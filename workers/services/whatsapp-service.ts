/**
 * workers/services/whatsapp-service.ts
 *
 * Serviço de envio de mensagens via WhatsApp.
 * Suporta múltiplos provedores de API detectados automaticamente pela base_url:
 *
 *  - Evolution API v2  (base_url contém 'evolution')
 *  - UAZAPI            (base_url contém 'uazapi')
 *  - Genérico          (usa formato Evolution API v2 como padrão)
 */

import { getCachedWhatsAppApi } from "./cache-service";

// ─── Tipos ────────────────────────────────────────────────────────────────────

/** Tipo de provedor WhatsApp detectado */
type WhatsAppProvider = 'evolution' | 'uazapi' | 'generic';

/** Registro de API WhatsApp vindo do banco */
interface WhatsAppAPIRecord {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
}

/** Resposta de download de mídia */
export interface MediaDownloadResult {
  base64Data: string;
  mimetype: string;
}

// ─── Cache em memória (por lifetime da request) ──────────────────────────────

/** Cache de configs para evitar consultas repetidas ao DB na mesma request */
const apiCache = new Map<string, WhatsAppAPIRecord>();

// ─── Helpers internos ─────────────────────────────────────────────────────────

/**
 * Verifica se uma string se parece com o nome de um arquivo (terminando com extensão de mídia).
 */
function isFileName(str: string | null | undefined): boolean {
  if (!str) return false;
  const lower = str.toLowerCase().trim();
  const extensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.mov', '.avi', '.pdf', '.ogg', '.mp3', '.wav'];
  return extensions.some(ext => lower.endsWith(ext));
}

/**
 * Busca a configuração da API WhatsApp no banco.
 * Usa cache em memória e KV para evitar múltiplas consultas na mesma request/edge.
 */
async function getAPIConfig(db: D1Database, whatsappApiId: string, kv?: KVNamespace): Promise<WhatsAppAPIRecord> {
  // Verificar cache em memória
  const cached = apiCache.get(whatsappApiId);
  if (cached) return cached;

  // Buscar do cache KV (com fallback automático para D1 dentro do helper)
  const result = await getCachedWhatsAppApi(db, kv, whatsappApiId);

  if (!result) {
    throw new Error(`API WhatsApp não encontrada: ${whatsappApiId}`);
  }

  // Guardar no cache em memória
  apiCache.set(whatsappApiId, result);
  return result;
}

/**
 * Detecta o tipo de provedor a partir da base_url.
 */
function detectProvider(baseUrl: string): WhatsAppProvider {
  const lower = baseUrl.toLowerCase();

  if (lower.includes('evolution')) return 'evolution';
  if (lower.includes('uazapi')) return 'uazapi';

  // Padrão: usa formato Evolution
  return 'generic';
}

/**
 * Remove a barra final da URL base, se houver.
 */
function cleanBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

/**
 * Extrai o nome da instância da base_url da Evolution API.
 * Formato esperado: https://host/instance ou configurado diretamente.
 *
 * Por padrão, usa a última parte do path como instância.
 * Se não houver path, usa "default".
 */
function extractEvolutionInstance(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : 'default';
  } catch {
    return 'default';
  }
}

/**
 * Realiza uma requisição HTTP com tratamento de erros.
 */
