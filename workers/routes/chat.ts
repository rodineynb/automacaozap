import { Hono } from "hono";
import type { Env } from "../app";
import { sendText, sendAudio, sendDocument, sendImage, sendVideo, deleteWhatsAppMessage } from "../services/whatsapp-service";
import { executeTool } from "../automations/recheios/tools";
import { executeFollowup } from "../automations/recheios/followups";

export const chatRoutes = new Hono<{ Bindings: Env; Variables: { userId: string; userEmail: string } }>();

// Middleware de verificação de permissões de automação para endpoints específicos de conversa
const checkConversationAccess = async (c: any, next: any) => {
  const db = c.env.DB;
  const userId = c.get("userId");
  const id = c.req.param("id");
  
  if (!userId) {
    return c.json({ error: "Sessão inválida ou não autenticada." }, 401);
  }
  
  const userPerms = (await db.prepare("SELECT role, allowed_automations FROM users WHERE id = ?").bind(userId).first()) as { role: string; allowed_automations: string } | null;
  
  if (userPerms && userPerms.role !== 'admin' && userPerms.allowed_automations !== 'all') {
    const conversation = (await db.prepare("SELECT automation_id FROM conversations WHERE id = ?").bind(id).first()) as { automation_id: string } | null;
    if (!conversation) {
      return c.json({ error: "Conversa não encontrada." }, 404);
    }
    const allowed = userPerms.allowed_automations.split(",");
    if (!allowed.includes(conversation.automation_id)) {
      return c.json({ error: "Acesso não autorizado a esta conversa." }, 403);
    }
  }
  
  await next();
};

chatRoutes.use("/conversations/:id", checkConversationAccess);
chatRoutes.use("/conversations/:id/*", checkConversationAccess);

// GET /api/chat/conversations — Listar conversas com filtros
chatRoutes.get("/conversations", async (c) => {
  const db = c.env.DB;
  const automationId = c.req.query("automation_id");
  const status = c.req.query("status");
  const search = c.req.query("search");
  const startDate = c.req.query("start_date");
  const endDate = c.req.query("end_date");
  const limit = parseInt(c.req.query("limit") || "50");
  const offset = parseInt(c.req.query("offset") || "0");
  const userId = c.get("userId");
  
  const userPerms = (await db.prepare("SELECT role, allowed_automations FROM users WHERE id = ?").bind(userId).first()) as { role: string; allowed_automations: string } | null;
  
  let query = `
    SELECT 
      cv.id,
      cv.status,
      cv.ai_active,
      cv.created_at,
      cv.updated_at,
      ct.phone,
      ct.name as contact_name,
      a.name as automation_name,
      a.id as automation_id,
      (SELECT content FROM messages WHERE conversation_id = cv.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = cv.id) as message_count
    FROM conversations cv
    JOIN contacts ct ON cv.contact_id = ct.id
    JOIN automations a ON cv.automation_id = a.id
  `;
  
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  
  if (userPerms && userPerms.role !== 'admin' && userPerms.allowed_automations !== 'all') {
    const allowed = userPerms.allowed_automations.split(",");
    const placeholders = allowed.map(() => "?").join(",");
    conditions.push(`cv.automation_id IN (${placeholders})`);
    params.push(...allowed);
  }
  
  if (automationId) { conditions.push("cv.automation_id = ?"); params.push(automationId); }
  if (status) { conditions.push("cv.status = ?"); params.push(status); }
  if (search) { conditions.push("(ct.phone LIKE ? OR ct.name LIKE ?)"); params.push(`%${search}%`, `%${search}%`); }
  if (startDate) { conditions.push("cv.updated_at >= ?"); params.push(startDate); }
  if (endDate) { conditions.push("cv.updated_at <= ?"); params.push(endDate); }
  
  if (conditions.length > 0) query += " WHERE " + conditions.join(" AND ");
  query += " ORDER BY cv.updated_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);
  
  const conversations = await db.prepare(query).bind(...params).all();
  
  // Contar total
  let countQuery = "SELECT COUNT(*) as total FROM conversations cv JOIN contacts ct ON cv.contact_id = ct.id";
  if (conditions.length > 0) {
    countQuery += " WHERE " + conditions.join(" AND ");
  }
  const countParams = params.slice(0, -2); // Remove limit e offset
  const total = await db.prepare(countQuery).bind(...countParams).first<{ total: number }>();
  
  return c.json({ data: conversations.results, total: total?.total || 0 });
});

