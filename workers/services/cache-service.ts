/**
 * workers/services/cache-service.ts
 *
 * Edge Caching Service using Cloudflare KV.
 * Acts as an ultra-fast Redis-equivalent on the edge (sub-millisecond reads).
 * Falls back gracefully to D1 Database on cache misses or KV failures.
 */

export interface CachedAutomation {
  id: string;
  name: string;
  product_name: string | null;
  slug: string;
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
}

export interface CachedWhatsAppApi {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
}

export interface CachedLlm {
  id: string;
  name: string;
  provider: string;
  api_key: string;
  docs_url: string | null;
}

const CACHE_TTL = 86400; // 24 hours in seconds

/**
 * Helper to fetch a value from KV safely
 */
async function kvGet<T>(kv: KVNamespace | undefined, key: string): Promise<T | null> {
  if (!kv) return null;
  try {
    const data = await kv.get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch (err) {
    console.error(`[CacheService] KV get error for key ${key}:`, err);
    return null;
  }
}

/**
 * Helper to write a value to KV safely
 */
async function kvSet<T>(kv: KVNamespace | undefined, key: string, value: T): Promise<void> {
  if (!kv) return;
  try {
    await kv.put(key, JSON.stringify(value), { expirationTtl: CACHE_TTL });
  } catch (err) {
    console.error(`[CacheService] KV put error for key ${key}:`, err);
  }
}

/**
 * Helper to delete a value from KV safely
 */
async function kvDelete(kv: KVNamespace | undefined, key: string): Promise<void> {
  if (!kv) return;
  try {
    await kv.delete(key);
  } catch (err) {
    console.error(`[CacheService] KV delete error for key ${key}:`, err);
  }
}

// ─── AUTOMATION CACHE ────────────────────────────────────────────────────────

export async function getCachedAutomation(
  db: D1Database,
  kv: KVNamespace | undefined,
  slug: string
): Promise<CachedAutomation | null> {
  const cacheKey = `config:automation:slug:${slug}`;
  
  // Try KV
  const cached = await kvGet<CachedAutomation>(kv, cacheKey);
  if (cached) {
    console.log(`[CacheService] KV Cache Hit for automation slug: ${slug}`);
    return cached;
  }

  // Fallback to D1
  console.log(`[CacheService] KV Cache Miss for automation slug: ${slug}. Querying D1...`);
  const automation = await db.prepare(
    `SELECT id, name, product_name, slug, status, whatsapp_api_id, ocr_service_id, transcription_service_id, 
            whatsapp_number, pixel_id, facebook_token, waba_id, page_id, use_llm_variations, attendant_name 
     FROM automations WHERE slug = ?`
  ).bind(slug).first<CachedAutomation>();

  if (automation) {
    // Populate KV Cache
    await kvSet(kv, cacheKey, automation);
  }

  return automation;
}

export async function invalidateAutomationCache(
  kv: KVNamespace | undefined,
  slug: string,
  id?: string
): Promise<void> {
  console.log(`[CacheService] Invalidating cache for automation slug: ${slug}`);
  await kvDelete(kv, `config:automation:slug:${slug}`);
  if (id) {
    await kvDelete(kv, `config:automation:${id}:llms`);
  }
}

// ─── WHATSAPP API CACHE ──────────────────────────────────────────────────────

export async function getCachedWhatsAppApi(
  db: D1Database,
  kv: KVNamespace | undefined,
  id: string
): Promise<CachedWhatsAppApi | null> {
  const cacheKey = `config:whatsapp:${id}`;

  const cached = await kvGet<CachedWhatsAppApi>(kv, cacheKey);
  if (cached) {
    console.log(`[CacheService] KV Cache Hit for whatsapp_api: ${id}`);
    return cached;
  }

  console.log(`[CacheService] KV Cache Miss for whatsapp_api: ${id}. Querying D1...`);
  const api = await db.prepare(
    "SELECT id, name, base_url, api_key FROM whatsapp_apis WHERE id = ?"
  ).bind(id).first<CachedWhatsAppApi>();

  if (api) {
    await kvSet(kv, cacheKey, api);
  }

  return api;
}

export async function invalidateWhatsAppApiCache(
  kv: KVNamespace | undefined,
  id: string
): Promise<void> {
  console.log(`[CacheService] Invalidating cache for whatsapp_api: ${id}`);
  await kvDelete(kv, `config:whatsapp:${id}`);
}

// ─── LLM LIST CACHE ──────────────────────────────────────────────────────────

export async function getCachedLlmList(
  db: D1Database,
  kv: KVNamespace | undefined,
  automationId: string
): Promise<CachedLlm[]> {
  const cacheKey = `config:automation:${automationId}:llms`;

  const cached = await kvGet<CachedLlm[]>(kv, cacheKey);
  if (cached) {
    console.log(`[CacheService] KV Cache Hit for LLMs of automation: ${automationId}`);
    return cached;
  }

  console.log(`[CacheService] KV Cache Miss for LLMs of automation: ${automationId}. Querying D1...`);
  const { results } = await db.prepare(
    `SELECT l.id, l.name, l.provider, l.api_key, l.docs_url
     FROM automation_llms al
     JOIN llms l ON l.id = al.llm_id
     WHERE al.automation_id = ?
     ORDER BY al.priority_order ASC`
  ).bind(automationId).all<CachedLlm>();

  const llmList = results ?? [];
  
  if (llmList.length > 0) {
    await kvSet(kv, cacheKey, llmList);
  }

  return llmList;
}

export async function invalidateLlmListCache(
  kv: KVNamespace | undefined,
  automationId: string
): Promise<void> {
  console.log(`[CacheService] Invalidating LLM list cache for automation: ${automationId}`);
  await kvDelete(kv, `config:automation:${automationId}:llms`);
}

// ─── OCR API KEY CACHE ───────────────────────────────────────────────────────

export async function getCachedOcrApiKey(
  db: D1Database,
  kv: KVNamespace | undefined,
  ocrServiceId: string | null
): Promise<string> {
  const cacheKey = `config:ocr:${ocrServiceId || "default"}`;

  const cached = await kvGet<string>(kv, cacheKey);
  if (cached !== null) {
    console.log(`[CacheService] KV Cache Hit for OCR service: ${ocrServiceId || "default"}`);
    return cached;
  }

  console.log(`[CacheService] KV Cache Miss for OCR service: ${ocrServiceId || "default"}. Querying D1...`);
  let apiKey = "";

  if (!ocrServiceId) {
    // Default fallback: get any Gemini API key
    const geminiLlm = await db.prepare(
      "SELECT api_key FROM llms WHERE provider = 'google' OR name LIKE '%gemini%' LIMIT 1"
    ).first<{ api_key: string }>();
    apiKey = geminiLlm?.api_key || "";
  } else {
    const service = await db.prepare(
      "SELECT api_key FROM ocr_services WHERE id = ?"
    ).bind(ocrServiceId).first<{ api_key: string }>();
    apiKey = service?.api_key || "";
  }

  // Cache even empty string to avoid repeatedly hitting DB for unconfigured keys, with a small TTL
  await kvSet(kv, cacheKey, apiKey);

  return apiKey;
}

export async function invalidateOcrCache(
  kv: KVNamespace | undefined,
  ocrServiceId: string | null
): Promise<void> {
  console.log(`[CacheService] Invalidating OCR cache for service: ${ocrServiceId || "default"}`);
  await kvDelete(kv, `config:ocr:${ocrServiceId || "default"}`);
}

// ─── TRANSCRIPTION SERVICE API KEY CACHE ──────────────────────────────────────

export async function getCachedTranscriptionApiKey(
  db: D1Database,
  kv: KVNamespace | undefined,
  transcriptionServiceId: string | null
): Promise<string> {
  const cacheKey = `config:transcription:${transcriptionServiceId || "default"}`;

  const cached = await kvGet<string>(kv, cacheKey);
  if (cached !== null) {
    console.log(`[CacheService] KV Cache Hit for Transcription service: ${transcriptionServiceId || "default"}`);
    return cached;
  }

  console.log(`[CacheService] KV Cache Miss for Transcription service: ${transcriptionServiceId || "default"}. Querying D1...`);
  let apiKey = "";

  if (!transcriptionServiceId) {
    // Busca preferencialmente alguma chave do Gemini na tabela de LLMs como fallback geral
    const geminiLlm = await db.prepare(
      "SELECT api_key FROM llms WHERE provider = 'google' OR name LIKE '%gemini%' LIMIT 1"
    ).first<{ api_key: string }>();
    apiKey = geminiLlm?.api_key || "";
  } else {
    const service = await db.prepare(
      "SELECT api_key FROM transcription_services WHERE id = ?"
    ).bind(transcriptionServiceId).first<{ api_key: string }>();
    apiKey = service?.api_key || "";
  }

  await kvSet(kv, cacheKey, apiKey);

  return apiKey;
}

export async function invalidateTranscriptionCache(
  kv: KVNamespace | undefined,
  transcriptionServiceId: string | null
): Promise<void> {
  console.log(`[CacheService] Invalidating Transcription cache for service: ${transcriptionServiceId || "default"}`);
  await kvDelete(kv, `config:transcription:${transcriptionServiceId || "default"}`);
}

