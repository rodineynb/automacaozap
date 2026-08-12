/**
 * Ferramentas (tools/function calling) para o Agente SDR da automação Recheios
 * 
 * Cada ferramenta é uma ação que a IA pode disparar durante a conversa.
 * A lógica de QUANDO chamar está no prompt da IA.
 * A lógica de O QUE FAZER está aqui no código.
 */

import type { AutomationContext, ConversationState } from '../../automation-engine';
import { updateState } from '../../automation-engine';
import { sendText, sendDocument, sendImage, sendAudio, sendVideo, sendPixButton } from '../../services/whatsapp-service';
import { partitionMessage, calculateDelay, sleep, adjustScheduledTimeForSilentHours } from '../../services/message-utils';
import { PRODUCT, TEXTS, MEDIA_URLS, DELAYS } from './config';
import { sendLeadEvent, sendPurchaseEvent, sendPurchaseEventWithDetails, getTrackingData } from '../../services/facebook-tracking';
import { getApp } from '../../services/app-registry';
import { rewriteMessageViaLLM } from '../../services/llm-service';

// ============================================================
// DEFINIÇÕES DAS FERRAMENTAS (para enviar à LLM)
// ============================================================

export const TOOL_DEFINITIONS = [
  {
    name: 'seq1',
    description: 'Dispara a Sequência 1: envia a oferta inicial com textos, áudio e imagens. Use APENAS na primeira mensagem do cliente, quando não existe histórico anterior.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'seq2',
    description: 'Dispara a Sequência 2: envia os PDFs de receitas ao cliente. Use quando o cliente autorizar receber as receitas de R$10.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'pagamento',
    description: 'Registra o pagamento do cliente. Use IMEDIATAMENTE ao receber comprovante com nome R G FEITOSA 153DF.',
    parameters: {
      type: 'object',
      properties: {
        valor_pagamento: {
          type: 'number',
          description: 'Valor total pago (some todos os comprovantes)',
        },
        pago: {
          type: 'boolean',
          description: 'Sempre true ao registrar pagamento',
        },
        data_comprovante: {
          type: 'string',
          description: 'Data do pagamento conforme indicado no comprovante de pagamento (formato DD/MM/AAAA, dia nominal ex: "29", ou ISO YYYY-MM-DD). Se não encontrar, deixe em branco.',
        },
      },
      required: ['valor_pagamento', 'pago'],
    },
  },
  {
    name: 'sistema',
    description: 'Registra o acesso do cliente no sistema. Use após pagamento confirmado e cliente fornecer nome e email.',
    parameters: {
      type: 'object',
      properties: {
        nome: {
          type: 'string',
          description: 'Nome completo do cliente (nunca invente)',
        },
        email: {
          type: 'string',
          description: 'Email do cliente sem espaços (nunca invente)',
        },
        codigo_produto: {
          type: 'string',
          description: 'Código do produto: PROD-R1I27D (principal/Confeitaria) ou PROD-H3GQBU (upsell/Máquina de Vendas)',
        },
      },
      required: ['nome', 'email', 'codigo_produto'],
    },
  },
  {
    name: 'entregar_pdf_crm',
    description: 'Envia APENAS os 5 PDFs de receitas ao cliente, sem ofertas, bônus ou áudios extras. Use quando o cliente pagar R$ 10 e quiser apenas as receitas básicas (Opção B no CRM).',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'agendar_promessa',
    description: 'Agenda uma promessa de pagamento para o cliente na data especificada (ex: amanhã, dia tal). Use assim que o cliente concordar/fornecer a data.',
    parameters: {
      type: 'object',
      properties: {
        data_promessa: {
          type: 'string',
          description: 'A data da promessa de pagamento no formato YYYY-MM-DD. NUNCA invente, calcule com base na data de hoje informada no prompt.',
        },
      },
      required: ['data_promessa'],
    },
  },
];

// ============================================================
// EXECUTORES DAS FERRAMENTAS
// ============================================================

/**
 * Executa uma ferramenta chamada pela IA
 */
export async function executeTool(
  ctx: AutomationContext,
  toolName: string,
  args: Record<string, any>
): Promise<{ success: boolean; result?: string; error?: string }> {
  try {
    switch (toolName) {
      case 'seq1':
        return await executeSeq1(ctx);
      case 'seq2':
        return await executeSeq2(ctx);
      case 'pagamento':
        return await executePagamento(ctx, args);
      case 'sistema':
        return await executeSistema(ctx, args);
      case 'entregar_pdf_crm':
        return await executeEntregarPdfCrm(ctx);
      case 'agendar_promessa':
        return await executeAgendarPromessa(ctx, args);
      default:
        return { success: false, error: `Ferramenta desconhecida: ${toolName}` };
    }
  } catch (error) {
    console.error(`Erro ao executar ferramenta ${toolName}:`, error);
    return { success: false, error: String(error) };
  }
}

// ============================================================
// FUNNEL STAGES DYNAMIC DISPATCHER
// ============================================================

/**
 * Envia as mensagens de um determinado estágio de funil configurado no banco de dados.
 */
export async function sendFunnelStage(
  db: D1Database,
  whatsappApiId: string,
  phone: string,
  automation: any,
  contact: any,
  state: any,
  stageKey: string,
  kv: any,
  extraVars: Record<string, string> = {},
  skipAwait = false
): Promise<{ success: boolean; sent: boolean; messageLog: string[]; promises?: Promise<any>[] }> {
  try {
    const stage = await db.prepare(
      "SELECT id, enabled, rewrite_mode, variations FROM automation_funnel_stages WHERE automation_id = ? AND stage_key = ?"
    ).bind(automation.id, stageKey).first<{ id: string; enabled: number; rewrite_mode: string; variations: string }>();

    if (!stage || !stage.enabled) {
      console.log(`[Funnel Stage] ${stageKey} para ${phone} está desativado ou não configurado.`);
      return { success: true, sent: false, messageLog: [] };
    }

    const fieldsRes = await db.prepare(
      "SELECT * FROM automation_funnel_fields WHERE stage_id = ? ORDER BY sort_order ASC"
    ).bind(stage.id).all<{ type: string; content: string; file_name: string | null }>();
    const fields = fieldsRes.results || [];

    if (fields.length === 0) {
      console.log(`[Funnel Stage] Nenhuns campos encontrados para ${stageKey}`);
      return { success: true, sent: false, messageLog: [] };
    }

    const messageLog: string[] = [];
    const firstName = (contact.name || 'amiga').split(/\s+/)[0] || 'amiga';
    const attendantName = (automation as any).attendant_name || 'Julia';

    const replaceVariables = (txt: string) => {
      return txt
        .replace(/{{primeiro_nome}}/g, firstName)
        .replace(/{primeiro_nome}/g, firstName)
        .replace(/{{primeiro_name}}/g, firstName)
        .replace(/{primeiro_name}/g, firstName)
        .replace(/{{nome}}/g, contact.name || 'amiga')
        .replace(/{nome}/g, contact.name || 'amiga')
        .replace(/{{email_cliente}}/g, extraVars.email || state.client_email || '')
        .replace(/{email_cliente}/g, extraVars.email || state.client_email || '')
        .replace(/{{valor_pago}}/g, extraVars.valor_pago || (state.total_paid ? state.total_paid.toString() : '10.00'))
        .replace(/{valor_pago}/g, extraVars.valor_pago || (state.total_paid ? state.total_paid.toString() : '10.00'))
        .replace(/{{valor}}/g, extraVars.valor_pago || (state.total_paid ? state.total_paid.toString() : '10.00'))
        .replace(/{valor}/g, extraVars.valor_pago || (state.total_paid ? state.total_paid.toString() : '10.00'))
        .replace(/Julia/g, attendantName);
    };

    // Pré-carregar reescritas dinâmicas em paralelo para evitar timeouts de requisições sequenciais
    const rewrittenTexts = new Map<number, string>();
    const rewritePromises: Promise<any>[] = [];

    if (stage.rewrite_mode === 'dynamic') {
      fields.forEach((field, index) => {
        if (field.type === 'text') {
          rewritePromises.push(
            rewriteMessageViaLLM(db, automation.id, field.content, 1, contact.phone, contact.name || state.client_name, stageKey)
              .then(dynList => {
                const rewritten = dynList[0] || field.content;
                rewrittenTexts.set(index, rewritten);
              })
              .catch(err => {
                console.error(`[Funnel Message Dynamic Rewrite] Erro no bloco ${index}:`, err);
                rewrittenTexts.set(index, field.content);
              })
          );
        }
      });
    }

    if (rewritePromises.length > 0) {
      console.log(`[Funnel Stage] Executando ${rewritePromises.length} reescritas dinâmicas em paralelo...`);
      await Promise.all(rewritePromises);
    }

    const promises: Promise<any>[] = [];
    let i = 0;
    while (i < fields.length) {
      const field = fields[i];

      // Sleep between blocks (except for the first one)
      if (i > 0) {
        await sleep(1500);
      }
      
      // Se for um documento/imagem/vídeo e o próximo também for, podemos agrupar todos os consecutivos
      if (field.type === 'document' || field.type === 'image' || field.type === 'video') {
        const batch = [field];
        let j = i + 1;
        while (j < fields.length && (fields[j].type === 'document' || fields[j].type === 'image' || fields[j].type === 'video')) {
          batch.push(fields[j]);
          j++;
        }
        
        console.log(`[Funnel Stage] Enviando lote de ${batch.length} mídias em paralelo para ${phone}`);
        const batchPromises = batch.map(f => {
          if (f.type === 'document') {
            return sendDocument(db, whatsappApiId, phone, f.content, f.file_name || 'apostila.pdf', kv, automation.id)
              .catch(err => console.error(`[Funnel Stage] Erro ao enviar documento ${f.file_name}:`, err));
          } else if (f.type === 'image') {
            return sendImage(db, whatsappApiId, phone, f.content, f.file_name || undefined, kv, automation.id)
              .catch(err => console.error(`[Funnel Stage] Erro ao enviar imagem:`, err));
          } else {
            return sendVideo(db, whatsappApiId, phone, f.content, f.file_name || undefined, kv, automation.id)
              .catch(err => console.error(`[Funnel Stage] Erro ao enviar vídeo:`, err));
          }
        });
        
        promises.push(...batchPromises);
        
        // Registrar as mensagens enviadas
        for (const f of batch) {
          if (f.type === 'document') {
            messageLog.push(`[PDF de receita enviado: ${f.file_name || 'documento'}]`);
          } else if (f.type === 'image') {
            messageLog.push(`[Imagem enviada]`);
          } else {
            messageLog.push(`[Vídeo enviado]`);
          }
        }
        
        // Avançar o ponteiro
        i = j;
      } else {
        // Envio sequencial para texto e áudio
        if (field.type === 'text') {
          let textToSend = field.content;
          if (stage.rewrite_mode === 'dynamic') {
            textToSend = rewrittenTexts.get(i) || field.content;
          } else if (stage.rewrite_mode === 'static' && stage.variations) {
            try {
              const vars = JSON.parse(stage.variations);
              if (Array.isArray(vars) && vars.length > 0) {
                const charSum = phone.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                const idxVar = charSum % vars.length;
                textToSend = vars[idxVar] || field.content;
              }
            } catch (e) {
              console.error("[Funnel Message Static Variations] Erro:", e);
            }
          }
          
          const formattedText = replaceVariables(textToSend);
          const p = sendText(db, whatsappApiId, phone, formattedText, kv, automation.id)
            .catch(err => console.error(`[Funnel Stage] Erro ao enviar texto:`, err));
          promises.push(p);
          messageLog.push(formattedText);
        } else if (field.type === 'audio') {
          const p = sendAudio(db, whatsappApiId, phone, field.content, kv, automation.id)
            .catch(err => console.error(`[Funnel Stage] Erro ao enviar áudio:`, err));
          promises.push(p);
          messageLog.push(`[Áudio de entrega enviado]`);
        }
        
        i++;
      }
    }

    if (skipAwait) {
      console.log(`[Funnel Stage] Pulando await interno de ${promises.length} disparos para ${phone}.`);
      return { success: true, sent: true, messageLog, promises };
    }

    console.log(`[Funnel Stage] Aguardando a conclusão de todos os ${promises.length} disparos...`);
    await Promise.all(promises);
    console.log(`[Funnel Stage] Todos os disparos concluídos para ${phone}.`);

    return { success: true, sent: true, messageLog };
  } catch (err) {
    console.error(`[Funnel Stage] Erro ao enviar estágio ${stageKey}:`, err);
    return { success: false, sent: false, messageLog: [] };
  }
}

// ============================================================
// SEQ1 — Sequência de oferta inicial
// ============================================================