async function makeRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: any
): Promise<Response> {
  try {
    const resp = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[WhatsApp] Erro ${resp.status} em ${url}: ${errText}`);
      throw new Error(`WhatsApp API retornou status ${resp.status}: ${errText}`);
    }

    return resp;
  } catch (err: any) {
    console.error(`[WhatsApp] Erro de rede em ${url}: ${err?.message ?? err}`);
    throw err;
  }
}

// ─── Message ID Extractor ───────────────────────────────────────────────────

/**
 * Extrai o ID único da mensagem das respostas das APIs WhatsApp.
 */
function extractMessageId(data: any): string {
  if (!data) return "";
  if (data.key?.id) return data.key.id;
  if (data.messageId) return String(data.messageId);
  if (data.data?.messageId) return String(data.data.messageId);
  if (data.data?.key?.id) return data.data.key.id;
  if (data.id) return String(data.id);
  if (data.msgId) return String(data.msgId);
  return "";
}

// ─── Evolution API v2 ─────────────────────────────────────────────────────────

/**
 * Funções específicas para a Evolution API v2.
 */
const evolution = {
  async sendText(api: WhatsAppAPIRecord, phone: string, text: string): Promise<string> {
    const base = cleanBaseUrl(api.base_url);
    const instance = extractEvolutionInstance(api.base_url);
    const url = `${base}/message/sendText/${instance}`;

    const resp = await makeRequest(url, 'POST', { apikey: api.api_key }, {
      number: phone,
      text,
    });
    const data = await resp.json() as any;
    return extractMessageId(data);
  },

  async sendImage(api: WhatsAppAPIRecord, phone: string, imageUrl: string, caption?: string): Promise<string> {
    const base = cleanBaseUrl(api.base_url);
    const instance = extractEvolutionInstance(api.base_url);
    const url = `${base}/message/sendMedia/${instance}`;

    const resp = await makeRequest(url, 'POST', { apikey: api.api_key }, {
      number: phone,
      mediatype: 'image',
      media: imageUrl,
      ...(caption && { caption }),
    });
    const data = await resp.json() as any;
    return extractMessageId(data);
  },

  async sendDocument(api: WhatsAppAPIRecord, phone: string, docUrl: string, fileName: string): Promise<string> {
    const base = cleanBaseUrl(api.base_url);
    const instance = extractEvolutionInstance(api.base_url);
    const url = `${base}/message/sendMedia/${instance}`;

    const resp = await makeRequest(url, 'POST', { apikey: api.api_key }, {
      number: phone,
      mediatype: 'document',
      media: docUrl,
      fileName,
    });
    const data = await resp.json() as any;
    return extractMessageId(data);
  },

  async sendAudio(api: WhatsAppAPIRecord, phone: string, audioUrl: string): Promise<string> {
    const base = cleanBaseUrl(api.base_url);
    const instance = extractEvolutionInstance(api.base_url);
    const url = `${base}/message/sendWhatsAppAudio/${instance}`;

    const resp = await makeRequest(url, 'POST', { apikey: api.api_key }, {
      number: phone,
      audio: audioUrl,
    });
    const data = await resp.json() as any;
    return extractMessageId(data);
  },

  async sendVideo(api: WhatsAppAPIRecord, phone: string, videoUrl: string, caption?: string): Promise<string> {
    const base = cleanBaseUrl(api.base_url);
    const instance = extractEvolutionInstance(api.base_url);
    const url = `${base}/message/sendMedia/${instance}`;

    const resp = await makeRequest(url, 'POST', { apikey: api.api_key }, {
      number: phone,
      mediatype: 'video',
      media: videoUrl,
      ...(caption && { caption }),
    });
    const data = await resp.json() as any;
    return extractMessageId(data);
  },
};

// ─── UAZAPI ───────────────────────────────────────────────────────────────────

/**
 * Funções específicas para a UAZAPI.
 */
const uazapi = {
  async sendText(api: WhatsAppAPIRecord, phone: string, text: string): Promise<string> {
    const base = cleanBaseUrl(api.base_url);
    const url = `${base}/send/text`;

    const resp = await makeRequest(url, 'POST', { token: api.api_key }, {
      number: phone,
      text,
    });
    const data = await resp.json() as any;
    return extractMessageId(data);
  },

  async sendImage(api: WhatsAppAPIRecord, phone: string, imageUrl: string, caption?: string): Promise<string> {
    const base = cleanBaseUrl(api.base_url);
    const url = `${base}/send/media`;

    const resp = await makeRequest(url, 'POST', { token: api.api_key }, {
      number: phone,
      type: 'image',
      file: imageUrl,
      path: imageUrl,
      ...(caption && { text: caption, caption: caption }),
    });
    const data = await resp.json() as any;
    return extractMessageId(data);
  },

  async sendDocument(api: WhatsAppAPIRecord, phone: string, docUrl: string, fileName: string): Promise<string> {
    const base = cleanBaseUrl(api.base_url);
    const url = `${base}/send/media`;

    const resp = await makeRequest(url, 'POST', { token: api.api_key }, {
      number: phone,
      type: 'document',
      file: docUrl,
      path: docUrl,
      docName: fileName,
    });
    const data = await resp.json() as any;
    return extractMessageId(data);
  },

  async sendAudio(api: WhatsAppAPIRecord, phone: string, audioUrl: string): Promise<string> {
    const base = cleanBaseUrl(api.base_url);
    const url = `${base}/send/media`;

    const resp = await makeRequest(url, 'POST', { token: api.api_key }, {
      number: phone,
      type: 'audio',
      file: audioUrl,
      path: audioUrl,
    });
    const data = await resp.json() as any;
    return extractMessageId(data);
  },

  async sendVideo(api: WhatsAppAPIRecord, phone: string, videoUrl: string, caption?: string): Promise<string> {
    const base = cleanBaseUrl(api.base_url);
    const url = `${base}/send/media`;

    const resp = await makeRequest(url, 'POST', { token: api.api_key }, {
      number: phone,
      type: 'video',
      file: videoUrl,
      path: videoUrl,
      ...(caption && { text: caption, caption: caption }),
    });
    const data = await resp.json() as any;
    return extractMessageId(data);
  },

  async downloadMedia(api: WhatsAppAPIRecord, mediaId: string): Promise<MediaDownloadResult> {
    const base = cleanBaseUrl(api.base_url);
    const url = `${base}/message/download`;

    const resp = await makeRequest(url, 'POST', { token: api.api_key }, {
      id: mediaId,
      return_base64: true,
      return_link: false,
    });

    const data: any = await resp.json();

    return {
      base64Data: data.base64Data ?? data.base64 ?? data.data ?? '',
      mimetype: data.mimetype ?? data.mimeType ?? 'application/octet-stream',
    };
  },
};

// ─── Funções públicas ─────────────────────────────────────────────────────────

/**
 * Grava um log de disparo (sucesso ou falha) na tabela dispatch_logs.
 * Caso o automationId não seja passado, tenta encontrá-lo a partir do telefone.
 */
export async function writeDispatchLog(
  db: D1Database,
  phone: string,
  messageType: string,
  messageContent: string,
  status: 'success' | 'error',
  errorMessage: string | null = null,
  automationId?: string
): Promise<void> {
  try {
    let finalAutoId = automationId || null;
    if (!finalAutoId) {
      // Tenta recuperar a automação mais recente vinculada a este número de telefone
      const contact = await db.prepare(
        "SELECT automation_id FROM contacts WHERE phone = ? ORDER BY created_at DESC LIMIT 1"
      ).bind(phone).first<{ automation_id: string }>();
      finalAutoId = contact?.automation_id || null;
    }

    const logId = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO dispatch_logs (id, automation_id, phone, message_type, message_content, status, error_message, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      logId,
      finalAutoId,
      phone,
      messageType,
      messageContent.substring(0, 1000), // snippet do conteúdo
      status,
      errorMessage
    ).run();
  } catch (err) {
    console.error("[DispatchLog] Erro ao gravar log de envio no D1:", err);
  }
}

/**
 * Envia uma mensagem de texto via WhatsApp.
 *
 * @param db - Instância do banco D1
 * @param whatsappApiId - ID da API WhatsApp cadastrada
 * @param phone - Número do destinatário (formato internacional, ex: 5511999999999)
 * @param text - Texto da mensagem
 * @param kv - Namespace KV do Cloudflare
 * @param automationId - ID da automação associada (opcional)
 *
 * @example
 * ```ts
 * await sendText(env.DB, 'api-id', '5511999999999', 'Olá, tudo bem?');
 * ```
 */
export async function sendText(
  db: D1Database,
  whatsappApiId: string,
  phone: string,
  text: string,
  kv?: KVNamespace,
  automationId?: string
): Promise<string> {
  try {
    const api = await getAPIConfig(db, whatsappApiId, kv);
    const provider = detectProvider(api.base_url);

    console.log(`[WhatsApp] Enviando texto para ${phone} via ${api.name} (${provider})`);

    const cleanedText = text ? text.replace(/\*\*/g, '*') : '';

    let result: string;
    switch (provider) {
      case 'uazapi':
        result = await uazapi.sendText(api, phone, cleanedText);
        break;
      case 'evolution':
      case 'generic':
      default:
        result = await evolution.sendText(api, phone, cleanedText);
        break;
    }

    await writeDispatchLog(db, phone, 'text', cleanedText, 'success', null, automationId);
    return result;
  } catch (err: any) {
    console.error(`[WhatsApp] Erro ao enviar texto: ${err?.message ?? err}`);
    await writeDispatchLog(db, phone, 'text', text ? text.replace(/\*\*/g, '*') : '', 'error', err?.message ?? String(err), automationId);
    throw err;
  }
}

/**
 * Envia uma imagem via WhatsApp.
 *
 * @param db - Instância do banco D1
 * @param whatsappApiId - ID da API WhatsApp cadastrada
 * @param phone - Número do destinatário
 * @param imageUrl - URL pública da imagem
 * @param caption - Legenda opcional
 * @param kv - Namespace KV do Cloudflare
 * @param automationId - ID da automação associada (opcional)
 */
export async function sendImage(
  db: D1Database,
  whatsappApiId: string,
  phone: string,
  imageUrl: string,
  caption?: string,
  kv?: KVNamespace,
  automationId?: string
): Promise<string> {
  const contentDesc = caption ? `[Imagem] ${caption} (${imageUrl})` : `[Imagem] ${imageUrl}`;
  try {
    const api = await getAPIConfig(db, whatsappApiId, kv);
    const provider = detectProvider(api.base_url);

    console.log(`[WhatsApp] Enviando imagem para ${phone} via ${api.name} (${provider})`);

    let cleanedCaption = caption ? caption.replace(/\*\*/g, '*') : caption;
    if (cleanedCaption && isFileName(cleanedCaption)) {
      cleanedCaption = undefined;
    }

    let result: string;
    switch (provider) {
      case 'uazapi':
        result = await uazapi.sendImage(api, phone, imageUrl, cleanedCaption);
        break;
      case 'evolution':
      case 'generic':
      default:
        result = await evolution.sendImage(api, phone, imageUrl, cleanedCaption);
        break;
    }

    const updatedContentDesc = cleanedCaption ? `[Imagem] ${cleanedCaption} (${imageUrl})` : `[Imagem] ${imageUrl}`;
    await writeDispatchLog(db, phone, 'image', updatedContentDesc, 'success', null, automationId);
    return result;
  } catch (err: any) {
    console.error(`[WhatsApp] Erro ao enviar imagem: ${err?.message ?? err}`);
    const cleanedCaption = caption ? caption.replace(/\*\*/g, '*') : caption;
    const updatedContentDesc = cleanedCaption ? `[Imagem] ${cleanedCaption} (${imageUrl})` : `[Imagem] ${imageUrl}`;
    await writeDispatchLog(db, phone, 'image', updatedContentDesc, 'error', err?.message ?? String(err), automationId);
    throw err;
  }
}

/**
 * Envia um documento via WhatsApp.
 *
 * @param db - Instância do banco D1
 * @param whatsappApiId - ID da API WhatsApp cadastrada
 * @param phone - Número do destinatário
 * @param docUrl - URL pública do documento
 * @param fileName - Nome do arquivo para exibição
 * @param kv - Namespace KV do Cloudflare
 * @param automationId - ID da automação associada (opcional)
 */
export async function sendDocument(
  db: D1Database,
  whatsappApiId: string,
  phone: string,
  docUrl: string,
  fileName: string,
  kv?: KVNamespace,
  automationId?: string
): Promise<string> {
  const contentDesc = `[Documento] ${fileName} (${docUrl})`;
  try {
    const api = await getAPIConfig(db, whatsappApiId, kv);
    const provider = detectProvider(api.base_url);

    console.log(`[WhatsApp] Enviando documento para ${phone} via ${api.name} (${provider})`);

    let result: string;
    switch (provider) {
      case 'uazapi':
        result = await uazapi.sendDocument(api, phone, docUrl, fileName);
        break;
      case 'evolution':
      case 'generic':
      default:
        result = await evolution.sendDocument(api, phone, docUrl, fileName);
        break;
    }

    await writeDispatchLog(db, phone, 'document', contentDesc, 'success', null, automationId);
    return result;
  } catch (err: any) {
    console.error(`[WhatsApp] Erro ao enviar documento: ${err?.message ?? err}`);
    await writeDispatchLog(db, phone, 'document', contentDesc, 'error', err?.message ?? String(err), automationId);
    throw err;
  }
}

/**
 * Envia um áudio via WhatsApp.
 *
 * @param db - Instância do banco D1
 * @param whatsappApiId - ID da API WhatsApp cadastrada
 * @param phone - Número do destinatário
 * @param audioUrl - URL pública do áudio
 * @param kv - Namespace KV do Cloudflare
 * @param automationId - ID da automação associada (opcional)
 */
export async function sendAudio(
  db: D1Database,
  whatsappApiId: string,
  phone: string,
  audioUrl: string,
  kv?: KVNamespace,
  automationId?: string
): Promise<string> {
  const contentDesc = `[Áudio] ${audioUrl}`;
  try {
    const api = await getAPIConfig(db, whatsappApiId, kv);
    const provider = detectProvider(api.base_url);

    console.log(`[WhatsApp] Enviando áudio para ${phone} via ${api.name} (${provider})`);

    let result: string;
    switch (provider) {
      case 'uazapi':
        result = await uazapi.sendAudio(api, phone, audioUrl);
        break;
      case 'evolution':
      case 'generic':
      default:
        result = await evolution.sendAudio(api, phone, audioUrl);
        break;
    }

    await writeDispatchLog(db, phone, 'audio', contentDesc, 'success', null, automationId);
    return result;
  } catch (err: any) {
    console.error(`[WhatsApp] Erro ao enviar áudio: ${err?.message ?? err}`);
    await writeDispatchLog(db, phone, 'audio', contentDesc, 'error', err?.message ?? String(err), automationId);
    throw err;
  }
}

/**
 * Envia um vídeo via WhatsApp.
 *
 * @param db - Instância do banco D1
 * @param whatsappApiId - ID da API WhatsApp cadastrada
 * @param phone - Número do destinatário
 * @param videoUrl - URL pública do vídeo
 * @param caption - Legenda opcional
 * @param kv - Namespace KV do Cloudflare
 * @param automationId - ID da automação associada (opcional)
 */
export async function sendVideo(
  db: D1Database,
  whatsappApiId: string,
  phone: string,
  videoUrl: string,
  caption?: string,
  kv?: KVNamespace,
  automationId?: string
): Promise<string> {
  let cleanedCaption = caption ? caption.replace(/\*\*/g, '*') : caption;
  if (cleanedCaption && isFileName(cleanedCaption)) {
    cleanedCaption = undefined;
  }
  const contentDesc = cleanedCaption ? `[Vídeo] ${cleanedCaption} (${videoUrl})` : `[Vídeo] ${videoUrl}`;
  try {
    const api = await getAPIConfig(db, whatsappApiId, kv);
    const provider = detectProvider(api.base_url);

    console.log(`[WhatsApp] Enviando vídeo para ${phone} via ${api.name} (${provider})`);

    let result: string;
    switch (provider) {
      case 'uazapi':
        result = await uazapi.sendVideo(api, phone, videoUrl, cleanedCaption);
        break;
      case 'evolution':
      case 'generic':
      default:
        result = await evolution.sendVideo(api, phone, videoUrl, cleanedCaption);
        break;
    }

    await writeDispatchLog(db, phone, 'video', contentDesc, 'success', null, automationId);
    return result;
  } catch (err: any) {
    console.error(`[WhatsApp] Erro ao enviar vídeo: ${err?.message ?? err}`);
    await writeDispatchLog(db, phone, 'video', contentDesc, 'error', err?.message ?? String(err), automationId);
    throw err;
  }
}

/**
 * Envia um botão nativo de PIX (exclusivo UAZAPI) ou fallback formatado em texto para outros provedores.
 *
 * @param db - Instância do banco D1
 * @param whatsappApiId - ID da API WhatsApp cadastrada
 * @param phone - Número do destinatário
 * @param pixKey - Chave PIX
 * @param pixType - Tipo da chave ('CPF' | 'CNPJ' | 'PHONE' | 'EMAIL' | 'EVP')
 * @param pixName - Nome do recebedor (opcional)
 * @param kv - Namespace KV
 * @param automationId - ID da automação associada (opcional)
 */
export async function sendPixButton(
  db: D1Database,
  whatsappApiId: string,
  phone: string,
  pixKey: string,
  pixType: 'CPF' | 'CNPJ' | 'PHONE' | 'EMAIL' | 'EVP',
  pixName?: string,
  kv?: KVNamespace,
  automationId?: string
): Promise<string> {
  const labelType = pixType === 'PHONE' ? 'Celular' : pixType;
  const contentDesc = `[Botão PIX] Chave ${labelType}: ${pixKey} (${pixName || 'Beneficiário'})`;
  try {
    const api = await getAPIConfig(db, whatsappApiId, kv);
    const provider = detectProvider(api.base_url);

    console.log(`[WhatsApp] Enviando PIX para ${phone} via ${api.name} (${provider})`);

    let resultId: string;
    if (provider === 'uazapi') {
      const base = cleanBaseUrl(api.base_url);
      const url = `${base}/send/pix-button`;

      const resp = await makeRequest(url, 'POST', { token: api.api_key }, {
        number: phone,
        pixType,
        pixKey,
        pixName: pixName || '',
      });
      const data = await resp.json() as any;
      resultId = extractMessageId(data);
    } else {
      // Fallback para outros provedores (Evolution, Genérico)
      const text = `🔑 *Chave PIX (${labelType}):*\n\`${pixKey}\`\n\n👤 *Beneficiário:* ${pixName || 'R G FEITOSA 153DF'}\n\n_(Copie a chave acima para realizar o pagamento)_`;
      
      switch (provider) {
        case 'evolution':
        case 'generic':
        default:
          resultId = await evolution.sendText(api, phone, text);
          break;
      }
    }

    await writeDispatchLog(db, phone, 'pix_button', contentDesc, 'success', null, automationId);
    return resultId;
  } catch (err: any) {
    console.error(`[WhatsApp] Erro ao enviar botão de PIX: ${err?.message ?? err}`);
    await writeDispatchLog(db, phone, 'pix_button', contentDesc, 'error', err?.message ?? String(err), automationId);
    throw err;
  }
}

