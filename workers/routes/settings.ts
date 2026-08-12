import { Hono } from "hono";
import type { Env } from "../app";
import {
  invalidateWhatsAppApiCache,
  invalidateLlmListCache,
  invalidateOcrCache,
  invalidateTranscriptionCache
} from "../services/cache-service";

export const settingsRoutes = new Hono<{ Bindings: Env }>();

// ============================================================
// APIs WhatsApp
// ============================================================

// GET /api/settings/whatsapp-apis
settingsRoutes.get("/whatsapp-apis", async (c) => {
  const db = c.env.DB;
  const apis = await db.prepare("SELECT * FROM whatsapp_apis ORDER BY created_at DESC").all();
  return c.json({ data: apis.results });
});

// GET /api/settings/whatsapp-status — Status de conexão das APIs WhatsApp
settingsRoutes.get("/whatsapp-status", async (c) => {
  const db = c.env.DB;
  try {
    const { checkAllApisStatus } = await import("../services/whatsapp-service");
    const statuses = await checkAllApisStatus(db);
    return c.json({ data: statuses });
  } catch (err: any) {
    console.error('[Settings] Erro ao checar status WhatsApp:', err);
    return c.json({ data: [], error: err?.message || 'Erro desconhecido' }, 500);
  }
});

// POST /api/settings/whatsapp-apis
settingsRoutes.post("/whatsapp-apis", async (c) => {
  const db = c.env.DB;
  const { name, base_url, api_key, docs_url } = await c.req.json<{
    name: string; base_url: string; api_key: string; docs_url?: string;
  }>();
  
  if (!name || !base_url || !api_key) {
    return c.json({ error: "Nome, URL base e API key são obrigatórios" }, 400);
  }
  
  const id = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO whatsapp_apis (id, name, base_url, api_key, docs_url) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, name, base_url, api_key, docs_url || null).run();
  
  const created = await db.prepare("SELECT * FROM whatsapp_apis WHERE id = ?").bind(id).first();
  return c.json({ data: created, message: "API WhatsApp cadastrada" }, 201);
});

// PUT /api/settings/whatsapp-apis/:id
settingsRoutes.put("/whatsapp-apis/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const { name, base_url, api_key, docs_url } = await c.req.json<{
    name?: string; base_url?: string; api_key?: string; docs_url?: string;
  }>();
  
  const updates: string[] = [];
  const values: (string | null)[] = [];
  
  if (name !== undefined) { updates.push("name = ?"); values.push(name); }
  if (base_url !== undefined) { updates.push("base_url = ?"); values.push(base_url); }
  if (api_key !== undefined) { updates.push("api_key = ?"); values.push(api_key); }
  if (docs_url !== undefined) { updates.push("docs_url = ?"); values.push(docs_url); }
  
  if (updates.length === 0) return c.json({ error: "Nenhum campo para atualizar" }, 400);
  
  values.push(id);
  await db.prepare(`UPDATE whatsapp_apis SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run();
  await invalidateWhatsAppApiCache(c.env.KV, id);
  
  const updated = await db.prepare("SELECT * FROM whatsapp_apis WHERE id = ?").bind(id).first();
  return c.json({ data: updated, message: "API WhatsApp atualizada" });
});

// DELETE /api/settings/whatsapp-apis/:id
settingsRoutes.delete("/whatsapp-apis/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  await db.prepare("DELETE FROM whatsapp_apis WHERE id = ?").bind(id).run();
  await invalidateWhatsAppApiCache(c.env.KV, id);
  return c.json({ message: "API WhatsApp removida" });
});

// ============================================================
// LLMs
// ============================================================

// GET /api/settings/llms
settingsRoutes.get("/llms", async (c) => {
  const db = c.env.DB;
  const llms = await db.prepare("SELECT * FROM llms ORDER BY sort_order ASC, created_at DESC").all();
  return c.json({ data: llms.results });
});

// POST /api/settings/llms
settingsRoutes.post("/llms", async (c) => {
  const db = c.env.DB;
  const { name, provider, api_key, docs_url } = await c.req.json<{
    name: string; provider: string; api_key: string; docs_url?: string;
  }>();
  
  if (!name || !provider || !api_key) {
    return c.json({ error: "Nome, provedor e API key são obrigatórios" }, 400);
  }
  
  const id = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO llms (id, name, provider, api_key, docs_url) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, name, provider, api_key, docs_url || null).run();
  
  const created = await db.prepare("SELECT * FROM llms WHERE id = ?").bind(id).first();
  return c.json({ data: created, message: "LLM cadastrada" }, 201);
});

// PUT /api/settings/llms/:id
settingsRoutes.put("/llms/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const { name, provider, api_key, docs_url } = await c.req.json<{
    name?: string; provider?: string; api_key?: string; docs_url?: string;
  }>();
  
  const updates: string[] = [];
  const values: (string | null)[] = [];
  
  if (name !== undefined) { updates.push("name = ?"); values.push(name); }
  if (provider !== undefined) { updates.push("provider = ?"); values.push(provider); }
  if (api_key !== undefined) { updates.push("api_key = ?"); values.push(api_key); }
  if (docs_url !== undefined) { updates.push("docs_url = ?"); values.push(docs_url); }
  
  if (updates.length === 0) return c.json({ error: "Nenhum campo para atualizar" }, 400);
  
  values.push(id);
  await db.prepare(`UPDATE llms SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run();
  
  const affected = await db.prepare("SELECT automation_id FROM automation_llms WHERE llm_id = ?").bind(id).all<{ automation_id: string }>();
  if (affected.results) {
    for (const row of affected.results) {
      await invalidateLlmListCache(c.env.KV, row.automation_id);
    }
  }
  
  const updated = await db.prepare("SELECT * FROM llms WHERE id = ?").bind(id).first();
  return c.json({ data: updated, message: "LLM atualizada" });
});

