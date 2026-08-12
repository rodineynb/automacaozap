/**
 * workers/services/llm-service.ts
 *
 * Serviço unificado de LLM com fallback automático.
 * Lê as configurações do banco D1 e tenta cada LLM em ordem de prioridade.
 *
 * Provedores suportados:
 *  - google   → Google Gemini API
 *  - deepseek → DeepSeek (compatível com OpenAI)
 *  - openai   → OpenAI API
 *  - xai      → xAI Grok (compatível com OpenAI)
 *  - openrouter → OpenRouter (compatível com OpenAI)
 *  - anthropic → Anthropic Claude
 */

import { getCachedLlmList } from "./cache-service";

/** Definição de uma ferramenta (function calling) */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

/** Resposta normalizada de qualquer LLM */
export interface LLMResponse {
  /** Texto gerado pela LLM */
  content: string;
  /** Chamadas de função solicitadas pela LLM (se houver) */
  toolCalls?: { name: string; arguments: Record<string, any> }[];
  /** Nome da LLM que efetivamente respondeu */
  llmUsed: string;
}

/** Mensagem no formato chat */
export interface ChatMessage {
  role: string;
  content: string;
}

/** Registro de LLM vindo do banco */
interface LLMRecord {
  id: string;
  name: string;
  provider: string;
  api_key: string;
  docs_url: string | null;
}

/** Opções para chamada principal de LLM */
export interface CallLLMOptions {
  db: D1Database;
  automationId: string;
  systemPrompt: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  kv?: KVNamespace;
  leadPhone?: string;
  leadName?: string;
  timeoutMs?: number;
}

/** Opções para chamada de visão/OCR via LLM */
export interface CallLLMVisionOptions {
  db: D1Database;
  automationId: string;
  prompt: string;
  imageBase64: string;
  mimeType: string;
  kv?: KVNamespace;
}

/** Opções para transcrição de áudio via LLM */
export interface CallLLMTranscriptionOptions {
  db: D1Database;
  automationId: string;
  audioBase64: string;
  mimeType: string;
  kv?: KVNamespace;
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

/**
 * Realiza um fetch com tempo limite (timeout) usando AbortController.
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs?: number): Promise<Response> {
  const actualTimeoutMs = timeoutMs ?? 20000;
  const controller = new AbortController();
  const { signal } = controller;
  
  const id = setTimeout(() => controller.abort(), actualTimeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal,
    });
    return response;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(`Tempo limite excedido (${actualTimeoutMs / 1000}s) ao acessar a API externa`);
    }
    throw error;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Busca as LLMs configuradas para uma automação, ordenadas por prioridade.
 */
async function getLLMsForAutomation(db: D1Database, automationId: string, kv?: KVNamespace): Promise<LLMRecord[]> {
  return await getCachedLlmList(db, kv, automationId);
}

/**
 * Extrai o nome do modelo Gemini a partir do campo `name` da LLM.
 * Exemplos: "gemini-2.5-flash" → "gemini-2.5-flash", "Meu Gemini Pro" → "gemini-2.5-flash-lite"
 */
function extractGeminiModel(llmName: string): string {
  const lower = llmName.toLowerCase().trim();

  // Se o nome já parece um modelo Gemini válido (contém "gemini-")
  const match = lower.match(/(gemini[\w.-]+)/);
  if (match) {
    return match[1];
  }

  // Fallback
  return 'gemini-2.5-flash-lite';
}

/**
 * Detecta o provedor normalizado a partir do campo `provider`.
 */
function normalizeProvider(provider: string): string {
  const p = provider.toLowerCase().trim();
  if (p.includes('deepseek')) return 'deepseek';
  if (p.includes('google') || p.includes('gemini')) return 'google';
  if (p.includes('openai') || p.includes('chat gpt') || p.includes('chatgpt') || p.includes('gpt')) return 'openai';
  if (p.includes('xai') || p.includes('grok')) return 'xai';
  if (p.includes('openrouter')) return 'openrouter';
  if (p.includes('anthropic') || p.includes('claude') || p.includes('cloud')) return 'anthropic';
  return p;
}


// ─── Chamadas por provedor ────────────────────────────────────────────────────

/**
 * Chama a API do Google Gemini (generateContent).
 */
async function callGemini(
  llm: LLMRecord,
  systemPrompt: string,
  messages: ChatMessage[],
  tools?: ToolDefinition[],
  timeoutMs?: number
): Promise<LLMResponse> {
  const model = extractGeminiModel(llm.name);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${llm.api_key}`;

  // Montar contents no formato Gemini
  const contents: any[] = [];

  // System instruction via systemInstruction (Gemini suporta)
  // Montar mensagens do histórico
  for (const msg of messages) {
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    });
  }

  const body: any = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents,
  };

  // Function calling no formato Gemini
  if (tools && tools.length > 0) {
    body.tools = [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      },
    ];
  }

  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, timeoutMs);

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini API erro ${resp.status}: ${errText}`);
  }

  const data: any = await resp.json();

  // Extrair conteúdo
  const candidate = data.candidates?.[0];
  if (!candidate?.content?.parts?.length) {
    throw new Error('Gemini retornou resposta vazia');
  }

  let content = '';
  const toolCalls: { name: string; arguments: Record<string, any> }[] = [];

  for (const part of candidate.content.parts) {
    if (part.text) {
      content += part.text;
    }
    if (part.functionCall) {
      toolCalls.push({
        name: part.functionCall.name,
        arguments: part.functionCall.args ?? {},
      });
    }
  }

  return {
    content,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    llmUsed: llm.name,
  };
}

