/**
 * Funções utilitárias para processamento de mensagens WhatsApp.
 *
 * Inclui:
 * - Particionamento de mensagens longas em pedaços naturais
 * - Cálculo de delays para simular digitação humana
 * - Formatação de telefone para padrão brasileiro
 * - Detecção e extração de conteúdo de webhooks (UAZAPI e Evolution API)
 * - Saudação baseada no horário (Bom dia / Boa tarde / Boa noite)
 * - Função sleep para delays entre envios
 *
 * @module message-utils
 */

// ============================================================================
// Tipos
// ============================================================================

/** Tipo de mensagem recebida via webhook */
export type MessageType =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'unknown';

/** Conteúdo extraído de uma mensagem de webhook */
export interface ExtractedMessage {
  /** ID único da mensagem gerado pelo WhatsApp */
  id?: string;
  /** Número de telefone do remetente (somente dígitos) */
  phone: string;
  /** Nome do remetente (pushName) */
  senderName: string;
  /** Tipo da mensagem (text, image, audio, etc.) */
  messageType: MessageType;
  /** Conteúdo textual da mensagem (ou string vazia para mídia sem caption) */
  textContent: string;
  /** ID da mídia (quando aplicável) */
  mediaId?: string;
  /** Tipo MIME da mídia (quando aplicável) */
  mimeType?: string;
  /** Legenda da mídia (quando aplicável) */
  caption?: string;
  /** Se a mensagem foi enviada por nós (não pelo cliente) */
  isFromMe?: boolean;
}

// ============================================================================
// Particionamento de Mensagens
// ============================================================================

/** Padrão para quebra de sentença: pontos finais, exclamação, interrogação, quebras de linha */
const SENTENCE_BOUNDARY_REGEX = /(?<=[.!?\n])\s+/;

/**
 * Divide uma mensagem longa em partes de no máximo ~maxLength caracteres,
 * quebrando em limites de sentença (pontos, exclamações, interrogações, etc.).
 *
 * Isso simula o comportamento natural de digitação, enviando mensagens
 * em pedaços menores como uma pessoa faria.
 *
 * Regras de quebra (em ordem de prioridade):
 * 1. Quebra de linha (`\n`)
 * 2. Final de sentença (`. `, `! `, `? `)
 * 3. Limite de palavra (espaço) — se a sentença for maior que maxLength
 * 4. Nunca quebra no meio de uma palavra
 *
 * @param text - Texto completo a ser dividido
 * @param maxLength - Tamanho máximo de cada parte (padrão: 500)
 * @returns Array de strings, cada uma com no máximo maxLength caracteres
 *
 * @example
 * ```typescript
 * const parts = partitionMessage("Olá! Como vai? Tudo bem com você?");
 * // => ["Olá! Como vai?", "Tudo bem com você?"]
 *
 * const parts2 = partitionMessage(longText, 300);
 * // Cada parte terá no máximo ~300 caracteres
 * ```
 */
export function partitionMessage(text: string, maxLength: number = 500): string[] {
  // Texto curto — retorna direto
  if (!text || text.trim().length === 0) {
    return [];
  }

  const trimmed = text.trim();

  if (trimmed.length <= maxLength) {
    return [trimmed];
  }

  const parts: string[] = [];

  // Primeiro, dividir por sentenças
  const sentences = splitIntoSentences(trimmed);

  let currentPart = '';

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();

    if (trimmedSentence.length === 0) {
      continue;
    }

    // Se a sentença sozinha é maior que maxLength, dividir por palavras
    if (trimmedSentence.length > maxLength) {
      // Salvar parte acumulada antes
      if (currentPart.trim().length > 0) {
        parts.push(currentPart.trim());
        currentPart = '';
      }

      // Dividir sentença longa por palavras
      const wordParts = splitByWords(trimmedSentence, maxLength);
      parts.push(...wordParts);
      continue;
    }

    // Verificar se adicionar esta sentença excede o limite
    const separator = currentPart.length > 0 ? ' ' : '';
    const combined = currentPart + separator + trimmedSentence;

    if (combined.length <= maxLength) {
      currentPart = combined;
    } else {
      // Salvar parte atual e começar nova com esta sentença
      if (currentPart.trim().length > 0) {
        parts.push(currentPart.trim());
      }
      currentPart = trimmedSentence;
    }
  }

  // Não esquecer a última parte
  if (currentPart.trim().length > 0) {
    parts.push(currentPart.trim());
  }

  return parts;
}