// DELETE /api/settings/llms/:id
settingsRoutes.delete("/llms/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  
  const affected = await db.prepare("SELECT automation_id FROM automation_llms WHERE llm_id = ?").bind(id).all<{ automation_id: string }>();
  await db.prepare("DELETE FROM llms WHERE id = ?").bind(id).run();
  
  if (affected.results) {
    for (const row of affected.results) {
      await invalidateLlmListCache(c.env.KV, row.automation_id);
    }
  }
  
  return c.json({ message: "LLM removida" });
});

// ============================================================
// OCR
// ============================================================

// GET /api/settings/ocr
settingsRoutes.get("/ocr", async (c) => {
  const db = c.env.DB;
  const ocr = await db.prepare("SELECT * FROM ocr_services ORDER BY sort_order ASC, created_at DESC").all();
  return c.json({ data: ocr.results });
});

// POST /api/settings/ocr
settingsRoutes.post("/ocr", async (c) => {
  const db = c.env.DB;
  const { name, endpoint, api_key, docs_url } = await c.req.json<{
    name: string; endpoint: string; api_key: string; docs_url?: string;
  }>();
  
  if (!name || !endpoint || !api_key) {
    return c.json({ error: "Nome, endpoint e API key são obrigatórios" }, 400);
  }
  
  const id = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO ocr_services (id, name, endpoint, api_key, docs_url) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, name, endpoint, api_key, docs_url || null).run();
  
  const created = await db.prepare("SELECT * FROM ocr_services WHERE id = ?").bind(id).first();
  return c.json({ data: created, message: "Serviço OCR cadastrado" }, 201);
});

