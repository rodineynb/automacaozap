/**
 * automation-engine.ts — Motor central de automações
 *
 * Ponte entre o webhook handler e os módulos individuais de automação.
 * Responsável por:
 * - Parsear mensagens recebidas
 * - Debounce de mensagens (15s via KV)
 * - Gerenciar estado da conversa (máquina de estados)
 * - Carregar e executar módulos de automação
 */
import type { Env } from './app';
import { saveTrackingData, fetchAdCampaignInfo } from './services/facebook-tracking';
import { extractMessageContent as robustExtractMessageContent, type MessageType } from './services/message-utils';

// ─────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────

/** Mensagem recebida do WhatsApp, normalizada */
export interface IncomingMessage {
  id?: string;
  phone: string;
  senderName: string;
  messageType: MessageType;
  textContent: string;
  mediaId?: string;
  mimeType?: string;
  caption?: string;
  isFromMe?: boolean;
  instanceNumber?: string;
  rawBody: any;
}

/** Contexto completo passado para o módulo de automação */
export interface AutomationContext {
  message: IncomingMessage;
  conversation: { id: string; ai_active: number; status: string };
  contact: { id: string; phone: string; name: string | null; had_profile_pic?: number };
  automation: {
    id: string;
    name: string;
    slug: string;
    product_name: string | null;
    status: string;
    whatsapp_api_id: string;
    ocr_service_id: string | null;
    transcription_service_id: string | null;
    whatsapp_number: string | null;
    pixel_id: string | null;
    facebook_token: string | null;
    waba_id: string | null;
    page_id: string | null;
    use_llm_variations?: number;
    attendant_name?: string;
  };
  state: ConversationState;
  history: { role: string; content: string; created_at: string }[];
  env: Env;
  baseUrl?: string;
  isManual?: boolean;
  bypassDirectSend?: boolean;
}

/** Estado persistido de uma conversa na automação */
export interface ConversationState {
  id: string;
  conversation_id: string;
  automation_slug: string;
  phase: string;
  seq1_called: number;
  seq2_called: number;
  payment_confirmed: number;
  total_paid: number;
  upsell_offered: number;
  upsell_accepted: number;
  downsell_offered: number;
  kit_completo_offered: number;
  kit_completo_price: number | null;
  client_name: string | null;
  client_email: string | null;
  access_delivered: number;
  last_tool_called: string | null;
  metadata: string | null;
  oferta_19_90_feita?: number;
  upsell_enviado?: number;
  funil_encerrado?: number;
  promessa_pagamento_data?: string | null;
}

/** Interface que cada módulo de automação deve implementar */
export interface AutomationModule {
  handleMessage(ctx: AutomationContext): Promise<void>;
}

// ─────────────────────────────────────────────
//  Automation Module Registry
// ─────────────────────────────────────────────

/**
 * Registro de módulos de automação.
 * Cada slug mapeia para um lazy-loader que retorna o módulo correspondente.
 */
const automationRegistry: Record<string, () => Promise<AutomationModule>> = {};

/**
 * Registra um módulo de automação no registry.
 * Deve ser chamado na inicialização (ex: no app.ts ou num barrel file).
 *
 * @param slug - Slug único da automação (mesmo do banco)
 * @param loader - Função que importa dinamicamente o módulo
 *
 * @example
 * ```ts
 * registerAutomation('recheios-fit', () => import('./automations/recheios-fit'));
 * ```
 */
export function registerAutomation(slug: string, loader: () => Promise<AutomationModule>) {
  automationRegistry[slug] = loader;
}

// ─────────────────────────────────────────────
//  Message Parsing
// ─────────────────────────────────────────────

/**
 * Extrai conteúdo normalizado de um body recebido via webhook.
 * Suporta Evolution API v2 e formato genérico.
 */
function extractMessageContent(body: any): IncomingMessage {
  const extracted = robustExtractMessageContent(body);

  // Fallback se a extração robusta falhar ou retornar vazio
  if (!extracted.phone) {
    const phone = body.phone || body.from || '';
    const textContent = typeof body.message === 'string'
      ? body.message
      : (body.text || '');
    const senderName = body.name || body.pushName || '';
    const id = body.messageId || body.id || (body.key?.id) || '';

    return {
      id,
      phone: phone.replace(/@.*$/, ''),
      senderName,
      messageType: 'text',
      textContent,
      isFromMe: body.fromMe === true || body.isFromMe === true,
      instanceNumber: body.instance || body.data?.instance || '',
      rawBody: body,
    };
  }

  return {
    ...extracted,
    instanceNumber: body.instance || body.data?.instance || '',
    rawBody: body,
  };
}

/**
 * Extrai dados de referral (Click to WhatsApp) ou externalAdReply do payload do webhook.
 */
function extractReferralData(body: any): any {
  if (!body) return null;

  // 1. Verificar UAZAPI / Evolution API v2 no content.contextInfo ou message.contextInfo
  const messageObj = body.message || body.data?.message;
  if (messageObj) {
    // UAZAPI envia o objeto raw do Baileys dentro de message.content
    const content = messageObj.content || messageObj;
    
    // Tentar extendedTextMessage.contextInfo ou contextInfo diretamente
    const contextInfo = content.extendedTextMessage?.contextInfo || content.contextInfo;
    
    if (contextInfo) {
      if (contextInfo.externalAdReply) {
        return {
          ctwaClid: contextInfo.externalAdReply.ctwaClid || null,
          sourceId: contextInfo.externalAdReply.sourceID || contextInfo.externalAdReply.sourceId || null,
          pageId: contextInfo.externalAdReply.pageID || contextInfo.externalAdReply.pageId || null,
          headline: contextInfo.externalAdReply.title || null,
          sourceUrl: contextInfo.externalAdReply.mediaURL || contextInfo.externalAdReply.mediaUrl || null,
          thumbnailUrl: contextInfo.externalAdReply.thumbnailURL || contextInfo.externalAdReply.thumbnailUrl || null,
          sourceType: contextInfo.externalAdReply.mediaType || null,
          body: contextInfo.externalAdReply.body || null,
        };
      }
      if (contextInfo.referral) {
        return contextInfo.referral;
      }
    }
  }

  // 2. Fallback para outros caminhos explícitos
  if (body.data?.message?.extendedTextMessage?.contextInfo?.referral) {
    return body.data.message.extendedTextMessage.contextInfo.referral;
  }
  if (body.data?.message?.contextInfo?.referral) {
    return body.data.message.contextInfo.referral;
  }
  if (body.message?.extendedTextMessage?.contextInfo?.referral) {
    return body.message.extendedTextMessage.contextInfo.referral;
  }
  if (body.data?.referral) {
    return body.data.referral;
  }
  if (body.referral) {
    return body.referral;
  }
  return null;
}

/**
 * Extrai o Click-to-WhatsApp Click ID (ctwaclid) a partir do referral ou URL.
 */
function extractCtwaclid(referral: any): string | null {
  if (!referral) return null;
  if (referral.ctwaClid) return referral.ctwaClid;
  if (referral.ctwa_clid) return referral.ctwa_clid;
  
  const sourceUrl = referral.sourceUrl || referral.source_url || '';
  if (sourceUrl) {
    try {
      const urlObj = new URL(sourceUrl);
      return urlObj.searchParams.get('ctwa_clid') || urlObj.searchParams.get('fbclid') || null;
    } catch {
      const match = sourceUrl.match(/[?&](ctwa_clid|fbclid)=([^&]+)/);
      return match ? match[2] : null;
    }
  }
  return null;
}

/**
 * Extrai dados de campanha e criativo (anúncio) a partir do referral, decodificando URLs do Facebook se necessário.
 */
