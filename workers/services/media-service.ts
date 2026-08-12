/**
 * workers/services/media-service.ts
 *
 * Serviço de processamento de mídia:
 *  - OCR em imagens (comprovantes de pagamento, etc.)
 *  - OCR em PDFs
 *  - Transcrição de áudio para texto
 *
 * Utiliza a API do Google Gemini para todas as operações.
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

/** Opções para OCR de imagem */
export interface OCRImageOptions {
  /** Chave da API do Google Gemini */
  apiKey: string;
  /** Imagem codificada em base64 */
  imageBase64: string;
  /** Tipo MIME da imagem (ex: image/png, image/jpeg) */
  mimeType: string;
  /** Prompt customizado para a extração. Padrão: extrair texto de comprovante PIX */
  prompt?: string;
}

/** Opções para OCR de PDF */
export interface OCRPdfOptions {
  /** Chave da API do Google Gemini */
  apiKey: string;
  /** PDF codificado em base64 */
  pdfBase64: string;
  /** Tipo MIME do PDF (normalmente application/pdf) */
  mimeType: string;
  /** Prompt customizado para a extração */
  prompt?: string;
}

/** Opções para transcrição de áudio */
export interface TranscribeAudioOptions {
  /** Chave da API do Google Gemini */
  apiKey: string;
  /** Áudio codificado em base64 */
  audioBase64: string;
  /** Tipo MIME do áudio (ex: audio/ogg, audio/mpeg, audio/wav) */
  mimeType: string;
  /** Endpoint de transcrição customizado */
  endpoint?: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Modelo padrão do Gemini para processamento de mídia */
const GEMINI_MODEL = 'gemini-2.5-flash';

/** URL base da API do Gemini */
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Prompt padrão para OCR de comprovantes e imagens de suporte */
const DEFAULT_OCR_PROMPT =
  'Você é um assistente de OCR inteligente.\n' +
  'Analise a imagem fornecida:\n\n' +
  '1. Se a imagem for um COMPROVANTE PIX/PAGAMENTO:\n' +
  'Extraia de forma estruturada: valor, data/hora, nome do pagador, nome do recebedor (que deve ser R G FEITOSA ou conter FEITOSA), banco, chave PIX, ID da transação. Indique "não identificado" para os dados ausentes. Ignore CAPTCHAs, marcas d\'água ou sobreposições de segurança.\n\n' +
  '2. Se a imagem NÃO for um comprovante de pagamento (ex: captura de tela de erro, tela de login, e-mail, configurações, ou qualquer outra imagem/documento):\n' +
  'Extraia todo o texto literal que puder ler na imagem. Adicione também uma descrição curtíssima e clara do que a imagem mostra (ex: "Print de tela com erro de login mostrando E-mail não encontrado").';

/** Prompt padrão para OCR de PDF */
const DEFAULT_PDF_PROMPT =
  'Extraia todo o texto deste documento PDF. ' +
  'Mantenha a formatação e estrutura o mais próximo possível do original.';

/** Prompt para transcrição de áudio */
const TRANSCRIPTION_PROMPT =
  'Transcreva o conteúdo deste áudio em texto. ' +
  'Retorne apenas a transcrição, sem comentários adicionais.';

// ─── Helpers internos ─────────────────────────────────────────────────────────

/**
 * Faz uma chamada ao Gemini API com conteúdo inline (imagem, PDF ou áudio).
 */
async function callGeminiInline(
  apiKey: string,
  prompt: string,
  inlineData: { mimeType: string; data: string },
  model: string = GEMINI_MODEL
): Promise<any> {
  const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${apiKey}`;
  const cleanMime = (inlineData.mimeType || '').split(';')[0].trim();

  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: cleanMime,
              data: inlineData.data,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
    },
  };

  let lastError: any = null;
  const maxAttempts = 3;
  const delayMs = 1000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        const status = resp.status;
        console.warn(`[Media] Gemini API retornou erro ${status} (tentativa ${attempt}/${maxAttempts}): ${errText}`);
        
        // Se for erro temporário de sobrecarga ou cota, tentar novamente
        if (status === 503 || status === 429 || status === 500 || status === 504) {
          lastError = new Error(`Gemini API erro ${status}: ${errText}`);
          if (attempt < maxAttempts) {
            console.log(`[Media] Aguardando ${delayMs * attempt}ms antes de tentar novamente...`);
            await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
            continue;
          }
        } else {
          // Erros de autenticação, formato ou cliente são fatais
          throw new Error(`Gemini API erro ${status}: ${errText}`);
        }
      } else {
        return resp.json();
      }
    } catch (err: any) {
      lastError = err;
      if (attempt < maxAttempts) {
        console.warn(`[Media] Falha na conexão/transmissão com Gemini (tentativa ${attempt}/${maxAttempts}): ${err?.message ?? err}`);
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        continue;
      }
    }
  }

  throw lastError || new Error(`Falha ao se conectar com a API do Gemini após ${maxAttempts} tentativas.`);
}

// ─── Funções públicas ─────────────────────────────────────────────────────────

/**
 * Realiza OCR em uma imagem usando o Google Gemini.
 * Ideal para extrair dados de comprovantes de pagamento PIX,
 * recibos, boletos e outros documentos fotográficos.
 *
 * @param opts - Opções de OCR (apiKey, imageBase64, mimeType, prompt opcional)
 * @returns Texto extraído da imagem
 *
 * @example
 * ```ts
 * const texto = await ocrImage({
 *   apiKey: 'AIzaSy...',
 *   imageBase64: 'iVBORw0KGgo...',
 *   mimeType: 'image/png',
 * });
 * console.log(texto); // "Valor: R$ 150,00 ..."
 * ```
 */
export async function ocrImage(opts: OCRImageOptions): Promise<string> {
  const { apiKey, imageBase64, mimeType, prompt } = opts;

  const finalPrompt = prompt ?? DEFAULT_OCR_PROMPT;

  console.log(`[Media] Iniciando OCR de imagem (${mimeType})...`);

  try {
    const response = await callGeminiInline(
      apiKey,
      finalPrompt,
      { mimeType, data: imageBase64 }
    );

    const text = extractTextFromResponse(response);

    if (!text) {
      throw new Error('OCR retornou texto vazio');
    }

    console.log(`[Media] ✅ OCR de imagem concluído (${text.length} caracteres)`);
    return text;
  } catch (err: any) {
    console.error(`[Media] ❌ Erro no OCR de imagem: ${err?.message ?? err}`);
    throw err;
  }
}

/**
 * Realiza OCR em um arquivo PDF usando o Google Gemini.
 * Extrai todo o texto do documento, mantendo a estrutura.
 *
 * @param opts - Opções de OCR (apiKey, pdfBase64, mimeType, prompt opcional)
 * @returns Texto extraído do PDF
 *
 * @example
 * ```ts
 * const texto = await ocrPdf({
 *   apiKey: 'AIzaSy...',
 *   pdfBase64: 'JVBERi0xLjQ...',
 *   mimeType: 'application/pdf',
 * });
 * ```
 */
export async function ocrPdf(opts: OCRPdfOptions): Promise<string> {
  const { apiKey, pdfBase64, mimeType, prompt } = opts;

  const finalPrompt = prompt ?? DEFAULT_PDF_PROMPT;

  console.log(`[Media] Iniciando OCR de PDF...`);

  try {
    const response = await callGeminiInline(
      apiKey,
      finalPrompt,
      { mimeType: mimeType || 'application/pdf', data: pdfBase64 }
    );

    const text = extractTextFromResponse(response);

    if (!text) {
      throw new Error('OCR de PDF retornou texto vazio');
    }

    console.log(`[Media] ✅ OCR de PDF concluído (${text.length} caracteres)`);
    return text;
  } catch (err: any) {
    console.error(`[Media] ❌ Erro no OCR de PDF: ${err?.message ?? err}`);
    throw err;
  }
}

/**
 * Transcreve áudio para texto usando o Google Gemini.
 * Suporta diversos formatos: OGG (WhatsApp), MP3, WAV, M4A, etc.
 *
 * @param opts - Opções de transcrição (apiKey, audioBase64, mimeType)
 * @returns Texto transcrito do áudio
 *
 * @example
 * ```ts
 * const texto = await transcribeAudio({
 *   apiKey: 'AIzaSy...',
 *   audioBase64: 'T2dnUwACAA...',
 *   mimeType: 'audio/ogg',
 * });
 * console.log(texto); // "Olá, gostaria de saber sobre..."
 * ```
 */
export async function transcribeAudio(opts: TranscribeAudioOptions): Promise<string> {
  const { apiKey, audioBase64, mimeType, endpoint } = opts;

  console.log(`[Media] Iniciando transcrição de áudio (${mimeType})...`);

  try {
    let response;
    if (endpoint) {
      const cleanMime = (mimeType || '').split(';')[0].trim();
      const url = endpoint.includes('?key=') ? endpoint : `${endpoint}?key=${apiKey}`;
      
      const body = {
        contents: [
          {
            parts: [
              { text: TRANSCRIPTION_PROMPT },
              {
                inlineData: {
                  mimeType: cleanMime,
                  data: audioBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
        },
      };

      console.log(`[Media] Enviando requisição para endpoint customizado: ${url}`);
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Endpoint customizado erro ${resp.status}: ${errText}`);
      }

      response = await resp.json();
    } else {
      response = await callGeminiInline(
        apiKey,
        TRANSCRIPTION_PROMPT,
        { mimeType, data: audioBase64 }
      );
    }

    const text = extractTextFromResponse(response);

    if (!text) {
      throw new Error('Transcrição retornou texto vazio');
    }

    console.log(`[Media] ✅ Transcrição concluída (${text.length} caracteres)`);
    return text;
  } catch (err: any) {
    console.error(`[Media] ❌ Erro na transcrição: ${err?.message ?? err}`);
    throw err;
  }
}