async function executeSeq1(ctx: AutomationContext): Promise<{ success: boolean; result: string }> {
  const { env, automation, contact, state } = ctx;
  const db = env.DB;
  const whatsappApiId = automation.whatsapp_api_id;
  const phone = contact.phone;
  const nome = contact.name || 'amiga';
  const firstName = nome.split(/\s+/)[0] || 'amiga';

  // Verificar se SEQ1 já foi chamada (apenas para automação automática, não manual)
  if (state.seq1_called && !ctx.isManual) {
    return { success: true, result: 'SEQ1 já foi executada anteriormente.' };
  }

  // Marcar como chamada
  await updateState(db, state.conversation_id, {
    seq1_called: 1,
    phase: 'seq1_sent',
    last_tool_called: 'seq1',
  });

  // Marcar conversa como aberta
  await db.prepare(
    "UPDATE conversations SET status = 'open', updated_at = datetime('now') WHERE id = ?"
  ).bind(state.conversation_id).run();

  // Disparar evento de Lead no Facebook Conversions API (CAPI)
  if (automation.pixel_id && automation.facebook_token) {
    const lead = await db.prepare(
      'SELECT id, cliente_codigo FROM automation_leads WHERE phone = ? AND automation_id = ?'
    ).bind(phone, automation.id).first<{ id: string; cliente_codigo: number | null }>();
    const leadId = lead?.cliente_codigo ? String(lead.cliente_codigo) : (lead?.id || crypto.randomUUID());
    const tracking = await getTrackingData(db, phone, automation.id);

    console.log(`[Facebook CAPI] Enviando evento Lead para ${phone} (Pixel: ${automation.pixel_id})`);
    try {
      const success = await sendLeadEvent(db, automation.id, automation.pixel_id, automation.facebook_token, {
        phone,
        name: nome,
        trackingData: tracking,
        leadId,
        wabaId: automation.waba_id,
        pageId: automation.page_id,
        contentName: automation.product_name || 'recheios a prova de fogo',
      });
      console.log(`[Facebook CAPI] Evento Lead enviado com sucesso? ${success}`);
    } catch (err) {
      console.error(`[Facebook CAPI] Erro ao enviar evento Lead:`, err);
    }
  }

  // Tentar disparar o estágio 'welcome' dinâmico do banco
  const stageRes = await sendFunnelStage(db, whatsappApiId, phone, automation, contact, state, 'welcome', env.KV);

  if (stageRes.sent) {
    await saveAssistantMessages(db, state.conversation_id, stageRes.messageLog);
  } else {
    // Fallback legado
    // Enviar apenas o áudio de oferta (se configurado)
    if (MEDIA_URLS.seq1.audio) {
      await sendAudio(db, whatsappApiId, phone, MEDIA_URLS.seq1.audio, env.KV);
    }

    // Sleep de 3s para humanização e garantir que o áudio seja entregue antes do texto complementar
    await sleep(3000);

    // 5 Variações premium do texto de boas-vindas (Seq1 / Anunciador)
    const seq1Variations = [
      `Oi, *${firstName}*! Tudo bem? Aqui é a Julia 😊\n\nVou te liberar agora as *200 receitas de recheios a frio* especiais!\n\nVocê confere primeiro e, se estiver tudo certo, depois faz o pagamento de *R$ 10,00.*\n\nE, se quiser ir além, depois eu também posso te mostrar o pacote completo — com receitas de tortinhas, Fatias de Feira mais vendidas, videoaulas e muito mais... 🍰\n\n👇 *Posso te enviar agora?* 🙏`,
      `Olá, *${firstName}*! Tudo joia? Aqui é a Julia 😊\n\nPreparei para você as nossas famosas *200 receitas de recheios a frio*!\n\nO combinado é simples: você baixa as apostilas primeiro, confere tudo, e depois faz o Pix de *R$ 10,00* se gostar.\n\nE depois, se você quiser, eu te apresento o nosso Kit Completo com receitas de bolos no pote, fatias de feira campeãs de vendas e videoaulas de bônus... 🍰\n\n👇 *Posso fazer o envio agora?* 🙏`,
      `Oi, *${firstName}*! Como vai? Julia aqui 😊\n\nJá separei as suas *200 receitas de recheios a frio* especiais para você começar!\n\nVocê recebe e avalia o material primeiro. Se gostar e achar que vale a pena, depois faz o pagamento de *R$ 10,00*.\n\nMais à frente, posso te mostrar o nosso Kit de Confeitaria completo, com bolos caseiros, videoaulas passo a passo e muito mais... 🍰\n\n👇 *Posso te mandar os arquivos agora?* 🙏`,
      `Oi, *${firstName}*! Que bom falar com você! Aqui é a Julia 😊\n\nDeixei no ponto para você as *200 receitas de recheios a frio* que fazem o maior sucesso!\n\nVocê olha os arquivos primeiro e, se estiver tudo certinho, faz o Pix de *R$ 10,00* depois.\n\nE se você quiser crescer ainda mais nas vendas, depois eu te mostro o Kit Completo com receitas de brigadeiros, bolos caseirinhos e bônus incríveis... 🍰\n\n👇 *Posso enviar o seu acesso agora?* 🙏`,
      `Olá, *${firstName}*! Tudo ótimo por aí? Julia por aqui 😊\n\nProntinha para receber as *200 receitas de recheios a frio* mais cremosas do Brasil?\n\nVocê baixa e testa primeiro, e depois faz o pagamento de *R$ 10,00* com total segurança.\n\nDepois posso te apresentar o nosso Kit Completo com fatias gourmet, bolos caseirinhos, videoaulas e suporte vitalício... 🍰\n\n👇 *Posso te liberar o envio agora?* 🙏`
    ];

    const welcomeTextRaw = seq1Variations[Math.floor(Math.random() * seq1Variations.length)];
    const attendantName = (automation as any).attendant_name || 'Julia';
    const welcomeText = welcomeTextRaw.replace(/Julia/g, attendantName);

    // Enviar o texto de boas-vindas
    await sendText(db, whatsappApiId, phone, welcomeText, env.KV);
    
    await saveAssistantMessages(db, state.conversation_id, [
      '[Áudio de oferta enviado]',
      welcomeText,
    ]);
  }

  // Cancelar follow-ups antigos se for disparo manual para não duplicar agendamentos
  if (ctx.isManual) {
    await cancelFollowups(db, state.conversation_id, '%');
  }

  // Agendar SOMENTE os follow-ups de reengajamento (vigia + finalizador)
  // Os follow-ups de cobrança (incentivador, cobradores) serão agendados no SEQ2,
  // para que os tempos contem a partir de quando o cliente recebeu os PDFs.
  try {
    const reengStages = await db.prepare(
      "SELECT key, delay_minutes FROM automation_followup_stages WHERE automation_id = ? AND enabled = 1 AND class = 'reengajamento'"
    ).bind(automation.id).all<{ key: string; delay_minutes: number }>();

    if (reengStages.results && reengStages.results.length > 0) {
      for (const stage of reengStages.results) {
        await scheduleFollowup(db, state.conversation_id, automation.slug, stage.key, stage.delay_minutes * 60 * 1000);
      }
      console.log(`[Followup Scheduler] Agendados ${reengStages.results.length} follow-ups de reengajamento.`);
    } else {
      // Fallback retrocompatibilidade: apenas reengajamento
      const defaults = [
        { key: 'followup_vigia_15min', delay: 15 * 60 * 1000 },
        { key: 'followup_finalizador_12h', delay: 12 * 60 * 60 * 1000 },
      ];
      for (const d of defaults) {
        await scheduleFollowup(db, state.conversation_id, automation.slug, d.key, d.delay);
      }
    }
  } catch (err) {
    console.error(`[Followup Scheduler] Erro ao buscar/agendar follow-ups de reengajamento:`, err);
  }

  return { success: true, result: 'Sequência 1 executada com sucesso.' };
}

// ============================================================
// SEQ2 — Entrega dos PDFs de receitas
// ============================================================

export interface Seq2Step {
  type: 'document' | 'documents' | 'text' | 'audio' | 'image' | 'images';
  documents?: { url: string; name: string }[];
  images?: { url: string; caption?: string }[];
  url?: string;
  name?: string;
  text?: string;
  caption?: string;
  delay: number;
}

export function getSeq2Steps(firstName: string): Seq2Step[] {
  return [
    {
      type: 'documents',
      documents: [
        {
          url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%205.%20Recheios%20Sem%20Fog%C3%A3o%20(101%20Receitas).pdf',
          name: 'Apostila 5. Recheios Sem Fogão (101 Receitas).pdf'
        },
        {
          url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%201.%20Recheios%20Sem%20Fog%C3%A3o%20(50%20Receitas).pdf',
          name: 'Apostila 1. Recheios Sem Fogão (50 Receitas).pdf'
        },
        {
          url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%203.%20Recheios%20Sem%20Fog%C3%A3o%20(20%20Receitas).pdf',
          name: 'Apostila 3. Recheios Sem Fogão (20 Receitas).pdf'
        },
        {
          url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%204.%20Recheios%20Sem%20Fog%C3%A3o%20(23%20Receitas).pdf',
          name: 'Apostila 4. Recheios Sem Fogão (23 Receitas).pdf'
        },
        {
          url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%202.%20Recheios%20Sem%20Fog%C3%A3o%20(34%20Receitas).pdf',
          name: 'Apostila 2. Recheios Sem Fogão (34 Receitas).pdf'
        }
      ],
      delay: 2500
    },
    {
      type: 'text',
      text: `*${firstName}*, acabei de te enviar as *200 receitas de recheios a frio*, que vão *transformar qualquer docinho simples* em algo incrível.`,
      delay: 2500
    },
    {
      type: 'audio',
      url: 'https://dados.promentor21.top/Funil%20Recheios/audio2-v3.mp3',
      delay: 3000
    },
    {
      type: 'text',
      text: `📋 *DADOS DO PIX*:\n\nTipo: *PIX Celular*\nNome: *R G FEITOSA 153DF*\nBanco: *Banco Cora*\nChave PIX: *61982277206*`,
      delay: 2000
    },
    {
      type: 'images',
      images: [
        {
          url: 'https://dados.promentor21.top/Funil%20Recheios/img2.jpeg',
          caption: `1️⃣ PACOTE 1: RECHEIOS A FRIO (O Pontapé Ideal) \n✅ +200 receitas cremosas sem precisar de fogão ou forno. \n💰 Apenas R$ 10,00!  \n\n2️⃣ PACOTE 2: RECHEIOS + MASSAS (Qualidade que Encanta) \n✅ Tudo do Pacote 1 + massas fofinhas e estruturadas para bolos e fatias. \n💰 Apenas R$ 15,00! (Só R$ 5,00 a mais para elevar seu nível!)  \n\n3️⃣ PACOTE 3: KIT COMPLETO (Tudo para Arrasar - O MAIS ESCOLHIDO! ⭐) \n✅ Tudo dos pacotes anteriores + Vídeo Aulas, Brigadeiros, Geladinhos, Pipocas Gourmet, Copos da Felicidade e Bônus Exclusivos! \n💰 Por apenas R$ 25,00!`
        },
        {
          url: 'https://dados.promentor21.top/Funil%20Recheios/img-bonus.jpeg',
          caption: `🎁 *Bônus Exclusivos no Pacote 3*:\n\n- *Caseirinho (Bolos Caseiros Lucrativos)*\n- *Método Fatias de Feira* — As receitas mais *vendidas* aqui comigo, *que minhas clientes amam*!\n- *Estratégia de Vendas para os Primeiros 30 Dias* — Passo a passo para você *vender mais rápido* e ter sucesso logo de cara!`
        }
      ],
      delay: 3000
    },
    {
      type: 'text',
      text: `E o melhor: o Pacote Completo é sempre atualizado com novas receitas, e quem escolher o Pacote 3 tem acesso vitalício.\nOu seja, nunca mais precisa comprar receita nenhuma! 😍\n\nAgora, é só escolher o pacote que mais combina com você e me mandar o comprovante do PIX logo abaixo!\nEu libero tudo na hora!\nA hora de agir é agora, não perca essa chance de transformar seus doces e suas vendas! 🚀\n\n📋 DADOS DO PIX:\nTipo: PIX Celular\nNome: R G FEITOSA 153DF\nBanco: Banco Cora\nChave PIX:\n👇 Copia e cola abaixo 👇\n\n61982277206\n\nMe manda o comprovante do PIX e eu libero tudo na hora! 🎯`,
      delay: 0
    }
  ];
}