/**
 * Faz download de uma mídia recebida no WhatsApp (imagem, documento, áudio, etc.).
 * Retorna os dados em base64 e o mimetype.
 *
 * @param db - Instância do banco D1
 * @param whatsappApiId - ID da API WhatsApp cadastrada
 * @param mediaId - ID da mídia (fornecido pelo webhook do WhatsApp)
 * @param kv - Namespace KV do Cloudflare
 * @returns Objeto com base64Data e mimetype
 *
 * @example
 * ```ts
 * const media = await downloadMedia(env.DB, 'api-id', 'media-id-xyz');
 * console.log(media.mimetype, media.base64Data.length);
 * ```
 */
export async function downloadMedia(
  db: D1Database,
  whatsappApiId: string,
  mediaId: string,
  kv?: KVNamespace
): Promise<MediaDownloadResult> {
  const api = await getAPIConfig(db, whatsappApiId, kv);
  const provider = detectProvider(api.base_url);

  console.log(`[WhatsApp] Baixando mídia ${mediaId} via ${api.name} (${provider})`);

  switch (provider) {
    case 'uazapi':
      return uazapi.downloadMedia(api, mediaId);

    case 'evolution':
    case 'generic':
    default: {
      // Evolution API v2 — download via endpoint de mídia
      const base = cleanBaseUrl(api.base_url);
      const instance = extractEvolutionInstance(api.base_url);
      const url = `${base}/chat/getBase64FromMediaMessage/${instance}`;

      const resp = await makeRequest(url, 'POST', { apikey: api.api_key }, {
        message: { key: { id: mediaId } },
        convertToMp4: false,
      });

      const data: any = await resp.json();

      return {
        base64Data: data.base64Data ?? data.base64 ?? data.data ?? '',
        mimetype: data.mimetype ?? data.mimeType ?? 'application/octet-stream',
      };
    }
  }
}