// GET /api/chat/conversations/:id — Detalhes de uma conversa com mensagens
chatRoutes.get("/conversations/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  
  const conversation = await db.prepare(`
    SELECT 
      cv.*,
      ct.phone,
      ct.name as contact_name,
      a.name as automation_name
    FROM conversations cv
    JOIN contacts ct ON cv.contact_id = ct.id
    JOIN automations a ON cv.automation_id = a.id
    WHERE cv.id = ?
  `).bind(id).first();
  
  if (!conversation) {
    return c.json({ error: "Conversa não encontrada" }, 404);
  }
  
  const messages = await db.prepare(
    "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"
  ).bind(id).all();
  
  return c.json({ data: { ...conversation, messages: messages.results } });
});

// POST /api/chat/conversations/:id/messages — Enviar mensagem manual
chatRoutes.post("/conversations/:id/messages", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const { content } = await c.req.json<{ content: string }>();
  
  if (!content) {
    return c.json({ error: "Conteúdo da mensagem é obrigatório" }, 400);
  }
  
  // Buscar dados da conversa, contato e API WhatsApp correspondente
  const leadData = await db.prepare(`
    SELECT cv.id, cv.ai_active, ct.phone, a.whatsapp_api_id
    FROM conversations cv
    JOIN contacts ct ON cv.contact_id = ct.id
    JOIN automations a ON cv.automation_id = a.id
    WHERE cv.id = ?
  `).bind(id).first<{ id: string; ai_active: number; phone: string; whatsapp_api_id: string }>();
  
  if (!leadData) {
    return c.json({ error: "Conversa não encontrada" }, 404);
  }

  if (leadData.ai_active === 1) {
    return c.json({ error: "A IA está ativa para esta conversa. Desative a IA antes de responder manualmente." }, 400);
  }
  
  // Enviar em tempo real para o WhatsApp do cliente e obter o ID real da mensagem
  let msgId: string = crypto.randomUUID();
  if (leadData.whatsapp_api_id) {
    const waId = await sendText(db, leadData.whatsapp_api_id, leadData.phone, content, c.env.KV);
    if (waId) msgId = waId;
  }

  // Registrar mensagem manual no D1
  await db.prepare(
    "INSERT INTO messages (id, conversation_id, content, role) VALUES (?, ?, ?, 'manual')"
  ).bind(msgId, id, content).run();
  
  // Atualizar timestamp da conversa
  await db.prepare(
    "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?"
  ).bind(id).run();

  // Notificar realtime
  try {
    const { notifyNewMessage, notifyConversationUpdated } = await import("../services/realtime-service");
    await notifyNewMessage(c.env, id, {
      id: msgId,
      content,
      role: 'manual',
    });
    await notifyConversationUpdated(c.env, id, {
      updated_at: new Date().toISOString()
    });
  } catch (err) {
    console.error("[ChatRoutes] Error notifying realtime manual message:", err);
  }
  
  const message = await db.prepare("SELECT * FROM messages WHERE id = ?").bind(msgId).first();
  return c.json({ data: message, message: "Mensagem registrada e enviada" }, 201);
});

// POST /api/chat/conversations/:id/send-text — Enviar texto manual dedicado
chatRoutes.post("/conversations/:id/send-text", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const { content } = await c.req.json<{ content: string }>();
  
  if (!content) {
    return c.json({ error: "Conteúdo da mensagem é obrigatório" }, 400);
  }
  
  const leadData = await db.prepare(`
    SELECT cv.id, cv.ai_active, ct.phone, a.whatsapp_api_id
    FROM conversations cv
    JOIN contacts ct ON cv.contact_id = ct.id
    JOIN automations a ON cv.automation_id = a.id
    WHERE cv.id = ?
  `).bind(id).first<{ id: string; ai_active: number; phone: string; whatsapp_api_id: string }>();
  
  if (!leadData) {
    return c.json({ error: "Conversa não encontrada" }, 404);
  }

  if (leadData.ai_active === 1) {
    return c.json({ error: "A IA está ativa para esta conversa. Desative a IA antes de responder manualmente." }, 400);
  }
  
  let msgId: string = crypto.randomUUID();
  if (leadData.whatsapp_api_id) {
    const waId = await sendText(db, leadData.whatsapp_api_id, leadData.phone, content, c.env.KV);
    if (waId) msgId = waId;
  }

  // Registrar mensagem manual
  await db.prepare(
    "INSERT INTO messages (id, conversation_id, content, role) VALUES (?, ?, ?, 'manual')"
  ).bind(msgId, id, content).run();
  
  await db.prepare(
    "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?"
  ).bind(id).run();

  // Notificar realtime
  try {
    const { notifyNewMessage, notifyConversationUpdated } = await import("../services/realtime-service");
    await notifyNewMessage(c.env, id, {
      id: msgId,
      content,
      role: 'manual',
    });
    await notifyConversationUpdated(c.env, id, {
      updated_at: new Date().toISOString()
    });
  } catch (err) {
    console.error("[ChatRoutes] Error notifying realtime text message:", err);
  }
  
  const message = await db.prepare("SELECT * FROM messages WHERE id = ?").bind(msgId).first();
  return c.json({ data: message, message: "Mensagem de texto enviada" }, 201);
});