async function executeSeq2(ctx: AutomationContext): Promise<{ success: boolean; result: string }> {
  const { env, automation, contact, state } = ctx;
  const db = env.DB;
  const kv = env.KV;
  const whatsappApiId = automation.whatsapp_api_id;
  const phone = contact.phone;
  const nome = contact.name || 'amiga';
  const firstName = nome.split(/\s+/)[0] || 'amiga';

  // Marcar como chamada (pode ser chamada mais de uma vez se cliente não recebeu)
  await updateState(db, state.conversation_id, {
    seq2_called: 1,
    phase: 'seq2_sent',
    last_tool_called: 'seq2',
  });

  // Marcar conversa como pendente (aguardando pagamento)
  await db.prepare(
    "UPDATE conversations SET status = 'pending', updated_at = datetime('now') WHERE id = ?"
  ).bind(state.conversation_id).run();

  // Cancelar follow-ups de reengajamento (porque o lead respondeu e recebeu as receitas!)
  try {
    const reengajamentoStages = await db.prepare(
      "SELECT key FROM automation_followup_stages WHERE automation_id = ? AND class = 'reengajamento'"
    ).bind(automation.id).all<{ key: string }>();

    if (reengajamentoStages.results && reengajamentoStages.results.length > 0) {
      for (const stage of reengajamentoStages.results) {
        await cancelFollowups(db, state.conversation_id, stage.key);
      }
      console.log(`[Followup Canceller] Cancelados ${reengajamentoStages.results.length} follow-ups de reengajamento pendentes.`);
    } else {
      // Fallback retrocompatibilidade
      await cancelFollowups(db, state.conversation_id, 'followup_vigia%');
      await cancelFollowups(db, state.conversation_id, 'followup_finalizador%');
    }
  } catch (err) {
    console.error(`[Followup Canceller] Erro ao cancelar follow-ups de reengajamento:`, err);
    await cancelFollowups(db, state.conversation_id, 'followup_vigia%');
    await cancelFollowups(db, state.conversation_id, 'followup_finalizador%');
  }

  // Agendar follow-ups de cobrança/incentivo (tempos contam a partir de AGORA = quando o cliente recebeu os PDFs)
  try {
    const cobrancaStages = await db.prepare(
      "SELECT key, delay_minutes FROM automation_followup_stages WHERE automation_id = ? AND enabled = 1 AND (class != 'reengajamento' OR class IS NULL)"
    ).bind(automation.id).all<{ key: string; delay_minutes: number }>();

    if (cobrancaStages.results && cobrancaStages.results.length > 0) {
      for (const stage of cobrancaStages.results) {
        await scheduleFollowup(db, state.conversation_id, automation.slug, stage.key, stage.delay_minutes * 60 * 1000);
      }
      console.log(`[Followup Scheduler] Agendados ${cobrancaStages.results.length} follow-ups de cobrança pós-SEQ2.`);
    } else {
      // Fallback retrocompatibilidade: follow-ups de cobrança padrão
      const defaults = [
        { key: 'followup_incentivador_1h', delay: 60 * 60 * 1000 },
        { key: 'followup_cobrador_amigo_10h', delay: 10 * 60 * 60 * 1000 },
        { key: 'followup_cobrador_curioso_34h', delay: 34 * 60 * 60 * 1000 },
        { key: 'followup_cobrador_final_58h', delay: 58 * 60 * 60 * 1000 },
      ];
      for (const d of defaults) {
        await scheduleFollowup(db, state.conversation_id, automation.slug, d.key, d.delay);
      }
      console.log(`[Followup Scheduler] Agendados 4 follow-ups de cobrança padrão pós-SEQ2.`);
    }
  } catch (err) {
    console.error(`[Followup Scheduler] Erro ao agendar follow-ups de cobrança pós-SEQ2:`, err);
  }

  try {
    // Buscar se o lead já está pago para evitar alterar updated_at
    const leadPaid = await db.prepare(
      "SELECT pago FROM automation_leads WHERE phone = ? AND automation_id = ?"
    ).bind(phone, automation.id).first<{ pago: number }>();

    if (leadPaid && leadPaid.pago === 1) {
      // Se já está pago, atualizamos recebeu_acesso mas PRESERVAMOS o updated_at antigo!
      await db.prepare(
        "UPDATE automation_leads SET recebeu_acesso = 1 WHERE phone = ? AND automation_id = ?"
      ).bind(phone, automation.id).run();
      console.log(`[Seq2] Marcado recebeu_acesso = 1 na tabela de leads para ${phone} (preservando data de pagamento)`);
    } else {
      await db.prepare(
        "UPDATE automation_leads SET recebeu_acesso = 1, updated_at = datetime('now') WHERE phone = ? AND automation_id = ?"
      ).bind(phone, automation.id).run();
      console.log(`[Seq2] Marcado recebeu_acesso = 1 na tabela de leads para ${phone}`);
    }
  } catch (err) {
    console.error(`[Seq2] Erro ao marcar recebeu_acesso na tabela de leads:`, err);
  }

  // Sinalizar no KV que estamos entregando a sequência (bloqueia liberação precoce de Mutex)
  const isDeliveringKey = `is_delivering_seq2:${automation.slug}:${phone}`;
  await kv.put(isDeliveringKey, "true", { expirationTtl: 120 });

  const executeSeq2Async = async () => {
    try {
      const stageRes = await sendFunnelStage(db, whatsappApiId, phone, automation, contact, state, 'delivery', env.KV, {}, true);

      if (stageRes.sent) {
        await saveAssistantMessages(db, state.conversation_id, stageRes.messageLog);
        
        const allPromises = [...(stageRes.promises || [])];
        
        // Espera mais 1.5s após os disparos anteriores antes de mandar o botão Pix para manter a ordem correta
        await sleep(1500);

        try {
          console.log(`[Seq2] Enviando botão nativo do Pix pós-estágio 'delivery' para ${phone}`);
          const pixPromise = sendPixButton(db, whatsappApiId, phone, '61982277206', 'PHONE', 'R G FEITOSA 153DF', kv)
            .catch(pixErr => console.error(`[Seq2] Erro ao enviar botão do Pix pós-estágio 'delivery':`, pixErr));
          allPromises.push(pixPromise);
        } catch (pixErr) {
          console.error(`[Seq2] Erro ao criar promessa do botão do Pix pós-estágio 'delivery':`, pixErr);
        }

        console.log(`[Seq2] Aguardando conclusão de todos os ${allPromises.length} disparos dinâmicos...`);
        await Promise.all(allPromises);
        console.log(`[Seq2] Todos os disparos dinâmicos concluídos com sucesso.`);
      } else {
        const allPromises: Promise<any>[] = [];

        // 1. Enviar os 5 PDFs
        const pdfs = [
          { url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%205.%20Recheios%20Sem%20Fog%C3%A3o%20(101%20Receitas).pdf', name: 'Apostila 5. Recheios Sem Fogão (101 Receitas).pdf' },
          { url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%201.%20Recheios%20Sem%20Fog%C3%A3o%20(50%20Receitas).pdf', name: 'Apostila 1. Recheios Sem Fogão (50 Receitas).pdf' },
          { url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%203.%20Recheios%20Sem%20Fog%C3%A3o%20(20%20Receitas).pdf', name: 'Apostila 3. Recheios Sem Fogão (20 Receitas).pdf' },
          { url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%204.%20Recheios%20Sem%20Fog%C3%A3o%20(23%20Receitas).pdf', name: 'Apostila 4. Recheios Sem Fogão (23 Receitas).pdf' },
          { url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%202.%20Recheios%20Sem%20Fog%C3%A3o%20(34%20Receitas).pdf', name: 'Apostila 2. Recheios Sem Fogão (34 Receitas).pdf' }
        ];

        console.log(`[Seq2] Enviando 5 PDFs em paralelo para ${phone}`);
        const pdfPromises = pdfs.map(pdf => 
          sendDocument(db, whatsappApiId, phone, pdf.url, pdf.name, kv)
        );
        allPromises.push(...pdfPromises);

        // Salvar logs das receitas enviadas no D1 em lote único
        const pdfLogs = pdfs.map(pdf => `[PDF de receita enviado: ${pdf.name}]`);
        await saveAssistantMessages(db, state.conversation_id, pdfLogs);

        // Delay de 2 segundos para os PDFs começarem a carregar no WhatsApp do lead
        console.log(`[Seq2] Aguardando delay de 2s pós-PDFs...`);
        await sleep(2000);

        const isSpecialFollowupOffer = state.oferta_19_90_feita === 1 || 
                                       state.funil_encerrado === 1 || 
                                       state.last_tool_called === 'vigia' || 
                                       state.last_tool_called === 'finalizador' ||
                                       state.last_tool_called === 'cobrador_final';

        if (isSpecialFollowupOffer) {
          let offerValue = '19,90';
          if (state.last_tool_called === 'cobrador_final') {
            offerValue = '10,00';
          } else if (state.funil_encerrado === 1 || state.last_tool_called === 'finalizador') {
            offerValue = '12,90';
          } else if (state.oferta_19_90_feita === 1 || state.last_tool_called === 'vigia') {
            offerValue = '19,90';
          }

          const textRecovery = `*${firstName}*, já estou te entregando aqui em cima as apostilas do kit básico para você ir conferindo as receitas! 😍🍰\n\nEstou aguardando o seu Pix no valor da oferta especial de *R$ ${offerValue}* para liberar o seu acesso vitalício ao *Kit Completo* (com todas as videoaulas gravadas, apostilas extras, brigadeiros sem fogo e bônus)!\n\nAssim que você me mandar a foto do comprovante por aqui, eu ativo a sua conta na mesma hora! 🎯\n\n📋 *DADOS DO PIX*:\nTipo: *PIX Celular*\nNome: *R G FEITOSA 153DF*\nBanco: *Banco Cora*\nChave PIX:\n👇 Copia e cola abaixo 👇\n\n61982277206\n\nMe envia o comprovante aqui embaixo para liberarmos tudo! 🚀`;
          
          console.log(`[Seq2] Enviando Texto de Oferta Especial Recuperada para ${phone} (Valor: R$ ${offerValue})`);
          const pTextRec = sendText(db, whatsappApiId, phone, textRecovery, kv);
          allPromises.push(pTextRec);
          await saveAssistantMessages(db, state.conversation_id, [textRecovery]);

          await sleep(1500);

          // Enviar Botão do Pix nativo
          try {
            console.log(`[Seq2] Enviando botão nativo do Pix pós-oferta especial para ${phone}`);
            const pPixRec = sendPixButton(db, whatsappApiId, phone, '61982277206', 'PHONE', 'R G FEITOSA 153DF', kv)
              .catch(pixErr => console.error(`[Seq2] Erro ao enviar botão do Pix pós-oferta especial:`, pixErr));
            allPromises.push(pPixRec);
          } catch (pixErr) {
            console.error(`[Seq2] Erro ao enviar botão do Pix pós-oferta especial:`, pixErr);
          }
          
          console.log(`[Seq2] Aguardando conclusão de todos os ${allPromises.length} disparos do fallback de recuperação...`);
          await Promise.all(allPromises);
          console.log(`[Seq2] Todos os disparos do fallback de recuperação concluídos.`);
          return;
        }

        // 2. Enviar Texto 1 (5 variações premium)
        const text1Variations = [
          `*${firstName}*, acabei de te enviar as *200 receitas de recheios a frio* que te prometi! Elas vão *transformar qualquer docinho simples* em uma verdadeira obra de arte lucrativa. Dá uma olhadinha nos arquivos acima! 🍰✨`,
          `Prontinho, *${firstName}*! As suas *200 receitas de recheios a frio* já estão aí em cima. Preparei esse material com muito carinho para te ajudar a *mudar o nível dos seus doces* de forma prática! 😍🍰`,
          `Tudo enviado com muito carinho, *${firstName}*! Estão aí em cima as *200 receitas de recheios a frio* que vão te ajudar a economizar muito gás e *multiplicar as suas encomendas* de forma simples e rápida! 🚀🍰`,
          `Já estão em suas mãos, *${firstName}*! As *200 receitas de recheios a frio* foram enviadas com sucesso aqui em cima. Elas são a chave para você *faturar muito mais* na cozinha com total praticidade! 🧁✨`,
          `Receitas na mão, *${firstName}*! Acabei de carregar as *200 receitas de recheios a frio* especiais aí em cima para você. Tenho certeza de que você vai amar a textura e a praticidade de cada uma delas! 😍💖`
        ];
        const text1 = text1Variations[Math.floor(Math.random() * text1Variations.length)];

        console.log(`[Seq2] Enviando Texto 1 para ${phone}`);
        const pText1 = sendText(db, whatsappApiId, phone, text1, kv);
        allPromises.push(pText1);
        await saveAssistantMessages(db, state.conversation_id, [text1]);

        // Delay de 1.5s
        await sleep(1500);

        // 3. Enviar Áudio 2
        const audioUrl = 'https://dados.promentor21.top/Funil%20Recheios/audio2-v3.mp3';
        console.log(`[Seq2] Enviando Áudio 2 para ${phone}`);
        const pAudio = sendAudio(db, whatsappApiId, phone, audioUrl, kv);
        allPromises.push(pAudio);
        await saveAssistantMessages(db, state.conversation_id, ['[Áudio de entrega enviado]']);

        // Delay de 1.5s
        await sleep(1500);

        // 4. Enviar Texto 2 (Pix Details)
        const text2 = `📋 *DADOS DO PIX*:\n\nTipo: *PIX Celular*\nNome: *R G FEITOSA 153DF*\nBanco: *Banco Cora*\nChave PIX: *61982277206*`;
        console.log(`[Seq2] Enviando Dados Pix para ${phone}`);
        const pText2 = sendText(db, whatsappApiId, phone, text2, kv);
        allPromises.push(pText2);
        await saveAssistantMessages(db, state.conversation_id, [text2]);

        // Delay de 1.5s
        await sleep(1500);

        // 5. Enviar Imagens de Preços e Bônus
        const images = [
          { url: 'https://dados.promentor21.top/Funil%20Recheios/img2.jpeg', caption: `1️⃣ PACOTE 1: RECHEIOS A FRIO (O Pontapé Ideal) \n✅ +200 receitas cremosas sem precisar de fogão ou forno. \n💰 Apenas R$ 10,00!  \n\n2️⃣ PACOTE 2: RECHEIOS + MASSAS (Qualidade que Encanta) \n✅ Tudo do Pacote 1 + massas fofinhas e estruturadas para bolos e fatias. \n💰 Apenas R$ 15,00! (Só R$ 5,00 a mais para elevar seu nível!)  \n\n3️⃣ PACOTE 3: KIT COMPLETO (Tudo para Arrasar - O MAIS ESCOLHIDO! ⭐) \n✅ Tudo dos pacotes anteriores + Vídeo Aulas, Brigadeiros, Geladinhos, Pipocas Gourmet, Copos da Felicidade e Bônus Exclusivos! \n💰 Por apenas R$ 25,00!` },
          { url: 'https://dados.promentor21.top/Funil%20Recheios/img-bonus.jpeg', caption: `🎁 *Bônus Exclusivos no Pacote 3*:\n\n- *Caseirinho (Bolos Caseiros Lucrativos)*\n- *Método Fatias de Feira* — As receitas mais *vendidas* aqui comigo, *que minhas clientes amam*!\n- *Estratégia de Vendas para os Primeiros 30 Dias* — Passo a passo para você *vender mais rápido* e ter sucesso logo de cara!` }
        ];

        console.log(`[Seq2] Enviando 2 imagens em paralelo para ${phone}`);
        const imgPromises = images.map((img, idx) => 
          sendImage(db, whatsappApiId, phone, img.url, img.caption, kv)
            .then(() => saveAssistantMessages(db, state.conversation_id, [img.caption ? `[Imagem enviada com legenda: ${img.caption}]` : `[Imagem enviada]`]))
        );
        allPromises.push(...imgPromises);

        // Delay de 1.5s
        await sleep(1500);

        // 6. Enviar Texto Final (5 variações premium)
        const textFinalVariations = [
          `E o melhor de tudo: o Pacote Completo é sempre atualizado com novas tendências, e quem escolhe o Pacote 3 ganha *acesso vitalício* para sempre! Ou seja, você nunca mais precisará gastar com outras apostilas na vida! 😍\n\nAgora é com você: escolha o pacote ideal para começar hoje mesmo e me envie o comprovante do PIX aqui embaixo. Eu libero seu acesso na mesma hora! Não deixe essa chance passar! 🚀`,
          `Lembrando que o nosso Pacote Completo recebe novidades constantemente, e garantindo o Pacote 3 você tem *acesso vitalício* a todas elas! É um investimento único para o resto da vida! 🧁💖\n\nEscolha o pacote que mais se encaixa no seu momento agora e me mande o comprovante do PIX logo abaixo para eu liberar seu cadastro na hora! A hora de começar a lucrar é agora! 🎯`,
          `O legal é que o Pacote Completo é atualizado direto com novas receitas, e garantindo o Pacote 3 hoje você garante o *acesso vitalício* sem nenhuma mensalidade! É tudo seu para sempre! 🍰🌟\n\nSelecione o pacote perfeito para você e envie o comprovante do PIX aqui no chat. Eu faço a sua matrícula na mesma hora! Aproveite essa oportunidade de ouro! 🚀`,
          `Tenho orgulho de dizer que o nosso material vive recebendo novas atualizações de mercado, e quem adquire o Pacote 3 tem direito a todas elas com *acesso vitalício* garantido! É praticidade para sempre! 😍✨\n\nEscolha qual dos pacotes combina com você agora e envie o comprovante do Pix aqui no nosso chat. Liberamos tudo de forma instantânea! 🎯`,
          `Fazendo a escolha do Pacote 3 hoje, você assegura *acesso vitalício* e recebe de graça todas as novas apostilas e receitas que eu lançar na plataforma! Sem taxas extras! 🧁💖\n\nDecida qual o melhor pacote para o seu momento e me mande o comprovante do Pix logo abaixo para liberar o seu cadastro imediatamente! Vamos crescer juntas! 🚀`
        ];
        const textFinalIntro = textFinalVariations[Math.floor(Math.random() * textFinalVariations.length)];

        const textFinal = `${textFinalIntro}\n\n📋 *DADOS DO PIX*:\nTipo: *PIX Celular*\nNome: *R G FEITOSA 153DF*\nBanco: *Banco Cora*\nChave PIX:\n👇 Copia e cola abaixo 👇\n\n61982277206\n\nMe manda o comprovante do PIX e eu libero tudo na hora! 🎯`;

        console.log(`[Seq2] Enviando Texto Final para ${phone}`);
        const pTextFinal = sendText(db, whatsappApiId, phone, textFinal, kv);
        allPromises.push(pTextFinal);
        await saveAssistantMessages(db, state.conversation_id, [textFinal]);

        // Delay de 1.5s
        await sleep(1500);

        // Enviar Botão do Pix nativo
        try {
          console.log(`[Seq2] Enviando botão nativo do Pix pós-texto final para ${phone}`);
          const pPix = sendPixButton(db, whatsappApiId, phone, '61982277206', 'PHONE', 'R G FEITOSA 153DF', kv)
            .catch(pixErr => console.error(`[Seq2] Erro ao enviar botão do Pix pós-texto final:`, pixErr));
          allPromises.push(pPix);
        } catch (pixErr) {
          console.error(`[Seq2] Erro ao enviar botão do Pix pós-texto final:`, pixErr);
        }

        console.log(`[Seq2] Aguardando a conclusão de todas as promessas de entrega legado no executeSeq2Async...`);
        await Promise.all(allPromises);
        console.log(`[Seq2] Todas as promessas de entrega legado concluídas no executeSeq2Async.`);
      }

    } catch (err) {
      console.error(`[Seq2] Erro na execução assíncrona da Sequência 2 para ${phone}:`, err);
      await db.prepare(
        'INSERT INTO error_logs (id, automation_id, error_type, error_message) VALUES (?, ?, ?, ?)'
      ).bind(crypto.randomUUID(), automation.id, 'seq2_error', String(err)).run();
    } finally {
      // --- CLEANUP DO MUTEX LOCK NO KV ---
      console.log(`[Seq2] Iniciando liberação de lock para ${phone}...`);
      await kv.delete(isDeliveringKey);

      const processingKey = `processing:${automation.slug}:${phone}`;
      const hasQueuedKey = `has_queued_messages:${automation.slug}:${phone}`;
      const queueKey = `queue:${automation.slug}:${phone}`;

      const hasQueued = await kv.get(hasQueuedKey);

      if (hasQueued === "true") {
        await kv.delete(hasQueuedKey);
        const qMessages = await kv.get(queueKey, "json") as any[] | null;
        if (qMessages && qMessages.length > 0) {
          await kv.delete(queueKey);
          const dbKey = `debounce:${automation.slug}:${phone}`;
          await kv.put(dbKey, JSON.stringify(qMessages), { expirationTtl: 60 });
          
          console.log(`[Seq2] Agendando mensagens enfileiradas pós-delay.`);
          const runQueuedAsync = async () => {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            const urlObj = new URL(ctx.baseUrl || 'https://zapgo.promentor21.top');
            const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
            const envWithCtx = { ...env, executionCtx: env.executionCtx, baseUrl, app: getApp() };
            // Obter automação mapeada
            const mappedAutomation = {
              id: automation.id,
              name: automation.name,
              slug: automation.slug,
              product_name: automation.product_name || null,
              status: automation.status,
              whatsapp_api_id: automation.whatsapp_api_id,
              ocr_service_id: automation.ocr_service_id || null,
              transcription_service_id: automation.transcription_service_id || null,
              whatsapp_number: automation.whatsapp_number || null,
              pixel_id: automation.pixel_id || null,
              facebook_token: automation.facebook_token || null,
              waba_id: automation.waba_id || null,
              page_id: automation.page_id || null,
            };
            const { processMessageAsync } = await import('../../automation-engine');
            await processMessageAsync(envWithCtx, mappedAutomation, phone, automation.slug);
          };

          console.log(`[Seq2] Executando fila sequencial de forma síncrona pós-sleep para garantir VM ativa...`);
          await runQueuedAsync();
        }
      } else {
        await kv.delete(processingKey);
        console.log(`[Seq2] Lock de processamento finalizado e liberado para ${phone}`);
      }
    }
  };

  if (env.executionCtx && typeof env.executionCtx.waitUntil === 'function') {
    env.executionCtx.waitUntil(executeSeq2Async());
  } else {
    // Se não tiver executionCtx, aguarda síncrono
    await executeSeq2Async();
  }

  return { success: true, result: 'Sequência 2 iniciada com sucesso em background.' };
}

// Helper para parsar a data do comprovante em formatos brasileiros, ISO ou dia nominal
function parseDateComprovante(dateStr: string): string | null {
  if (!dateStr) return null;
  const clean = dateStr.trim().toLowerCase();

  // 1. Tentar extrair hora (HH:MM ou HH:MM:SS) da string
  let timePart = "";
  const timeMatch = clean.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/);
  if (timeMatch) {
    const localHour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2];
    const second = timeMatch[3] || "00";
    
    // Converter de local São Paulo (UTC-3) para UTC (somando 3 horas)
    let utcHour = localHour + 3;
    if (utcHour >= 24) {
      utcHour -= 24;
    }
    timePart = `${String(utcHour).padStart(2, '0')}:${minute}:${second}`;
  } else {
    // Se não tiver hora na string, usar o horário atual (em UTC)
    const now = new Date();
    timePart = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')}`;
  }

  // 2. Extrair a data (Caso 1: ISO YYYY-MM-DD)
  const isoMatch = clean.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]} ${timePart}`;
  }

  // Caso 2: Formato DD/MM/AAAA ou DD/MM/AA
  const brMatch = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (brMatch) {
    let day = brMatch[1].padStart(2, '0');
    let month = brMatch[2].padStart(2, '0');
    let year = brMatch[3];
    if (year.length === 2) {
      year = '20' + year;
    }
    return `${year}-${month}-${day} ${timePart}`;
  }

  // Caso 3: "dia X" ou apenas o dia (ex: "29", "dia 29") no mês atual/ano atual
  const dayOnlyMatch = clean.match(/(?:dia\s+)?(\d{1,2})\b/);
  if (dayOnlyMatch) {
    const day = parseInt(dayOnlyMatch[1], 10);
    if (day >= 1 && day <= 31) {
      const now = new Date(Date.now() - 3 * 3600 * 1000); // UTC-3 (Brasília)
      let year = now.getUTCFullYear();
      let month = now.getUTCMonth() + 1;
      let currentDay = now.getUTCDate();
      
      if (day > currentDay) {
        month--;
        if (month === 0) {
          month = 12;
          year--;
        }
      }
      
      const yStr = year.toString();
      const mStr = month.toString().padStart(2, '0');
      const dStr = day.toString().padStart(2, '0');
      return `${yStr}-${mStr}-${dStr} ${timePart}`;
    }
  }

  return null;
}

// Helper para extrair o ID de transação Pix (EndToEnd ID) ou código de autenticação do texto
function extractTransactionId(text: string): string | null {
  if (!text) return null;
  const clean = text.toLowerCase();
  
  // Tentar encontrar o formato estruturado do regex primeiro (gerado por formatReceiptOcrTextWithRegex)
  const structuredMatch = clean.match(/id da transação \/ autenticação:\s*([^\n\r]+)/i);
  if (structuredMatch && structuredMatch[1] && !structuredMatch[1].includes('não identificado')) {
    return structuredMatch[1].trim();
  }
  
  // Tentar encontrar ID fim a fim (EndToEnd ID) do Pix (geralmente começa com E e tem 32 caracteres)
  const pixIdMatch = clean.match(/\b(e\d{8,}[a-z0-9]+)\b/i);
  if (pixIdMatch) {
    return pixIdMatch[1].trim();
  }
  
  // Tentar encontrar código de autenticação (ex: SISBB ou número de autenticação)
  const authMatch = clean.match(/(?:autenticacao|autenticação|autenticad|documento|doc):\s*([a-z0-9.\-_]+)/i);
  if (authMatch && authMatch[1]) {
    return authMatch[1].trim();
  }
  
  return null;
}

// ============================================================
// PAGAMENTO — Registra pagamento
// ============================================================

async function executePagamento(
  ctx: AutomationContext,
  args: Record<string, any>
): Promise<{ success: boolean; result: string }> {
  const { env, state, contact } = ctx;
  const db = env.DB;
  let valor = args.valor_pagamento || 10;

  // Extrair ID de transação para controle de duplicidade de alta precisão
  let idTransacao = args.id_transacao || null;
  if (!idTransacao && ctx.message?.textContent) {
    idTransacao = extractTransactionId(ctx.message.textContent);
  }

  // 1. Determinar o preço da oferta ativa de follow-up
  const isSpecialFollowupOfferActive = state.oferta_19_90_feita === 1 || 
                                       state.funil_encerrado === 1 || 
                                       state.last_tool_called === 'vigia' || 
                                       state.last_tool_called === 'finalizador' || 
                                       state.last_tool_called === 'cobrador_final';

  let activeOfferPrice = 25.00;
  if (state.last_tool_called === 'cobrador_final') {
    activeOfferPrice = 10.00;
  } else if (state.funil_encerrado === 1 || state.last_tool_called === 'finalizador') {
    activeOfferPrice = 12.90;
  } else if (state.oferta_19_90_feita === 1 || state.last_tool_called === 'vigia') {
    activeOfferPrice = 19.90;
  }

  // É considerado pago na oferta especial se o total_paid atingir o preço da oferta ativa (com margem de R$ 0,50 de segurança)
  const paidSpecialFollowup = isSpecialFollowupOfferActive && state.total_paid >= (activeOfferPrice - 0.50);

  // Se o pagamento já foi confirmado e o valor total pago garante o Kit Completo (>= 25, upsell aceito ou se cobriu a oferta de follow-up)
  const alreadyHasKitCompleto = state.payment_confirmed === 1 && (
    state.total_paid >= 25 || 
    state.upsell_accepted === 1 ||
    paidSpecialFollowup
  );

  if (alreadyHasKitCompleto) {
    console.log(`[Pagamento] Pagamento já confirmado anteriormente para o Kit Completo (${state.total_paid}). Ignorando re-gatilho.`);
    return { success: true, result: 'Pagamento do Kit Completo já confirmado anteriormente.' };
  }

  // 2. Tratar Upgrade de Upsell: se já tinha pago R$ 10 e pagou mais R$ 5 (ou próximo de R$ 5)
  let isUpsellUpgrade = false;
  if (state.payment_confirmed === 1 && state.total_paid === 10 && valor >= 4.00 && valor <= 6.00) {
    valor = 15; // O total pago acumulado é R$ 15 (10 + 5)
    isUpsellUpgrade = true;
  }

  // 3. Buscar lead existente para checar status de pagamento no banco
  const existingLead = await db.prepare(
    'SELECT id, pago, valor_pago FROM automation_leads WHERE phone = ? AND automation_id = ?'
  ).bind(contact.phone, ctx.automation.id).first<{ id: string; pago: number; valor_pago: number }>();

  const isPaidInDb = existingLead?.pago === 1;
  const dbTotalPaid = existingLead?.valor_pago || 0;
  const totalAnterior = Math.round(Math.max(state.total_paid || 0, dbTotalPaid) * 100) / 100;
  const valAtual = Math.round(valor * 100) / 100;

  // ⚠️ REGRA DE OURO CRÍTICA RE-PROJETADA:
  // 1. Se identificamos um ID de transação e ele já foi processado nesta conversa, ignoramos.
  if (idTransacao) {
    const cleanTx = idTransacao.trim().toLowerCase();
    const isTxDuplicate = ctx.history.some((h, index) => {
      if ((h as any).id) {
        if ((h as any).id === ctx.message.id) return false;
      } else {
        if (index === ctx.history.length - 1) return false;
      }
      return h.content.toLowerCase().includes(cleanTx);
    });

    if (isTxDuplicate) {
      console.log(`[Pagamento] Transação Pix ${idTransacao} já registrada em mensagem anterior para ${contact.phone}. Ignorando re-gatilho.`);
      return { success: true, result: 'Pagamento já registrado anteriormente.' };
    }
  }

  // 2. Se já está pago no banco e o valor atual é idêntico ao já registrado no banco (sem ID de transação novo),
  // ignoramos para evitar duplicidade de CAPI ou alteração das datas de pagamento.
  if (isPaidInDb && valAtual === dbTotalPaid && !idTransacao) {
    console.log(`[Pagamento] Pagamento idêntico já confirmado no banco de dados para ${contact.phone} (Banco: R$ ${dbTotalPaid}). Retornando sucesso silencioso.`);
    
    // Sincronizar estado KV
    if (state.payment_confirmed === 0 || state.total_paid < dbTotalPaid) {
      await updateState(db, state.conversation_id, {
        payment_confirmed: 1,
        total_paid: dbTotalPaid,
        phase: 'paid'
      });
    }

    // Cancelar follow-ups
    await cancelFollowups(db, state.conversation_id, '%');

    return { success: true, result: 'Pagamento já registrado anteriormente.' };
  }

  // 4. Bloquear re-registro se o valor correspondente já foi pago no estado (somente se não tivermos um ID de transação novo)
  let alreadyRegistered = false;
  if (totalAnterior > 0 && !idTransacao) {
    if (valAtual === totalAnterior) {
      alreadyRegistered = true;
    } else if (valAtual === 10 && totalAnterior >= 10) {
      alreadyRegistered = true;
    } else if (valAtual === 19.90 && totalAnterior >= 19.90) {
      alreadyRegistered = true;
    } else if (valAtual === 12.90 && totalAnterior >= 12.90) {
      alreadyRegistered = true;
    } else if (valAtual === 14.50 && totalAnterior >= 14.50) {
      alreadyRegistered = true;
    } else if (valAtual === 5 && totalAnterior >= 15) {
      alreadyRegistered = true;
    } else if (valAtual === 15 && totalAnterior >= 25) {
      alreadyRegistered = true;
    } else if (valAtual === 14.90) {
      const totalsWithUpsell = [24.90, 29.90, 39.90, 34.80, 27.80, 29.40];
      if (totalsWithUpsell.includes(totalAnterior)) {
        alreadyRegistered = true;
      }
    }
  }

  if (alreadyRegistered) {
    console.log(`[Pagamento] Pagamento de R$ ${valor} já registrado anteriormente (Total pago: R$ ${totalAnterior}). Ignorando re-gatilho.`);
    return { success: true, result: 'Pagamento já registrado anteriormente.' };
  }

  // Somar os valores para atualizar com o valor acumulado final
  let valorAcumulado = valAtual;
  if (totalAnterior > 0 && !isUpsellUpgrade) {
    valorAcumulado = Math.round((totalAnterior + valAtual) * 100) / 100;
    console.log(`[Pagamento] Somando novo pagamento de R$ ${valAtual} ao total anterior de R$ ${totalAnterior}. Novo total: R$ ${valorAcumulado}`);
  } else {
    console.log(`[Pagamento] Novo total de pagamento registrado: R$ ${valorAcumulado}`);
  }

  // Atualizar a variável valor para que o restante da lógica (CAPI, DB) use o total somado
  valor = valorAcumulado;

  // Atualizar estado
  await updateState(db, state.conversation_id, {
    payment_confirmed: 1,
    total_paid: valor,
    phase: 'paid',
    last_tool_called: 'pagamento',
    ...(isUpsellUpgrade ? { upsell_accepted: 1 } : {})
  });

  // Marcar conversa como resolvida
  await db.prepare(
    "UPDATE conversations SET status = 'finalizado_com_sucesso', updated_at = datetime('now') WHERE id = ?"
  ).bind(state.conversation_id).run();

  // Parsar data do comprovante se fornecida pela IA
  const parsedDate = args.data_comprovante ? parseDateComprovante(args.data_comprovante) : null;
  if (parsedDate) {
    console.log(`[Pagamento] Data do comprovante extraída: ${args.data_comprovante} -> DB Format: ${parsedDate}`);
  }

  if (existingLead) {
    if (existingLead.pago === 1) {
      // Se já está pago no banco, atualizamos APENAS o valor do pagamento para upgrades (upsell)
      // sem atualizar nenhuma data/timestamp (created_at ou updated_at) para preservar o histórico original!
      if (valor > existingLead.valor_pago) {
        await db.prepare(
          'UPDATE automation_leads SET valor_pago = ? WHERE id = ?'
        ).bind(valor, existingLead.id).run();
      }
    } else {
      if (parsedDate) {
        await db.prepare(
          'UPDATE automation_leads SET pago = 1, valor_pago = ?, created_at = ?, updated_at = ? WHERE id = ?'
        ).bind(valor, parsedDate, parsedDate, existingLead.id).run();
      } else {
        await db.prepare(
          'UPDATE automation_leads SET pago = 1, valor_pago = ?, updated_at = datetime(\'now\') WHERE id = ?'
        ).bind(valor, existingLead.id).run();
      }
    }
  } else {
    const maxCodeRes = await db.prepare(
      'SELECT COALESCE(MAX(cliente_codigo), 0) + 1 AS next_code FROM automation_leads'
    ).first<{ next_code: number }>();
    const nextCode = maxCodeRes?.next_code || 1;

    if (parsedDate) {
      await db.prepare(
        'INSERT INTO automation_leads (id, automation_id, phone, nome, pago, valor_pago, cliente_codigo, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)'
      ).bind(crypto.randomUUID(), ctx.automation.id, contact.phone, contact.name, valor, nextCode, parsedDate, parsedDate).run();
    } else {
      await db.prepare(
        'INSERT INTO automation_leads (id, automation_id, phone, nome, pago, valor_pago, cliente_codigo) VALUES (?, ?, ?, ?, 1, ?, ?)'
      ).bind(crypto.randomUUID(), ctx.automation.id, contact.phone, contact.name, valor, nextCode).run();
    }
  }

  // Buscar configuração do upsell dinâmico no banco D1 para resolver o produto CAPI e lógica
  let upsellConfig: any = null;
  try {
    upsellConfig = await db.prepare(`
      SELECT pu.* 
      FROM product_upsells pu
      JOIN product_automations pa ON pu.product_id = pa.product_id
      WHERE pa.automation_id = ?
    `).bind(ctx.automation.id).first();
  } catch (dbErr) {
    console.error('[Pagamento] Erro ao buscar configuração de upsell no D1:', dbErr);
  }

  const upsellPrice = upsellConfig ? upsellConfig.price : 14.50;
  const upsellSku = upsellConfig ? upsellConfig.upsell_sku : 'PROD-H3GQBU';
  const isUpsellPurchase = Math.abs(valor - upsellPrice) < 0.05 && state.access_delivered === 1;

  // Disparar evento de Purchase 1 no Facebook Conversions API (CAPI)
  if (ctx.automation.pixel_id && ctx.automation.facebook_token) {
    const lead = await db.prepare(
      'SELECT id, cliente_codigo FROM automation_leads WHERE phone = ? AND automation_id = ?'
    ).bind(contact.phone, ctx.automation.id).first<{ id: string; cliente_codigo: number | null }>();
    const leadId = lead?.cliente_codigo ? String(lead.cliente_codigo) : (lead?.id || crypto.randomUUID());
    const tracking = await getTrackingData(db, contact.phone, ctx.automation.id);

    const dynamicContentName = isUpsellPurchase && upsellConfig?.upsell_name
      ? upsellConfig.upsell_name
      : (ctx.automation.product_name || 'recheios a prova de fogo');

    console.log(`[Facebook CAPI] Enviando Purchase 1 para ${contact.phone} (Valor: ${valor}, Produto: ${dynamicContentName})`);
    try {
      const success = await sendPurchaseEvent(db, ctx.automation.id, ctx.automation.pixel_id, ctx.automation.facebook_token, {
        phone: contact.phone,
        trackingData: tracking,
        leadId,
        value: valor,
        contentName: dynamicContentName,
        wabaId: ctx.automation.waba_id,
        pageId: ctx.automation.page_id,
      });
      console.log(`[Facebook CAPI] Purchase 1 enviado com sucesso? ${success}`);
    } catch (err) {
      console.error(`[Facebook CAPI] Erro ao enviar Purchase 1:`, err);
    }
  }

  // Cancelar follow-ups pendentes (cliente pagou!)
  await cancelFollowups(db, state.conversation_id, '%');

  // ── DISPARAR RESPOSTA DETERMINÍSTICA DE PÓS-PAGAMENTO ──
  const clientFirstName = contact.name ? (contact.name.trim().split(/\s+/)[0] || 'amiga') : 'amiga';
  let replyText = "";

  // É considerado pago se cobriu a oferta especial (com margem de R$ 0,50)
  const paidSpecialFollowupNow = isSpecialFollowupOfferActive && valor >= (activeOfferPrice - 0.50);

  // Sub-pagamento: estava em follow-up de R$ 19,90 ou R$ 12,90, mas enviou menos (ex: R$ 10,00)
  const isUnderpaidFollowup = isSpecialFollowupOfferActive && valor < activeOfferPrice && !paidSpecialFollowupNow;

  const isSpecialFollowupOffer = paidSpecialFollowupNow ||
                                 isUpsellUpgrade ||
                                 (state.kit_completo_offered === 1 && valor >= 14.00);

  // Upgrade de follow-up especial quando já tinha acesso (básico) entregue
  const isSpecialFollowupUpgrade = paidSpecialFollowupNow && state.access_delivered === 1;
  const isAutoUpgrade = isUpsellPurchase || isSpecialFollowupUpgrade;
  const upgradeSku = isSpecialFollowupUpgrade ? PRODUCT.productCodes.principal : upsellSku;

  if (isUpsellPurchase) {
    replyText = `*${clientFirstName}*, seu pagamento de *R$ ${upsellPrice.toFixed(2).replace('.', ',')}* foi confirmado com sucesso! 🎉😍\n\nComo você adquiriu a *Máquina de Vendas Online*, já estou ativando o seu acesso vitalício aqui no sistema!\n\nUm minutinho só que já te trago o link de acesso... 🚀`;
  } else if (isSpecialFollowupUpgrade) {
    replyText = `*${clientFirstName}*, seu pagamento complementar foi confirmado com sucesso! 🎉😍\n\nAgora o seu *Kit Completo vitalício* está 100% liberado! Estou atualizando o seu cadastro aqui no sistema...\n\nUm minutinho só que já te trago o novo link de acesso... 🚀`;
  } else if (isUnderpaidFollowup) {
    const diff = activeOfferPrice - valor;
    const diffStr = diff.toFixed(2).replace('.', ',');
    const offerStr = activeOfferPrice.toFixed(2).replace('.', ',');
    const valorStr = valor.toFixed(2).replace('.', ',');
    
    replyText = `*${clientFirstName}*, seu pagamento de *R$ ${valorStr}* foi confirmado com sucesso! 🎉😍\n\nComo a última oferta que te fiz foi do nosso *Kit Completo vitalício por R$ ${offerStr}*, e você enviou *R$ ${valorStr}* (que é o valor do nosso pacote básico de receitas), você prefere:\n\n1️⃣ *Ficar com o Pacote Básico de Recheios* (R$ 10,00):\nSe preferir este, me manda o seu *Nome Completo* e *E-mail* aqui no chat para eu liberar o seu cadastro no sistema e te enviar as receitas! 🍰\n\n2️⃣ *Garantir o Kit Completo vitalício* (R$ ${offerStr}):\nBasta fazer um Pix complementar da diferença de *R$ ${diffStr}* na mesma chave celular e me mandar o comprovante aqui:\n💰 *Pix (Celular):* 61982277206\n\nMe conta aqui o que você prefere! 🤗`;
  } else if (valor >= 25 || isSpecialFollowupOffer) {
    const pagSuccessVariations = [
      `*${clientFirstName}*, seu pagamento de *R$ ${valor.toFixed(2)}* foi confirmado com sucesso! 🎉😍\n\nComo você escolheu o *Kit Completo*, seu acesso é vitalício e já vou liberar tudo pra você!\n\nPara isso, preciso apenas de duas informações simples para gerar o seu login:\n\n1️⃣ Seu *Nome Completo*\n2️⃣ Seu melhor *E-mail* (onde você quer receber os dados de acesso)\n\nMe manda aqui embaixo e eu libero na hora! 🎯`,
      `Tudo confirmado, *${clientFirstName}*! Recebemos o seu pagamento de *R$ ${valor.toFixed(2)}* com sucesso! 🎉💖\n\nSua vaga no *Kit Completo vitalício* está garantida. Já estou com a tela de cadastro aberta!\n\nMe passe apenas essas duas informações para eu criar a sua conta:\n\n1️⃣ Seu *Nome Completo*\n2️⃣ Seu *E-mail* principal\n\nEscreva aqui no chat e eu ativo na mesma hora! 🎯`,
      `Que alegria, *${clientFirstName}*! Pagamento de *R$ ${valor.toFixed(2)}* confirmado com sucesso! 🎉😍\n\nSeu acesso vitalício ao nosso *Kit Completo* está pronto para ser ativado agora mesmo!\n\nDigite para mim aqui embaixo:\n\n1️⃣ Seu *Nome Completo*\n2️⃣ O seu *E-mail* de uso diário\n\nAssim que me mandar, eu gero o seu login de acesso na hora! 🎯`,
      `Confirmadíssimo, *${clientFirstName}*! Recebemos o Pix de *R$ ${valor.toFixed(2)}* direitinho! Muito obrigada pela confiança! 🎉💖\n\nVamos liberar o seu *Kit Completo vitalício* agora. Só preciso que me envie:\n\n1️⃣ Seu *Nome Completo*\n2️⃣ Seu melhor *E-mail*\n\nMe envie aqui no chat e eu já te retorno com os dados de login! 🎯`,
      `Oba, *${clientFirstName}*! Pix de *R$ ${valor.toFixed(2)}* confirmado com sucesso por aqui! 🎉😍\n\nVocê garantiu o *Kit Completo* com acesso vitalício! Para que eu possa fazer o seu cadastro no sistema, me mande por favor:\n\n1️⃣ Seu *Nome Completo*\n2️⃣ Seu *E-mail* sem erros de digitação\n\nEu realizo a sua matrícula na mesma hora! 🎯`
    ];
    replyText = pagSuccessVariations[Math.floor(Math.random() * pagSuccessVariations.length)];
  } else {
    // Atualizar no estado indicando que ofertamos o upsell
    await updateState(db, state.conversation_id, {
      upsell_offered: 1,
    });

    let ticketBoostSent = false;

    if (!ctx.bypassDirectSend) {
      // ⚠️ TIMEOUT DE SEGURANÇA TRANSACIONAL (Solução Definitiva)
      // O checkout é o momento mais crítico do funil. Neste ponto, o Worker já consumiu
      // ~15-20s do orçamento de 30s do waitUntil (debounce 5s + OCR 3-5s + auditoria LLM 3-5s + CAPI 2-3s).
      // Se o sendFunnelStage('ticket_boost') tentar reescrita dinâmica (LLM), pode estourar o limite.
      // Este timeout garante que SEMPRE haverá uma resposta ao cliente, mesmo que o stage falhe.
      const TICKET_BOOST_TIMEOUT_MS = 8000;
      try {
        const stageRes = await Promise.race([
          sendFunnelStage(db, ctx.automation.whatsapp_api_id, contact.phone, ctx.automation, contact, state, 'ticket_boost', env.KV),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('TICKET_BOOST_TIMEOUT')), TICKET_BOOST_TIMEOUT_MS)
          )
        ]);
        if (stageRes.sent) {
          ticketBoostSent = true;
          await saveAssistantMessages(db, state.conversation_id, stageRes.messageLog);
          
          // Se a mensagem enviada contiver a chave Pix celular, enviar botão do Pix
          const stageLogText = stageRes.messageLog.join('\n');
          if (stageLogText.includes('61982277206')) {
            try {
              console.log(`[Pagamento] Enviando botão nativo do Pix de R$ 5,00 (Upsell) para ${contact.phone}`);
              await sendPixButton(db, ctx.automation.whatsapp_api_id, contact.phone, '61982277206', 'PHONE', 'R G FEITOSA 153DF', env.KV);
            } catch (pixErr) {
              console.error(`[Pagamento] Erro ao enviar botão de Pix de upsell:`, pixErr);
            }
          }
        }
      } catch (stageErr) {
        console.error(`[Pagamento] ⚠️ sendFunnelStage('ticket_boost') falhou ou excedeu timeout de ${TICKET_BOOST_TIMEOUT_MS}ms:`, stageErr);
        // ticketBoostSent permanece false → fallback automático para variações estáticas abaixo
      }
    }

    if (!ticketBoostSent) {
      const pagUpsellVariations = [
        `*${clientFirstName}*, seu pagamento de *R$ ${valor.toFixed(2)}* foi confirmado com sucesso! 🎉😍\n\n*${clientFirstName}*, tenho uma surpresa super especial pra você! 🎁\n\nPor apenas mais *R$ 5,00* você leva o nosso *Kit Completo de Confeitaria* (que custa R$ 25,00)!\n\nNo kit completo você recebe:\n📹 Vídeo aulas passo a passo com o ponto certo dos recheios\n📚 Apostilas extras de brigadeiros premium, bolos no pote e geladinhos gourmet\n🍰 Método Como Ganhar Dinheiro com Fatias de Bolo\nE muito mais!\n\nÉ só fazer o PIX de *R$ 5,00* para o mesmo número celular:\n💰 *Chave PIX:* 61982277206\n\nSe preferir ficar apenas com as receitas que escolheu, basta digitar *\"não quero\"* ou *\"só as receitas\"* que já te peço os dados de acesso. O que você acha? 😊`,
        `Confirmado, *${clientFirstName}*! Seu pagamento de *R$ ${valor.toFixed(2)}* foi recebido com sucesso! 🎉💖\n\nE olha só, preparei um presente incrível para você: por apenas mais *R$ 5,00*, eu consigo liberar o seu upgrade para o *Kit Completo de Confeitaria*!\n\nVocê vai levar além das receitas: videoaulas gravadas passo a passo, apostila de massas fofinhas, brigadeiros especiais e bônus exclusivos. O Kit custa R$ 25, mas sai por apenas +R$ 5 para você hoje! 🎁\n\nPara aproveitar, faça o Pix de *R$ 5,00* na mesma chave celular:\n💰 *Chave Pix (Celular):* 61982277206\n\nSe não quiser o Kit Completo, tudo bem! Digite *\"não quero\"* ou *\"só as receitas\"* que eu já faço a sua liberação padrão. O que prefere? 😊`,
        `Tudo certo, *${clientFirstName}*! Recebemos o Pix de *R$ ${valor.toFixed(2)}* com sucesso! 🎉😍\n\nDeixa eu te dar uma notícia maravilhosa: por apenas mais *R$ 5,00* você pode levar o nosso *Kit Completo de Confeitaria* vitalício!\n\nEle inclui videoaulas do ponto correto, apostilas de bolos no pote, geladinhos gourmet e estratégias de venda rápidas. É um desconto gigante de R$ 25 por apenas +R$ 5! 🎁\n\nChave Pix de *R$ 5,00* é a mesma:\n💰 *Pix (Celular):* 61982277206\n\nCaso prefira apenas o pacote básico, digite *\"não quero\"* ou *\"só as receitas\"* e eu te peço os dados para liberação imediata. Qual dos dois você prefere? 😊`,
        `Pix de *R$ ${valor.toFixed(2)}* confirmado com sucesso, *${clientFirstName}*! Muito obrigada! 🎉💖\n\n*${clientFirstName}*, como você já fez o Pix básico, eu consigo te dar uma oportunidade única: por mais *R$ 5,00*, eu libero todo o *Kit Completo de Confeitaria* vitalício com videoaulas passo a passo e massas especiais! 🎁\n\nO Pix de *R$ 5,00* é feito no mesmo celular:\n💰 *Pix Chave:* 61982277206\n\nSe preferir apenas o pacote que já pagou, me responda com *\"não quero\"* ou *\"só as receitas\"* para eu te pedir os dados de cadastro. O que acha? 😊`,
        `Tudo confirmado, *${clientFirstName}*! Pagamento de *R$ ${valor.toFixed(2)}* recebido com muito orgulho! 🎉😍\n\nQuero te dar um presentão: por mais *R$ 5,00 adicionais, eu faço o seu upgrade para o nosso *Kit Completo* vitalício, com videoaulas gravadas, apostila de massas caseiras estruturadas e bônus lucrativos! 🎁\n\nPara garantir tudo completo por apenas +R$ 5, faça o Pix no mesmo número celular:\n💰 *Pix (Celular):* 61982277206\n\nCaso queira prosseguir apenas com o pacote básico de recheios, diga *\"não quero\"* ou *\"só as receitas\"* para eu liberar seu login padrão. O que você decide? 😊`
      ];
      replyText = pagUpsellVariations[Math.floor(Math.random() * pagUpsellVariations.length)];
    }
  }

  if (ctx.bypassDirectSend) {
    if (isAutoUpgrade && state.client_name && state.client_email) {
      console.log(`[Pagamento] Detectou auto-upgrade com dados existentes (${state.client_name} - ${state.client_email}) para SKU ${upgradeSku}. Liberando de forma transparente...`);
      try {
        const sistemaRes = await executeSistema(ctx, {
          nome: state.client_name,
          email: state.client_email,
          codigo_produto: upgradeSku
        });
        if (sistemaRes.success && sistemaRes.result) {
          replyText += "\n\n" + sistemaRes.result;
        }
      } catch (err) {
        console.error(`[Pagamento] Erro na auto-liberação transparente de upgrade:`, err);
      }
    }
    return {
      success: true,
      result: replyText
    };
  }

  if (replyText) {
    console.log(`[Pagamento] Enviando resposta determinística para ${contact.phone} (Valor: ${valor})`);
    await sendText(db, ctx.automation.whatsapp_api_id, contact.phone, replyText, env.KV);
    await saveAssistantMessages(db, state.conversation_id, [replyText]);

    // Se for oferta de upsell, enviar botão de Pix
    if (replyText.includes('61982277206') && !isAutoUpgrade) {
      try {
        console.log(`[Pagamento] Enviando botão nativo do Pix de R$ 5,00 (Upsell) para ${contact.phone}`);
        await sendPixButton(db, ctx.automation.whatsapp_api_id, contact.phone, '61982277206', 'PHONE', 'R G FEITOSA 153DF', env.KV);
      } catch (pixErr) {
        console.error(`[Pagamento] Erro ao enviar botão de Pix de upsell:`, pixErr);
      }
    }
  }

  // Se for a compra do Upsell ou Upgrade especial e já tivermos os dados de cadastro salvos no estado,
  // liberamos o acesso correspondente dinamicamente de forma automática e transparente!
  if (isAutoUpgrade && state.client_name && state.client_email) {
    console.log(`[Pagamento] Detectou auto-upgrade com dados existentes (${state.client_name} - ${state.client_email}) para SKU ${upgradeSku}. Liberando de forma transparente...`);
    try {
      await executeSistema(ctx, {
        nome: state.client_name,
        email: state.client_email,
        codigo_produto: upgradeSku
      });
    } catch (err) {
      console.error(`[Pagamento] Erro na auto-liberação transparente de upgrade:`, err);
    }
  }

  return {
    success: true,
    result: `Pagamento de R$ ${valor.toFixed(2)} registrado com sucesso e resposta enviada.`,
  };
}