/**
 * Divide texto em sentenças usando limites naturais.
 * Preserva o conteúdo original (não remove pontuação).
 */
function splitIntoSentences(text: string): string[] {
  // Primeiro dividir por quebras de linha
  const lineChunks = text.split('\n');
  const sentences: string[] = [];

  for (const chunk of lineChunks) {
    if (chunk.trim().length === 0) {
      continue;
    }

    // Dentro de cada linha, dividir por finais de sentença
    // Usa lookbehind para manter a pontuação com a sentença
    const subSentences = chunk.split(SENTENCE_BOUNDARY_REGEX);

    for (const sub of subSentences) {
      if (sub.trim().length > 0) {
        sentences.push(sub.trim());
      }
    }
  }

  return sentences;
}

/**
 * Divide um texto longo em partes quebrando em limites de palavra.
 * Nunca quebra no meio de uma palavra.
 */
function splitByWords(text: string, maxLength: number): string[] {
  const words = text.split(/\s+/);
  const parts: string[] = [];
  let currentPart = '';

  for (const word of words) {
    if (word.length === 0) {
      continue;
    }

    // Se uma única palavra é maior que maxLength, forçar inclusão
    // (melhor do que perder conteúdo)
    if (word.length > maxLength) {
      if (currentPart.trim().length > 0) {
        parts.push(currentPart.trim());
        currentPart = '';
      }
      parts.push(word);
      continue;
    }

    const separator = currentPart.length > 0 ? ' ' : '';
    const combined = currentPart + separator + word;

    if (combined.length <= maxLength) {
      currentPart = combined;
    } else {
      if (currentPart.trim().length > 0) {
        parts.push(currentPart.trim());
      }
      currentPart = word;
    }
  }

  if (currentPart.trim().length > 0) {
    parts.push(currentPart.trim());
  }

  return parts;
}

// ============================================================================
// Delays e Simulação de Digitação
// ============================================================================

/**
 * Calcula um delay aleatório entre min e max milissegundos.
 *
 * Usado para simular velocidade natural de digitação entre partes
 * de uma mensagem, tornando o bot mais humano.
 *
 * @param minMs - Delay mínimo em milissegundos (padrão: 1000 = 1s)
 * @param maxMs - Delay máximo em milissegundos (padrão: 3000 = 3s)
 * @returns Delay aleatório em milissegundos
 *
 * @example
 * ```typescript
 * const delay = calculateDelay(500, 2000);
 * await sleep(delay);
 * ```
 */
