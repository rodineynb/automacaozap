import { Hono } from "hono";
import { cors } from "hono/cors";
import { createRequestHandler } from "react-router";
import { authRoutes } from "./routes/auth";
import { settingsRoutes } from "./routes/settings";
import { automationsRoutes } from "./routes/automations";
import { chatRoutes } from "./routes/chat";
import { dashboardRoutes } from "./routes/dashboard";
import { analyticsRoutes } from "./routes/analytics";
import { webhookRoutes } from "./routes/webhooks";
import { productsRoutes } from "./routes/products";
import { reportsRoutes, cleanupOldFallbackLogs } from "./routes/reports";
import { crmRoutes, processCrmScheduled } from "./routes/crm";
import { followupRoutes } from "./routes/followup";
import { usersRoutes } from "./routes/users";
import { funnelMessagesRoutes } from "./routes/funnel-messages";
import { authMiddleware } from "./middleware/auth";
import { registerAutomation } from "./automation-engine";
import { processScheduledFollowups } from "./automations/recheios/followups";
import { setApp } from "./services/app-registry";

// ── Registrar módulos de automação ──────────────────────────
// Cada automação é registrada pelo seu slug (mesmo do banco)
// O import dinâmico garante que o módulo só é carregado quando necessário
registerAutomation('recheios', async () => {
  const mod = await import('./automations/recheios/index');
  return mod.default;
});

registerAutomation('recheios-09011', async () => {
  const mod = await import('./automations/recheios/index');
  return mod.default;
});

export type Env = {
  DB: D1Database;
  STORAGE: R2Bucket;
  KV: KVNamespace;
  CHAT_ROOM: DurableObjectNamespace;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  APP_NAME: string;
  executionCtx?: any;
};

const app = new Hono<{ Bindings: Env; Variables: { userId: string; userEmail: string } }>();
setApp(app);

// Injetar a instância do Hono no c.env para permitir chamadas locais (in-process loopbacks)
app.use("*", async (c, next) => {
  (c.env as any).app = app;
  await next();
});

// CORS
app.use("/api/*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// Webhooks — sem autenticação (acesso externo)
app.route("/api/webhook", webhookRoutes);

// Servir Mídia do R2 publicamente sem autenticação
app.get("/api/media/*", async (c) => {
  const path = c.req.path.replace(/^\/api\/media\//, "");
  const object = await c.env.STORAGE.get(path);
  
  if (!object) {
    return c.text("Arquivo não encontrado", 404);
  }
  
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Access-Control-Allow-Origin", "*");
  
  return c.body(object.body, 200, Object.fromEntries(headers.entries()));
});

// Middleware de autenticação para todas as rotas /api/* exceto login, webhooks e media
app.use("/api/*", authMiddleware);

// Rotas da API
app.route("/api/auth", authRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/automations", automationsRoutes);
app.route("/api/products", productsRoutes);
app.route("/api/chat", chatRoutes);
app.route("/api/dashboard", dashboardRoutes);
app.route("/api/analytics", analyticsRoutes);
app.route("/api/reports", reportsRoutes);
app.route("/api/crm", crmRoutes);
app.route("/api/followup", followupRoutes);
app.route("/api/users", usersRoutes);
app.route("/api/funnel-messages", funnelMessagesRoutes);

// React Router — serve o frontend para todas as outras rotas
app.get("*", (c) => {
  const requestHandler = createRequestHandler(
    () => import("virtual:react-router/server-build"),
    import.meta.env.MODE
  );

  return requestHandler(c.req.raw, {
    cloudflare: { env: c.env, ctx: c.executionCtx },
  });
});

/**
 * Monitor de Status WhatsApp — executa a cada 5 minutos no cron.
 * Verifica o status de cada API e envia alerta se detectar desconexão.
 */
async function monitorWhatsAppStatus(env: Env) {
  const ADMIN_PHONE = '5522998513392';
  try {
    const { checkAllApisStatus, sendText } = await import('./services/whatsapp-service');
    const statuses = await checkAllApisStatus(env.DB);

    for (const status of statuses) {
      const kvKey = `whatsapp_status:${status.id}`;
      const alertKey = `whatsapp_alert_sent:${status.id}`;
      const previousState = await env.KV.get(kvKey);

      // Salvar estado atual no KV (TTL de 15 minutos)
      await env.KV.put(kvKey, status.connected ? 'connected' : 'disconnected', { expirationTtl: 900 });

      if (!status.connected) {
        // Verificar se já enviamos alerta para esta desconexão
        const alertSent = await env.KV.get(alertKey);
        if (alertSent) {
          console.log(`[Monitor WhatsApp] API "${status.name}" continua desconectada. Alerta já enviado.`);
          continue;
        }

        console.warn(`[Monitor WhatsApp] ⚠️ API "${status.name}" DESCONECTADA! Detalhes: ${status.details}`);

        // Tentar enviar alerta via OUTRA API conectada
        const connectedApi = statuses.find(s => s.connected && s.id !== status.id);
        if (connectedApi) {
          try {
            const alertMsg = `⚠️ *ALERTA AUTOMÁTICO*\n\nA API WhatsApp *"${status.name}"* está *DESCONECTADA*.\n\nDetalhes: ${status.details}\nHorário: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\nAcesse o painel da Uazapi para reconectar a sessão.`;
            await sendText(env.DB, connectedApi.id, ADMIN_PHONE, alertMsg, env.KV);
            console.log(`[Monitor WhatsApp] Alerta enviado para ${ADMIN_PHONE} via API "${connectedApi.name}"`);
          } catch (sendErr) {
            console.error(`[Monitor WhatsApp] Falha ao enviar alerta via ${connectedApi.name}:`, sendErr);
          }
        } else {
          console.error(`[Monitor WhatsApp] Nenhuma API conectada disponível para enviar alerta!`);
        }

        // Marcar alerta como enviado (TTL de 30 minutos para evitar spam)
        await env.KV.put(alertKey, 'true', { expirationTtl: 1800 });

      } else if (previousState === 'disconnected') {
        // API voltou! Enviar notificação de recuperação
        console.log(`[Monitor WhatsApp] ✅ API "${status.name}" RECONECTADA!`);
        // Limpar flag de alerta
        await env.KV.delete(`whatsapp_alert_sent:${status.id}`);

        try {
          const recoveryMsg = `✅ *API RECONECTADA*\n\nA API WhatsApp *"${status.name}"* voltou a ficar *ONLINE*.\n\nHorário: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
          await sendText(env.DB, status.id, ADMIN_PHONE, recoveryMsg, env.KV);
        } catch (sendErr) {
          console.error(`[Monitor WhatsApp] Falha ao enviar notificação de recuperação:`, sendErr);
        }
      }
    }
  } catch (err) {
    console.error('[Monitor WhatsApp] Erro no monitor de status:', err);
  }
}

export default {
  fetch: app.fetch,

  // Cron Trigger — processa follow-ups e limpa logs antigos a cada 5 minutos
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const envWithCtx = { ...env, executionCtx: ctx };
    ctx.waitUntil(
      Promise.all([
        processScheduledFollowups(envWithCtx),
        cleanupOldFallbackLogs(env.DB),
        processCrmScheduled(envWithCtx),
        monitorWhatsAppStatus(env)
      ])
    );
  },
};

// Export do Durable Object
export { ChatRoom } from "./durable-objects/chat-room";