// ============================================================
// SISTEMA — Registra acesso do cliente
// ============================================================

async function executeSistema(
  ctx: AutomationContext,
  args: Record<string, any>
): Promise<{ success: boolean; result: string }> {
  const { env, state, contact } = ctx;
  const db = env.DB;
  const nome = args.nome;
  let email = args.email ? args.email.replace(/\s/g, '').toLowerCase().replace(/,/g, '.') : '';
  const inputCodigoProduto = args.codigo_produto || PRODUCT.productCodes.principal;
  let upsellConfig: any = null;
  try {
    upsellConfig = await db.prepare(`
      SELECT pu.* 
      FROM product_upsells pu
      JOIN product_automations pa ON pu.product_id = pa.product_id
      WHERE pa.automation_id = ?
    `).bind(ctx.automation.id).first();
  } catch (dbErr) {
    console.error('[Sistema] Erro ao buscar config de upsell no início:', dbErr);
  }

  if (!nome || !email) {
    return { success: false, result: 'Nome e email são obrigatórios.' };
  }

  // Validação extra de segurança: o e-mail precisa ter um "@" e um ponto após o "@"
  const atIdx = email.indexOf('@');
  const dotIdx = email.lastIndexOf('.');
  if (atIdx === -1 || dotIdx === -1 || dotIdx < atIdx) {
    return { success: false, result: `E-mail '${email}' é inválido. Certifique-se de que possui um provedor e extensão (ex: .com).` };
  }

  // Failsafe automatic upgrade logic to ensure access is released correctly:
  // If the client paid for a special offer or paid at least R$ 11.50, always release the Kit Completo.
  const isSpecialFollowup = state.oferta_19_90_feita === 1 || 
                             state.funil_encerrado === 1 || 
                             state.last_tool_called === 'vigia' || 
                             state.last_tool_called === 'finalizador' || 
                             state.last_tool_called === 'cobrador_final';

  let activeOfferPrice = 25.00;
  if (state.last_tool_called === 'cobrador_final') {
    activeOfferPrice = 10.00;
  } else if (state.funil_encerrado === 1 || state.last_tool_called === 'finalizador') {
    activeOfferPrice = 12.90;
  } else if (state.oferta_19_90_feita === 1 || state.last_tool_called === 'vigia') {
    activeOfferPrice = 19.90;
  }

  // É considerado pago na oferta especial se o total_paid atingir o preço da oferta ativa (com margem de R$ 0,50 de segurança)
  const paidSpecialFollowup = isSpecialFollowup && state.total_paid >= (activeOfferPrice - 0.50);

  const isKitCompleto = paidSpecialFollowup || 
                        state.total_paid >= 11.50 || 
                        state.upsell_accepted === 1 ||
                        state.downsell_offered === 1;

  // Buscar links de entrega dinâmicos no banco de dados Central de Produtos
  let deliveryLinks: any[] = [];
  try {
    const res = await db.prepare(`
      SELECT dl.* 
      FROM product_delivery_links dl
      JOIN product_automations pa ON dl.product_id = pa.product_id
      WHERE pa.automation_id = ?
    `).bind(ctx.automation.id).all();
    deliveryLinks = res.results || [];
    console.log(`[Sistema] Encontrados ${deliveryLinks.length} links de entrega dinâmicos no D1 para a automação ${ctx.automation.id}`);
  } catch (dbErr) {
    console.error('[Sistema] Erro ao buscar links de entrega no D1:', dbErr);
  }

  // Escolher o link correspondente dinamicamente
  let chosenLink: any = null;
  if (deliveryLinks.length > 0) {
    // 1. Prioridade absoluta: correspondência exata do SKU solicitado pela LLM
    chosenLink = deliveryLinks.find(l => l.product_code === inputCodigoProduto);
    
    // 2. Se não houver correspondência exata, aplicar os fallbacks clássicos
    if (!chosenLink) {
      if (deliveryLinks.length === 1) {
        chosenLink = deliveryLinks[0];
      } else {
        if (isKitCompleto) {
          // Procure um link com "completo" ou "vip" ou "upsell" ou "máquina" no título ou com o SKU estático do upsell
          chosenLink = deliveryLinks.find(l => 
            l.title.toLowerCase().includes("completo") || 
            l.title.toLowerCase().includes("vip") ||
            l.title.toLowerCase().includes("máquina") ||
            l.title.toLowerCase().includes("maquina") ||
            l.title.toLowerCase().includes("upsell") ||
            l.product_code === PRODUCT.productCodes.upsell
          );
          if (!chosenLink) {
            chosenLink = deliveryLinks.find(l => !l.title.toLowerCase().includes("básico") && !l.title.toLowerCase().includes("apostila"));
          }
        } else {
          // Básico
          chosenLink = deliveryLinks.find(l => 
            l.title.toLowerCase().includes("básico") || 
            l.title.toLowerCase().includes("apostila") ||
            l.title.toLowerCase().includes("digital") ||
            l.product_code === PRODUCT.productCodes.principal
          );
        }
        // Fallback final
        if (!chosenLink) chosenLink = deliveryLinks[0];
      }
    }
  }

  // Determinar o código do produto final
  let codigoProduto = inputCodigoProduto;
  
  // Se o SKU de entrada for o de upsell, respeitamos se o cliente de fato aceitou/adquiriu o upsell.
  // Caso contrário, se o cliente comprou Confeitaria (que inclui o Kit Completo de confeitaria), o SKU deve ser o principal.
  if (codigoProduto === (upsellConfig?.upsell_sku || PRODUCT.productCodes.upsell)) {
    const hasAcceptedUpsell = state.upsell_accepted === 1;
    if (!hasAcceptedUpsell) {
      console.log(`[Sistema] Cliente não possui o upsell ativo. Forçando SKU principal: ${PRODUCT.productCodes.principal}`);
      codigoProduto = PRODUCT.productCodes.principal;
    }
  } else if (chosenLink && chosenLink.product_code) {
    codigoProduto = chosenLink.product_code;
    console.log(`[Sistema Dinâmico] Usando SKU do link de acesso (${chosenLink.title}): ${codigoProduto}`);
  }

  // Buscar se o lead já tem acesso no banco de dados para segurança
  const leadDb = await db.prepare(
    'SELECT id, recebeu_acesso, email, nome FROM automation_leads WHERE phone = ? AND automation_id = ?'
  ).bind(contact.phone, ctx.automation.id).first<{ id: string; recebeu_acesso: number; email: string | null; nome: string | null }>();

  const wasAccessDelivered = state.access_delivered === 1 || leadDb?.recebeu_acesso === 1;
  const wasSystemAccessDelivered = state.access_delivered === 1 || (leadDb?.email ? true : false);

  // Casing and space insensitive validation for email and name:
  const cleanEmail = email.trim().toLowerCase();
  const cleanDbEmail = (leadDb?.email || '').trim().toLowerCase();
  const cleanStateEmail = (state.client_email || '').trim().toLowerCase();
  const isSameEmail = !email || cleanEmail === cleanStateEmail || cleanEmail === cleanDbEmail;

  const cleanNome = nome.trim().toLowerCase();
  const cleanDbNome = (leadDb?.nome || '').trim().toLowerCase();
  const cleanStateNome = (state.client_name || '').trim().toLowerCase();
  const isSameNome = !nome || cleanNome === cleanStateNome || cleanNome === cleanDbNome;

  const dynamicUpsellSku = upsellConfig ? upsellConfig.upsell_sku : 'PROD-H3GQBU';

  // Se já possui acesso com as mesmas credenciais, apenas reenviamos as credenciais e evitamos n8n, CAPI e alterações de banco
  if (wasAccessDelivered && isSameEmail && isSameNome) {
    console.log(`[Sistema] Cliente ${contact.phone} já possui acesso ativo com os mesmos dados. Reenviando login.`);
    const finalNome = nome || state.client_name || leadDb?.nome || contact.name || 'amiga';
    const finalEmail = email || state.client_email || leadDb?.email || '';

    // Sincronizar KV
    if (state.access_delivered === 0 || !state.client_email) {
      await updateState(db, state.conversation_id, {
        client_name: finalNome,
        client_email: finalEmail,
        access_delivered: 1,
        phase: 'completed'
      });
    }

    // Usar dados dinâmicos do link se presentes
    let linkLoginReal = chosenLink?.login_url || "https://app.promentor21.top/login";

    // Se o produto sendo entregue for o SKU do upsell, resolver login URL dinâmica
    if (upsellConfig && codigoProduto === upsellConfig.upsell_sku) {
      if (upsellConfig.use_main_login_url === 1) {
        const mainLink = deliveryLinks.find(l => l.product_code !== upsellConfig.upsell_sku);
        if (mainLink) {
          linkLoginReal = mainLink.login_url;
        }
      } else if (upsellConfig.upsell_url) {
        linkLoginReal = upsellConfig.upsell_url;
      }
    }

    const instructionsReal = chosenLink?.instructions || `Na hora do login, basta digitar o e-mail que você me passou: *${finalEmail}*`;
    const videoUrlReal = chosenLink?.video_url || "https://www.youtube.com/shorts/5xd3IRlA-GM";
    const clientFirstName = finalNome.trim().split(/\s+/)[0] || 'amiga';

    const deliveryText = `*${clientFirstName}*, o seu acesso já está ativo no sistema! 🎉🗝️\n\n⚠️ *CLIQUE AQUI PARA ENTRAR:* 👉 ${linkLoginReal}\n\n${instructionsReal}\n\n🎥 *Vídeo de Suporte*: Assista ao vídeo de ajuda para ver como acessar as apostilas:\n👉 ${videoUrlReal}`;

    // Enviar webhook de cadastro para o sistema em background mesmo já ativo (Re-requisitar liberação)
    try {
      const telefoneLimpo = contact.phone.replace(/\D/g, '');
      const webhookPayload = {
        evento: "compra_aprovada",
        cliente: {
          email: finalEmail,
          nome: finalNome,
          telefone: telefoneLimpo
        },
        produto: {
          sku: codigoProduto,
          nome: ""
        }
      };

      console.log(`[Webhook N8N - Reenvio] Recadastrando cliente ${finalNome} (${finalEmail}) no SKU: ${codigoProduto}...`);
      const res = await fetch('https://app.promentor21.top/api/webhooks/entrada', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Token': 'dvKVhM5uAVqJQB0662avGK87jUhy9V3T'
        },
        body: JSON.stringify(webhookPayload)
      });
      const text = await res.text();
      console.log(`[Webhook N8N - Reenvio] Sucesso/Resposta do cadastro: Status ${res.status}, Resposta: ${text}`);
    } catch (err) {
      console.error('[Webhook N8N - Reenvio] Falha ao enviar cadastro:', err);
    }

    if (ctx.bypassDirectSend) {
      return {
        success: true,
        result: deliveryText,
      };
    }

    await sendText(db, ctx.automation.whatsapp_api_id, contact.phone, deliveryText, env.KV);
    await saveAssistantMessages(db, state.conversation_id, [deliveryText]);

    return {
      success: true,
      result: `Acesso já estava ativo para ${finalNome} (${finalEmail}). Credenciais reenviadas e liberação no sistema re-solicitada com sucesso sem alterar faturamento ou enviar CAPI.`,
    };
  }

  // Atualizar estado
  await updateState(db, state.conversation_id, {
    client_name: nome,
    client_email: email,
    access_delivered: 1,
    phase: 'completed',
    last_tool_called: 'sistema',
  });

  // Marcar conversa como resolvida
  await db.prepare(
    "UPDATE conversations SET status = 'finalizado_com_sucesso', updated_at = datetime('now') WHERE id = ?"
  ).bind(state.conversation_id).run();

  // Atualizar lead (reusar leadDb)
  const lead = leadDb;

  if (lead) {
    // ⚠️ CRÍTICO: NÃO atualizar updated_at para não alterar a data de pagamento registrada na tabela leads!
    await db.prepare(
      'UPDATE automation_leads SET nome = ?, email = ?, produto_codigo = ?, recebeu_acesso = 1 WHERE id = ?'
    ).bind(nome, email, codigoProduto, lead.id).run();
  } else {
    const maxCodeRes = await db.prepare(
      'SELECT COALESCE(MAX(cliente_codigo), 0) + 1 AS next_code FROM automation_leads'
    ).first<{ next_code: number }>();
    const nextCode = maxCodeRes?.next_code || 1;

    await db.prepare(
      'INSERT INTO automation_leads (id, automation_id, phone, nome, email, produto_codigo, recebeu_acesso, pago, valor_pago, cliente_codigo) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)'
    ).bind(
      crypto.randomUUID(), ctx.automation.id, contact.phone,
      nome, email, codigoProduto,
      state.payment_confirmed, state.total_paid, nextCode
    ).run();
  }

  // ── MATRICULA N8N — Enviar webhook de cadastro para o sistema em background ──
  try {
    const telefoneLimpo = contact.phone.replace(/\D/g, '');
    
    // Mapear o nome do produto dinamicamente
    let nomeProduto = "";
    const webhookPayload = {
      evento: "compra_aprovada",
      cliente: {
        email: email,
        nome: nome,
        telefone: telefoneLimpo
      },
      produto: {
        sku: codigoProduto,
        nome: nomeProduto
      }
    };

    console.log(`[Webhook N8N] Cadastrando cliente ${nome} (${email}) no produto ${nomeProduto} (SKU: ${codigoProduto})...`);
    
    try {
      const res = await fetch('https://app.promentor21.top/api/webhooks/entrada', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Token': 'dvKVhM5uAVqJQB0662avGK87jUhy9V3T'
        },
        body: JSON.stringify(webhookPayload)
      });
      const text = await res.text();
      console.log(`[Webhook N8N] Sucesso/Resposta do cadastro: Status ${res.status}, Resposta: ${text}`);
    } catch (err) {
      console.error('[Webhook N8N] Falha ao enviar cadastro:', err);
    }
  } catch (webErr) {
    console.error('[Webhook N8N] Exceção ao preparar cadastro:', webErr);
  }

  // Se for upsell, atualizar estado
  if (codigoProduto === dynamicUpsellSku || codigoProduto === PRODUCT.productCodes.upsell || (chosenLink && chosenLink.title.toLowerCase().includes("completo"))) {
    await updateState(db, state.conversation_id, {
      upsell_accepted: 1,
    });
  }

  // Disparar evento Purchase 2 (enriquecido com dados de contato) no Facebook Conversions API (CAPI)
  if (!wasSystemAccessDelivered && ctx.automation.pixel_id && ctx.automation.facebook_token) {
    const activeLead = await db.prepare(
      'SELECT id, cliente_codigo FROM automation_leads WHERE phone = ? AND automation_id = ?'
    ).bind(contact.phone, ctx.automation.id).first<{ id: string; cliente_codigo: number | null }>();
    const leadId = activeLead?.cliente_codigo ? String(activeLead.cliente_codigo) : (activeLead?.id || crypto.randomUUID());
    const tracking = await getTrackingData(db, contact.phone, ctx.automation.id);
    const nameParts = nome.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const purchaseValue = state.total_paid || 10.00;
    const isUpsell = codigoProduto === dynamicUpsellSku || codigoProduto === PRODUCT.productCodes.upsell || (chosenLink && chosenLink.title.toLowerCase().includes("completo"));
    const dynamicContentName = isUpsell && upsellConfig?.upsell_name
      ? upsellConfig.upsell_name
      : (ctx.automation.product_name || 'recheios a prova de fogo');

    console.log(`[Facebook CAPI] Enviando Purchase 2 para ${contact.phone} (Valor: ${purchaseValue}, Nome: ${firstName} ${lastName}, Email: ${email}, Produto: ${dynamicContentName})`);
    try {
      const success = await sendPurchaseEventWithDetails(db, ctx.automation.id, ctx.automation.pixel_id, ctx.automation.facebook_token, {
        phone: contact.phone,
        trackingData: tracking,
        leadId,
        value: purchaseValue,
        firstName,
        lastName,
        email,
        contentName: dynamicContentName,
        wabaId: ctx.automation.waba_id,
        pageId: ctx.automation.page_id,
      });
      console.log(`[Facebook CAPI] Purchase 2 enviado com sucesso? ${success}`);
    } catch (err) {
      console.error(`[Facebook CAPI] Erro ao enviar Purchase 2:`, err);
    }
  }

  // ── DISPARAR MENSAGEM DE ENTREGA DE ACESSO REAL ──
  const leadData = await db.prepare(
    'SELECT id, cliente_codigo FROM automation_leads WHERE phone = ? AND automation_id = ?'
  ).bind(contact.phone, ctx.automation.id).first<{ id: string; cliente_codigo: number | null }>();
  
  const leadCode = leadData?.cliente_codigo ? String(leadData.cliente_codigo) : (leadData?.id || crypto.randomUUID());
  const clientFirstName = nome.trim().split(/\s+/)[0] || 'amiga';

  // Usar dados dinâmicos do link se presentes
  let linkLoginReal = chosenLink?.login_url || "https://app.promentor21.top/login";

  // Se o produto sendo entregue for o SKU do upsell, resolver login URL dinâmica
  if (upsellConfig && codigoProduto === upsellConfig.upsell_sku) {
    if (upsellConfig.use_main_login_url === 1) {
      const mainLink = deliveryLinks.find(l => l.product_code !== upsellConfig.upsell_sku);
      if (mainLink) {
        linkLoginReal = mainLink.login_url;
        console.log(`[Sistema Dinâmico] Usando login URL do produto principal para o Upsell: ${linkLoginReal}`);
      }
    } else if (upsellConfig.upsell_url) {
      linkLoginReal = upsellConfig.upsell_url;
      console.log(`[Sistema Dinâmico] Usando login URL customizado para o Upsell: ${linkLoginReal}`);
    }
  }

  const instructionsReal = chosenLink?.instructions || `Na hora do login, basta digitar o e-mail que você me passou: *${email}*`;
  const videoUrlReal = chosenLink?.video_url || "https://www.youtube.com/shorts/5xd3IRlA-GM";

  const sistemaVariations = [
    `*${clientFirstName}*, acabei de liberar o seu acesso no sistema! 🎉🗝️\n\n⚠️ *CLIQUE AQUI PARA ACESSAR:* 👉 ${linkLoginReal}\n\n${instructionsReal}\n\n🎥 *Assista a esse vídeo explicativo*: ele ensina direitinho passo a passo como entrar no sistema e encontrar todas as suas apostilas e bônus:\n👉 ${videoUrlReal}\n\nQue Deus abençoe imensamente a sua jornada e o seu negócio! Desejo muito sucesso e excelentes vendas! 💖🍰`,
    `Prontinho, *${clientFirstName}*! O seu cadastro foi concluído e o acesso já está liberado! 🎉🗝️\n\n⚠️ *LINK DE ACESSO:* 👉 ${linkLoginReal}\n\nPara entrar: ${instructionsReal}\n\n🎥 *Vídeo de Instruções*: Assista a este vídeo rápido de 1 minuto explicando como fazer o primeiro acesso e ver as receitas:\n👉 ${videoUrlReal}\n\nQue Deus abençoe ricamente a sua nova jornada na confeitaria! Muito sucesso e que você venda muito! 💖🍰`,
    `Tudo pronto, *${clientFirstName}*! Sua conta foi ativada com sucesso no nosso portal de alunas! 🎉🗝️\n\n⚠️ *ENTRAR NO SISTEMA:* 👉 ${linkLoginReal}\n\n${instructionsReal}\n\n🎥 *Passo a Passo de Acesso*: Preparei este vídeo curto explicando exatamente como navegar pela área de membros:\n👉 ${videoUrlReal}\n\nQue Deus abençoe os seus negócios e a sua vida! Que você tenha muito sucesso e muitas encomendas! 💖🍰`,
    `Matrícula realizada com sucesso, *${clientFirstName}*! Seu acesso vitalício está liberado! 🎉🗝️\n\n⚠️ *CLIQUE PARA ENTRAR:* 👉 ${linkLoginReal}\n\n${instructionsReal}\n\n🎥 *Suporte Visual*: Veja este vídeo explicativo mostrando como acessar as apostilas e videoaulas de bônus:\n👉 ${videoUrlReal}\n\nQue Deus abençoe as suas vendas e o seu caminho! Desejo muito sucesso e prosperidade para você! 💖🍰`,
    `Eba, *${clientFirstName}*! Seu acesso exclusivo foi gerado e está prontinho para você entrar! 🎉🗝️\n\n⚠️ *LINK PORTAL DE ALUNAS:* 👉 ${linkLoginReal}\n\n${instructionsReal}\n\n🎥 *Vídeo Explicativo*: Assista a este vídeo curto para entender o passo a passo de como encontrar o material:\n👉 ${videoUrlReal}\n\nQue Deus abençoe grandemente a sua jornada empreendedora! Muito sucesso e ótimas vendas com os doces! 💖🍰`
  ];
  const deliveryText = sistemaVariations[Math.floor(Math.random() * sistemaVariations.length)];

  // Se o produto que acabou de ser liberado foi o Kit Completo (produto principal),
  // e o upsell de pós-venda ainda não foi disparado, agendamos o upsell para o delay configurado!
  const isPrincipalProduct = codigoProduto === PRODUCT.productCodes.principal || 
                             (chosenLink && (chosenLink.title.toLowerCase().includes("completo") || chosenLink.title.toLowerCase().includes("vip")));
  
  if (isPrincipalProduct && !state.upsell_enviado) {
    const delayMinutes = upsellConfig ? upsellConfig.delay_minutes : 5;
    console.log(`[Sistema] Agendando Upsell 'upsell_5min' de ${delayMinutes} minutos para ${contact.phone}...`);
    // Cancela qualquer agendamento de upsell anterior para não duplicar
    await cancelFollowups(db, state.conversation_id, 'upsell%');
    await scheduleFollowup(db, state.conversation_id, ctx.automation.slug, 'upsell_5min', delayMinutes * 60 * 1000);
  }

  if (ctx.bypassDirectSend) {
    return {
      success: true,
      result: deliveryText,
    };
  }

  console.log(`[Sistema] Enviando mensagem de entrega de acesso para ${contact.phone}`);
  await sendText(db, ctx.automation.whatsapp_api_id, contact.phone, deliveryText, env.KV);
  await saveAssistantMessages(db, state.conversation_id, [deliveryText]);

  return {
    success: true,
    result: `Acesso registrado para ${nome} (${email}). Produto: ${codigoProduto}.`,
  };
}

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