export function calculateDelay(minMs: number = 1000, maxMs: number = 3000): number {
  if (minMs > maxMs) {
    // Trocar valores se invertidos
    [minMs, maxMs] = [maxMs, minMs];
  }

  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

/**
 * Pausa a execução por um número de milissegundos.
 *
 * Usado para introduzir delays entre envios de partes de mensagem,
 * simulando o tempo de digitação humana.
 *
 * @param ms - Duração do sleep em milissegundos
 * @returns Promise que resolve após o tempo especificado
 *
 * @example
 * ```typescript
 * // Esperar 2 segundos entre envios
 * await sleep(2000);
 * ```
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Formatação de Telefone
// ============================================================================

/**
 * Formata um número de telefone para o padrão utilizado pelas APIs WhatsApp.
 *
 * Remove espaços, traços, parênteses e outros caracteres não numéricos.
 * Garante que o número comece com o código do país (padrão: 55 para Brasil).
 *
 * @param phone - Número de telefone em qualquer formato
 * @returns Número formatado contendo apenas dígitos com código do país
 *
 * @example
 * ```typescript
 * formatPhone('(61) 99999-9999')   // => '5561999999999'
 * formatPhone('+55 61 99999-9999') // => '5561999999999'
 * formatPhone('5561999999999')     // => '5561999999999'
 * formatPhone('61999999999')       // => '5561999999999'
 * formatPhone('5561999999999@s.whatsapp.net') // => '5561999999999'
 * ```
 */
export function formatPhone(phone: string): string {
  if (!phone) return '';

  // Remover sufixo do WhatsApp (ex: @s.whatsapp.net, @c.us)
  let cleaned = phone.split('@')[0];

  // Remover todos os caracteres não numéricos
  cleaned = cleaned.replace(/\D/g, '');

  // Se vazio após limpeza, retornar vazio
  if (cleaned.length === 0) return '';

  // Remover o '+' inicial que já foi limpo, mas garantir código do país
  // Números brasileiros: 55 + DDD(2) + número(8-9) = 12-13 dígitos
  // Se não começa com 55 e tem entre 10-11 dígitos, adicionar 55
  if (!cleaned.startsWith('55') && cleaned.length >= 10 && cleaned.length <= 11) {
    cleaned = '55' + cleaned;
  }

  return cleaned;
}

// ============================================================================
// Detecção de Tipo de Mensagem
// ============================================================================

/**
 * Detecta o tipo de uma mensagem recebida via webhook.
 *
 * Suporta os formatos de payload da UAZAPI e Evolution API.
 *
 * @param body - Corpo do webhook (JSON parseado)
 * @returns Tipo da mensagem: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'unknown'
 *
 * @example
 * ```typescript
 * const type = detectMessageType(webhookBody);
 * if (type === 'image') {
 *   // Processar imagem (possível comprovante)
 * }
 * ```
 */
export function detectMessageType(body: any): MessageType {
  if (!body) return 'unknown';

  // 1. Tentar inferir por presença de mídias/mimetypes/captions primeiro (mais específico)
  const msg = body.message || body.data?.message || {};
  const mime = (body.message?.mimetype || body.message?.mimeType || msg.imageMessage?.mimetype || msg.audioMessage?.mimetype || msg.videoMessage?.mimetype || msg.documentMessage?.mimetype || msg.documentWithCaptionMessage?.message?.documentMessage?.mimetype || '') .toLowerCase();
  const lowerMediaType = (body.message?.mediaType || msg.mediaType || '').toLowerCase();

  if (mime.includes('image') || msg.imageMessage || lowerMediaType === 'image') return 'image';
  if (mime.includes('video') || msg.videoMessage || lowerMediaType === 'video') return 'video';
  if (mime.includes('audio') || mime.includes('ptt') || msg.audioMessage || lowerMediaType === 'audio' || lowerMediaType === 'ptt') return 'audio';
  if (mime.includes('pdf') || mime.includes('document') || msg.documentMessage || msg.documentWithCaptionMessage || lowerMediaType === 'document') return 'document';
  if (mime.includes('webp') || msg.stickerMessage || lowerMediaType === 'sticker') return 'sticker';

  // =========================================
  // Formato UAZAPI
  // =========================================
  if (body.message?.messageType) {
    const type = body.message.messageType.toLowerCase();
    const mapped = mapToMessageType(type);
    if (mapped !== 'unknown') return mapped;
  }

  if (body.message?.type) {
    const type = body.message.type.toLowerCase();
    const mapped = mapToMessageType(type);
    if (mapped !== 'unknown') return mapped;
  }

  // =========================================
  // Formato Evolution API
  // =========================================
  if (body.data?.messageType) {
    const type = body.data.messageType.toLowerCase().replace('message', '');
    const mapped = mapToMessageType(type);
    if (mapped !== 'unknown') return mapped;
  }

  // Inferir do objeto message do Evolution API
  if (body.data?.message) {
    if (msg.conversation || msg.extendedTextMessage) return 'text';
    if (msg.imageMessage) return 'image';
    if (msg.audioMessage) return 'audio';
    if (msg.videoMessage) return 'video';
    if (msg.documentMessage || msg.documentWithCaptionMessage) return 'document';
    if (msg.stickerMessage) return 'sticker';
  }

  return 'unknown';
}

/**
 * Mapeia string de tipo para o enum MessageType.
 */
function mapToMessageType(type: string): MessageType {
  const lower = (type || '').toLowerCase();
  
  if (lower.includes('image')) return 'image';
  if (lower.includes('video')) return 'video';
  if (lower.includes('audio') || lower.includes('ptt')) return 'audio';
  if (lower.includes('document')) return 'document';
  if (lower.includes('sticker')) return 'sticker';

  if (lower === 'chat' || lower === 'conversation' || lower === 'text' || lower === 'extendedtextmessage') {
    return 'text';
  }

  return 'unknown';
}

// ============================================================================
// Extração de Conteúdo de Mensagem
// ============================================================================

/**
 * Extrai o conteúdo de uma mensagem a partir de diferentes formatos
 * de webhook de APIs WhatsApp.
 *
 * Suporta os seguintes formatos:
 * - **UAZAPI**: `body.message.body` para texto, `body.message.caption` para mídia
 * - **Evolution API**: `body.data.message.conversation` para texto,
 *   `body.data.message.imageMessage.caption` para mídia
 *
 * @param body - Corpo do webhook (JSON parseado)
 * @returns Objeto com dados extraídos da mensagem
 *
 * @example
 * ```typescript
 * const content = extractMessageContent(webhookBody);
 * console.log(content.phone);       // '5561999999999'
 * console.log(content.senderName);  // 'João'
 * console.log(content.textContent); // 'Olá, preciso de ajuda'
 * ```
 */
export function extractMessageContent(body: any): ExtractedMessage {
  // Resultado padrão para payloads inválidos
  const defaultResult: ExtractedMessage = {
    id: '',
    phone: '',
    senderName: '',
    messageType: 'unknown',
    textContent: '',
    isFromMe: false,
  };

  if (!body) return defaultResult;

  // =========================================
  // Formato UAZAPI v2 (uazapiGO)
  // Keys: BaseUrl, EventType, chat, message, owner
  // =========================================
  if (body.EventType && body.chat && body.message) {
    return extractFromUazapiV2(body);
  }

  // =========================================
  // Formato UAZAPI v1 (legado)
  // =========================================
  if (body.type === 'ReceivedCallback' || (body.phone && body.message)) {
    return extractFromUazapi(body);
  }

  // =========================================
  // Formato Evolution API
  // =========================================
  if (body.data?.key?.remoteJid || body.data?.message) {
    return extractFromEvolutionApi(body);
  }

  return defaultResult;
}

/**
 * Extrai conteúdo do formato UAZAPI v2 (uazapiGO).
 *
 * Formato esperado:
 * ```json
 * {
 *   "BaseUrl": "https://api-tbz.uazapi.com",
 *   "EventType": "messages",
 *   "chat": {
 *     "phone": "+55 22 99851-3392",
 *     "name": "João",
 *     "wa_chatid": "5522998513392@s.whatsapp.net",
 *     "owner": "5522981678365"
 *   },
 *   "message": {
 *     "fromMe": false,
 *     "text": "Olá",
 *     "content": "Olá",
 *     "type": "chat",
 *     "messageType": "conversation",
 *     "senderName": "João",
 *     "wasSentByApi": false
 *   },
 *   "owner": "5522981678365"
 * }
 * ```
 */
function extractFromUazapiV2(body: any): ExtractedMessage {
  const chat = body.chat || {};
  const msg = body.message || {};

  // Extrair telefone: tentar chat.phone, ou extrair do wa_chatid
  let rawPhone = chat.phone || '';
  if (!rawPhone && chat.wa_chatid) {
    // wa_chatid format: "5522998513392@s.whatsapp.net"
    rawPhone = chat.wa_chatid.split('@')[0] || '';
  }
  const phone = formatPhone(rawPhone);

  const senderName = chat.name || chat.wa_contactName || msg.senderName || '';
  
  // Detectar tipo de mensagem
  const msgType = msg.messageType || msg.type || 'text';
  const messageType = mapUazapiV2Type(msgType, msg.mediaType, msg.mimetype || msg.mimeType);

  const result: ExtractedMessage = {
    id: msg.messageid || msg.id || '',
    phone,
    senderName,
    messageType,
    textContent: '',
    isFromMe: msg.fromMe === true,
  };

  switch (messageType) {
    case 'text':
      result.textContent = msg.text || msg.content || msg.body || '';
      break;

    case 'image':
    case 'video':
    case 'document':
      result.caption = msg.caption || msg.text || '';
      result.textContent = msg.caption || msg.text || '';
      result.mediaId = msg.messageid || msg.id || '';
      result.mimeType = msg.mimetype || msg.mimeType || '';
      break;

    case 'audio':
      result.mediaId = msg.messageid || msg.id || '';
      result.mimeType = msg.mimetype || msg.mimeType || '';
      break;

    case 'sticker':
      result.mediaId = msg.messageid || msg.id || '';
      result.mimeType = msg.mimetype || msg.mimeType || 'image/webp';
      break;

    default:
      result.textContent = msg.text || msg.content || msg.body || '';
  }

  return result;
}

/**
 * Mapeia tipos de mensagem do uazapiGO v2 para nosso tipo interno.
 */
function mapUazapiV2Type(type: string, mediaType?: string, mimeType?: string): ExtractedMessage['messageType'] {
  const lower = (type || '').toLowerCase();
  const lowerMedia = (mediaType || '').toLowerCase();
  const lowerMime = (mimeType || '').toLowerCase();
  
  // Priorizar detecção de mídia por mediaType ou mimeType
  if (lowerMedia === 'image' || lowerMime.includes('image') || lower.includes('image')) return 'image';
  if (lowerMedia === 'video' || lowerMime.includes('video') || lower.includes('video')) return 'video';
  if (lowerMedia === 'audio' || lowerMedia === 'ptt' || lowerMime.includes('audio') || lower.includes('audio') || lower.includes('ptt')) return 'audio';
  if (lowerMedia === 'document' || lowerMime.includes('pdf') || lowerMime.includes('document') || lower.includes('document')) return 'document';
  if (lowerMedia === 'sticker' || lowerMime.includes('webp') || lower.includes('sticker')) return 'sticker';
  if (lower.includes('location')) return 'location';
  if (lower.includes('contact')) return 'contact';

  // Fallback para tipos de texto
  if (lower === 'chat' || lower === 'conversation' || lower === 'text' || lower === 'extendedtextmessage') {
    return 'text';
  }

  return 'text'; // fallback: tratar como texto
}

/**
 * Extrai conteúdo do formato UAZAPI v1 (legado).
 *
 * Formato esperado:
 * ```json
 * {
 *   "type": "ReceivedCallback",
 *   "isGroup": false,
 *   "phone": "5561999999999",
 *   "name": "João",
 *   "message": {
 *     "type": "text",
 *     "body": "Olá"
 *   }
 * }
 * ```
 */
function extractFromUazapi(body: any): ExtractedMessage {
  const phone = formatPhone(body.phone || '');
  const senderName = body.name || body.senderName || '';
  const messageType = detectMessageType(body);
  const msg = body.message || {};

  const result: ExtractedMessage = {
    id: msg.id || msg.mediaId || body.messageId || '',
    phone,
    senderName,
    messageType,
    textContent: '',
    isFromMe: body.fromMe === true || body.isFromMe === true,
  };

  switch (messageType) {
    case 'text':
      result.textContent = msg.body || msg.text || msg.content || '';
      break;

    case 'image':
    case 'video':
    case 'document':
      result.caption = msg.caption || '';
      result.textContent = msg.caption || '';
      result.mediaId = msg.id || msg.mediaId || '';
      result.mimeType = msg.mimetype || msg.mimeType || '';
      break;

    case 'audio':
      result.mediaId = msg.id || msg.mediaId || '';
      result.mimeType = msg.mimetype || msg.mimeType || '';
      break;

    case 'sticker':
      result.mediaId = msg.id || msg.mediaId || '';
      result.mimeType = msg.mimetype || msg.mimeType || 'image/webp';
      break;

    default:
      result.textContent = msg.body || msg.text || '';
  }

  return result;
}

/**
 * Extrai conteúdo do formato Evolution API.
 *
 * Formato esperado:
 * ```json
 * {
 *   "data": {
 *     "key": {
 *       "remoteJid": "5561999999999@s.whatsapp.net",
 *       "fromMe": false
 *     },
 *     "pushName": "João",
 *     "message": {
 *       "conversation": "Olá"
 *     }
 *   }
 * }
 * ```
 */
function extractFromEvolutionApi(body: any): ExtractedMessage {
  const data = body.data || {};
  const key = data.key || {};
  const msg = data.message || {};

  const phone = formatPhone(key.remoteJid || '');
  const senderName = data.pushName || data.participant || '';
  const messageType = detectMessageType(body);

  const result: ExtractedMessage = {
    id: key.id || data.messageId || '',
    phone,
    senderName,
    messageType,
    textContent: '',
    isFromMe: key.fromMe === true,
  };

  switch (messageType) {
    case 'text':
      result.textContent =
        msg.conversation ||
        msg.extendedTextMessage?.text ||
        '';
      break;

    case 'image':
      result.caption = msg.imageMessage?.caption || '';
      result.textContent = msg.imageMessage?.caption || '';
      result.mimeType = msg.imageMessage?.mimetype || '';
      result.mediaId = msg.imageMessage?.id || data.mediaId || '';
      break;

    case 'audio':
      result.mimeType = msg.audioMessage?.mimetype || '';
      result.mediaId = msg.audioMessage?.id || data.mediaId || '';
      break;

    case 'video':
      result.caption = msg.videoMessage?.caption || '';
      result.textContent = msg.videoMessage?.caption || '';
      result.mimeType = msg.videoMessage?.mimetype || '';
      result.mediaId = msg.videoMessage?.id || data.mediaId || '';
      break;

    case 'document': {
      const docMsg = msg.documentMessage || msg.documentWithCaptionMessage?.message?.documentMessage;
      result.caption = docMsg?.caption || docMsg?.fileName || '';
      result.textContent = docMsg?.caption || '';
      result.mimeType = docMsg?.mimetype || '';
      result.mediaId = docMsg?.id || data.mediaId || '';
      break;
    }

    case 'sticker':
      result.mimeType = msg.stickerMessage?.mimetype || 'image/webp';
      result.mediaId = msg.stickerMessage?.id || data.mediaId || '';
      break;

    default:
      // Tentar extrair qualquer texto disponível
      result.textContent = msg.conversation || '';
  }

  return result;
}

// ============================================================================
// Saudação por Horário
// ============================================================================

/**
 * Retorna uma saudação em português baseada no horário atual.
 *
 * - 06:00 — 11:59 → "Bom dia"
 * - 12:00 — 17:59 → "Boa tarde"
 * - 18:00 — 05:59 → "Boa noite"
 *
 * Usa o fuso horário de Brasília (UTC-3).
 *
 * @returns Saudação apropriada para o horário
 *
 * @example
 * ```typescript
 * const greeting = getGreeting(); // "Boa tarde" (se for 14h em Brasília)
 * const response = `${greeting}! Como posso ajudá-lo?`;
 * ```
 */
export function getGreeting(): string {
  // Obter hora atual no fuso de Brasília (UTC-3)
  const now = new Date();
  const brasiliaTime = new Date(
    now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
  );
  const hour = brasiliaTime.getHours();

  if (hour >= 6 && hour < 12) {
    return 'Bom dia';
  }

  if (hour >= 12 && hour < 18) {
    return 'Boa tarde';
  }

  return 'Boa noite';
}

/**
 * Garante que o texto tenha parágrafos curtos para leitura amigável no WhatsApp.
 * Insere quebras de linha duplas (\n\n) a cada 1 ou 2 sentenças, evitando parágrafos longos.
 */
export function formatWhatsAppShortParagraphs(text: string): string {
  if (!text) return '';
  
  // Se for uma oferta longa especial (como a de R$14,50), ela já vem com formatação de parágrafos rica e específica.
  // Vamos preservar sua formatação original de parágrafos para não desconfigurar listas ou bullet points.
  if (text.includes('Kit Completo') && text.length > 500) {
    return text;
  }

  // Dividir o texto em linhas para processar cada bloco individualmente
  const lines = text.split('\n');
  const formattedLines: string[] = [];

  for (let line of lines) {
    line = line.trim();
    if (line.length === 0) {
      formattedLines.push('');
      continue;
    }

    // Se a linha for um item de lista (começa com bullet, número, emoji, etc.), mantemos ela intacta
    if (/^([*•\-\d]|🎨|🎥|🧁|🍫|🍰|✨|📖|🧊|🍿|🥤|🍮|🏡|🎂|💰|👍|🔥|👑|✅|❌|👉|👉🏻|👉🏼|👉🏽|👉🏾|👉🏿|👇|👇🏻|👇🏼|👇🏽|👇🏾|👇🏿|😊|😍|🤗|🗝️|Me)/.test(line)) {
      formattedLines.push(line);
      continue;
    }

    // Caso contrário, dividir a linha em sentenças
    // Padrão de divisão: ponto, exclamação ou interrogação seguido de espaço e letra maiúscula ou emoji ou número.
    // Ignora abreviações comuns (ex: R$, Sr., Dr., etc.) e decimais
    const sentences: string[] = [];
    let currentSentence = '';
    
    // Expressão regular para achar limites de sentenças sem quebrar em abreviações ou decimais
    const chars = line.split('');
    for (let i = 0; i < chars.length; i++) {
      currentSentence += chars[i];
      
      const isBoundary = 
        (chars[i] === '.' || chars[i] === '!' || chars[i] === '?') && 
        (i + 1 < chars.length && chars[i+1] === ' ') &&
        // Não é decimal (ex: 10.00)
        !(chars[i] === '.' && i > 0 && /\d/.test(chars[i-1]) && i + 2 < chars.length && /\d/.test(chars[i+2])) &&
        // Não é parte de abreviação conhecida como "R$" ou "ex."
        !(chars[i] === '.' && currentSentence.toLowerCase().endsWith('ex.')) &&
        !(chars[i] === '.' && currentSentence.toLowerCase().endsWith('sr.')) &&
        !(chars[i] === '.' && currentSentence.toLowerCase().endsWith('dr.'));

      if (isBoundary) {
        sentences.push(currentSentence.trim());
        currentSentence = '';
        i++; // pular o espaço
      }
    }
    if (currentSentence.trim().length > 0) {
      sentences.push(currentSentence.trim());
    }

    // Agrupar sentenças em parágrafos de no máximo 2 sentenças (ou no máximo 150 caracteres)
    let paragraph: string[] = [];
    let paragraphLength = 0;
    
    for (const sentence of sentences) {
      if (paragraph.length >= 2 || (paragraphLength > 0 && paragraphLength + sentence.length > 150)) {
        formattedLines.push(paragraph.join(' '));
        formattedLines.push(''); // Linha em branco
        paragraph = [sentence];
        paragraphLength = sentence.length;
      } else {
        paragraph.push(sentence);
        paragraphLength += sentence.length + 1;
      }
    }
    
    if (paragraph.length > 0) {
      formattedLines.push(paragraph.join(' '));
    }
  }

  // Juntar tudo de novo e limpar novas linhas consecutivas triplas ou mais
  let result = formattedLines.join('\n');
  
  // Substituir 3 ou mais novas linhas por apenas 2 (\n\n)
  result = result.replace(/\n{3,}/g, '\n\n');
  
  return result.trim();
}

/**
 * Retorna as partes numéricas de data/hora no fuso America/Sao_Paulo.
 */
export function getSaoPauloTime(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return {
    year: parseInt(partMap.year, 10),
    month: parseInt(partMap.month, 10),
    day: parseInt(partMap.day, 10),
    hour: parseInt(partMap.hour, 10),
    minute: parseInt(partMap.minute, 10),
    second: parseInt(partMap.second, 10)
  };
}

/**
 * Se a data cair no horário silencioso do fuso SP (00:00 - 06:59),
 * reagenda para o mesmo dia pela manhã, distribuída aleatoriamente entre 07:00 e 10:59.
 */
export function adjustScheduledTimeForSilentHours(targetDate: Date): Date {
  const spTime = getSaoPauloTime(targetDate);
  if (spTime.hour >= 0 && spTime.hour < 7) {
    // Escolhe hora aleatória entre 7 e 10 e minuto aleatório
    const randomHour = 7 + Math.floor(Math.random() * 4); // 7, 8, 9, 10
    const randomMinute = Math.floor(Math.random() * 60);
    const randomSecond = Math.floor(Math.random() * 60);

    const pad = (num: number) => String(num).padStart(2, '0');
    // Como o fuso de Brasília (SP) é fixo em -03:00 (sem horário de verão desde 2019),
    // construímos a string ISO informando o fuso diretamente.
    const spIsoString = `${spTime.year}-${pad(spTime.month)}-${pad(spTime.day)}T${pad(randomHour)}:${pad(randomMinute)}:${pad(randomSecond)}-03:00`;
    return new Date(spIsoString);
  }
  return targetDate;
}