// PUT /api/settings/ocr/:id
settingsRoutes.put("/ocr/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const { name, endpoint, api_key, docs_url } = await c.req.json<{
    name?: string; endpoint?: string; api_key?: string; docs_url?: string;
  }>();
  
  const updates: string[] = [];
  const values: (string | null)[] = [];
  
  if (name !== undefined) { updates.push("name = ?"); values.push(name); }
  if (endpoint !== undefined) { updates.push("endpoint = ?"); values.push(endpoint); }
  if (api_key !== undefined) { updates.push("api_key = ?"); values.push(api_key); }
  if (docs_url !== undefined) { updates.push("docs_url = ?"); values.push(docs_url); }
  
  if (updates.length === 0) return c.json({ error: "Nenhum campo para atualizar" }, 400);
  
  values.push(id);
  await db.prepare(`UPDATE ocr_services SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run();
  await invalidateOcrCache(c.env.KV, id);
  
  const updated = await db.prepare("SELECT * FROM ocr_services WHERE id = ?").bind(id).first();
  return c.json({ data: updated, message: "Serviço OCR atualizado" });
});

// DELETE /api/settings/ocr/:id
settingsRoutes.delete("/ocr/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  await db.prepare("DELETE FROM ocr_services WHERE id = ?").bind(id).run();
  await invalidateOcrCache(c.env.KV, id);
  return c.json({ message: "Serviço OCR removido" });
});

// ============================================================
// Transcription Services
// ============================================================

// GET /api/settings/transcription-services
settingsRoutes.get("/transcription-services", async (c) => {
  const db = c.env.DB;
  const services = await db.prepare("SELECT * FROM transcription_services ORDER BY sort_order ASC, created_at DESC").all();
  return c.json({ data: services.results });
});

// POST /api/settings/transcription-services
settingsRoutes.post("/transcription-services", async (c) => {
  const db = c.env.DB;
  const { name, endpoint, api_key, docs_url } = await c.req.json<{
    name: string; endpoint: string; api_key: string; docs_url?: string;
  }>();
  
  if (!name || !endpoint || !api_key) {
    return c.json({ error: "Nome, endpoint e API key são obrigatórios" }, 400);
  }
  
  const id = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO transcription_services (id, name, endpoint, api_key, docs_url) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, name, endpoint, api_key, docs_url || null).run();
  
  const created = await db.prepare("SELECT * FROM transcription_services WHERE id = ?").bind(id).first();
  return c.json({ data: created, message: "Serviço de transcrição cadastrado" }, 201);
});

// PUT /api/settings/transcription-services/:id
settingsRoutes.put("/transcription-services/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const { name, endpoint, api_key, docs_url } = await c.req.json<{
    name?: string; endpoint?: string; api_key?: string; docs_url?: string;
  }>();
  
  const updates: string[] = [];
  const values: (string | null)[] = [];
  
  if (name !== undefined) { updates.push("name = ?"); values.push(name); }
  if (endpoint !== undefined) { updates.push("endpoint = ?"); values.push(endpoint); }
  if (api_key !== undefined) { updates.push("api_key = ?"); values.push(api_key); }
  if (docs_url !== undefined) { updates.push("docs_url = ?"); values.push(docs_url); }
  
  if (updates.length === 0) return c.json({ error: "Nenhum campo para atualizar" }, 400);
  
  values.push(id);
  await db.prepare(`UPDATE transcription_services SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run();
  
  await invalidateTranscriptionCache(c.env.KV, id);
  await invalidateTranscriptionCache(c.env.KV, null);
  
  const updated = await db.prepare("SELECT * FROM transcription_services WHERE id = ?").bind(id).first();
  return c.json({ data: updated, message: "Serviço de transcrição atualizado" });
});

// DELETE /api/settings/transcription-services/:id
settingsRoutes.delete("/transcription-services/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  await db.prepare("DELETE FROM transcription_services WHERE id = ?").bind(id).run();
  await invalidateTranscriptionCache(c.env.KV, id);
  await invalidateTranscriptionCache(c.env.KV, null);
  return c.json({ message: "Serviço de transcrição removido" });
});

// ============================================================
// Domínios
// ============================================================

// GET /api/settings/domains
settingsRoutes.get("/domains", async (c) => {
  const db = c.env.DB;
  const domains = await db.prepare("SELECT * FROM domains ORDER BY created_at DESC").all();
  return c.json({ data: domains.results });
});