/**
 * Chama uma API compatível com OpenAI (OpenAI, DeepSeek, xAI, OpenRouter).
 */
async function callOpenAICompatible(
  llm: LLMRecord,
  baseUrl: string,
  systemPrompt: string,
  messages: ChatMessage[],
  tools?: ToolDefinition[],
  extraHeaders?: Record<string, string>,
  timeoutMs?: number
): Promise<LLMResponse> {
  const url = `${baseUrl}/chat/completions`;

  // Montar mensagens no formato OpenAI
  const openaiMessages: any[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  ];

  const provider = normalizeProvider(llm.provider);
  let model = llm.name.trim();
  if (provider === 'deepseek') {
    if (model.toLowerCase() === 'deepseek' || model === '') {
      model = 'deepseek-chat';
    }
  }

  const body: any = {
    model,
    messages: openaiMessages,
  };


  // Function calling no formato OpenAI
  if (tools && tools.length > 0) {
    body.tools = tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
    body.tool_choice = 'auto';
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${llm.api_key}`,
    ...extraHeaders,
  };

  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }, timeoutMs);

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI-compat API erro ${resp.status}: ${errText}`);
  }

  const data: any = await resp.json();

  const choice = data.choices?.[0];
  if (!choice?.message) {
    throw new Error('OpenAI-compat retornou resposta vazia');
  }

  const content = choice.message.content ?? '';
  const toolCalls: { name: string; arguments: Record<string, any> }[] = [];

  // Tool calls no formato OpenAI
  if (choice.message.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      if (tc.type === 'function') {
        toolCalls.push({
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments || '{}'),
        });
      }
    }
  }

  return {
    content,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    llmUsed: llm.name,
  };
}

/**
 * Chama a API do Anthropic Claude.
 */