function parseTrackingFromReferral(referral: any): any {
  if (!referral) return null;

  const ctwaclid = extractCtwaclid(referral);
  const sourceId = referral.sourceId || referral.source_id || null;
  const sourceUrl = referral.sourceUrl || referral.source_url || '';

  let campanha = null;
  let campanhaId = null;
  let conjuntoAnuncio = null;
  let conjuntoAnuncioId = null;
  let anuncio = null;
  let anuncioId = sourceId; // Default to sourceId as it is the ad id

  if (sourceUrl) {
    try {
      let urlToParse = sourceUrl;
      if (sourceUrl.includes('l.facebook.com/l.php')) {
        const urlObj = new URL(sourceUrl);
        const uParam = urlObj.searchParams.get('u');
        if (uParam) {
          urlToParse = decodeURIComponent(uParam);
        }
      }

      const urlObj = new URL(urlToParse);
      campanha = urlObj.searchParams.get('utm_campaign') || urlObj.searchParams.get('campaign_name');
      campanhaId = urlObj.searchParams.get('utm_campaign_id') || urlObj.searchParams.get('campaign_id');
      conjuntoAnuncio = urlObj.searchParams.get('utm_term') || urlObj.searchParams.get('adset_name');
      conjuntoAnuncioId = urlObj.searchParams.get('utm_adset_id') || urlObj.searchParams.get('adset_id');
      anuncio = urlObj.searchParams.get('utm_content') || urlObj.searchParams.get('ad_name');
      const parsedAdId = urlObj.searchParams.get('utm_ad_id') || urlObj.searchParams.get('ad_id');
      if (parsedAdId) anuncioId = parsedAdId;
    } catch {
      // Fallback regex parsing if URL parsing fails
      const decodedUrl = decodeURIComponent(sourceUrl);
      
      const cMatch = decodedUrl.match(/[?&](utm_campaign|campaign_name)=([^&]+)/);
      if (cMatch) campanha = cMatch[2];
      
      const cIdMatch = decodedUrl.match(/[?&](utm_campaign_id|campaign_id)=([^&]+)/);
      if (cIdMatch) campanhaId = cIdMatch[2];
      
      const termMatch = decodedUrl.match(/[?&](utm_term|adset_name)=([^&]+)/);
      if (termMatch) conjuntoAnuncio = termMatch[2];
      
      const termIdMatch = decodedUrl.match(/[?&](utm_adset_id|adset_id)=([^&]+)/);
      if (termIdMatch) conjuntoAnuncioId = termIdMatch[2];
      
      const contentMatch = decodedUrl.match(/[?&](utm_content|ad_name)=([^&]+)/);
      if (contentMatch) anuncio = contentMatch[2];
      
      const adIdMatch = decodedUrl.match(/[?&](utm_ad_id|ad_id)=([^&]+)/);
      if (adIdMatch) anuncioId = adIdMatch[2];
    }
  }

  // Se nao encontrou pelos UTMs mas temos o titulo (headline) do anuncio
  const headline = referral.headline || null;
  if (!anuncio && headline) {
    anuncio = headline; // Usa o titulo do anuncio como nome se nao tiver utm_content
  }

  return {
    ctwaclid: ctwaclid || null,
    source_id: sourceId,
    page_id: referral.pageId || referral.page_id || null,
    campanha: campanha || null,
    campanha_id: campanhaId || null,
    conjunto_anuncio: conjuntoAnuncio || null,
    conjunto_anuncio_id: conjuntoAnuncioId || null,
    anuncio: anuncio || null,
    anuncio_id: anuncioId || null,
    titulo: headline,
    url_anuncio: sourceUrl || null,
    thumbnail_url: referral.thumbnailUrl || referral.thumbnail_url || null,
    tipo_anuncio: referral.mediaType || referral.sourceType || null,
    mensagem_lead: referral.body || null,
  };
}

// ─────────────────────────────────────────────
//  Debounce via KV
// ─────────────────────────────────────────────

const DEBOUNCE_WINDOW_MS = 5_000; // 5 segundos (reduzido para caber no waitUntil de 30s)
const DEBOUNCE_TTL_SECONDS = 60;   // TTL do KV (mínimo 60s exigido pela Cloudflare)

/**
 * Adiciona uma mensagem ao buffer de debounce no KV.
 * Retorna `true` se é a primeira mensagem (deve agendar processamento).
 * Retorna `false` se já existe buffer (será processada junto).
 */
async function addToDebounce(
  kv: KVNamespace,
  phone: string,
  slug: string,
  message: IncomingMessage
): Promise<boolean> {
  const key = `debounce:${slug}:${phone}`;
  const existing = await kv.get(key, 'json') as IncomingMessage[] | null;

  if (existing) {
    // Já existe buffer — adicionar e NÃO agendar novo processamento
    existing.push(message);
    await kv.put(key, JSON.stringify(existing), { expirationTtl: DEBOUNCE_TTL_SECONDS });
    return false;
  }

  // Primeira mensagem — criar buffer e sinalizar para agendar
  await kv.put(key, JSON.stringify([message]), { expirationTtl: DEBOUNCE_TTL_SECONDS });
  return true;
}

/**
 * Recupera e limpa as mensagens acumuladas no debounce.
 */
async function getAndClearDebounce(
  kv: KVNamespace,
  phone: string,
  slug: string
): Promise<IncomingMessage[]> {
  const key = `debounce:${slug}:${phone}`;
  const messages = await kv.get(key, 'json') as IncomingMessage[] | null;
  await kv.delete(key);
  return messages || [];
}

// ─────────────────────────────────────────────
//  State Management
// ─────────────────────────────────────────────

/**
 * Busca ou cria o estado de uma conversa na automação.
 */
async function getOrCreateState(
  db: D1Database,
  conversationId: string,
  slug: string
): Promise<ConversationState> {
  let state = await db.prepare(
    'SELECT * FROM conversation_state WHERE conversation_id = ?'
  ).bind(conversationId).first<ConversationState>();

  if (!state) {
    const id = crypto.randomUUID();
    await db.prepare(
      'INSERT INTO conversation_state (id, conversation_id, automation_slug) VALUES (?, ?, ?)'
    ).bind(id, conversationId, slug).run();

    state = await db.prepare(
      'SELECT * FROM conversation_state WHERE id = ?'
    ).bind(id).first<ConversationState>();
  }

  // ── Sincronizar status de pagamento com a tabela de leads ──
  try {
    const leadPaid = await db.prepare(`
      SELECT al.pago, al.valor_pago 
      FROM automation_leads al
      JOIN conversations c ON c.automation_id = al.automation_id
      JOIN contacts ct ON c.contact_id = ct.id AND ct.phone = al.phone
      WHERE c.id = ?
    `).bind(conversationId).first<{ pago: number; valor_pago: number }>();

    if (leadPaid && leadPaid.pago === 1) {
      let needsUpdate = false;
      const updates: Partial<ConversationState> = {};

      if (state && state.payment_confirmed !== 1) {
        updates.payment_confirmed = 1;
        needsUpdate = true;
      }
      if (state && state.total_paid < leadPaid.valor_pago) {
        updates.total_paid = leadPaid.valor_pago;
        needsUpdate = true;
      }
      // Se a fase for inicial ou de boas vindas, mudar para paid para que a IA não reinicie o funil
      const initialPhases = ['initial', 'welcome', 'seq1_sent', 'seq2_sent', 'awaiting_payment'];
      if (state && initialPhases.includes(state.phase)) {
        updates.phase = 'paid';
        needsUpdate = true;
      }

      if (needsUpdate && state) {
        console.log(`[getOrCreateState] Sincronizando pagamento de lead para conversa ${conversationId}: payment_confirmed=1, total_paid=${leadPaid.valor_pago}`);
        const setClauses: string[] = [];
        const values: any[] = [];
        for (const [key, val] of Object.entries(updates)) {
          setClauses.push(`${key} = ?`);
          values.push(val ?? null);
          (state as any)[key] = val; // atualiza em memória
        }
        setClauses.push("updated_at = datetime('now')");
        values.push(conversationId);

        await db.prepare(`
          UPDATE conversation_state 
          SET ${setClauses.join(', ')} 
          WHERE conversation_id = ?
        `).bind(...values).run();
      }
    }
  } catch (syncErr) {
    console.error(`[getOrCreateState] Erro ao sincronizar status de pagamento do lead:`, syncErr);
  }

  return state!;
}