/**
 * Agenda um follow-up para execução futura
 */
async function scheduleFollowup(
  db: D1Database,
  conversationId: string,
  automationSlug: string,
  type: string,
  delayMs: number
): Promise<void> {
  // Adiciona Jitter (dispersão aleatória entre 1 e 10 minutos)
  // Exceção: upsell_5min exige precisão temporal, por isso adicionamos apenas um micro jitter de 5 a 15 segundos
  const isUpsell5min = type === 'upsell_5min';
  const jitterMs = isUpsell5min
    ? Math.floor(Math.random() * 10 * 1000) + 5 * 1000 // 5 a 15 segundos
    : Math.floor(Math.random() * 9 * 60 * 1000) + 60 * 1000; // 1 a 10 minutos
  
  const finalDelay = delayMs + jitterMs;

  let scheduledDate = new Date(Date.now() + finalDelay);
  scheduledDate = adjustScheduledTimeForSilentHours(scheduledDate);
  const scheduledFor = scheduledDate.toISOString();
  await db.prepare(
    'INSERT INTO scheduled_followups (id, conversation_id, automation_slug, type, scheduled_for) VALUES (?, ?, ?, ?, ?)'
  ).bind(crypto.randomUUID(), conversationId, automationSlug, type, scheduledFor).run();
}