async function callAnthropic(
  llm: LLMRecord,
  systemPrompt: string,
  messages: ChatMessage[],
  tools?: ToolDefinition[],
  timeoutMs?: number
): Promise<LLMResponse> {
  const url = 'https://api.anthropic.com/v1/messages';

  // Montar mensagens no formato Anthropic
  const anthropicMessages = messages.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));

  const body: any = {
    model: llm.name,
    max_tokens: 4096,
    system: systemPrompt,
    messages: anthropicMessages,
  };

  // Function calling no formato Anthropic (tools)
  if (tools && tools.length > 0) {
    body.tools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': llm.api_key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  }, timeoutMs);

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Anthropic API erro ${resp.status}: ${errText}`);
  }

  const data: any = await resp.json();

  if (!data.content?.length) {
    throw new Error('Anthropic retornou resposta vazia');
  }

  let content = '';
  const toolCalls: { name: string; arguments: Record<string, any> }[] = [];

  for (const block of data.content) {
    if (block.type === 'text') {
      content += block.text;
    }
    if (block.type === 'tool_use') {
      toolCalls.push({
        name: block.name,
        arguments: block.input ?? {},
      });
    }
  }

  return {
    content,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    llmUsed: llm.name,
  };
}

/**
 * Roteia a chamada para o provedor correto.
 */
async function callSingleLLM(
  llm: LLMRecord,
  systemPrompt: string,
  messages: ChatMessage[],
  tools?: ToolDefinition[],
  timeoutMs?: number
): Promise<LLMResponse> {
  const provider = normalizeProvider(llm.provider);

  switch (provider) {
    case 'google':
      return callGemini(llm, systemPrompt, messages, tools, timeoutMs);

    case 'openai':
      return callOpenAICompatible(
        llm,
        'https://api.openai.com/v1',
        systemPrompt,
        messages,
        tools,
        undefined,
        timeoutMs
      );

    case 'deepseek':
      return callOpenAICompatible(
        llm,
        'https://api.deepseek.com/v1',
        systemPrompt,
        messages,
        tools,
        undefined,
        timeoutMs
      );

    case 'xai':
      return callOpenAICompatible(
        llm,
        'https://api.x.ai/v1',
        systemPrompt,
        messages,
        tools,
        undefined,
        timeoutMs
      );

    case 'openrouter':
      return callOpenAICompatible(
        llm,
        'https://openrouter.ai/api/v1',
        systemPrompt,
        messages,
        tools,
        { 'HTTP-Referer': 'https://automacaozap.com' },
        timeoutMs
      );

    case 'anthropic':
      return callAnthropic(llm, systemPrompt, messages, tools, timeoutMs);

    default:
      throw new Error(`Provedor de LLM desconhecido: ${llm.provider}`);
  }
}

// ─── Funções públicas ─────────────────────────────────────────────────────────

/**
 * Chama uma LLM com fallback automático por ordem de prioridade.
 *
 * 1. Busca as LLMs da automação ordenadas por prioridade
 * 2. Tenta a primeira; se falhar, tenta a próxima
 * 3. Retorna a resposta da primeira que funcionar
 *
 * @param opts - Opções da chamada (db, automationId, systemPrompt, messages, tools)
 * @returns Resposta normalizada da LLM, incluindo qual LLM foi usada
 * @throws Error se nenhuma LLM conseguir responder
 *
 * @example
 * ```ts
 * const resp = await callLLM({
 *   db: env.DB,
 *   automationId: 'abc-123',
 *   systemPrompt: 'Você é um assistente de vendas.',
 *   messages: [{ role: 'user', content: 'Olá!' }],
 * });
 * console.log(resp.content, resp.llmUsed);
 * ```
 */
export async function callLLM(opts: CallLLMOptions): Promise<LLMResponse> {
  const { db, automationId, systemPrompt, messages, tools, kv, leadPhone, leadName, timeoutMs } = opts;

  const llms = await getLLMsForAutomation(db, automationId, kv);

  if (llms.length === 0) {
    throw new Error(`Nenhuma LLM configurada para a automação ${automationId}`);
  }

  const errors: string[] = [];
  const actualTimeout = timeoutMs ?? 8000; // 8 seconds per attempt by default

  for (let i = 0; i < llms.length; i++) {
    const llm = llms[i];
    let success = false;
    let response: LLMResponse | null = null;
    let lastError: any = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[LLM] Tentando ${llm.name} (${llm.provider}) - Tentativa ${attempt}/2 (timeout: ${actualTimeout}ms)...`);
        response = await callSingleLLM(llm, systemPrompt, messages, tools, actualTimeout);

        // Verificar se a resposta não está vazia
        if (!response.content && (!response.toolCalls || response.toolCalls.length === 0)) {
          throw new Error('Resposta vazia da LLM');
        }

        console.log(`[LLM] ✅ Sucesso com ${llm.name} na tentativa ${attempt}`);
        success = true;
        break;
      } catch (err: any) {
        lastError = err;
        const msg = err?.message ?? String(err);
        console.warn(`[LLM] ⚠️ Falha na tentativa ${attempt}/2 com ${llm.name}: ${msg}`);

        if (attempt < 2) {
          // Pequena pausa de 500ms antes de tentar o mesmo modelo novamente
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }

    if (success && response) {
      return response;
    }

    // Se as duas tentativas falharem, registrar o fallback para a próxima LLM
    const msg = lastError?.message ?? String(lastError);
    console.error(`[LLM] ❌ Todas as tentativas falharam para ${llm.name}: ${msg}`);
    errors.push(`${llm.name}: ${msg}`);

    // Registrar o fallback de LLM se houver outra para tentar
    if (llms.length > 1 && i < llms.length - 1) {
      try {
        const nextLlm = llms[i + 1];
        const auto = await db.prepare("SELECT product_name FROM automations WHERE id = ?").bind(automationId).first<{ product_name: string | null }>();
        
        await db.prepare(`
          INSERT INTO fallback_logs (automation_id, lead_phone, lead_name, product_name, fallback_type, details)
          VALUES (?, ?, ?, ?, 'llm', ?)
        `).bind(
          automationId,
          leadPhone || 'unknown',
          leadName || 'unknown',
          auto?.product_name || 'Desconhecido',
          `Falhou após 2 tentativas: ${llm.name} (${llm.provider}) - Erro: ${msg.substring(0, 150)}. Assumindo: ${nextLlm.name} (${nextLlm.provider})`
        ).run();
        console.log(`[LLM Fallback Log] Gravado com sucesso.`);
      } catch (logErr) {
        console.error(`[LLM Fallback Log] Erro ao gravar no banco:`, logErr);
      }
    }
  }

  throw new Error(
    `Todas as LLMs falharam para automação ${automationId}. Erros: ${errors.join(' | ')}`
  );
}