// POST /api/chat/conversations/:id/send-audio — Enviar áudio manual com presets
chatRoutes.post("/conversations/:id/send-audio", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const { url, preset } = await c.req.json<{ url?: string; preset?: 'audio1' | 'audio2' }>();
  
  if (!url && !preset) {
    return c.json({ error: "É necessário fornecer um URL de áudio ou um preset ('audio1' | 'audio2')" }, 400);
  }
  
  const leadData = await db.prepare(`
    SELECT cv.id, cv.ai_active, ct.phone, a.whatsapp_api_id
    FROM conversations cv
    JOIN contacts ct ON cv.contact_id = ct.id
    JOIN automations a ON cv.automation_id = a.id
    WHERE cv.id = ?
  `).bind(id).first<{ id: string; ai_active: number; phone: string; whatsapp_api_id: string }>();
  
  if (!leadData) {
    return c.json({ error: "Conversa não encontrada" }, 404);
  }

  if (leadData.ai_active === 1) {
    return c.json({ error: "A IA está ativa para esta conversa. Desative a IA antes de responder manualmente." }, 400);
  }
  
  let audioUrl = url || "";
  let logText = `[Áudio manual enviado]`;
  
  if (preset === 'audio1') {
    audioUrl = "https://dados.promentor21.top/Funil%20Recheios/audio1-v4.mp3";
    logText = `[Áudio manual enviado: Apresentação (Áudio 1)]`;
  } else if (preset === 'audio2') {
    audioUrl = "https://dados.promentor21.top/Funil%20Recheios/audio2-v2.mp3";
    logText = `[Áudio manual enviado: Confirmação PIX (Áudio 2)]`;
  } else if (url) {
    logText = `[Áudio manual enviado: ${url}]`;
  }
  
  if (!audioUrl) {
    return c.json({ error: "URL do áudio inválida" }, 400);
  }
  
  let msgId: string = crypto.randomUUID();
  if (leadData.whatsapp_api_id) {
    const waId = await sendAudio(db, leadData.whatsapp_api_id, leadData.phone, audioUrl, c.env.KV);
    if (waId) msgId = waId;
  }
  
  await db.prepare(
    "INSERT INTO messages (id, conversation_id, content, role) VALUES (?, ?, ?, 'manual')"
  ).bind(msgId, id, logText).run();
  
  await db.prepare(
    "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?"
  ).bind(id).run();

  // Notificar realtime
  try {
    const { notifyNewMessage, notifyConversationUpdated } = await import("../services/realtime-service");
    await notifyNewMessage(c.env, id, {
      id: msgId,
      content: logText,
      role: 'manual',
    });
    await notifyConversationUpdated(c.env, id, {
      updated_at: new Date().toISOString()
    });
  } catch (err) {
    console.error("[ChatRoutes] Error notifying realtime audio message:", err);
  }
  
  const message = await db.prepare("SELECT * FROM messages WHERE id = ?").bind(msgId).first();
  return c.json({ data: message, message: "Áudio enviado e registrado" }, 201);
});