/**
 * Extrai texto de uma resposta de LLM, independente do formato/provedor.
 *
 * Formatos suportados:
 *  - Google Gemini: response.candidates[0].content.parts[0].text
 *  - OpenAI:        response.choices[0].message.content
 *  - Anthropic:     response.content[0].text
 *  - Genérico:      response.text, response.data.text, etc.
 *
 * @param response - Objeto de resposta bruto de qualquer LLM
 * @returns Texto extraído ou string vazia se não encontrar
 *
 * @example
 * ```ts
 * // Resposta do Gemini
 * const text = extractTextFromResponse({
 *   candidates: [{ content: { parts: [{ text: 'Olá!' }] } }]
 * });
 * // text === 'Olá!'
 *
 * // Resposta do OpenAI
 * const text2 = extractTextFromResponse({
 *   choices: [{ message: { content: 'Olá!' } }]
 * });
 * // text2 === 'Olá!'
 * ```
 */
export function extractTextFromResponse(response: any): string {
  if (!response) return '';

  // ── Formato Google Gemini ──
  // response.candidates[0].content.parts[0].text
  try {
    const candidates = response.candidates;
    if (candidates && Array.isArray(candidates) && candidates.length > 0) {
      const parts = candidates[0]?.content?.parts;
      if (parts && Array.isArray(parts)) {
        // Concatenar todos os text parts
        const texts = parts
          .filter((p: any) => p.text)
          .map((p: any) => p.text);
        if (texts.length > 0) {
          return texts.join('');
        }
      }
    }
  } catch {
    // Continuar tentando outros formatos
  }

  // ── Formato OpenAI ──
  // response.choices[0].message.content
  try {
    const choices = response.choices;
    if (choices && Array.isArray(choices) && choices.length > 0) {
      const content = choices[0]?.message?.content;
      if (typeof content === 'string') {
        return content;
      }
    }
  } catch {
    // Continuar tentando
  }

  // ── Formato Anthropic Claude ──
  // response.content[0].text
  try {
    const content = response.content;
    if (content && Array.isArray(content) && content.length > 0) {
      const textBlock = content.find((c: any) => c.type === 'text');
      if (textBlock?.text) {
        return textBlock.text;
      }
      // Se não tem type, tenta o primeiro .text
      if (content[0]?.text) {
        return content[0].text;
      }
    }
  } catch {
    // Continuar tentando
  }

  // ── Formatos genéricos ──

  // response.text
  if (typeof response.text === 'string') {
    return response.text;
  }

  // response.data.text
  if (response.data && typeof response.data.text === 'string') {
    return response.data.text;
  }

  // response.result
  if (typeof response.result === 'string') {
    return response.result;
  }

  // response.output
  if (typeof response.output === 'string') {
    return response.output;
  }

  // response.message
  if (typeof response.message === 'string') {
    return response.message;
  }

  // response.data.content
  if (response.data && typeof response.data.content === 'string') {
    return response.data.content;
  }

  // Último recurso: tentar converter para string
  console.warn('[Media] Não foi possível extrair texto da resposta. Formato desconhecido.');
  return '';
}