/**
 * Atualiza campos do estado da conversa.
 * Aceita um objeto parcial com os campos a atualizar.
 *
 * @param db - Instância do banco D1
 * @param conversationId - ID da conversa
 * @param updates - Campos a atualizar (parcial de ConversationState)
 *
 * @example
 * ```ts
 * await updateState(db, conversationId, {
 *   phase: 'awaiting_payment',
 *   seq1_called: 1,
 *   client_name: 'Maria',
 * });
 * ```
 */
export async function updateState(
  db: D1Database,
  conversationId: string,
  updates: Partial<ConversationState>
): Promise<void> {
  // 1. Obter estado atual antes de aplicar o update
  let currentState: { payment_confirmed: number; funil_encerrado: number | null; automation_slug: string } | null = null;
  try {
    currentState = await db.prepare(
      'SELECT payment_confirmed, funil_encerrado, automation_slug FROM conversation_state WHERE conversation_id = ?'
    ).bind(conversationId).first<any>();
  } catch (err) {
    console.error("[CRM Trigger] Erro ao obter estado atual da conversa:", err);
  }

  // Campos que podem ser atualizados (excluir id e conversation_id)
  const allowedFields: (keyof ConversationState)[] = [
    'automation_slug', 'phase', 'seq1_called', 'seq2_called',
    'payment_confirmed', 'total_paid', 'upsell_offered', 'upsell_accepted',
    'downsell_offered', 'kit_completo_offered', 'kit_completo_price',
    'client_name', 'client_email', 'access_delivered',
    'last_tool_called', 'metadata', 'oferta_19_90_feita', 'upsell_enviado',
    'funil_encerrado', 'promessa_pagamento_data',
  ];

  const setClauses: string[] = [];
  const values: any[] = [];

  for (const field of allowedFields) {
    if (field in updates) {
      setClauses.push(`${field} = ?`);
      values.push(updates[field] ?? null);
    }
  }

  if (setClauses.length === 0) return;

  // Sempre atualizar updated_at
  setClauses.push("updated_at = datetime('now')");
  values.push(conversationId);

  await db.prepare(
    `UPDATE conversation_state SET ${setClauses.join(', ')} WHERE conversation_id = ?`
  ).bind(...values).run();

  // 2. Triggers CRM (Processados em background pós-update)
  if (currentState) {
    const slug = updates.automation_slug || currentState.automation_slug;
    
    // Trigger A: Pagamento Confirmado (Transição: payment_confirmed era 0 e virou 1)
    const paymentConfirmedTransition = 
      currentState.payment_confirmed === 0 && 
      updates.payment_confirmed === 1;

    // Trigger B: Funil Encerrado sem pagamento (Transição: funil_encerrado era 0/nulo e virou 1, E payment_confirmed é 0)
    const objectionTransition = 
      (currentState.funil_encerrado || 0) === 0 && 
      updates.funil_encerrado === 1 && 
      (updates.payment_confirmed !== undefined ? updates.payment_confirmed : currentState.payment_confirmed) === 0;

    if (paymentConfirmedTransition || objectionTransition) {
      // Disparar agendamentos do CRM de forma assíncrona
      (async () => {
        try {
          // Buscar produto e dados do contato
          const autoInfo = await db.prepare(`
            SELECT a.id as automation_id, a.whatsapp_api_id, pa.product_id, p.name as product_name
            FROM automations a
            LEFT JOIN product_automations pa ON pa.automation_id = a.id
            LEFT JOIN products p ON pa.product_id = p.id
            WHERE a.slug = ?
            LIMIT 1
          `).bind(slug).first<any>();

          if (!autoInfo || !autoInfo.product_id) {
            console.log(`[CRM Trigger] Automação "${slug}" não possui produto associado, pulando triggers CRM.`);
            return;
          }

          const contactInfo = await db.prepare(`
            SELECT c.phone, c.name
            FROM conversations cv
            JOIN contacts c ON cv.contact_id = c.id
            WHERE cv.id = ?
            LIMIT 1
          `).bind(conversationId).first<any>();

          if (!contactInfo) {
            console.error(`[CRM Trigger] Não foi possível encontrar dados de contato para conversa ${conversationId}`);
            return;
          }

          // Buscar configurações de CRM dinâmicas da automação
          const crmStages = await db.prepare(
            'SELECT * FROM automation_crm_stages WHERE automation_id = ? AND enabled = 1'
          ).bind(autoInfo.automation_id).all<any>();

          const stages = crmStages.results || [];

          if (paymentConfirmedTransition) {
            console.log(`[CRM Trigger] Pagamento confirmado para ${contactInfo.phone}. Agendando estágios de pós-venda.`);
            
            // Cancelar agendamentos anteriores pendentes para o mesmo telefone nesta automação
            await db.prepare(
              "UPDATE crm_scheduled SET status = 'cancelled' WHERE phone = ? AND automation_id = ? AND status = 'pending'"
            ).bind(contactInfo.phone, autoInfo.automation_id).run();

            // Agendar estágios de pós-venda (todos cuja classe seja 'sucesso')
            const postSaleStages = stages.filter(s => s.class === 'sucesso' || (!s.class && s.key !== 'objection'));
            for (const s of postSaleStages) {
              await db.prepare(`
                INSERT INTO crm_scheduled (product_id, automation_id, phone, flow_type, scheduled_for, status)
                VALUES (?, ?, ?, ?, datetime('now', '+' || ? || ' hours'), 'pending')
              `).bind(autoInfo.product_id, autoInfo.automation_id, contactInfo.phone, s.key, s.delay_hours).run();
              console.log(`[CRM Trigger] Agendado estágio pós-venda "${s.name}" para daqui a ${s.delay_hours}h`);
            }
          }

          if (objectionTransition) {
            console.log(`[CRM Trigger] Funil encerrado sem pagamento para ${contactInfo.phone}. Agendando objeções.`);
            
            // Cancelar agendamentos anteriores
            await db.prepare(
              "UPDATE crm_scheduled SET status = 'cancelled' WHERE phone = ? AND automation_id = ? AND status = 'pending'"
            ).bind(contactInfo.phone, autoInfo.automation_id).run();

            // Agendar estágios de objeção (cuja classe seja 'sem_sucesso')
            const objectionStages = stages.filter(s => s.class === 'sem_sucesso' || (!s.class && s.key === 'objection'));
            for (const s of objectionStages) {
              await db.prepare(`
                INSERT INTO crm_scheduled (product_id, automation_id, phone, flow_type, scheduled_for, status)
                VALUES (?, ?, ?, ?, datetime('now', '+' || ? || ' hours'), 'pending')
              `).bind(autoInfo.product_id, autoInfo.automation_id, contactInfo.phone, s.key, s.delay_hours).run();
              console.log(`[CRM Trigger] Agendado estágio de objeção "${s.name}" para daqui a ${s.delay_hours}h`);
            }
          }
        } catch (crmErr) {
          console.error("[CRM Trigger] Erro ao disparar agendamentos CRM:", crmErr);
        }
      })();
    }
  }
}

