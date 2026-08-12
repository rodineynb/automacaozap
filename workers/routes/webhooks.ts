import { Hono } from "hono";
import type { Env } from "../app";
import { processMessage, processMessageAsync } from "../automation-engine";
import { processScheduledFollowups } from "../automations/recheios/followups";
import { getCachedAutomation } from "../services/cache-service";
import { getApp } from "../services/app-registry";

export const webhookRoutes = new Hono<{ Bindings: Env }>();

// Middleware de diagnóstico: loga QUALQUER request que chega às rotas de webhook
webhookRoutes.use("/*", async (c, next) => {
  const method = c.req.method;
  const path = c.req.path;
  const userAgent = c.req.header("user-agent") || "unknown";
  const contentType = c.req.header("content-type") || "none";
  const contentLength = c.req.header("content-length") || "0";
  
  console.log(`[Webhook] >>> ${method} ${path} | UA: ${userAgent} | CT: ${contentType} | CL: ${contentLength}`);
  
  await next();
  
  console.log(`[Webhook] <<< ${method} ${path} | Status: ${c.res.status}`);
});

// GET /api/webhook/health — Endpoint de diagnóstico (sem parâmetro slug)
webhookRoutes.get("/health", async (c) => {
  return c.json({ 
    status: "ok", 
    message: "Webhook endpoint is alive",
    timestamp: new Date().toISOString(),
  });
});

// POST /api/webhook/:slug — Recebe mensagens WhatsApp
webhookRoutes.post("/:slug", async (c) => {
  const db = c.env.DB;
  const slug = c.req.param("slug");
  
  console.log(`[Webhook] Slug recebido: "${slug}"`);
  
  // Buscar automação pelo slug (usando cache KV)
  const automation = await getCachedAutomation(db, c.env.KV, slug);
  
  if (!automation) {
    console.error(`[Webhook] Automação não encontrada para slug: "${slug}"`);
    return c.json({ error: "Automação não encontrada" }, 404);
  }
  
  console.log(`[Webhook] Automação encontrada: ${automation.name} (${automation.id})`);
  
  // Receber os dados da mensagem
  let body: any;
  try {
    body = await c.req.json();
    console.log(`[Webhook] Body parsed com sucesso. Keys: ${Object.keys(body).join(', ')}`);
    
    // Log detalhado do payload UAZAPI v2 (uazapiGO)
    if (body.chat) {
      console.log(`[Webhook] chat keys: ${Object.keys(body.chat).join(', ')}`);
      console.log(`[Webhook] chat.phone: ${body.chat.phone || body.chat.jid || body.chat.id || 'N/A'}`);
    }
    if (body.message) {
      const msgKeys = typeof body.message === 'object' ? Object.keys(body.message).join(', ') : typeof body.message;
      console.log(`[Webhook] message keys: ${msgKeys}`);
    }
    console.log(`[Webhook] EventType: ${body.EventType || body.eventType || 'N/A'}`);
    console.log(`[Webhook] owner: ${body.owner || 'N/A'}`);
    console.log(`[Webhook] FULL BODY: ${JSON.stringify(body).substring(0, 1500)}`);
    
    // Log resumido do payload (sem dados sensíveis)
    const phone = body.phone || body.from || body.chat?.phone || body.chat?.jid || body.data?.key?.remoteJid || 'N/A';
    const type = body.type || body.event || body.EventType || 'N/A';
    const fromMe = body.fromMe ?? body.isFromMe ?? body.message?.fromMe ?? 'N/A';
    console.log(`[Webhook] Payload: phone=${phone}, type=${type}, fromMe=${fromMe}`);
  } catch (parseError) {
    console.error(`[Webhook] ERRO ao parsear body JSON:`, parseError);
    return c.json({ error: "Body inválido" }, 400);
  }
  
  try {
    const urlObj = new URL(c.req.url);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
    const envWithCtx = { ...c.env, executionCtx: c.executionCtx, baseUrl, app: getApp() };

    // Processar mensagem pelo automation-engine
    const result = await processMessage({
      env: envWithCtx,
      automation,
      body,
    });

    console.log(`[Webhook] Resultado do processMessage: status=${result.status}, phone=${result.phone}, msg=${result.message}`);

    // Se o engine sinalizou para processar, agendar processamento assíncrono
    if (result.status === 'processing' && result.phone) {
      c.executionCtx.waitUntil(
        processMessageAsync(envWithCtx, automation, result.phone, slug)
      );
    }

    return c.json({
      status: result.status,
      automation: automation.name,
      message: result.message,
    });
    
  } catch (error) {
    console.error(`[Webhook] ERRO CRÍTICO no processamento:`, error);
    
    // Registrar erro
    await db.prepare(
      "INSERT INTO error_logs (id, automation_id, error_type, error_message) VALUES (?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), automation.id, "webhook_error", String(error)).run();
    
    return c.json({ error: "Erro ao processar mensagem" }, 500);
  }
});

// GET /api/webhook/:slug — Verificação do webhook (usado por algumas APIs)
webhookRoutes.get("/:slug", async (c) => {
  const challenge = c.req.query("hub.challenge");
  if (challenge) return c.text(challenge);
  return c.json({ status: "ok", message: "Webhook ativo" });
});

// POST /api/webhook/cron/followups — Executa follow-ups pendentes
// Deve ser chamado por um Cron Trigger do Cloudflare a cada 5 minutos
webhookRoutes.post("/cron/followups", async (c) => {
  try {
    const envWithCtx = { ...c.env, executionCtx: c.executionCtx };
    const processed = await processScheduledFollowups(envWithCtx);
    return c.json({ status: "ok", processed });
  } catch (error) {
    console.error("[Cron] Erro ao processar follow-ups:", error);
    return c.json({ error: "Erro ao processar follow-ups" }, 500);
  }
});