/**
 * Deleta/revoga uma mensagem enviada no WhatsApp.
 * Suporta Evolution API v2 e UAZAPI.
 *
 * @param db - Instância do banco D1
 * @param whatsappApiId - ID da API WhatsApp cadastrada
 * @param phone - Número do destinatário
 * @param messageId - ID único da mensagem do WhatsApp a ser deletada
 * @param kv - Namespace KV
 * @returns boolean indicando se a revogação foi bem sucedida na API do WhatsApp
 */
export async function deleteWhatsAppMessage(
  db: D1Database,
  whatsappApiId: string,
  phone: string,
  messageId: string,
  kv?: KVNamespace
): Promise<boolean> {
  try {
    const api = await getAPIConfig(db, whatsappApiId, kv);
    const provider = detectProvider(api.base_url);

    console.log(`[WhatsApp] Deletando mensagem ${messageId} para o lead ${phone} via ${api.name} (${provider})`);

    const cleanPhone = phone.replace(/@.*$/, '');

    switch (provider) {
      case 'uazapi': {
        const base = cleanBaseUrl(api.base_url);
        const url = `${base}/message/delete`;

        await makeRequest(url, 'POST', { token: api.api_key }, {
          number: cleanPhone,
          messageId: messageId,
          fromMe: true,
        });
        return true;
      }

      case 'evolution':
      case 'generic':
      default: {
        const base = cleanBaseUrl(api.base_url);
        const instance = extractEvolutionInstance(api.base_url);
        const url = `${base}/chat/deleteMessageForEveryone/${instance}`;

        const remoteJid = `${cleanPhone}@s.whatsapp.net`;

        await makeRequest(url, 'DELETE', { apikey: api.api_key }, {
          remoteJid: remoteJid,
          fromMe: true,
          id: messageId,
        });
        return true;
      }
    }
  } catch (err: any) {
    console.error(`[WhatsApp] Erro ao deletar mensagem: ${err?.message ?? err}`);
    return false;
  }
}

