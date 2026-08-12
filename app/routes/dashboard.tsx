import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth, useApi } from "../contexts/auth-context";
import { AppLayout } from "../components/layout";

interface DashboardStats {
  today: {
    active_conversations: number;
    resolved_conversations: number;
    ai_messages: number;
    manual_messages: number;
    busiest_automation: { name: string; message_count: number } | null;
  };
  alerts: {
    error_count: number;
    errors: Array<{ id: string; automation_name: string; error_type: string; error_message: string; created_at: string }>;
  };
  recent_conversations: Array<{
    id: string; status: string; contact_name: string; phone: string;
    automation_name: string; last_message: string; updated_at: string;
  }>;
  automations: { total: number; active: number; paused: number };
  conversations: { total: number; open: number; pending: number; resolved: number; reaberto: number };
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, isLoading: authLoading } = useAuth();
  const { apiFetch } = useApi();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) loadStats();
  }, [user]);

  async function loadStats() {
    try {
      const res = await apiFetch("/dashboard/stats");
      if (res.ok) {
        const data = await res.json() as DashboardStats;
        setStats(data);
      }
    } catch (err) {
      console.error("Erro ao carregar dashboard:", err);
    }
    setLoading(false);
  }

  if (authLoading || !user) return null;

  return (
    <AppLayout title="Dashboard">
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "80px" }}>
          <div className="spinner" style={{ width: "40px", height: "40px" }} />
        </div>
      ) : stats ? (
        <div>
          {/* Stat Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "20px", marginBottom: "32px" }}>
            <div className="stat-card">
              <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Conversas Ativas Hoje
              </div>
              <div className="stat-number count-up gradient-text">
                {stats.today.active_conversations}
              </div>
              <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                {stats.today.resolved_conversations} resolvidas
              </div>
            </div>

            <div className="stat-card">
              <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Respostas da IA
              </div>
              <div className="stat-number count-up" style={{ color: "var(--color-success)" }}>
                {stats.today.ai_messages}
              </div>
              <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                {stats.today.manual_messages} manuais
              </div>
            </div>

            <div className="stat-card">
              <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Automações
              </div>
              <div className="stat-number count-up" style={{ color: "var(--color-brand-400)" }}>
                {stats.automations.total}
              </div>
              <div style={{ display: "flex", gap: "12px", fontSize: "13px" }}>
                <span style={{ color: "var(--color-success)" }}>{stats.automations.active} ativas</span>
                <span style={{ color: "var(--color-warning)" }}>{stats.automations.paused} pausadas</span>
              </div>
            </div>

            <div className="stat-card">
              <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Alertas
              </div>
              <div className="stat-number count-up" style={{ color: stats.alerts.error_count > 0 ? "var(--color-danger)" : "var(--color-success)" }}>
                {stats.alerts.error_count}
              </div>
              <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                últimas 24h
              </div>
            </div>
          </div>

          {/* Busiest Automation */}
          {stats.today.busiest_automation && (
            <div className="glass-card" style={{ padding: "20px 24px", marginBottom: "24px", display: "flex", alignItems: "center", gap: "16px" }}>
              <div style={{ fontSize: "24px" }}>🔥</div>
              <div>
                <div style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>Automação mais movimentada hoje</div>
                <div style={{ fontSize: "16px", fontWeight: "700" }}>
                  {stats.today.busiest_automation.name}
                  <span style={{ color: "var(--color-brand-400)", marginLeft: "8px", fontSize: "14px" }}>
                    {stats.today.busiest_automation.message_count} mensagens
                  </span>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
            {/* Recent Conversations */}
            <div className="glass-card" style={{ padding: "24px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: "700", marginBottom: "20px" }}>
                Conversas Recentes
              </h3>
              {stats.recent_conversations.length === 0 ? (
                <div className="empty-state" style={{ padding: "40px 20px" }}>
                  <div className="empty-state-icon">💬</div>
                  <div className="empty-state-title">Nenhuma conversa ainda</div>
                  <div className="empty-state-text">As conversas aparecerão aqui quando mensagens forem recebidas</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {stats.recent_conversations.map((conv) => (
                    <div
                      key={conv.id}
                      onClick={() => navigate(`/chat/${conv.id}`)}
                      style={{
                        padding: "14px 16px",
                        borderRadius: "12px",
                        background: "rgba(255,255,255,0.03)",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        border: "1px solid transparent"
                      }}
                      onMouseEnter={(e) => {
                        (e.target as HTMLElement).style.borderColor = "rgba(12,147,242,0.2)";
                        (e.target as HTMLElement).style.background = "rgba(255,255,255,0.05)";
                      }}
                      onMouseLeave={(e) => {
                        (e.target as HTMLElement).style.borderColor = "transparent";
                        (e.target as HTMLElement).style.background = "rgba(255,255,255,0.03)";
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <span style={{ fontWeight: "600", fontSize: "14px" }}>
                          {conv.contact_name || conv.phone}
                        </span>
                        <span className={`badge badge-${
                          conv.status === 'open' ? 'info' : 
                          conv.status === 'pending' ? 'warning' : 
                          conv.status === 'reaberto' ? 'reaberto' :
                          conv.status === 'finalizado_com_sucesso' ? 'success' : 'danger'
                        }`}>
                          {conv.status === 'open' ? 'Aberta' : 
                           conv.status === 'pending' ? 'Pendente' : 
                           conv.status === 'reaberto' ? 'Re-aberta' :
                           conv.status === 'finalizado_com_sucesso' ? 'Finalizado (Pago)' : 'Finalizado (Sem Compra)'}
                        </span>
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "4px" }}>
                        {conv.automation_name}
                      </div>
                      <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {conv.last_message || "..."}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Alerts */}
            <div className="glass-card" style={{ padding: "24px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: "700", marginBottom: "20px" }}>
                Alertas de Falha
              </h3>
              {stats.alerts.errors.length === 0 ? (
                <div className="empty-state" style={{ padding: "40px 20px" }}>
                  <div className="empty-state-icon">✅</div>
                  <div className="empty-state-title">Tudo funcionando!</div>
                  <div className="empty-state-text">Nenhuma falha nas últimas 24 horas</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {stats.alerts.errors.map((err) => (
                    <div key={err.id} style={{
                      padding: "14px 16px",
                      borderRadius: "12px",
                      background: "rgba(239,68,68,0.06)",
                      border: "1px solid rgba(239,68,68,0.15)"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <span style={{ fontWeight: "600", fontSize: "14px", color: "var(--color-danger)" }}>
                          {err.error_type}
                        </span>
                        <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                          {err.automation_name}
                        </span>
                      </div>
                      <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                        {err.error_message}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Conversation Stats Bar */}
          <div className="glass-card" style={{ padding: "24px", marginTop: "24px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "700", marginBottom: "16px" }}>
              Conversas por Status
            </h3>
            <div style={{ display: "flex", gap: "24px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>Abertas</span>
                  <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--color-info)" }}>{stats.conversations.open}</span>
                </div>
                <div style={{ height: "6px", borderRadius: "3px", background: "var(--color-surface-600)" }}>
                  <div style={{
                    height: "100%", borderRadius: "3px", background: "var(--color-info)",
                    width: `${stats.conversations.total > 0 ? (stats.conversations.open / stats.conversations.total) * 100 : 0}%`,
                    transition: "width 0.8s ease"
                  }} />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>Pendentes</span>
                  <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--color-warning)" }}>{stats.conversations.pending}</span>
                </div>
                <div style={{ height: "6px", borderRadius: "3px", background: "var(--color-surface-600)" }}>
                  <div style={{
                    height: "100%", borderRadius: "3px", background: "var(--color-warning)",
                    width: `${stats.conversations.total > 0 ? (stats.conversations.pending / stats.conversations.total) * 100 : 0}%`,
                    transition: "width 0.8s ease"
                  }} />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>Re-abertas</span>
                  <span style={{ fontSize: "13px", fontWeight: "600", color: "#a855f7" }}>{stats.conversations.reaberto || 0}</span>
                </div>
                <div style={{ height: "6px", borderRadius: "3px", background: "var(--color-surface-600)" }}>
                  <div style={{
                    height: "100%", borderRadius: "3px", background: "#a855f7",
                    width: `${stats.conversations.total > 0 ? ((stats.conversations.reaberto || 0) / stats.conversations.total) * 100 : 0}%`,
                    transition: "width 0.8s ease"
                  }} />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>Resolvidas</span>
                  <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--color-success)" }}>{stats.conversations.resolved}</span>
                </div>
                <div style={{ height: "6px", borderRadius: "3px", background: "var(--color-surface-600)" }}>
                  <div style={{
                    height: "100%", borderRadius: "3px", background: "var(--color-success)",
                    width: `${stats.conversations.total > 0 ? (stats.conversations.resolved / stats.conversations.total) * 100 : 0}%`,
                    transition: "width 0.8s ease"
                  }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <div className="empty-state-title">Erro ao carregar dados</div>
          <div className="empty-state-text">Tente recarregar a página</div>
        </div>
      )}
    </AppLayout>
  );
}