// ─────────────────────────────────────────────
//  Contact & Conversation helpers
// ─────────────────────────────────────────────

interface ContactRow {
  id: string;
  phone: string;
  name: string | null;
  had_profile_pic?: number;
}

interface ConversationRow {
  id: string;
  ai_active: number;
  status: string;
}

/**
 * Busca ou cria um contato para o telefone + automação.
 */
async function getOrCreateContact(
  db: D1Database,
  phone: string,
  name: string,
  automationId: string,
  whatsappNumber: string | null,
  productName: string | null
): Promise<ContactRow> {
  // If productName and whatsappNumber are set, perform isolated lookup by product and automation_id
  let contact: ContactRow | null = null;
  if (productName && whatsappNumber) {
    contact = await db.prepare(
      `SELECT c.id, c.phone, c.name, c.had_profile_pic FROM contacts c
       JOIN automations a ON c.automation_id = a.id
       WHERE c.phone = ? AND c.whatsapp_number = ? AND c.automation_id = ? AND a.product_name = ?
       LIMIT 1`
    ).bind(phone, whatsappNumber, automationId, productName).first<ContactRow>();
  } else if (whatsappNumber) {
    contact = await db.prepare(
      'SELECT id, phone, name, had_profile_pic FROM contacts WHERE phone = ? AND automation_id = ? AND whatsapp_number = ?'
    ).bind(phone, automationId, whatsappNumber).first<ContactRow>();
  } else {
    contact = await db.prepare(
      'SELECT id, phone, name, had_profile_pic FROM contacts WHERE phone = ? AND automation_id = ?'
    ).bind(phone, automationId).first<ContactRow>();
  }

  if (!contact) {
    let upgraded = false;
    if (productName && whatsappNumber) {
      // Fallback: Check if there's a contact with NULL whatsapp_number for this phone/product and automation_id
      contact = await db.prepare(
        `SELECT c.id, c.phone, c.name, c.had_profile_pic FROM contacts c
         JOIN automations a ON c.automation_id = a.id
         WHERE c.phone = ? AND c.whatsapp_number IS NULL AND c.automation_id = ? AND a.product_name = ?
         LIMIT 1`
      ).bind(phone, automationId, productName).first<ContactRow>();

      if (contact) {
        // Upgrade legacy contact with the current whatsapp number
        await db.prepare(
          'UPDATE contacts SET whatsapp_number = ? WHERE id = ?'
        ).bind(whatsappNumber, contact.id).run();
        console.log(`[AutomationEngine] Upgraded legacy contact ${contact.id} with whatsapp_number: ${whatsappNumber}`);
        upgraded = true;
      }
    } else if (whatsappNumber) {
      // Fallback: Check if there's a contact with NULL whatsapp_number for this phone and automation
      contact = await db.prepare(
        'SELECT id, phone, name, had_profile_pic FROM contacts WHERE phone = ? AND automation_id = ? AND whatsapp_number IS NULL LIMIT 1'
      ).bind(phone, automationId).first<ContactRow>();

      if (contact) {
        // Upgrade legacy contact with the current whatsapp number
        await db.prepare(
          'UPDATE contacts SET whatsapp_number = ? WHERE id = ?'
        ).bind(whatsappNumber, contact.id).run();
        console.log(`[AutomationEngine] Upgraded legacy contact ${contact.id} with whatsapp_number: ${whatsappNumber}`);
        upgraded = true;
      }
    }

    // Se o contato legado foi atualizado com o novo número de WhatsApp de origem,
    // reiniciamos o estado da conversa e cancelamos os follow-ups agendados anteriores.
    // Isso garante que ele receba a Sequência 1 (Boas-Vindas) perfeitamente como um novo lead
    // no chat em branco desse novo número.
    if (upgraded && contact) {
      try {
        await db.prepare(`
          UPDATE conversation_state 
          SET phase = 'welcome', 
              seq1_called = 0, 
              seq2_called = 0, 
              payment_confirmed = 0, 
              total_paid = 0, 
              upsell_offered = 0, 
              upsell_accepted = 0, 
              downsell_offered = 0, 
              kit_completo_offered = 0, 
              kit_completo_price = NULL, 
              client_name = NULL, 
              client_email = NULL, 
              access_delivered = 0, 
              last_tool_called = NULL, 
              metadata = NULL, 
              oferta_19_90_feita = 0, 
              upsell_enviado = 0, 
              funil_encerrado = 0,
              updated_at = datetime('now')
          WHERE conversation_id IN (SELECT id FROM conversations WHERE contact_id = ?)
        `).bind(contact.id).run();

        await db.prepare(`
          UPDATE conversations 
          SET status = 'open', 
              ai_active = 1, 
              updated_at = datetime('now') 
          WHERE contact_id = ?
        `).bind(contact.id).run();

        await db.prepare(`
          UPDATE scheduled_followups 
          SET status = 'cancelled' 
          WHERE conversation_id IN (SELECT id FROM conversations WHERE contact_id = ?)
        `).bind(contact.id).run();

        console.log(`[AutomationEngine] Redefinição completa de estado e follow-ups executada para o contato legado ${contact.id}`);
      } catch (resetErr) {
        console.error(`[AutomationEngine] Falha ao redefinir estado conversacional no upgrade do contato:`, resetErr);
      }
    }
  }

  if (!contact) {
    const contactId = crypto.randomUUID();
    let hadProfilePic = 0;
    
    // Tenta obter a foto de perfil usando o whatsapp-service em background/dynamic import
    try {
      const { getProfilePicture } = await import('./services/whatsapp-service');
      const picUrl = await getProfilePicture(db, automationId, phone);
      if (picUrl) {
        hadProfilePic = 1;
        console.log(`[AutomationEngine] Lead ${phone} possui foto de perfil inicial.`);
      } else {
        console.log(`[AutomationEngine] Lead ${phone} NÃO possui foto de perfil inicial.`);
      }
    } catch (err) {
      console.error(`[AutomationEngine] Erro ao consultar foto de perfil inicial para ${phone}:`, err);
    }

    await db.prepare(
      'INSERT INTO contacts (id, phone, name, automation_id, whatsapp_number, had_profile_pic) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(contactId, phone, name || null, automationId, whatsappNumber, hadProfilePic).run();
    contact = { id: contactId, phone, name: name || null, had_profile_pic: hadProfilePic };
  } else if (name && !contact.name) {
    await db.prepare(
      'UPDATE contacts SET name = ? WHERE id = ?'
    ).bind(name, contact.id).run();
    contact.name = name;
  }

  return contact;
}

/**
 * Busca ou cria uma conversa ativa para o contato + automação.
 */
async function getOrCreateConversation(
  db: D1Database,
  contactId: string,
  automationId: string,
  productName: string | null
): Promise<ConversationRow> {
  let conversation: ConversationRow | null = null;
  if (productName) {
    conversation = await db.prepare(
      `SELECT cv.id, cv.ai_active, cv.status FROM conversations cv
       JOIN automations a ON cv.automation_id = a.id
       WHERE cv.contact_id = ? AND a.product_name = ?
       ORDER BY cv.created_at DESC LIMIT 1`
    ).bind(contactId, productName).first<ConversationRow>();
  } else {
    conversation = await db.prepare(
      "SELECT id, ai_active, status FROM conversations WHERE contact_id = ? AND automation_id = ? ORDER BY created_at DESC LIMIT 1"
    ).bind(contactId, automationId).first<ConversationRow>();
  }

  if (!conversation) {
    const convId = crypto.randomUUID();
    await db.prepare(
      'INSERT INTO conversations (id, contact_id, automation_id) VALUES (?, ?, ?)'
    ).bind(convId, contactId, automationId).run();
    conversation = { id: convId, ai_active: 1, status: 'open' };
  } else if (conversation.status === 'finalizado_com_sucesso' || conversation.status === 'finalizado_sem_sucesso' || conversation.status === 'resolved' || conversation.status === 'reaberto') {
    // Se a conversa já estava finalizada/resolvida e o cliente enviou uma nova mensagem, marcar como reaberto
    await db.prepare(
      "UPDATE conversations SET status = 'reaberto', updated_at = datetime('now') WHERE id = ?"
    ).bind(conversation.id).run();
    conversation.status = 'reaberto';
    console.log(`[AutomationEngine] Reabrendo conversa finalizada/resolvida ${conversation.id} para ${contactId} como 'reaberto' pois o cliente enviou uma nova mensagem`);
  }

  return conversation;
}

/**
 * Busca o histórico recente de mensagens de uma conversa.
 */
async function getMessageHistory(
  db: D1Database,
  conversationId: string,
  limit = 50
): Promise<{ id: string; role: string; content: string; created_at: string }[]> {
  const result = await db.prepare(
    'SELECT id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?'
  ).bind(conversationId, limit).all<{ id: string; role: string; content: string; created_at: string }>();

  // Retornar em ordem cronológica (do mais antigo para o mais recente)
  return (result.results || []).reverse();
}

/**
 * Salva uma mensagem no banco.
 */
async function saveMessage(
  db: D1Database,
  conversationId: string,
  content: string,
  role: 'user' | 'assistant' | 'manual',
  messageId?: string
): Promise<string> {
  const id = messageId || crypto.randomUUID();

  if (messageId) {
    try {
      const existing = await db.prepare(
        "SELECT id FROM messages WHERE id = ?"
      ).bind(messageId).first();
      if (existing) {
        console.log(`[AutomationEngine] Mensagem ${messageId} já existe no banco. Ignorando insert duplicado.`);
        return messageId;
      }
    } catch (err) {
      console.error(`[AutomationEngine] Erro ao verificar duplicidade:`, err);
    }
  }

  await db.prepare(
    "INSERT INTO messages (id, conversation_id, content, role) VALUES (?, ?, ?, ?)"
  ).bind(id, conversationId, content, role).run();

  // Atualizar timestamp da conversa
  await db.prepare(
    "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?"
  ).bind(conversationId).run();

  return id;
}

// ─────────────────────────────────────────────
//  Error Logging
// ─────────────────────────────────────────────

/**
 * Registra um erro no log de erros.
 */
async function logError(
  db: D1Database,
  automationId: string,
  errorType: string,
  errorMessage: string
): Promise<void> {
  try {
    await db.prepare(
      'INSERT INTO error_logs (id, automation_id, error_type, error_message) VALUES (?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), automationId, errorType, errorMessage).run();
  } catch {
    // Evitar loop infinito se o log falhar
    console.error('[AutomationEngine] Falha ao registrar erro:', errorMessage);
  }
}

// ─────────────────────────────────────────────
//  Main Entry Point
// ─────────────────────────────────────────────

/**
 * Ponto de entrada principal: processa uma mensagem recebida via webhook.
 *
 * O fluxo:
 * 1. Parseia a mensagem
 * 2. Ignora mensagens próprias (isFromMe)
 * 3. Faz debounce de 15s via KV (acumula mensagens rápidas)
 * 4. Após a janela, processa todas as mensagens acumuladas
 *
 * @param opts - Dados da requisição
 * @returns Objeto com status e mensagem
 */
export async function processMessage(opts: {
  env: Env;
  automation: AutomationContext['automation'];
  body: any;
}): Promise<{ status: string; message: string; phone?: string }> {
  const { env, automation, body } = opts;

  // 1. Parsear mensagem
  const message = extractMessageContent(body);

  // 2. Ignorar mensagens do próprio bot
  if (message.isFromMe) {
    return { status: 'skipped', message: 'Mensagem do próprio bot — ignorada', phone: message.phone };
  }

  // 3. Validar telefone
  if (!message.phone || message.phone === 'unknown') {
    return { status: 'skipped', message: 'Telefone não identificado — ignorada', phone: message.phone };
  }

  // 3.01. Ignorar mensagens de grupos ou comunidades do WhatsApp
  const isGroup = 
    body.isGroup === true ||
    body.message?.isGroup === true ||
    body.chat?.isGroup === true ||
    body.chat?.wa_chatid?.includes('@g.us') ||
    body.data?.key?.remoteJid?.includes('@g.us') ||
    message.phone.startsWith('1203') ||
    message.phone.length > 15;

  if (isGroup) {
    console.log(`[AutomationEngine] Mensagem ignorada por ser de Grupo/Comunidade (phone: ${message.phone}, name: ${message.senderName || 'unknown'})`);
    return { status: 'skipped', message: 'Mensagem de grupo/comunidade — ignorada', phone: message.phone };
  }

  // 3.0. Salvar dados de tracking de anúncios instantaneamente (Click to WhatsApp / CTWA)
  const referralData = extractReferralData(body);
  if (referralData) {
    const trackingRecord = parseTrackingFromReferral(referralData);
    
    // Enriquecer com dados da campanha via Facebook Marketing API (se source_id disponível)
    if (trackingRecord.source_id && !trackingRecord.campanha && automation.facebook_token) {
      try {
        const adInfo = await fetchAdCampaignInfo(trackingRecord.source_id, automation.facebook_token);
        if (adInfo) {
          trackingRecord.campanha = adInfo.campanha;
          trackingRecord.campanha_id = adInfo.campanha_id;
          trackingRecord.conjunto_anuncio = adInfo.conjunto_anuncio;
          trackingRecord.conjunto_anuncio_id = adInfo.conjunto_anuncio_id;
          // Preferir nome real do anúncio da API ao invés do headline
          if (adInfo.anuncio) trackingRecord.anuncio = adInfo.anuncio;
          if (adInfo.anuncio_id) trackingRecord.anuncio_id = adInfo.anuncio_id;
          console.log(`[AutomationEngine] Tracking enriched via Marketing API: campanha=${adInfo.campanha}, anuncio=${adInfo.anuncio}`);
        }
      } catch (err) {
        console.error(`[AutomationEngine] Error enriching tracking with Marketing API:`, err);
      }
    }
    
    try {
      await saveTrackingData(env.DB, message.phone, automation.id, trackingRecord);
      console.log(`[AutomationEngine] Instant tracking data saved for ${message.phone} (campanha: ${trackingRecord.campanha}, anuncio: ${trackingRecord.anuncio}, ctwaclid: ${trackingRecord.ctwaclid})`);
    } catch (err) {
      console.error(`[AutomationEngine] Error saving instant tracking data:`, err);
    }
  }

  // 3.1. Verificar Mutex de Processamento
  const processingKey = `processing:${automation.slug}:${message.phone}`;
  const isProcessing = await env.KV.get(processingKey);

  if (isProcessing === "true") {
    // Se a IA está formulando/enviando resposta ativa para este cliente,
    // enfileirar a mensagem na fila assíncrona temporária para processamento sequencial.
    const qKey = `queue:${automation.slug}:${message.phone}`;
    const qExisting = await env.KV.get(qKey, "json") as IncomingMessage[] | null;
    const qNew = qExisting ? [...qExisting, message] : [message];
    await env.KV.put(qKey, JSON.stringify(qNew), { expirationTtl: DEBOUNCE_TTL_SECONDS });
    await env.KV.put(`has_queued_messages:${automation.slug}:${message.phone}`, "true", { expirationTtl: DEBOUNCE_TTL_SECONDS });

    // --- SEGURANÇA ADICIONAL ---
    // Salvar a mensagem no D1 IMEDIATAMENTE para garantir que ela nunca seja perdida se o worker principal crashar!
    try {
      const contact = await getOrCreateContact(env.DB, message.phone, message.senderName || '', automation.id, automation.whatsapp_number, automation.product_name);
      const conversation = await getOrCreateConversation(env.DB, contact.id, automation.id, automation.product_name);
      await saveMessage(env.DB, conversation.id, message.textContent, 'user', message.id);
      console.log(`[AutomationEngine] Mensagem de ${message.phone} salva no D1 em background de segurança.`);
    } catch (saveErr) {
      console.error(`[AutomationEngine] Erro na salvaguarda de mensagem no D1:`, saveErr);
    }

    console.log(`[AutomationEngine] Mensagem recebida durante processamento de ${message.phone}. Enfileirada.`);
    return { status: 'queued', message: 'Mensagem enfileirada, IA ativa processando fluxo anterior', phone: message.phone };
  }

  // 4. Debounce: adicionar ao buffer
  const isFirst = await addToDebounce(env.KV, message.phone, automation.slug, message);

  if (!isFirst) {
    // Já existe processamento agendado — esta mensagem será incluída
    return { status: 'debounced', message: 'Mensagem adicionada ao buffer de debounce', phone: message.phone };
  }

  // 5. É a primeira mensagem — retornar imediatamente e sinalizar para agendar
  // O caller (webhook handler) deve usar waitUntil para agendar o processamento
  return { status: 'processing', message: 'Processamento agendado', phone: message.phone };
}

/**
 * Processamento assíncrono após a janela de debounce.
 * Deve ser chamado via `ctx.executionCtx.waitUntil(processMessageAsync(...))`.
 *
 * @param env - Bindings do Cloudflare
 * @param automation - Dados da automação
 * @param phone - Telefone do remetente
 * @param slug - Slug da automação
 */
export async function processMessageAsync(
  env: Env,
  automation: AutomationContext['automation'],
  phone: string,
  slug: string
): Promise<void> {
  const db = env.DB;
  let conversationId: string | null = null;

  try {
    // Aguardar a janela de debounce (15 segundos)
    await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_WINDOW_MS));

    // Recuperar todas as mensagens acumuladas
    const messages = await getAndClearDebounce(env.KV, phone, slug);

    if (messages.length === 0) {
      console.log(`[AutomationEngine] Nenhuma mensagem no buffer para ${phone}/${slug}`);
      return;
    }

    // Ativar o Mutex de Processamento no KV (auto-expiração em 60s)
    const processingKey = `processing:${slug}:${phone}`;
    await env.KV.put(processingKey, 'true', { expirationTtl: 60 });

    // Combinar textos das mensagens acumuladas
    const combinedMessage = combineMessages(messages);

    // Tentar extrair dados de tracking de anúncios (Click to WhatsApp / CTWA)
    // NOTA: O tracking já é salvo instantaneamente em processIncomingMessage() (saveTrackingData).
    // Aqui apenas extraímos os dados para uso na criação do lead (UTM fields).
    let referralData: any = null;
    for (const msg of messages) {
      const ref = extractReferralData(msg.rawBody);
      if (ref) {
        referralData = ref;
        break;
      }
    }

    // Criar ou obter lead na tabela de leads de automação (se não existir)
    const senderName = messages[0].senderName || '';
    let lead: { id: string } | null = null;
    if (automation.product_name) {
      lead = await db.prepare(
        `SELECT al.id FROM automation_leads al
         JOIN automations a ON al.automation_id = a.id
         WHERE al.phone = ? AND a.product_name = ?
         LIMIT 1`
      ).bind(phone, automation.product_name).first<{ id: string }>();
    } else {
      lead = await db.prepare(
        'SELECT id FROM automation_leads WHERE phone = ? AND automation_id = ?'
      ).bind(phone, automation.id).first<{ id: string }>();
    }

    if (!lead) {
      const leadId = crypto.randomUUID();
      let utmSource = null;
      let utmMedium = null;
      let utmCampaign = null;

      if (referralData) {
        const trackingRecord = parseTrackingFromReferral(referralData);
        utmCampaign = trackingRecord.campanha;
        const sourceUrl = referralData.sourceUrl || referralData.source_url || '';
        if (sourceUrl) {
          try {
            let urlToParse = sourceUrl;
            if (sourceUrl.includes('l.facebook.com/l.php')) {
              const urlObj = new URL(sourceUrl);
              const uParam = urlObj.searchParams.get('u');
              if (uParam) {
                urlToParse = decodeURIComponent(uParam);
              }
            }
            const urlObj = new URL(urlToParse);
            utmSource = urlObj.searchParams.get('utm_source');
            utmMedium = urlObj.searchParams.get('utm_medium');
          } catch {
            const decodedUrl = decodeURIComponent(sourceUrl);
            const sMatch = decodedUrl.match(/[?&]utm_source=([^&]+)/);
            const mMatch = decodedUrl.match(/[?&]utm_medium=([^&]+)/);
            utmSource = sMatch ? sMatch[1] : null;
            utmMedium = mMatch ? mMatch[1] : null;
          }
        }
      }

      // Obter o próximo cliente_codigo sequencial
      const maxCodeRes = await db.prepare(
        'SELECT COALESCE(MAX(cliente_codigo), 0) + 1 AS next_code FROM automation_leads'
      ).first<{ next_code: number }>();
      const nextCode = maxCodeRes?.next_code || 1;

      await db.prepare(
        'INSERT INTO automation_leads (id, automation_id, phone, nome, pago, valor_pago, origem, utm_source, utm_medium, utm_campaign, cliente_codigo) VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?)'
      ).bind(leadId, automation.id, phone, senderName || null, referralData ? 'facebook' : 'organico', utmSource, utmMedium, utmCampaign, nextCode).run();
      
      console.log(`[AutomationEngine] Novo lead criado no banco com ID: ${leadId}`);
    }

    // Buscar/criar contato
    const contact = await getOrCreateContact(db, phone, senderName, automation.id, automation.whatsapp_number, automation.product_name);

    // Buscar/criar conversa
    const conversation = await getOrCreateConversation(db, contact.id, automation.id, automation.product_name);
    conversationId = conversation.id;

    // Registrar env no realtime-service para acesso global na request
    try {
      const { registerEnv } = await import("./services/realtime-service");
      registerEnv(conversation.id, env);
    } catch (err) {
      console.error("[AutomationEngine] Error registering env for realtime:", err);
    }

    // Verificar se automação está pausada ou IA desativada
    if (automation.status === 'paused') {
      // Salvar mensagem e parar
      await saveMessage(db, conversation.id, combinedMessage.textContent, 'user', combinedMessage.id);
      try {
        const { notifyNewMessage } = await import("./services/realtime-service");
        await notifyNewMessage(env, conversation.id, {
          id: combinedMessage.id || crypto.randomUUID(),
          content: combinedMessage.textContent,
          role: 'user',
        });
      } catch {}
      console.log(`[AutomationEngine] Automação pausada — mensagem registrada para ${phone}`);
      return;
    }

    if (!conversation.ai_active) {
      // Salvar mensagem e parar
      await saveMessage(db, conversation.id, combinedMessage.textContent, 'user', combinedMessage.id);
      try {
        const { notifyNewMessage } = await import("./services/realtime-service");
        await notifyNewMessage(env, conversation.id, {
          id: combinedMessage.id || crypto.randomUUID(),
          content: combinedMessage.textContent,
          role: 'user',
        });
      } catch {}
      console.log(`[AutomationEngine] IA desativada — mensagem registrada para ${phone}`);
      return;
    }

    // Salvar a(s) mensagem(s) recebida(s)
    await saveMessage(db, conversation.id, combinedMessage.textContent, 'user', combinedMessage.id);
    try {
      const { notifyNewMessage } = await import("./services/realtime-service");
      await notifyNewMessage(env, conversation.id, {
        id: combinedMessage.id || crypto.randomUUID(),
        content: combinedMessage.textContent,
        role: 'user',
      });
    } catch (err) {
      console.error("[AutomationEngine] Error notifying realtime user message:", err);
    }

    // ─── Interceptar Resposta CRM ───
    const activeCrm = await db.prepare(
      "SELECT * FROM crm_responses WHERE phone = ? AND status = 'sent' ORDER BY created_at DESC LIMIT 1"
    ).bind(phone).first<any>();

    if (activeCrm) {
      console.log(`[CRM Response Handler] Detectada resposta CRM pendente para ${phone}`);
      
      const handleCrmResponse = async () => {
        try {
          let responseText = combinedMessage.textContent || "";
          let mediaUrl: string | null = null;
          let mediaType = "text";
          
          if (combinedMessage.messageType !== "text" && combinedMessage.mediaId) {
            mediaType = combinedMessage.messageType;
            
            try {
              const { downloadMedia } = await import("./services/whatsapp-service");
              const media = await downloadMedia(db, automation.whatsapp_api_id, combinedMessage.mediaId, env.KV);
              
              if (media && media.base64Data) {
                const binaryString = atob(media.base64Data);
                const len = binaryString.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                const mediaBuffer = bytes.buffer;
                
                let ext = "bin";
                if (mediaType === "audio") ext = "ogg";
                else if (mediaType === "video") ext = "mp4";
                else if (mediaType === "image") ext = "jpg";
                else if (mediaType === "pdf") ext = "pdf";
                
                const assetId = crypto.randomUUID();
                const r2Key = `crm/responses/${phone}/${assetId}.${ext}`;
                
                await env.STORAGE.put(r2Key, mediaBuffer, {
                  httpMetadata: { contentType: media.mimetype || "application/octet-stream" }
                });
                
                const baseUrl = (env as any).baseUrl || "";
                mediaUrl = `${baseUrl}/api/media/${r2Key}`;
                console.log(`[CRM Response Handler] Mídia do CRM salva no R2: ${mediaUrl}`);
                
                if (mediaType === "audio") {
                  try {
                    const llm = await db.prepare('SELECT api_key FROM llms ORDER BY sort_order ASC, id ASC LIMIT 1').first<any>();
                    if (llm && llm.api_key) {
                      const { transcribeAudio } = await import("./services/media-service");
                      const transcription = await transcribeAudio({
                        apiKey: llm.api_key,
                        audioBase64: media.base64Data,
                        mimeType: media.mimetype || "audio/ogg"
                      });
                      if (transcription) {
                        responseText = transcription;
                        console.log(`[CRM Response Handler] Áudio do CRM transcrito: "${responseText}"`);
                      }
                    }
                  } catch (transcErr) {
                    console.error(`[CRM Response Handler] Falha ao transcrever áudio do CRM:`, transcErr);
                  }
                }
              }
            } catch (mediaErr) {
              console.error(`[CRM Response Handler] Erro ao tratar mídia do CRM:`, mediaErr);
            }
          }
          
          let summary = "";
          let tags = "[]";
          let detailedAnalysisJson: string | null = null;
          
          try {
            const llm = await db.prepare('SELECT * FROM llms ORDER BY sort_order ASC, id ASC LIMIT 1').first<any>();
            if (llm) {
              const chatHistory = await getMessageHistory(db, conversation.id, 50);
              const historyFormatted = chatHistory.map(m => `${m.role === 'user' ? 'Cliente' : 'Assistente'}: ${m.content}`).join('\n');
              
              const prompt = `Você é um Psicólogo de Consumo e Analista de Marketing Digital de Elite.
Sua tarefa é analisar a resposta de um cliente a uma pesquisa de pós-venda/CRM e correlacionar com toda a jornada e histórico do chat dele.

DADOS DA PESQUISA:
- Produto: "${activeCrm.product_name || "nosso produto"}"
- Tipo de Fluxo CRM: "${activeCrm.flow_type}"
- Pergunta Enviada: "${activeCrm.question_sent || ""}"
- Resposta do Cliente: "${responseText}"

HISTÓRICO COMPLETO DA CONVERSA (JORNADA DO CLIENTE):
${historyFormatted}

Você DEVE responder rigorosamente com um JSON no seguinte formato (sem formatação markdown, apenas o JSON bruto de forma compacta):
{
  "summary": "Resumo de 1 frase amigável descrevendo o sentimento e pontos chave para exibição rápida no painel",
  "tags": ["tag1", "tag2"],
  "detailed_analysis": {
    "journey_sentiment_analysis": {
      "overall_sentiment": "altamente_positivo", // altamente_positivo, neutro, confuso, frustrado, desconfiado
      "initial_attitude": "descrever a atitude do cliente no primeiro contato (ex: com medo de golpe, ansiosa, decidida)",
      "evolution_of_sentiment": "descrever brevemente como o sentimento evoluiu ao longo do chat",
      "emotional_peaks": {
        "highest_frustration_point": "ponto de maior frustração ou atrito no chat",
        "highest_satisfaction_point": "ponto de maior satisfação ou alívio no chat"
      },
      "key_customer_quotes": ["citação relevante 1", "citação relevante 2"]
    },
    "crm_response_depth": {
      "direct_answer_analysis": "análise detalhada e profunda do que o cliente respondeu na pesquisa",
      "subtext_and_implied_needs": "necessidades implícitas ou subentendidas que o cliente não disse diretamente mas a jornada revela",
      "satisfaction_with_support": "avaliação da satisfação com o atendimento do robô/suporte humano"
    },
    "psychographic_profile_extraction": {
      "primary_motivation": "motivação primária dele na confeitaria (ex: renda extra, transição de carreira, hobby)",
      "technological_savviness": "baixa", // baixa, média, alta
      "buying_persona_segment": "descrever o segmento de persona (ex: mãe empreendedora, dona de casa, confeiteira experiente)",
      "price_sensitivity": "sensivel_a_preco" // sensivel_a_preco, neutro, valoriza_qualidade
    },
    "funnel_performance_insights": {
      "main_objections_raised": ["objeção 1", "objeção 2"],
      "was_discount_required": true, // true se precisou de desconto/followup ou false se pagou direto
      "retention_score": 10, // nota de 1 a 10 estimando chance de engajamento futuro
      "recommended_next_action": "recomendação clara de marketing ou próxima oferta de pós-venda"
    }
  }
}

Use tags relevantes e precisas baseadas na análise.
Exemplos de tags:
- satisfaction: satisfeito, insatisfeito, gostou_preco, gostou_conteudo, comprou_por_curiosidade, comprou_por_preco
- testimonial: deu_depoimento, promotor, detrator, neutro, depoimento_audio, depoimento_video
- objection: objecao_preco, objecao_conteudo, objecao_desconfianca, objecao_momento, objecao_ja_tem_similar

Responda apenas o JSON puro, sem blocos markdown.

JSON:`;
              
              const apiKey = llm.api_key;
              const model = llm.model || 'gemini-2.5-flash';
              const provider = llm.provider || 'google';
              let llmText = "";
              
              if (provider === 'google' || provider === 'gemini') {
                const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.1 }
                  })
                });
                const data = await resp.json() as any;
                llmText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
              } else if (provider === 'openai') {
                const resp = await fetch('https://api.openai.com/v1/chat/completions', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                  body: JSON.stringify({
                    model: model,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.1, response_format: { type: "json_object" }
                  })
                });
                const data = await resp.json() as any;
                llmText = data?.choices?.[0]?.message?.content || "{}";
              }
              
              try {
                const cleanText = llmText.replace(/```json/g, "").replace(/```/g, "").trim();
                const parsed = JSON.parse(cleanText);
                summary = parsed.summary || "";
                tags = JSON.stringify(parsed.tags || []);
                if (parsed.detailed_analysis) {
                  detailedAnalysisJson = JSON.stringify(parsed.detailed_analysis);
                }
              } catch (parseErr) {
                console.error(`[CRM Response Handler] Erro ao parsear JSON da LLM:`, parseErr);
                summary = responseText.substring(0, 100);
              }
            }
          } catch (llmErr) {
            console.error(`[CRM Response Handler] Erro ao analisar resposta do CRM com LLM:`, llmErr);
          }
          
          await db.prepare(`
            UPDATE crm_responses 
            SET response_text = ?, response_media_url = ?, response_media_type = ?, 
                ai_summary = ?, ai_tags = ?, ai_analysis_json = ?, status = 'answered', 
                answered_at = datetime('now'), updated_at = datetime('now')
            WHERE id = ?
          `).bind(responseText, mediaUrl, mediaType, summary, tags, detailedAnalysisJson, activeCrm.id).run();
          
          try {
            const stateRow = await db.prepare("SELECT crm_tags FROM conversation_state WHERE conversation_id = ?").bind(conversation.id).first<any>();
            let existingTags: string[] = [];
            if (stateRow?.crm_tags) {
              try {
                existingTags = JSON.parse(stateRow.crm_tags);
              } catch {
                existingTags = [];
              }
            }
            let newTags: string[] = [];
            try {
              newTags = JSON.parse(tags);
            } catch {
              newTags = [];
            }
            const mergedTags = Array.from(new Set([...existingTags, ...newTags]));
            
            await db.prepare("UPDATE conversation_state SET crm_tags = ?, updated_at = datetime('now') WHERE conversation_id = ?")
              .bind(JSON.stringify(mergedTags), conversation.id).run();
          } catch (tagErr) {
            console.error(`[CRM Response Handler] Erro ao fundir crm_tags:`, tagErr);
          }
          
          console.log(`[CRM Response Handler] Resposta CRM processada com sucesso para ${phone}`);
        } catch (crmProcErr) {
          console.error(`[CRM Response Handler] Erro geral no loop handleCrmResponse:`, crmProcErr);
        }
      };
      
      if (env.executionCtx && typeof env.executionCtx.waitUntil === 'function') {
        env.executionCtx.waitUntil(handleCrmResponse());
      } else {
        await handleCrmResponse();
      }
      console.log(`[CRM Response Handler] Resposta interceptada e processamento de CRM agendado para ${phone}/${slug}. Continuando fluxo conversacional.`);
    }

    // Buscar/criar estado da conversa
    const state = await getOrCreateState(db, conversation.id, slug);

    // Buscar histórico de mensagens
    const history = await getMessageHistory(db, conversation.id, 50);

    // Montar contexto completo
    const ctx: AutomationContext = {
      message: combinedMessage,
      conversation,
      contact,
      automation,
      state,
      history,
      env,
      baseUrl: (env as any).baseUrl,
    };

    // Carregar módulo de automação
    const loader = automationRegistry[slug];

    if (!loader) {
      await logError(
        db,
        automation.id,
        'module_not_found',
        `Módulo de automação não encontrado para slug: ${slug}`
      );
      console.error(`[AutomationEngine] Módulo não registrado: ${slug}`);
      return;
    }

    const automationModule = await loader();

    // Executar a lógica da automação
    await automationModule.handleMessage(ctx);

    console.log(`[AutomationEngine] Mensagem processada com sucesso para ${phone}/${slug}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[AutomationEngine] Erro ao processar mensagem:`, errorMsg);

    await logError(db, automation.id, 'processing_error', errorMsg);
  } finally {
    // Desregistrar env do realtime-service
    try {
      const { unregisterEnv } = await import("./services/realtime-service");
      if (conversationId) {
        unregisterEnv(conversationId);
      }
    } catch (err) {
      console.error("[AutomationEngine] Error unregistering env:", err);
    }

    // ─── LIBERAÇÃO DO LOCK & ENCADERNAÇÃO DE FILA ───
    try {
      const processingKey = `processing:${slug}:${phone}`;
      const hasQueuedKey = `has_queued_messages:${slug}:${phone}`;
      const queueKey = `queue:${slug}:${phone}`;

      // Se a Sequência 2 estiver sendo entregue de forma assíncrona passo-a-passo,
      // manter o lock ativo e não processar a fila agora (a última etapa fará o cleanup).
      const isDeliveringSeq2Key = `is_delivering_seq2:${slug}:${phone}`;
      const isDeliveringSeq2 = await env.KV.get(isDeliveringSeq2Key);
      if (isDeliveringSeq2 === "true") {
        console.log(`[AutomationEngine] Envio de Sequência 2 em progresso para ${phone}/${slug}. Mantendo lock ativo.`);
        return;
      }

      const hasQueued = await env.KV.get(hasQueuedKey);

      if (hasQueued === "true") {
        // Remover flag de fila
        await env.KV.delete(hasQueuedKey);

        // Mover as mensagens da fila temporária de volta para o debounce
        const qMessages = await env.KV.get(queueKey, "json") as IncomingMessage[] | null;
        if (qMessages && qMessages.length > 0) {
          await env.KV.delete(queueKey);

          const dbKey = `debounce:${slug}:${phone}`;
          await env.KV.put(dbKey, JSON.stringify(qMessages), { expirationTtl: 60 });

          console.log(`[AutomationEngine] Detectadas mensagens enfileiradas para ${phone}/${slug}. Agendando processamento sequencial pós-delay.`);

          // Agendar nova execução com delay curto (ex: 2 segundos de respiro) para evitar overlapping de mídias/copies
          const runQueuedAsync = async () => {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            await processMessageAsync(env, automation, phone, slug);
          };

          console.log(`[AutomationEngine] Executando fila sequencial de forma síncrona pós-sleep para garantir VM ativa...`);
          await runQueuedAsync();

          // Nota: Retornamos mantendo o lock ativo no KV para que novas chegadas continuem retidas!
          return;
        }
      }

      // Se não houver mais mensagens enfileiradas, deletar o lock de processamento de vez
      await env.KV.delete(processingKey);
      console.log(`[AutomationEngine] Lock de processamento finalizado e liberado para ${phone}/${slug}`);

    } catch (cleanupError) {
      console.error(`[AutomationEngine] Erro no cleanup do mutex:`, cleanupError);
    }
  }
}

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

/**
 * Combina múltiplas mensagens do debounce em uma única IncomingMessage.
 * Concatena textos separados por newline.
 * Mantém o tipo da última mensagem (para priorizar mídia se houver).
 */
function combineMessages(messages: IncomingMessage[]): IncomingMessage {
  if (messages.length === 1) return messages[0];

  // Separar textos e mídias
  const textParts: string[] = [];
  let lastMediaMessage: IncomingMessage | null = null;

  for (const msg of messages) {
    if (msg.textContent) {
      textParts.push(msg.textContent);
    }
    if (msg.messageType !== 'text' && msg.messageType !== 'unknown') {
      lastMediaMessage = msg;
    }
  }

  const combinedText = textParts.join('\n');

  // Se houve mídia, usar os dados dela mas com texto combinado
  if (lastMediaMessage) {
    return {
      ...lastMediaMessage,
      textContent: combinedText,
      rawBody: messages.map((m) => m.rawBody),
    };
  }

  // Apenas texto
  return {
    ...messages[0],
    textContent: combinedText,
    rawBody: messages.map((m) => m.rawBody),
  };
}