/**
 * Busca a URL da foto de perfil de um contato via UAZAPI.
 *
 * @param db - Instância do banco D1
 * @param whatsappApiId - ID da API WhatsApp cadastrada
 * @param phone - Número do destinatário
 * @param kv - Namespace KV
 * @returns URL da foto de perfil ou null se não tiver foto/erro
 */
export async function getProfilePicture(
  db: D1Database,
  whatsappApiId: string,
  phone: string,
  kv?: KVNamespace
): Promise<string | null> {
  try {
    const api = await getAPIConfig(db, whatsappApiId, kv);
    const provider = detectProvider(api.base_url);
    const cleanPhone = phone.replace(/@.*$/, '');

    console.log(`[WhatsApp] Buscando foto de perfil para ${cleanPhone} via ${api.name} (${provider})`);

    if (provider === 'uazapi') {
      const base = cleanBaseUrl(api.base_url);
      const url = `${base}/chat/profile-picture`;

      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': api.api_key,
          },
          body: JSON.stringify({ number: cleanPhone }),
        });

        if (!resp.ok) {
          const errText = await resp.text();
          console.warn(`[WhatsApp] UAZAPI retornou status ${resp.status} ao buscar foto de perfil: ${errText}`);
          return null;
        }

        const data = await resp.json() as any;
        console.log(`[WhatsApp] Foto de perfil retornada para ${cleanPhone}:`, JSON.stringify(data));
        
        return data.url || data.profilePictureUrl || data.avatar || data.data || null;
      } catch (reqErr: any) {
        console.warn(`[WhatsApp] Falha na requisição de foto de perfil para ${cleanPhone}:`, reqErr?.message ?? reqErr);
        return null;
      }
    }

    return null;
  } catch (err: any) {
    console.error(`[WhatsApp] Erro geral ao buscar foto de perfil: ${err?.message ?? err}`);
    return null;
  }
}

