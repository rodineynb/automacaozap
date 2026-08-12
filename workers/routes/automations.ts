import { Hono } from "hono";
import type { Env } from "../app";
import { invalidateAutomationCache } from "../services/cache-service";

export const automationsRoutes = new Hono<{ Bindings: Env; Variables: { userId: string; userEmail: string } }>();

// Função para gerar slug a partir do nome
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// GET /api/automations — Listar todas as automações
automationsRoutes.get("/", async (c) => {
  const db = c.env.DB;
  const userId = c.get("userId");
  
  const userPerms = await db.prepare("SELECT role, allowed_automations FROM users WHERE id = ?").bind(userId).first<{ role: string; allowed_automations: string }>();
  
  const automations = await db.prepare(`
    SELECT 
      a.*,
      d.domain as domain_name,
      w.name as whatsapp_api_name,
      o.name as ocr_service_name,
      t.name as transcription_service_name,
      p.id as product_id,
      p.name as product_assoc_name
    FROM automations a
    LEFT JOIN domains d ON a.domain_id = d.id
    LEFT JOIN whatsapp_apis w ON a.whatsapp_api_id = w.id
    LEFT JOIN ocr_services o ON a.ocr_service_id = o.id
    LEFT JOIN transcription_services t ON a.transcription_service_id = t.id
    LEFT JOIN product_automations pa ON a.id = pa.automation_id
    LEFT JOIN products p ON pa.product_id = p.id
    ORDER BY a.created_at DESC
  `).all();
  
  let automationsList = automations.results || [];
  if (userPerms && userPerms.role !== 'admin' && userPerms.allowed_automations !== 'all') {
    const allowed = userPerms.allowed_automations.split(",");
    automationsList = automationsList.filter((a: any) => allowed.includes(a.id));
  }
  
  // Buscar LLMs, OCRs e Transcrições de cada automação
  const result = [];
  for (const automation of automationsList) {
    const autoId = (automation as Record<string, unknown>).id;
    const llms = await db.prepare(`
      SELECT al.priority_order, l.id, l.name, l.provider
      FROM automation_llms al
      JOIN llms l ON al.llm_id = l.id
      WHERE al.automation_id = ?
      ORDER BY al.priority_order ASC
    `).bind(autoId).all();

    const ocrs = await db.prepare(`
      SELECT ao.priority_order, o.id, o.name
      FROM automation_ocrs ao
      JOIN ocr_services o ON ao.ocr_service_id = o.id
      WHERE ao.automation_id = ?
      ORDER BY ao.priority_order ASC
    `).bind(autoId).all();

    const transcriptions = await db.prepare(`
      SELECT at.priority_order, t.id, t.name
      FROM automation_transcriptions at
      JOIN transcription_services t ON at.transcription_service_id = t.id
      WHERE at.automation_id = ?
      ORDER BY at.priority_order ASC
    `).bind(autoId).all();
    
    result.push({ 
      ...automation, 
      llms: llms.results,
      ocrs: ocrs.results,
      transcriptions: transcriptions.results
    });
  }
  
  return c.json({ data: result });
});

// GET /api/automations/all-errors — Listar todos os logs de erros
automationsRoutes.get("/all-errors", async (c) => {
  const db = c.env.DB;
  const dateFrom = c.req.query("data_inicio");
  const dateTo = c.req.query("data_fim");
  
  // Limpeza de logs antigos
  try {
    await db.prepare("DELETE FROM error_logs WHERE created_at < datetime('now', '-2 days')").run();
  } catch {}

  let query = `
    SELECT el.*, a.name as automation_name
    FROM error_logs el
    LEFT JOIN automations a ON el.automation_id = a.id
  `;
  const params: any[] = [];
  
  if (dateFrom && dateTo) {
    query += " WHERE el.created_at >= ? AND el.created_at <= ?";
    params.push(`${dateFrom} 00:00:00`, `${dateTo} 23:59:59`);
  }
  
  query += " ORDER BY el.created_at DESC LIMIT 200";

  const logs = await db.prepare(query).bind(...params).all();
  return c.json({ data: logs.results });
});