// POST /api/chat/conversations/:id/send-document — Enviar PDF manual com presets
chatRoutes.post("/conversations/:id/send-document", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const { url, name, preset } = await c.req.json<{ url?: string; name?: string; preset?: 'pdf1' | 'pdf2' | 'pdf3' | 'pdf4' | 'pdf5' | 'all' }>();
  
  if (!url && !preset) {
    return c.json({ error: "É necessário fornecer um URL ou um preset ('pdf1'|'pdf2'|'pdf3'|'pdf4'|'pdf5'|'all')" }, 400);
  }
  
  const leadData = await db.prepare(`
    SELECT cv.id, cv.ai_active, ct.phone, a.whatsapp_api_id
    FROM conversations cv
    JOIN contacts ct ON cv.contact_id = ct.id
    JOIN automations a ON cv.automation_id = a.id
    WHERE cv.id = ?
  `).bind(id).first<{ id: string; ai_active: number; phone: string; whatsapp_api_id: string }>();
  
  if (!leadData) {
    return c.json({ error: "Conversa não encontrada" }, 404);
  }

  if (leadData.ai_active === 1) {
    return c.json({ error: "A IA está ativa para esta conversa. Desative a IA antes de responder manualmente." }, 400);
  }
  
  const pdfPresets = [
    { name: 'Apostila 5. Recheios Sem Fogão (101 Receitas).pdf', url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%205.%20Recheios%20Sem%20Fog%C3%A3o%20(101%20Receitas).pdf' },
    { name: 'Apostila 1. Recheios Sem Fogão (50 Receitas).pdf', url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%201.%20Recheios%20Sem%20Fog%C3%A3o%20(50%20Receitas).pdf' },
    { name: 'Apostila 3. Recheios Sem Fogão (20 Receitas).pdf', url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%203.%20Recheios%20Sem%20Fog%C3%A3o%20(20%20Receitas).pdf' },
    { name: 'Apostila 4. Recheios Sem Fogão (23 Receitas).pdf', url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%204.%20Recheios%20Sem%20Fog%C3%A3o%20(23%20Receitas).pdf' },
    { name: 'Apostila 2. Recheios Sem Fogão (34 Receitas).pdf', url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%202.%20Recheios%20Sem%20Fog%C3%A3o%20(34%20Receitas).pdf' },
  ];
  
  let docsToSend: { name: string; url: string }[] = [];
  let logText = "";
  
  if (preset === 'all') {
    docsToSend = pdfPresets;
    logText = `[Todos os 5 PDFs enviados manualmente]`;
  } else if (preset && preset.startsWith('pdf')) {
    const idx = parseInt(preset.replace('pdf', '')) - 1;
    if (idx >= 0 && idx < pdfPresets.length) {
      docsToSend = [pdfPresets[idx]];
      logText = `[Apostila manual enviada: ${pdfPresets[idx].name}]`;
    }
  } else if (url) {
    const docName = name || "Documento.pdf";
    docsToSend = [{ name: docName, url }];
    logText = `[Documento manual enviado: ${docName}]`;
  }
  
  if (docsToSend.length === 0) {
    return c.json({ error: "Preset ou URL do documento inválida" }, 400);
  }
  
  let msgId: string = crypto.randomUUID();
  // Enviar documentos via WhatsApp
  if (leadData.whatsapp_api_id) {
    for (let i = 0; i < docsToSend.length; i++) {
      const doc = docsToSend[i];
      if (i > 0) {
        // Delay humano de 4 segundos entre PDFs se enviar múltiplos
        await new Promise(resolve => setTimeout(resolve, 4000));
      }
      const waId = await sendDocument(db, leadData.whatsapp_api_id, leadData.phone, doc.url, doc.name, c.env.KV);
      if (i === docsToSend.length - 1 && waId) {
        msgId = waId;
      }
    }
  }
  
  await db.prepare(
    "INSERT INTO messages (id, conversation_id, content, role) VALUES (?, ?, ?, 'manual')"
  ).bind(msgId, id, logText).run();
  
  await db.prepare(
    "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?"
  ).bind(id).run();

  // Notificar realtime
  try {
    const { notifyNewMessage, notifyConversationUpdated } = await import("../services/realtime-service");
    await notifyNewMessage(c.env, id, {
      id: msgId,
      content: logText,
      role: 'manual',
    });
    await notifyConversationUpdated(c.env, id, {
      updated_at: new Date().toISOString()
    });
  } catch (err) {
    console.error("[ChatRoutes] Error notifying realtime document message:", err);
  }
  
  const message = await db.prepare("SELECT * FROM messages WHERE id = ?").bind(msgId).first();
  return c.json({ data: message, message: "Documento(s) enviado(s) e registrado(s)" }, 201);
});

// POST /api/chat/conversations/:id/send-image — Enviar imagem manual com presets
chatRoutes.post("/conversations/:id/send-image", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const { url, caption, preset } = await c.req.json<{ url?: string; caption?: string; preset?: 'seq1' | 'img2' | 'bonus' | 'upsell' }>();
  
  if (!url && !preset) {
    return c.json({ error: "É necessário fornecer um URL ou um preset ('seq1'|'img2'|'bonus'|'upsell')" }, 400);
  }
  
  const leadData = await db.prepare(`
    SELECT cv.id, cv.ai_active, ct.phone, a.whatsapp_api_id
    FROM conversations cv
    JOIN contacts ct ON cv.contact_id = ct.id
    JOIN automations a ON cv.automation_id = a.id
    WHERE cv.id = ?
  `).bind(id).first<{ id: string; ai_active: number; phone: string; whatsapp_api_id: string }>();
  
  if (!leadData) {
    return c.json({ error: "Conversa não encontrada" }, 404);
  }

  if (leadData.ai_active === 1) {
    return c.json({ error: "A IA está ativa para esta conversa. Desative a IA antes de responder manualmente." }, 400);
  }
  
  let imageUrl = "";
  let logText = "";
  
  if (preset === 'seq1') {
    imageUrl = "https://dados.promentor21.top/Funil%20Recheios/img_seq1.png";
    logText = `[Imagem manual enviada: Sequência 1]`;
  } else if (preset === 'img2') {
    imageUrl = "https://dados.promentor21.top/Funil%20Recheios/img2.jpeg";
    logText = `[Imagem manual enviada: Prova Social (img2)]`;
  } else if (preset === 'bonus') {
    imageUrl = "https://dados.promentor21.top/Funil%20Recheios/img-bonus.jpeg";
    logText = `[Imagem manual enviada: Detalhe do Bônus]`;
  } else if (preset === 'upsell') {
    imageUrl = "https://dados.promentor21.top/Funil%20Recheios/img_upssel.png";
    logText = `[Imagem manual enviada: Oferta de Upsell]`;
  } else if (url) {
    imageUrl = url;
    logText = `[Imagem manual enviada: ${url}]`;
  }
  
  if (!imageUrl) {
    return c.json({ error: "URL da imagem inválida" }, 400);
  }
  
  let msgId: string = crypto.randomUUID();
  if (leadData.whatsapp_api_id) {
    const waId = await sendImage(db, leadData.whatsapp_api_id, leadData.phone, imageUrl, caption, c.env.KV);
    if (waId) msgId = waId;
  }
  
  await db.prepare(
    "INSERT INTO messages (id, conversation_id, content, role) VALUES (?, ?, ?, 'manual')"
  ).bind(msgId, id, logText + (caption ? ` - Legenda: ${caption}` : "")).run();
  
  await db.prepare(
    "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?"
  ).bind(id).run();

  // Notificar realtime
  try {
    const { notifyNewMessage, notifyConversationUpdated } = await import("../services/realtime-service");
    const fullContent = logText + (caption ? ` - Legenda: ${caption}` : "");
    await notifyNewMessage(c.env, id, {
      id: msgId,
      content: fullContent,
      role: 'manual',
    });
    await notifyConversationUpdated(c.env, id, {
      updated_at: new Date().toISOString()
    });
  } catch (err) {
    console.error("[ChatRoutes] Error notifying realtime image message:", err);
  }
  
  const message = await db.prepare("SELECT * FROM messages WHERE id = ?").bind(msgId).first();
  return c.json({ data: message, message: "Imagem enviada e registrada" }, 201);
});

// POST /api/chat/conversations/:id/send-video — Enviar vídeo manual com presets
chatRoutes.post("/conversations/:id/send-video", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const { url, caption, preset } = await c.req.json<{ url?: string; caption?: string; preset?: 'video2' | 'video3' }>();
  
  if (!url && !preset) {
    return c.json({ error: "É necessário fornecer um URL ou um preset ('video2'|'video3')" }, 400);
  }
  
  const leadData = await db.prepare(`
    SELECT cv.id, cv.ai_active, ct.phone, a.whatsapp_api_id
    FROM conversations cv
    JOIN contacts ct ON cv.contact_id = ct.id
    JOIN automations a ON cv.automation_id = a.id
    WHERE cv.id = ?
  `).bind(id).first<{ id: string; ai_active: number; phone: string; whatsapp_api_id: string }>();
  
  if (!leadData) {
    return c.json({ error: "Conversa não encontrada" }, 404);
  }

  if (leadData.ai_active === 1) {
    return c.json({ error: "A IA está ativa para esta conversa. Desative a IA antes de responder manualmente." }, 400);
  }
  
  let videoUrl = "";
  let logText = "";
  
  if (preset === 'video2') {
    videoUrl = "https://dados.promentor21.top/Funil%20Recheios/video2.mp4";
    logText = `[Vídeo manual enviado: Suporte (video2)]`;
  } else if (preset === 'video3') {
    videoUrl = "https://dados.promentor21.top/Funil%20Recheios/video3.mp4";
    logText = `[Vídeo manual enviado: Demonstração (video3)]`;
  } else if (url) {
    videoUrl = url;
    logText = `[Vídeo manual enviado: ${url}]`;
  }
  
  if (!videoUrl) {
    return c.json({ error: "URL do vídeo inválida" }, 400);
  }
  
  let msgId: string = crypto.randomUUID();
  if (leadData.whatsapp_api_id) {
    const waId = await sendVideo(db, leadData.whatsapp_api_id, leadData.phone, videoUrl, caption, c.env.KV);
    if (waId) msgId = waId;
  }
  
  await db.prepare(
    "INSERT INTO messages (id, conversation_id, content, role) VALUES (?, ?, ?, 'manual')"
  ).bind(msgId, id, logText + (caption ? ` - Legenda: ${caption}` : "")).run();
  
  await db.prepare(
    "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?"
  ).bind(id).run();

  // Notificar realtime
  try {
    const { notifyNewMessage, notifyConversationUpdated } = await import("../services/realtime-service");
    const fullContent = logText + (caption ? ` - Legenda: ${caption}` : "");
    await notifyNewMessage(c.env, id, {
      id: msgId,
      content: fullContent,
      role: 'manual',
    });
    await notifyConversationUpdated(c.env, id, {
      updated_at: new Date().toISOString()
    });
  } catch (err) {
    console.error("[ChatRoutes] Error notifying realtime video message:", err);
  }
  
  const message = await db.prepare("SELECT * FROM messages WHERE id = ?").bind(msgId).first();
  return c.json({ data: message, message: "Vídeo enviado e registrado" }, 201);
});

// PATCH /api/chat/conversations/:id/ai — Pausar/Ativar IA
chatRoutes.patch("/conversations/:id/ai", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const { ai_active } = await c.req.json<{ ai_active: boolean }>();
  
  await db.prepare(
    "UPDATE conversations SET ai_active = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(ai_active ? 1 : 0, id).run();

  // Notificar realtime
  try {
    const { notifyConversationUpdated } = await import("../services/realtime-service");
    await notifyConversationUpdated(c.env, id, {
      ai_active: ai_active ? 1 : 0,
      updated_at: new Date().toISOString()
    });
  } catch (err) {
    console.error("[ChatRoutes] Error notifying realtime AI toggle:", err);
  }
  
  return c.json({ message: ai_active ? "IA ativada" : "IA pausada" });
});

// PATCH /api/chat/conversations/:id/status — Alterar status
chatRoutes.patch("/conversations/:id/status", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const { status } = await c.req.json<{ status: "open" | "pending" | "finalizado_com_sucesso" | "finalizado_sem_sucesso" | "reaberto" }>();
  
  if (!status || !["open", "pending", "finalizado_com_sucesso", "finalizado_sem_sucesso", "reaberto"].includes(status)) {
    return c.json({ error: "Status deve ser 'open', 'pending', 'finalizado_com_sucesso', 'finalizado_sem_sucesso' ou 'reaberto'" }, 400);
  }
  
  await db.prepare(
    "UPDATE conversations SET status = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(status, id).run();

  // Notificar realtime
  try {
    const { notifyConversationUpdated } = await import("../services/realtime-service");
    await notifyConversationUpdated(c.env, id, {
      status,
      updated_at: new Date().toISOString()
    });
  } catch (err) {
    console.error("[ChatRoutes] Error notifying realtime status update:", err);
  }
  
  return c.json({ message: `Conversa marcada como ${status}` });
});

// POST /api/chat/conversations/:id/trigger-tool — Disparar ferramenta manual (seq1, seq2, pagamento, sistema)
chatRoutes.post("/conversations/:id/trigger-tool", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const { toolName, args } = await c.req.json<{ toolName: string; args?: Record<string, any> }>();
  
  if (!toolName || !["seq1", "seq2", "pagamento", "sistema"].includes(toolName)) {
    return c.json({ error: "Ferramenta inválida. Escolha entre 'seq1', 'seq2', 'pagamento' ou 'sistema'" }, 400);
  }

  // 1. Buscar conversa
  const conversation = await db.prepare(
    "SELECT id, contact_id, automation_id, status, ai_active FROM conversations WHERE id = ?"
  ).bind(id).first<any>();
  if (!conversation) return c.json({ error: "Conversa não encontrada" }, 404);

  if (conversation.ai_active === 1) {
    return c.json({ error: "A IA está ativa para esta conversa. Desative a IA antes de realizar disparos manuais." }, 400);
  }

  // 2. Buscar contato
  const contact = await db.prepare(
    "SELECT id, phone, name FROM contacts WHERE id = ?"
  ).bind(conversation.contact_id).first<any>();

  // 3. Buscar automação
  const automation = await db.prepare(
    "SELECT id, name, slug, domain_id, whatsapp_api_id, ocr_service_id, transcription_service_id, whatsapp_number, status, product_name, pixel_id, facebook_token, waba_id, page_id, attendant_name FROM automations WHERE id = ?"
  ).bind(conversation.automation_id).first<any>();

  // 4. Buscar/criar estado
  let state = await db.prepare(
    "SELECT * FROM conversation_state WHERE conversation_id = ?"
  ).bind(id).first<any>();
  
  if (!state) {
    const stateId = crypto.randomUUID();
    await db.prepare(
      "INSERT INTO conversation_state (id, conversation_id, automation_slug) VALUES (?, ?, ?)"
    ).bind(stateId, id, automation.slug).run();
    state = await db.prepare("SELECT * FROM conversation_state WHERE id = ?").bind(stateId).first<any>();
  }

  // 5. Buscar histórico
  const historyResult = await db.prepare(
    "SELECT role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 50"
  ).bind(id).all<any>();
  const history = (historyResult.results || []).reverse();

  // 6. Rodar executeTool
  
  const ctx: any = {
    message: {
      phone: contact.phone,
      senderName: contact.name || "Cliente",
      messageType: "text",
      textContent: `[Manual Trigger: ${toolName}]`,
      rawBody: {}
    },
    conversation,
    contact,
    automation,
    state,
    history,
    env: {
      ...c.env,
      executionCtx: c.executionCtx
    },
    baseUrl: new URL(c.req.url).origin,
    isManual: true
  };

  // Registrar env no realtime-service para acesso global na request
  try {
    const { registerEnv } = await import("../services/realtime-service");
    registerEnv(id, c.env);
  } catch (err) {
    console.error("[ChatRoutes] Error registering env:", err);
  }

  let result;
  try {
    result = await executeTool(ctx, toolName, args || {});
  } finally {
    // Desregistrar env do realtime-service
    try {
      const { unregisterEnv } = await import("../services/realtime-service");
      unregisterEnv(id);
    } catch {}
  }
  
  if (result.success) {
    // Atualizar status da conversa no banco se necessário
    if (toolName === 'seq1') {
      await db.prepare("UPDATE conversations SET status = 'open', updated_at = datetime('now') WHERE id = ?").bind(id).run();
    } else if (toolName === 'seq2') {
      await db.prepare("UPDATE conversations SET status = 'pending', updated_at = datetime('now') WHERE id = ?").bind(id).run();
    } else if (toolName === 'pagamento' || toolName === 'sistema') {
      await db.prepare("UPDATE conversations SET status = 'finalizado_com_sucesso', updated_at = datetime('now') WHERE id = ?").bind(id).run();
    }
  }

  return c.json({ success: result.success, result });
});

// POST /api/chat/conversations/:id/trigger-followup — Disparar follow-up manual (vigia, finalizador, cobrador)
chatRoutes.post("/conversations/:id/trigger-followup", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const { type } = await c.req.json<{ type: string }>();
  
  const validTypes = [
    "followup_vigia_15min",
    "followup_finalizador_12h",
    "followup_incentivador_1h",
    "followup_cobrador_amigo_10h",
    "followup_cobrador_curioso_34h",
    "followup_cobrador_final_58h",
    "upsell_5min",
    "upsell_10min"
  ];

  if (!type || !validTypes.includes(type)) {
    return c.json({ error: `Tipo inválido. Escolha entre: ${validTypes.join(", ")}` }, 400);
  }

  // 1. Buscar conversa
  const conversation = await db.prepare(
    "SELECT id, contact_id, automation_id, ai_active FROM conversations WHERE id = ?"
  ).bind(id).first<any>();
  if (!conversation) return c.json({ error: "Conversa não encontrada" }, 404);

  if (conversation.ai_active === 1) {
    return c.json({ error: "A IA está ativa para esta conversa. Desative a IA antes de realizar disparos manuais." }, 400);
  }

  // 2. Buscar contato
  const contact = await db.prepare(
    "SELECT id, phone, name FROM contacts WHERE id = ?"
  ).bind(conversation.contact_id).first<any>();

  // 3. Buscar automação
  const automation = await db.prepare(
    "SELECT id, name, slug, whatsapp_api_id FROM automations WHERE id = ?"
  ).bind(conversation.automation_id).first<any>();

  // 4. Buscar/criar estado
  let state = await db.prepare(
    "SELECT * FROM conversation_state WHERE conversation_id = ?"
  ).bind(id).first<any>();
  
  if (!state) {
    const stateId = crypto.randomUUID();
    await db.prepare(
      "INSERT INTO conversation_state (id, conversation_id, automation_slug) VALUES (?, ?, ?)"
    ).bind(stateId, id, automation.slug).run();
    state = await db.prepare("SELECT * FROM conversation_state WHERE id = ?").bind(stateId).first<any>();
  }

  const followupData = {
    id: crypto.randomUUID(),
    conversation_id: id,
    type,
    phase: state.phase || "inicio",
    payment_confirmed: state.payment_confirmed || 0,
    total_paid: state.total_paid || 0,
    seq2_called: state.seq2_called || 0,
    oferta_19_90_feita: state.oferta_19_90_feita || 0,
    phone: contact.phone,
    contact_name: contact.name || "amiga",
    whatsapp_api_id: automation.whatsapp_api_id,
    automation_id: automation.id,
    automation_slug: automation.slug
  };

  // Registrar env no realtime-service para acesso global na request
  try {
    const { registerEnv } = await import("../services/realtime-service");
    registerEnv(id, c.env);
  } catch (err) {
    console.error("[ChatRoutes] Error registering env:", err);
  }

  try {
    await executeFollowup({ ...c.env, executionCtx: c.executionCtx } as any, followupData);
  } finally {
    // Desregistrar env do realtime-service
    try {
      const { unregisterEnv } = await import("../services/realtime-service");
      unregisterEnv(id);
    } catch {}
  }

  // Se for o cobrador final ou finalizador, marca a conversa como finalizado_sem_sucesso no banco
  if (type === 'followup_finalizador_12h' || type === 'followup_cobrador_final_58h') {
    await db.prepare("UPDATE conversations SET status = 'finalizado_sem_sucesso', updated_at = datetime('now') WHERE id = ?").bind(id).run();
  }

  return c.json({ success: true, message: `Follow-up ${type} disparado com sucesso` });
});