/**
 * Chama uma LLM para análise de imagem (visão/OCR).
 * Usa preferencialmente Google Gemini (melhor para visão).
 *
 * @param opts - Opções com db, automationId, prompt, imageBase64, mimeType
 * @returns Texto extraído/analisado da imagem
 *
 * @example
 * ```ts
 * const texto = await callLLMVision({
 *   db: env.DB,
 *   automationId: 'abc-123',
 *   prompt: 'Extraia os dados do comprovante PIX.',
 *   imageBase64: 'iVBORw0KGgo...',
 *   mimeType: 'image/png',
 * });
 * ```
 */
export async function callLLMVision(opts: CallLLMVisionOptions): Promise<string> {
  const { db, automationId, prompt, imageBase64, mimeType, kv } = opts;

  const llms = await getLLMsForAutomation(db, automationId, kv);

  // Buscar uma LLM Google Gemini primeiro (melhor para visão)
  let geminiLLM = llms.find(
    (l) => normalizeProvider(l.provider) === 'google' || l.name.toLowerCase().includes('gemini')
  );

  // Se não tem Gemini configurado, tenta qualquer uma que seja Google
  if (!geminiLLM) {
    // Buscar diretamente qualquer LLM Google no banco
    const { results } = await db
      .prepare(`SELECT id, name, provider, api_key, docs_url FROM llms WHERE provider = 'google' LIMIT 1`)
      .all<LLMRecord>();

    if (results && results.length > 0) {
      geminiLLM = results[0];
    }
  }

  if (!geminiLLM) {
    throw new Error('Nenhuma LLM Google Gemini encontrada para análise de imagem');
  }

  const model = extractGeminiModel(geminiLLM.name);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiLLM.api_key}`;

  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: imageBase64,
            },
          },
        ],
      },
    ],
  };

  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini Vision API erro ${resp.status}: ${errText}`);
  }

  const data: any = await resp.json();

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini Vision retornou resposta vazia');
  }

  console.log(`[LLM Vision] ✅ Análise concluída com ${geminiLLM.name}`);
  return text;
}

/**
 * Chama uma LLM para transcrição de áudio.
 * Usa Google Gemini com inlineData para processar o áudio.
 *
 * @param opts - Opções com db, automationId, audioBase64, mimeType
 * @returns Texto transcrito do áudio
 *
 * @example
 * ```ts
 * const texto = await callLLMTranscription({
 *   db: env.DB,
 *   automationId: 'abc-123',
 *   audioBase64: 'UklGR...',
 *   mimeType: 'audio/ogg',
 * });
 * ```
 */