// POST /api/settings/domains
settingsRoutes.post("/domains", async (c) => {
  const db = c.env.DB;
  const { domain } = await c.req.json<{ domain: string }>();
  
  if (!domain) {
    return c.json({ error: "Domínio é obrigatório" }, 400);
  }
  
  const id = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO domains (id, domain) VALUES (?, ?)"
  ).bind(id, domain).run();
  
  const created = await db.prepare("SELECT * FROM domains WHERE id = ?").bind(id).first();
  return c.json({ data: created, message: "Domínio cadastrado" }, 201);
});

// PUT /api/settings/domains/:id
settingsRoutes.put("/domains/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const { domain, active } = await c.req.json<{ domain?: string; active?: number }>();
  
  const updates: string[] = [];
  const values: (string | number)[] = [];
  
  if (domain !== undefined) { updates.push("domain = ?"); values.push(domain); }
  if (active !== undefined) { updates.push("active = ?"); values.push(active); }
  
  if (updates.length === 0) return c.json({ error: "Nenhum campo para atualizar" }, 400);
  
  values.push(id);
  await db.prepare(`UPDATE domains SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run();
  
  const updated = await db.prepare("SELECT * FROM domains WHERE id = ?").bind(id).first();
  return c.json({ data: updated, message: "Domínio atualizado" });
});

// DELETE /api/settings/domains/:id
settingsRoutes.delete("/domains/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  await db.prepare("DELETE FROM domains WHERE id = ?").bind(id).run();
  return c.json({ message: "Domínio removido" });
});

// POST /api/settings/reorder — Reordenar prioridades de fallback de serviços
settingsRoutes.post("/reorder", async (c) => {
  const db = c.env.DB;
  const { table, id, direction } = await c.req.json<{
    table: "llms" | "ocr" | "transcription";
    id: string;
    direction: "up" | "down";
  }>();

  if (!table || !id || !direction || !["llms", "ocr", "transcription"].includes(table)) {
    return c.json({ error: "Parâmetros inválidos" }, 400);
  }

  const tableName = table === "llms" ? "llms" : table === "ocr" ? "ocr_services" : "transcription_services";

  // Obter todos os itens ordenados
  const items = await db.prepare(`SELECT id, sort_order FROM ${tableName} ORDER BY sort_order ASC, created_at DESC`).all<{ id: string; sort_order: number }>();
  const list = items.results || [];

  const index = list.findIndex(item => item.id === id);
  if (index === -1) {
    return c.json({ error: "Item não encontrado" }, 404);
  }

  // Determinar novo índice
  const newIndex = direction === "up" ? index - 1 : index + 1;
  if (newIndex < 0 || newIndex >= list.length) {
    return c.json({ message: "Ordenação mantida" }); // Sem alteração possível (limite da lista)
  }

  // Trocar sort_order entre o atual e o alvo
  const currentItem = list[index];
  const targetItem = list[newIndex];

  // Se ambos têm a mesma prioridade, ou ordem inválida, corrigimos todos
  const currentOrder = currentItem.sort_order || 0;
  const targetOrder = targetItem.sort_order || 0;

  // Atualizar no banco trocando os valores de sort_order
  await db.prepare(`UPDATE ${tableName} SET sort_order = ? WHERE id = ?`).bind(targetOrder, currentItem.id).run();
  await db.prepare(`UPDATE ${tableName} SET sort_order = ? WHERE id = ?`).bind(currentOrder, targetItem.id).run();

  // Invalidar caches correspondentes
  if (table === "llms") {
    const affected = await db.prepare("SELECT DISTINCT automation_id FROM automation_llms").all<{ automation_id: string }>();
    if (affected.results) {
      for (const row of affected.results) {
        await invalidateLlmListCache(c.env.KV, row.automation_id);
      }
    }
  } else if (table === "ocr") {
    await invalidateOcrCache(c.env.KV, id);
    await invalidateOcrCache(c.env.KV, targetItem.id);
    await invalidateOcrCache(c.env.KV, null);
  } else if (table === "transcription") {
    await invalidateTranscriptionCache(c.env.KV, id);
    await invalidateTranscriptionCache(c.env.KV, targetItem.id);
    await invalidateTranscriptionCache(c.env.KV, null);
  }

  return c.json({ message: "Ordenação atualizada com sucesso" });
});
