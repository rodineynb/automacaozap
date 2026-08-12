import { Hono } from "hono";
import type { Env } from "../app";

export const dashboardRoutes = new Hono<{ Bindings: Env }>();

// GET /api/dashboard/stats — Métricas gerais do dashboard
dashboardRoutes.get("/stats", async (c) => {
  const db = c.env.DB;
  
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  
  // Total de conversas ativas hoje
  const activeToday = await db.prepare(
    "SELECT COUNT(*) as count FROM conversations WHERE date(updated_at) = ? AND status NOT IN ('finalizado_com_sucesso', 'finalizado_sem_sucesso')"
  ).bind(today).first<{ count: number }>();
  
  // Total de conversas resolvidas hoje
  const resolvedToday = await db.prepare(
    "SELECT COUNT(*) as count FROM conversations WHERE date(updated_at) = ? AND status IN ('finalizado_com_sucesso', 'finalizado_sem_sucesso')"
  ).bind(today).first<{ count: number }>();
  
  // Mensagens da IA vs manual hoje
  const aiMessages = await db.prepare(
    "SELECT COUNT(*) as count FROM messages WHERE date(created_at) = ? AND role = 'assistant'"
  ).bind(today).first<{ count: number }>();
  
  const manualMessages = await db.prepare(
    "SELECT COUNT(*) as count FROM messages WHERE date(created_at) = ? AND role = 'manual'"
  ).bind(today).first<{ count: number }>();
  
  // Automação mais movimentada hoje
  const busiestAutomation = await db.prepare(`
    SELECT a.name, COUNT(m.id) as message_count
    FROM messages m
    JOIN conversations cv ON m.conversation_id = cv.id
    JOIN automations a ON cv.automation_id = a.id
    WHERE date(m.created_at) = ?
    GROUP BY a.id
    ORDER BY message_count DESC
    LIMIT 1
  `).bind(today).first<{ name: string; message_count: number }>();
  
  // Alertas de falha (últimas 24h)
  const recentErrors = await db.prepare(
    "SELECT COUNT(*) as count FROM error_logs WHERE created_at >= datetime('now', '-24 hours')"
  ).first<{ count: number }>();
  
  const errorDetails = await db.prepare(`
    SELECT el.*, a.name as automation_name
    FROM error_logs el
    JOIN automations a ON el.automation_id = a.id
    WHERE el.created_at >= datetime('now', '-24 hours')
    ORDER BY el.created_at DESC
    LIMIT 10
  `).all();
  
  // Últimas conversas recentes
  const recentConversations = await db.prepare(`
    SELECT 
      cv.id,
      cv.status,
      cv.ai_active,
      cv.updated_at,
      ct.phone,
      ct.name as contact_name,
      a.name as automation_name,
      (SELECT content FROM messages WHERE conversation_id = cv.id ORDER BY created_at DESC LIMIT 1) as last_message
    FROM conversations cv
    JOIN contacts ct ON cv.contact_id = ct.id
    JOIN automations a ON cv.automation_id = a.id
    ORDER BY cv.updated_at DESC
    LIMIT 10
  `).all();
  
  // Total de automações ativas/pausadas
  const automationStats = await db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN status = 'paused' THEN 1 ELSE 0 END) as paused
    FROM automations
  `).first<{ total: number; active: number; paused: number }>();
  
  // Total de conversas por status
  const conversationStats = await db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status IN ('finalizado_com_sucesso', 'finalizado_sem_sucesso') THEN 1 ELSE 0 END) as resolved,
      SUM(CASE WHEN status = 'reaberto' THEN 1 ELSE 0 END) as reaberto
    FROM conversations
  `).first<{ total: number; open: number; pending: number; resolved: number; reaberto: number }>();
  
  return c.json({
    today: {
      active_conversations: activeToday?.count || 0,
      resolved_conversations: resolvedToday?.count || 0,
      ai_messages: aiMessages?.count || 0,
      manual_messages: manualMessages?.count || 0,
      busiest_automation: busiestAutomation || null,
    },
    alerts: {
      error_count: recentErrors?.count || 0,
      errors: errorDetails.results,
    },
    recent_conversations: recentConversations.results,
    automations: automationStats || { total: 0, active: 0, paused: 0 },
    conversations: conversationStats ? {
      total: conversationStats.total || 0,
      open: conversationStats.open || 0,
      pending: conversationStats.pending || 0,
      resolved: conversationStats.resolved || 0,
      reaberto: conversationStats.reaberto || 0
    } : { total: 0, open: 0, pending: 0, resolved: 0, reaberto: 0 },
  });
});