// GET /api/automations/:id — Detalhes de uma automação
automationsRoutes.get("/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  
  const automation = await db.prepare(`
    SELECT 
      a.*,
      d.domain as domain_name,
      w.name as whatsapp_api_name,
      o.name as ocr_service_name,
      t.name as transcription_service_name,
      p.id as product_id,
      p.name as product_assoc_name
    FROM automations a
    LEFT JOIN domains d ON a.domain_id = d.id
    LEFT JOIN whatsapp_apis w ON a.whatsapp_api_id = w.id
    LEFT JOIN ocr_services o ON a.ocr_service_id = o.id
    LEFT JOIN transcription_services t ON a.transcription_service_id = t.id
    LEFT JOIN product_automations pa ON a.id = pa.automation_id
    LEFT JOIN products p ON pa.product_id = p.id
    WHERE a.id = ?
  `).bind(id).first();
  
  if (!automation) {
    return c.json({ error: "Automação não encontrada" }, 404);
  }
  
  const llms = await db.prepare(`
    SELECT al.priority_order, l.id, l.name, l.provider
    FROM automation_llms al
    JOIN llms l ON al.llm_id = l.id
    WHERE al.automation_id = ?
    ORDER BY al.priority_order ASC
  `).bind(id).all();

  const ocrs = await db.prepare(`
    SELECT ao.priority_order, o.id, o.name
    FROM automation_ocrs ao
    JOIN ocr_services o ON ao.ocr_service_id = o.id
    WHERE ao.automation_id = ?
    ORDER BY ao.priority_order ASC
  `).bind(id).all();

  const transcriptions = await db.prepare(`
    SELECT at.priority_order, t.id, t.name
    FROM automation_transcriptions at
    JOIN transcription_services t ON at.transcription_service_id = t.id
    WHERE at.automation_id = ?
    ORDER BY at.priority_order ASC
  `).bind(id).all();
  
  return c.json({ 
    data: { 
      ...automation, 
      llms: llms.results,
      ocrs: ocrs.results,
      transcriptions: transcriptions.results
    } 
  });
});