export async function callLLMTranscription(opts: CallLLMTranscriptionOptions): Promise<string> {
  const { db, automationId, audioBase64, mimeType, kv } = opts;

  const llms = await getLLMsForAutomation(db, automationId, kv);

  // Buscar uma LLM Google Gemini (necessário para transcrição com inlineData)
  let geminiLLM = llms.find(
    (l) => normalizeProvider(l.provider) === 'google' || l.name.toLowerCase().includes('gemini')
  );

  if (!geminiLLM) {
    const { results } = await db
      .prepare(`SELECT id, name, provider, api_key, docs_url FROM llms WHERE provider = 'google' LIMIT 1`)
      .all<LLMRecord>();

    if (results && results.length > 0) {
      geminiLLM = results[0];
    }
  }

  if (!geminiLLM) {
    throw new Error('Nenhuma LLM Google Gemini encontrada para transcrição de áudio');
  }

  const model = extractGeminiModel(geminiLLM.name);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiLLM.api_key}`;

  const body = {
    contents: [
      {
        parts: [
          {
            text: 'Transcreva o conteúdo deste áudio em texto. Retorne apenas a transcrição, sem comentários adicionais.',
          },
          {
            inlineData: {
              mimeType,
              data: audioBase64,
            },
          },
        ],
      },
    ],
  };

  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini Audio API erro ${resp.status}: ${errText}`);
  }

  const data: any = await resp.json();

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini Audio retornou resposta vazia');
  }

  console.log(`[LLM Transcription] ✅ Transcrição concluída com ${geminiLLM.name}`);
  return text;
}

/**
 * Reescreve uma mensagem base usando LLM com fallback automático.
 * Mantém links, variáveis (como {{nome}}, {{primeiro_nome}}, {{produto}}) e sentido semântico intactos.
 */
export async function rewriteMessageViaLLM(
  db: D1Database,
  automationId: string,
  baseMessage: string,
  count = 1,
  leadPhone?: string,
  leadName?: string,
  stageKey?: string
): Promise<string[]> {
  const systemPrompt = `Você é um redator de marketing altamente experiente. Sua tarefa é criar variações alternativas de uma mensagem de WhatsApp mantendo exatamente o mesmo objetivo, tom de voz, links e variáveis dinâmicas como {{nome}}, {{primeiro_nome}} e {{produto}}.
Retorne exatamente ${count} variações, uma em cada linha, no formato de JSON array de strings.
Exemplo de retorno esperado:
["variação 1", "variação 2", "variação 3"]

Não adicione explicações, comentários ou formatação Markdown (como \`\`\`json). Retorne APENAS o JSON de array de strings puro e válido.`;

  const userPrompt = `Mensagem Base:\n"""\n${baseMessage}\n"""`;

  try {
    const response = await callLLM({
      db,
      automationId,
      systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      timeoutMs: 8000,
      leadPhone,
      leadName
    });

    const content = response.content.trim();
    const startIndex = content.indexOf('[');
    const endIndex = content.lastIndexOf(']');
    if (startIndex !== -1 && endIndex !== -1) {
      const jsonStr = content.substring(startIndex, endIndex + 1);
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        return parsed.map(s => s.trim());
      }
    }
    
    // Se o parse falhar, quebrar por quebra de linha se parecer uma lista
    if (content.includes('\n')) {
      const lines = content.split('\n').map(l => l.replace(/^[-*0-9.\s"']+|["'\s,]+$/g, '').trim()).filter(Boolean);
      if (lines.length > 0) {
        return lines.slice(0, count);
      }
    }
    
    return [baseMessage];
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error("[LLM Rewrite] Erro ao reescrever mensagem:", err);
    try {
      const auto = await db.prepare("SELECT product_name FROM automations WHERE id = ?").bind(automationId).first<{ product_name: string | null }>();
      await db.prepare(`
        INSERT INTO fallback_logs (automation_id, lead_phone, lead_name, product_name, fallback_type, details)
        VALUES (?, ?, ?, ?, 'funnel_rewrite', ?)
      `).bind(
        automationId,
        leadPhone || 'unknown',
        leadName || 'unknown',
        auto?.product_name || 'Desconhecido',
        `Falha na reescrita do estágio '${stageKey || 'unknown'}'. Erro: ${msg.substring(0, 200)}. Enviando mensagem padrão original.`
      ).run();
      console.log(`[LLM Rewrite Fallback Log] Gravado com sucesso.`);
    } catch (logErr) {
      console.error(`[LLM Rewrite Fallback Log] Erro ao gravar no banco:`, logErr);
    }
    return [baseMessage];
  }
}