/**
 * Busca a última mensagem enviada no chat via UAZAPI e retorna seu status/ack.
 *
 * @param db - Instância do banco D1
 * @param whatsappApiId - ID da API WhatsApp cadastrada
 * @param phone - Número do destinatário
 * @param kv - Namespace KV
 * @returns Número do status/ack (1 = sent, 2 = delivered, 3 = read) ou null
 */
export async function getLatestMessageStatus(
  db: D1Database,
  whatsappApiId: string,
  phone: string,
  kv?: KVNamespace
): Promise<number | null> {
  try {
    const api = await getAPIConfig(db, whatsappApiId, kv);
    const provider = detectProvider(api.base_url);
    const cleanPhone = phone.replace(/@.*$/, '');

    if (provider === 'uazapi') {
      const base = cleanBaseUrl(api.base_url);
      const url = `${base}/chat/messages`;

      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': api.api_key,
          },
          body: JSON.stringify({
            number: cleanPhone,
            limit: 5,
          }),
        });

        if (!resp.ok) return null;
        const data = await resp.json() as any[];
        
        if (Array.isArray(data) && data.length > 0) {
          // Filtrar mensagens enviadas por NÓS (fromMe === true)
          const sentByMe = data.filter((msg: any) => msg.key?.fromMe === true || msg.fromMe === true);
          if (sentByMe.length > 0) {
            // A primeira é a mais recente
            const latestMsg = sentByMe[0];
            const status = latestMsg.status ?? latestMsg.ack;
            return typeof status === 'number' ? status : null;
          }
        }
      } catch (e) {
        console.warn(`[WhatsApp] Falha ao obter status da última mensagem para ${cleanPhone}:`, e);
      }
    }
    return null;
  } catch (err) {
    return null;
  }
}