// POST /api/automations — Criar nova automação
automationsRoutes.post("/", async (c) => {
  const db = c.env.DB;
  const { name, product_name, domain_id, whatsapp_api_id, ocr_ids, transcription_ids, whatsapp_number, llm_ids, pixel_id, facebook_token, waba_id, page_id, product_id, source_automation_id, attendant_name } = await c.req.json<{
    name: string;
    product_name?: string;
    domain_id: string;
    whatsapp_api_id: string;
    ocr_ids?: string[];
    transcription_ids?: string[];
    whatsapp_number?: string;
    llm_ids: string[]; // Em ordem de prioridade
    pixel_id?: string;
    facebook_token?: string;
    waba_id?: string;
    page_id?: string;
    product_id?: string;
    source_automation_id?: string;
    attendant_name?: string;
  }>();
  
  if (!name || !domain_id || !whatsapp_api_id || !llm_ids || llm_ids.length === 0) {
    return c.json({ error: "Nome, domínio, API WhatsApp e pelo menos 1 LLM são obrigatórios" }, 400);
  }
  
  const id = crypto.randomUUID();
  const slug = generateSlug(name);
  
  // Verificar se slug já existe
  const existingSlug = await db.prepare("SELECT id FROM automations WHERE slug = ?").bind(slug).first();
  if (existingSlug) {
    return c.json({ error: "Já existe uma automação com esse nome. Escolha outro." }, 409);
  }
  
  const main_ocr_id = ocr_ids && ocr_ids.length > 0 ? ocr_ids[0] : null;
  const main_trans_id = transcription_ids && transcription_ids.length > 0 ? transcription_ids[0] : null;

  // Criar automação
  await db.prepare(
    "INSERT INTO automations (id, name, product_name, slug, domain_id, whatsapp_api_id, ocr_service_id, transcription_service_id, whatsapp_number, pixel_id, facebook_token, waba_id, page_id, attendant_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, name, product_name || null, slug, domain_id, whatsapp_api_id, main_ocr_id, main_trans_id, whatsapp_number || null, pixel_id || null, facebook_token || null, waba_id || null, page_id || null, attendant_name || 'Julia').run();
  
  // Criar relação com LLMs (com ordem de prioridade)
  for (let i = 0; i < llm_ids.length; i++) {
    await db.prepare(
      "INSERT INTO automation_llms (id, automation_id, llm_id, priority_order) VALUES (?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), id, llm_ids[i], i + 1).run();
  }

  // Criar relação com OCRs (com ordem de prioridade)
  if (ocr_ids && ocr_ids.length > 0) {
    for (let i = 0; i < ocr_ids.length; i++) {
      if (ocr_ids[i]) {
        await db.prepare(
          "INSERT INTO automation_ocrs (id, automation_id, ocr_service_id, priority_order) VALUES (?, ?, ?, ?)"
        ).bind(crypto.randomUUID(), id, ocr_ids[i], i + 1).run();
      }
    }
  }

  // Criar relação com Transcrições (com ordem de prioridade)
  if (transcription_ids && transcription_ids.length > 0) {
    for (let i = 0; i < transcription_ids.length; i++) {
      if (transcription_ids[i]) {
        await db.prepare(
          "INSERT INTO automation_transcriptions (id, automation_id, transcription_service_id, priority_order) VALUES (?, ?, ?, ?)"
        ).bind(crypto.randomUUID(), id, transcription_ids[i], i + 1).run();
      }
    }
  }

  // Criar relação com o produto cadastrado se fornecido
  if (product_id) {
    await db.prepare(
      "INSERT OR IGNORE INTO product_automations (product_id, automation_id) VALUES (?, ?)"
    ).bind(product_id, id).run();
  }

  // Copiar estágios de Follow-up e CRM do source_automation_id com status desativado (enabled = 0)
  if (source_automation_id) {
    // 1. Copiar estágios de Follow-up
    const followupStages = await db.prepare("SELECT * FROM automation_followup_stages WHERE automation_id = ?").bind(source_automation_id).all<any>();
    if (followupStages.results && followupStages.results.length > 0) {
      for (const stage of followupStages.results) {
        await db.prepare(`
          INSERT INTO automation_followup_stages (
            id, automation_id, key, name, class, enabled, delay_minutes, message, tag_to_add, rewrite_mode, rewrite_count, variations
          ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
        `).bind(
          crypto.randomUUID(),
          id,
          stage.key,
          stage.name,
          stage.class,
          stage.delay_minutes,
          stage.message || "",
          stage.tag_to_add || null,
          stage.rewrite_mode || "none",
          stage.rewrite_count !== undefined ? Number(stage.rewrite_count) : 5,
          stage.variations || "[]"
        ).run();
      }
    }

    // 2. Copiar estágios de CRM
    const crmStages = await db.prepare("SELECT * FROM automation_crm_stages WHERE automation_id = ?").bind(source_automation_id).all<any>();
    if (crmStages.results && crmStages.results.length > 0) {
      for (const stage of crmStages.results) {
        await db.prepare(`
          INSERT INTO automation_crm_stages (
            id, automation_id, key, name, enabled, delay_hours, message, rewrite_mode, rewrite_count, variations, class
          ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
        `).bind(
          crypto.randomUUID(),
          id,
          stage.key,
          stage.name,
          stage.delay_hours,
          stage.message || "",
          stage.rewrite_mode || "none",
          stage.rewrite_count !== undefined ? Number(stage.rewrite_count) : 5,
          stage.variations || "[]",
          stage.class || "sucesso"
        ).run();
      }
    }
  }
  
  // Buscar domínio para gerar o webhook
  const domain = await db.prepare("SELECT domain FROM domains WHERE id = ?").bind(domain_id).first<{ domain: string }>();
  const webhookUrl = domain ? `https://${domain.domain}/api/webhook/${slug}` : `/api/webhook/${slug}`;
  
  return c.json({
    data: { id, name, slug, webhook_url: webhookUrl },
    message: "Automação criada com sucesso"
  }, 201);
});

// PUT /api/automations/:id — Editar automação
automationsRoutes.put("/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const { name, product_name, domain_id, whatsapp_api_id, ocr_ids, transcription_ids, whatsapp_number, llm_ids, pixel_id, facebook_token, waba_id, page_id, product_id, attendant_name } = await c.req.json<{
    name?: string;
    product_name?: string;
    domain_id?: string;
    whatsapp_api_id?: string;
    ocr_ids?: string[];
    transcription_ids?: string[];
    whatsapp_number?: string;
    llm_ids?: string[];
    pixel_id?: string;
    facebook_token?: string;
    waba_id?: string;
    page_id?: string;
    product_id?: string | null;
    attendant_name?: string;
  }>();

  // Query before updating to get the current slug for cache invalidation
  const oldAuto = await db.prepare("SELECT slug FROM automations WHERE id = ?").bind(id).first<{ slug: string }>();
  
  const updates: string[] = [];
  const values: (string | null)[] = [];
  
  if (name !== undefined) {
    updates.push("name = ?");
    values.push(name);
    const newSlug = generateSlug(name);
    updates.push("slug = ?");
    values.push(newSlug);
  }
  if (product_name !== undefined) { updates.push("product_name = ?"); values.push(product_name); }
  if (domain_id !== undefined) { updates.push("domain_id = ?"); values.push(domain_id); }
  if (whatsapp_api_id !== undefined) { updates.push("whatsapp_api_id = ?"); values.push(whatsapp_api_id); }
  if (ocr_ids !== undefined) {
    const main_ocr_id = ocr_ids && ocr_ids.length > 0 ? ocr_ids[0] : null;
    updates.push("ocr_service_id = ?");
    values.push(main_ocr_id);
  }
  if (transcription_ids !== undefined) {
    const main_trans_id = transcription_ids && transcription_ids.length > 0 ? transcription_ids[0] : null;
    updates.push("transcription_service_id = ?");
    values.push(main_trans_id);
  }
  if (whatsapp_number !== undefined) { updates.push("whatsapp_number = ?"); values.push(whatsapp_number); }
  if (pixel_id !== undefined) { updates.push("pixel_id = ?"); values.push(pixel_id); }
  if (facebook_token !== undefined) { updates.push("facebook_token = ?"); values.push(facebook_token); }
  if (waba_id !== undefined) { updates.push("waba_id = ?"); values.push(waba_id); }
  if (page_id !== undefined) { updates.push("page_id = ?"); values.push(page_id); }
  if (attendant_name !== undefined) { updates.push("attendant_name = ?"); values.push(attendant_name); }
  
  if (updates.length > 0) {
    values.push(id);
    await db.prepare(`UPDATE automations SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run();
  }
  
  // Atualizar LLMs se fornecidas
  if (llm_ids && llm_ids.length > 0) {
    await db.prepare("DELETE FROM automation_llms WHERE automation_id = ?").bind(id).run();
    for (let i = 0; i < llm_ids.length; i++) {
      await db.prepare(
        "INSERT INTO automation_llms (id, automation_id, llm_id, priority_order) VALUES (?, ?, ?, ?)"
      ).bind(crypto.randomUUID(), id, llm_ids[i], i + 1).run();
    }
  }

  // Atualizar OCRs se fornecidas
  if (ocr_ids !== undefined) {
    await db.prepare("DELETE FROM automation_ocrs WHERE automation_id = ?").bind(id).run();
    if (ocr_ids && ocr_ids.length > 0) {
      for (let i = 0; i < ocr_ids.length; i++) {
        if (ocr_ids[i]) {
          await db.prepare(
            "INSERT INTO automation_ocrs (id, automation_id, ocr_service_id, priority_order) VALUES (?, ?, ?, ?)"
          ).bind(crypto.randomUUID(), id, ocr_ids[i], i + 1).run();
        }
      }
    }
  }

  // Atualizar Transcrições se fornecidas
  if (transcription_ids !== undefined) {
    await db.prepare("DELETE FROM automation_transcriptions WHERE automation_id = ?").bind(id).run();
    if (transcription_ids && transcription_ids.length > 0) {
      for (let i = 0; i < transcription_ids.length; i++) {
        if (transcription_ids[i]) {
          await db.prepare(
            "INSERT INTO automation_transcriptions (id, automation_id, transcription_service_id, priority_order) VALUES (?, ?, ?, ?)"
          ).bind(crypto.randomUUID(), id, transcription_ids[i], i + 1).run();
        }
      }
    }
  }

  // Atualizar relação de produto se fornecido (incluindo null/vazio para remover associação)
  if (product_id !== undefined) {
    await db.prepare("DELETE FROM product_automations WHERE automation_id = ?").bind(id).run();
    if (product_id) {
      await db.prepare(
        "INSERT OR IGNORE INTO product_automations (product_id, automation_id) VALUES (?, ?)"
      ).bind(product_id, id).run();
    }
  }

  // Invalidate KV cache
  if (oldAuto) {
    await invalidateAutomationCache(c.env.KV, oldAuto.slug, id);
    if (name !== undefined) {
      const newSlug = generateSlug(name);
      await invalidateAutomationCache(c.env.KV, newSlug, id);
    }
  }
  
  return c.json({ message: "Automação atualizada com sucesso" });
});

// PATCH /api/automations/:id/status — Pausar/Ativar automação
automationsRoutes.patch("/:id/status", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const { status } = await c.req.json<{ status: "active" | "paused" }>();
  
  if (!status || !["active", "paused"].includes(status)) {
    return c.json({ error: "Status deve ser 'active' ou 'paused'" }, 400);
  }

  const oldAuto = await db.prepare("SELECT slug FROM automations WHERE id = ?").bind(id).first<{ slug: string }>();
  
  await db.prepare("UPDATE automations SET status = ? WHERE id = ?").bind(status, id).run();

  if (oldAuto) {
    await invalidateAutomationCache(c.env.KV, oldAuto.slug, id);
  }

  return c.json({ message: `Automação ${status === "active" ? "ativada" : "pausada"}` });
});

// DELETE /api/automations/:id
automationsRoutes.delete("/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");

  const oldAuto = await db.prepare("SELECT slug FROM automations WHERE id = ?").bind(id).first<{ slug: string }>();

  await db.prepare("DELETE FROM automations WHERE id = ?").bind(id).run();

  if (oldAuto) {
    await invalidateAutomationCache(c.env.KV, oldAuto.slug, id);
  }

  return c.json({ message: "Automação removida" });
});

// GET /api/automations/:id/errors — Log de erros
automationsRoutes.get("/:id/errors", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  
  const errors = await db.prepare(
    "SELECT * FROM error_logs WHERE automation_id = ? ORDER BY created_at DESC LIMIT 100"
  ).bind(id).all();
  
  return c.json({ data: errors.results });
});

// GET /api/automations/:id/lead-flow — Acompanhamento do fluxo e follow-ups por telefone
automationsRoutes.get("/:id/lead-flow", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const phone = c.req.query("phone");
  
  if (!phone) {
    return c.json({ error: "O número de telefone é obrigatório." }, 400);
  }
  
  const cleanedPhone = phone.trim().replace(/\D/g, "");
  if (!cleanedPhone) {
    return c.json({ error: "Número de telefone inválido." }, 400);
  }
  
  // 1. Buscar contato e conversa
  const contactData = await db.prepare(`
    SELECT c.id as contact_id, conv.id as conversation_id, a.slug as automation_slug
    FROM contacts c
    JOIN conversations conv ON conv.contact_id = c.id
    JOIN automations a ON c.automation_id = a.id
    WHERE c.phone = ? AND c.automation_id = ?
  `).bind(cleanedPhone, id).first<{ contact_id: string; conversation_id: string; automation_slug: string }>();
  
  if (!contactData) {
    return c.json({ error: "Lead não encontrado para este número nesta automação." }, 404);
  }
  
  // 2. Buscar estado
  const state = await db.prepare(`
    SELECT * FROM conversation_state WHERE conversation_id = ?
  `).bind(contactData.conversation_id).first();
  
  // 3. Buscar follow-ups agendados
  const followups = await db.prepare(`
    SELECT type, status, scheduled_for, executed_at FROM scheduled_followups
    WHERE conversation_id = ?
    ORDER BY created_at ASC
  `).bind(contactData.conversation_id).all();
  
  // 4. Buscar logs de erros recentes contendo o telefone ou associados à automação
  const errors = await db.prepare(`
    SELECT * FROM error_logs 
    WHERE automation_id = ? AND error_message LIKE ?
    ORDER BY created_at DESC
    LIMIT 5
  `).bind(id, `%${cleanedPhone}%`).all();

  // 5. Buscar respostas coletadas no CRM
  const crmResponses = await db.prepare(`
    SELECT id, flow_type, question_sent, response_text, status, created_at, answered_at 
    FROM crm_responses
    WHERE phone = ? AND automation_id = ?
    ORDER BY created_at ASC
  `).bind(cleanedPhone, id).all();

  // 6. Buscar agendamentos de envio do CRM
  const crmScheduled = await db.prepare(`
    SELECT id, flow_type, scheduled_for, status FROM crm_scheduled
    WHERE phone = ? AND automation_id = ?
    ORDER BY scheduled_for ASC
  `).bind(cleanedPhone, id).all();
  
  return c.json({
    data: {
      hasStarted: true,
      contact: contactData,
      state: state || null,
      followups: followups.results || [],
      errors: errors.results || [],
      crmResponses: crmResponses.results || [],
      crmScheduled: crmScheduled.results || []
    }
  });
});

// GET /api/automations/:id/tracking-logs — Log de Rastreamento (Meta CAPI)
automationsRoutes.get("/:id/tracking-logs", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const dateFrom = c.req.query("data_inicio");
  const dateTo = c.req.query("data_fim");
  
  let query = "SELECT * FROM facebook_tracking_logs WHERE automation_id = ?";
  const params: any[] = [id];
  
  if (dateFrom && dateTo) {
    query += " AND created_at >= ? AND created_at <= ?";
    params.push(`${dateFrom} 00:00:00`, `${dateTo} 23:59:59`);
  }
  
  query += " ORDER BY created_at DESC LIMIT 100";
  
  const logs = await db.prepare(query).bind(...params).all();
  return c.json({ data: logs.results });
});

// POST /api/automations/purge-lead — Limpar dados de teste de um telefone
automationsRoutes.post("/purge-lead", async (c) => {
  const db = c.env.DB;
  const { phone } = await c.req.json<{ phone: string }>();
  
  if (!phone) {
    return c.json({ error: "Telefone é obrigatório" }, 400);
  }
  
  const cleanedPhone = phone.trim().replace(/\D/g, "");
  
  if (!cleanedPhone) {
    return c.json({ error: "Telefone inválido" }, 400);
  }
  
  try {
    // 1. Deletar mensagens associadas a conversas desse número
    await db.prepare(`
      DELETE FROM messages WHERE conversation_id IN (
        SELECT id FROM conversations WHERE contact_id IN (
          SELECT id FROM contacts WHERE phone = ?
        )
      )
    `).bind(cleanedPhone).run();
    
    // 2. Deletar estados de conversas
    await db.prepare(`
      DELETE FROM conversation_state WHERE conversation_id IN (
        SELECT id FROM conversations WHERE contact_id IN (
          SELECT id FROM contacts WHERE phone = ?
        )
      )
    `).bind(cleanedPhone).run();
    
    // 3. Deletar follow-ups agendados
    await db.prepare(`
      DELETE FROM scheduled_followups WHERE conversation_id IN (
        SELECT id FROM conversations WHERE contact_id IN (
          SELECT id FROM contacts WHERE phone = ?
        )
      )
    `).bind(cleanedPhone).run();
    
    // 4. Deletar conversas
    await db.prepare(`
      DELETE FROM conversations WHERE contact_id IN (
        SELECT id FROM contacts WHERE phone = ?
      )
    `).bind(cleanedPhone).run();
    
    // 5. Deletar contatos
    await db.prepare("DELETE FROM contacts WHERE phone = ?").bind(cleanedPhone).run();
    
    // 6. Deletar leads da automação
    await db.prepare("DELETE FROM automation_leads WHERE phone = ?").bind(cleanedPhone).run();
    
    // 7. Deletar dados de tracking CAPI
    await db.prepare("DELETE FROM tracking_data WHERE phone = ?").bind(cleanedPhone).run();
    
    // 8. Deletar logs do pixel/token
    await db.prepare("DELETE FROM facebook_tracking_logs WHERE phone = ?").bind(cleanedPhone).run();
    
    // 9. Limpar chaves do cache KV (debounce e concorrência)
    if (c.env.KV) {
      await c.env.KV.delete(`debounce:${cleanedPhone}`);
      await c.env.KV.delete(`debounce:${cleanedPhone}:processed`);
      await c.env.KV.delete(`processing:${cleanedPhone}`);
      await c.env.KV.delete(`queue:${cleanedPhone}`);
    }
    
    console.log(`[PurgeLead] Todos os dados do telefone ${cleanedPhone} foram expurgados com sucesso.`);
    return c.json({ message: `Todos os dados do telefone ${cleanedPhone} foram limpos com sucesso.` });
  } catch (err: any) {
    console.error(`[PurgeLead] Erro ao expurgar dados do telefone ${cleanedPhone}:`, err);
    return c.json({ error: `Erro ao limpar dados: ${err.message || err}` }, 500);
  }
});