/**
 * Cancela follow-ups pendentes que correspondem ao padrão
 */
async function cancelFollowups(
  db: D1Database,
  conversationId: string,
  typePattern: string
): Promise<void> {
  await db.prepare(
    'UPDATE scheduled_followups SET status = \'cancelled\' WHERE conversation_id = ? AND type LIKE ? AND status = \'pending\''
  ).bind(conversationId, typePattern).run();
}

/**
 * Salva mensagens do assistente no histórico
 */
export async function saveAssistantMessages(
  db: D1Database,
  conversationId: string,
  messages: string[],
  env?: any
): Promise<void> {
  if (messages.length === 0) return;
  
  const messagesWithIds = messages.map(content => ({
    id: crypto.randomUUID(),
    content
  }));

  const statements = messagesWithIds.map(msg =>
    db.prepare('INSERT INTO messages (id, conversation_id, content, role) VALUES (?, ?, ?, \'assistant\')')
      .bind(msg.id, conversationId, msg.content)
  );
  await db.batch(statements);

  try {
    const { getRegisteredEnv, notifyNewMessage } = await import("../../services/realtime-service");
    const activeEnv = env || getRegisteredEnv(conversationId);
    
    if (activeEnv) {
      for (const msg of messagesWithIds) {
        await notifyNewMessage(activeEnv, conversationId, {
          id: msg.id,
          content: msg.content,
          role: 'assistant'
        });
      }
    }
  } catch (err) {
    console.error("[saveAssistantMessages] Error notifying realtime assistant message:", err);
  }
}