// ─── Status Check ────────────────────────────────────────────────────────────

/** Resultado da checagem de status de uma API WhatsApp */
export interface WhatsAppApiStatusResult {
  id: string;
  name: string;
  connected: boolean;
  details: string;
}

/**
 * Verifica o status de conexão de uma única API WhatsApp.
 */
export async function checkSingleApiStatus(
  api: { id: string; name: string; base_url: string; api_key: string }
): Promise<WhatsAppApiStatusResult> {
  const provider = detectProvider(api.base_url);
  const base = cleanBaseUrl(api.base_url);

  try {
    let resp: Response;

    if (provider === 'uazapi') {
      // UAZAPI GO v2: GET /instance/status com header token
      resp = await fetch(`${base}/instance/status`, {
        method: 'GET',
        headers: { token: api.api_key },
      });
    } else {
      // Evolution API v2 / Generic
      const instance = base.split('/').filter(Boolean).pop() || 'default';
      const apiBase = base.substring(0, base.lastIndexOf('/'));
      resp = await fetch(`${apiBase}/instance/connectionState/${instance}`, {
        method: 'GET',
        headers: { apikey: api.api_key },
      });
    }

    if (!resp.ok) {
      return { id: api.id, name: api.name, connected: false, details: `HTTP ${resp.status}` };
    }

    const data = await resp.json() as any;

    // Helper: garantir que o detalhe é sempre uma string (nunca um objeto)
    const safeDetail = (val: any): string => {
      if (val == null) return '';
      if (typeof val === 'string') return val;
      if (typeof val === 'number' || typeof val === 'boolean') return String(val);
      return JSON.stringify(val).substring(0, 100);
    };

    if (provider === 'uazapi') {
      // UAZAPI GO v2 pode retornar vários formatos:
      //   { connected: true, jid: "..." }
      //   { status: "connected" }
      //   { status: { connected: true, jid: "..." } }  ← formato real observado
      //   { state: "connected" }

      // Checar connected em todos os níveis possíveis
      const isConnected = data.connected === true ||
                          data.status?.connected === true ||
                          data.state?.connected === true ||
                          (typeof data.status === 'string' && data.status.toLowerCase() === 'connected') ||
                          (typeof data.state === 'string' && data.state.toLowerCase() === 'connected');

      let detailText: string;
      if (isConnected) {
        detailText = 'Conectado';
      } else {
        // Extrair detalhe legível
        if (typeof data.status === 'string') {
          detailText = data.status;
        } else if (typeof data.state === 'string') {
          detailText = data.state;
        } else if (typeof data.message === 'string') {
          detailText = data.message;
        } else {
          detailText = 'Desconectado';
        }
      }

      return {
        id: api.id,
        name: api.name,
        connected: isConnected,
        details: detailText,
      };
    } else {
      // Evolution: { instance: { state: 'open' | 'close' } }
      const state = safeDetail(data.instance?.state || data.state);
      const isConnected = state === 'open' || state === 'connected';
      return {
        id: api.id,
        name: api.name,
        connected: isConnected,
        details: isConnected ? 'Conectado' : (state || 'Desconectado'),
      };
    }
  } catch (err: any) {
    return {
      id: api.id,
      name: api.name,
      connected: false,
      details: `Erro: ${err?.message || 'timeout'}`,
    };
  }
}

/**
 * Verifica o status de todas as APIs WhatsApp cadastradas.
 */
export async function checkAllApisStatus(
  db: D1Database
): Promise<WhatsAppApiStatusResult[]> {
  const apis = await db.prepare('SELECT id, name, base_url, api_key FROM whatsapp_apis').all<{
    id: string; name: string; base_url: string; api_key: string;
  }>();

  if (!apis.results || apis.results.length === 0) return [];

  const results = await Promise.all(
    apis.results.map(api => checkSingleApiStatus(api))
  );

  return results;
}