// DELETE /api/chat/messages/:id — Excluir uma mensagem no painel e no WhatsApp do lead
chatRoutes.delete("/messages/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  
  // Buscar a mensagem para obter o conversation_id e o role
  const message = await db.prepare(
    "SELECT conversation_id, role FROM messages WHERE id = ?"
  ).bind(id).first<{ conversation_id: string; role: string }>();
  
  if (!message) {
    return c.json({ error: "Mensagem não encontrada" }, 404);
  }

  // Buscar dados da conversa, do contato e da API WhatsApp correspondente
  const leadData = await db.prepare(`
    SELECT cv.id, ct.phone, a.whatsapp_api_id
    FROM conversations cv
    JOIN contacts ct ON cv.contact_id = ct.id
    JOIN automations a ON cv.automation_id = a.id
    WHERE cv.id = ?
  `).bind(message.conversation_id).first<{ id: string; phone: string; whatsapp_api_id: string }>();

  if (leadData && leadData.whatsapp_api_id && message.role !== 'user') {
    // Apenas tentar deletar no WhatsApp se não for uma mensagem enviada pelo próprio lead ('user')
    console.log(`[ChatRoute] Iniciando exclusão remota da mensagem ${id} para o lead ${leadData.phone}`);
    try {
      await deleteWhatsAppMessage(db, leadData.whatsapp_api_id, leadData.phone, id, c.env.KV);
    } catch (waError) {
      console.error("[ChatRoute] Erro ao tentar excluir mensagem no WhatsApp:", waError);
    }
  }
  
  // Excluir a mensagem do D1 SQLite
  await db.prepare(
    "DELETE FROM messages WHERE id = ?"
  ).bind(id).run();
  
  // Atualizar data de atualização da conversa
  await db.prepare(
    "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?"
  ).bind(message.conversation_id).run();
  
  return c.json({ success: true, message: "Mensagem excluída com sucesso do histórico." });
});

// GET /api/chat/websocket — Estabelecer canal WebSocket realtime
chatRoutes.get("/websocket", async (c) => {
  if (!c.env.CHAT_ROOM) {
    return c.text("Durable Object CHAT_ROOM binding not found", 500);
  }
  
  const upgradeHeader = c.req.header("Upgrade");
  if (upgradeHeader !== "websocket") {
    return c.text("Expected Upgrade: websocket", 426);
  }
  
  const id = c.env.CHAT_ROOM.idFromName("global");
  const room = c.env.CHAT_ROOM.get(id);
  
  // Alterar a URL para casar com a rota "/websocket" esperada pelo DO
  const doUrl = new URL(c.req.url);
  doUrl.pathname = "/websocket";
  
  return room.fetch(new Request(doUrl.toString(), c.req.raw));
});