/**
 * Envia os 5 PDFs básicos sem ofertas ou áudios extras (Gatilho da Opção B no CRM).
 */
export async function executeEntregarPdfCrm(ctx: AutomationContext): Promise<{ success: boolean; result?: string; error?: string }> {
  const { env, automation, contact, state } = ctx;
  const db = env.DB;
  const kv = env.KV;
  const whatsappApiId = automation.whatsapp_api_id;
  const phone = contact.phone;
  const nome = contact.name || state.client_name || 'amiga';
  const firstName = nome.split(/\s+/)[0] || 'amiga';

  try {
    // 1. Enviar os 5 PDFs de receitas
    const pdfs = [
      { url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%205.%20Recheios%20Sem%20Fog%C3%A3o%20(101%20Receitas).pdf', name: 'Apostila 5. Recheios Sem Fogão (101 Receitas).pdf' },
      { url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%201.%20Recheios%20Sem%20Fog%C3%A3o%20(50%20Receitas).pdf', name: 'Apostila 1. Recheios Sem Fogão (50 Receitas).pdf' },
      { url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%203.%20Recheios%20Sem%20Fog%C3%A3o%20(20%20Receitas).pdf', name: 'Apostila 3. Recheios Sem Fogão (20 Receitas).pdf' },
      { url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%204.%20Recheios%20Sem%20Fog%C3%A3o%20(23%20Receitas).pdf', name: 'Apostila 4. Recheios Sem Fogão (23 Receitas).pdf' },
      { url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%202.%20Recheios%20Sem%20Fog%C3%A3o%20(34%20Receitas).pdf', name: 'Apostila 2. Recheios Sem Fogão (34 Receitas).pdf' }
    ];

    console.log(`[CRM PDF Delivery] Enviando 5 PDFs em paralelo para ${phone}`);
    await Promise.all(pdfs.map(pdf => 
      sendDocument(db, whatsappApiId, phone, pdf.url, pdf.name, kv)
    ));

    // Salvar logs no D1 em lote único
    const pdfLogs = pdfs.map(pdf => `[PDF de receita enviado via CRM: ${pdf.name}]`);
    await saveAssistantMessages(db, state.conversation_id, pdfLogs);

    // Delay de 2 segundos para dar tempo do celular receber e abrir
    await sleep(2000);

    // Atualizar estado
    await updateState(db, state.conversation_id, {
      access_delivered: 1,
      phase: 'completed',
      last_tool_called: 'entregar_pdf_crm'
    });

    // Marcar conversa como resolvida
    await db.prepare(
      "UPDATE conversations SET status = 'finalizado_com_sucesso', updated_at = datetime('now') WHERE id = ?"
    ).bind(state.conversation_id).run();

    // Marcar que recebeu acesso na tabela de leads
    const existingLead = await db.prepare(
      'SELECT id FROM automation_leads WHERE phone = ? AND automation_id = ?'
    ).bind(phone, automation.id).first<{ id: string }>();

    if (existingLead) {
      await db.prepare(
        'UPDATE automation_leads SET recebeu_acesso = 1, updated_at = datetime(\'now\') WHERE id = ?'
      ).bind(existingLead.id).run();
    }

    // Enviar mensagem final afetuosa
    const msgFinal = `*${firstName}*, já te enviei as apostilas em PDF com as *200 receitas de recheios a frio* logo acima! 😍🍰\n\nQualquer dúvida com as receitas ou para baixar, estou por aqui! Desejo muito sucesso e excelentes vendas com os seus doces! Tenha um dia maravilhoso! ✨💛`;

    if (ctx.bypassDirectSend) {
      return { success: true, result: msgFinal };
    }

    await sendText(db, whatsappApiId, phone, msgFinal, kv);
    await saveAssistantMessages(db, state.conversation_id, [msgFinal]);

    return { success: true, result: 'PDFs de CRM entregues com sucesso sem ofertas.' };

  } catch (err) {
    console.error('[CRM PDF Delivery] Falha ao entregar PDFs:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Agenda uma promessa de pagamento para o cliente na data informada.
 * Se o produto não foi entregue ainda (seq2_called = 0), realiza o envio na hora.
 * Cancela todos os outros follow-ups normais de cobrança/reengajamento.
 */
export async function executeAgendarPromessa(
  ctx: AutomationContext,
  args: Record<string, any>
): Promise<{ success: boolean; result: string }> {
  const { env, state, contact, automation } = ctx;
  const db = env.DB;
  const dataPromessa = args.data_promessa;

  if (!dataPromessa) {
    return { success: false, result: 'A data da promessa é obrigatória.' };
  }

  // Validar formato YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dataPromessa)) {
    return { success: false, result: `Formato de data inválido: ${dataPromessa}. Deve ser YYYY-MM-DD.` };
  }

  console.log(`[Promessa Pagamento] Agendando promessa de pagamento para ${contact.phone} na data ${dataPromessa}`);

  // 1. Salvar data no estado
  await updateState(db, state.conversation_id, {
    promessa_pagamento_data: dataPromessa,
    last_tool_called: 'agendar_promessa'
  });

  state.promessa_pagamento_data = dataPromessa;
  state.last_tool_called = 'agendar_promessa';

  // 2. Se o produto não foi enviado ainda (seq2_called = 0), envia agora!
  let deliveryResult = '';
  if (state.seq2_called === 0) {
    console.log(`[Promessa Pagamento] seq2_called = 0. Disparando envio do produto antes de agendar cobrança...`);
    const seq2Res = await executeSeq2(ctx);
    if (seq2Res.success) {
      deliveryResult = 'Produto (SEQ2) enviado com sucesso. ';
      state.seq2_called = 1;
    } else {
      console.error(`[Promessa Pagamento] Falha ao enviar produto na promessa:`, seq2Res.result);
      deliveryResult = 'Aviso: Falha no envio automático do produto, mas a promessa foi registrada. ';
    }
  }

  // 3. Cancelar TODOS os outros follow-ups pendentes para essa conversa
  await cancelFollowups(db, state.conversation_id, '%');
  console.log(`[Promessa Pagamento] Cancelados todos os follow-ups pendentes para a conversa ${state.conversation_id}`);

  // 4. Manter status da conversa como 'pending'
  await db.prepare(
    "UPDATE conversations SET status = 'pending', updated_at = datetime('now') WHERE id = ?"
  ).bind(state.conversation_id).run();

  // 5. Agendar o follow-up especial de cobrança ('followup_cobranca_promessa')
  // Deve rodar no dia 'dataPromessa' entre 19:00 e 21:00 SP Time (UTC-3)
  const baseHour = 19;
  const randomMinutes = Math.floor(Math.random() * 120); // 0 a 119 minutos
  const targetHour = baseHour + Math.floor(randomMinutes / 60);
  const targetMinute = randomMinutes % 60;
  const targetSecond = Math.floor(Math.random() * 60);
  
  const pad = (num: number) => String(num).padStart(2, '0');
  const spIsoString = `${dataPromessa}T${pad(targetHour)}:${pad(targetMinute)}:${pad(targetSecond)}-03:00`;
  const scheduledFor = new Date(spIsoString).toISOString();

  console.log(`[Promessa Pagamento] Agendando followup_cobranca_promessa para ${scheduledFor} (Horário SP: ${pad(targetHour)}:${pad(targetMinute)})`);

  await db.prepare(
    'INSERT INTO scheduled_followups (id, conversation_id, automation_slug, type, scheduled_for) VALUES (?, ?, ?, ?, ?)'
  ).bind(crypto.randomUUID(), state.conversation_id, automation.slug, 'followup_cobranca_promessa', scheduledFor).run();

  const formattedDateBR = dataPromessa.split('-').reverse().join('/');
  return {
    success: true,
    result: `${deliveryResult}Promessa de pagamento agendada com sucesso para o dia ${formattedDateBR}. Todos os outros follow-ups foram cancelados e o lembrete de cobrança foi programado.`,
  };
}
