import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { useAuth, useApi } from "../contexts/auth-context";
import { AppLayout } from "../components/layout";

// Components
import MetricCards from "../components/dashboard/MetricCards";
import LeadsChart from "../components/dashboard/LeadsChart";
import CriativosChart from "../components/dashboard/CriativosChart";
import CampanhasChart from "../components/dashboard/CampanhasChart";
import FunnelChart from "../components/dashboard/FunnelChart";
import LeadsTable from "../components/dashboard/LeadsTable";
import AnalyticsChart from "../components/dashboard/AnalyticsChart";

// Icons
import {
  BarChart3, LayoutDashboard, TrendingUp, Megaphone,
  Target, Filter as FilterIcon, Table2, Calendar, Download, RefreshCw, Clock, MessageSquareText
} from "lucide-react";

import type { Metrics, Criativo, LeadPorDia, Campanha, Funil, LeadsResponse, Filtros, FiltersState, Analytics } from "../types/dashboard";

type SectionId = "overview" | "criativos" | "campanhas" | "analytics" | "followup_metrics" | "crm_metrics";

interface CrmDashboardMetrics {
  total_sent: number;
  total_answered: number;
  response_rate: number;
  by_flow_type: Array<{ flow_type: string; total: number; answered: number }>;
  by_product: Array<{
    automation_id: string;
    automation_name: string;
    product_id: string;
    product_name: string;
    health_score: number;
    total_sent: number;
    total_answered: number;
    response_rate: number;
  }>;
}

interface NavItem {
  id: SectionId;
  label: string;
  icon: React.ReactNode;
}

const REENGAJAMENTO_TYPES = [
  "followup_vigia_15min",
  "followup_finalizador_12h",
];
const COBRANCA_TYPES = [
  "followup_incentivador_1h",
  "followup_cobrador_amigo_10h",
  "followup_cobrador_curioso_34h",
  "followup_cobrador_final_58h",
];

function typeBadgeColor(type: string): string {
  if (type.includes("vigia")) return "#f59e0b";
  if (type.includes("finalizador")) return "#ef4444";
  if (type.includes("incentivador")) return "#10b981";
  if (type.includes("cobrador_amigo")) return "#0c93f2";
  if (type.includes("cobrador_curioso")) return "#c084fc";
  if (type.includes("cobrador_final")) return "#f97316";
  if (type.includes("upsell")) return "#06b6d4";
  return "#6b7280";
}

function typeShortLabel(type: string): string {
  const map: Record<string, string> = {
    followup_vigia_15min: "Vigia",
    followup_finalizador_12h: "Finalizador",
    followup_incentivador_1h: "Incentivador",
    followup_cobrador_amigo_10h: "Cobrador Amigo",
    followup_cobrador_curioso_34h: "Cobrador Curioso",
    followup_cobrador_final_58h: "Cobrador Final",
    upsell_5min: "Upsell 5min",
    upsell_10min: "Upsell 10min",
  };
  return map[type] || type;
}

const DATE_PRESETS = [
  { label: "Hoje", days: 0 },
  { label: "Ontem", days: 1 },
  { label: "7D", days: 7 },
  { label: "14D", days: 14 },
  { label: "30D", days: 30 },

];

function getSpDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function calcPresetDates(days: number): { start: string; end: string } {
  const now = new Date();
  const todaySP = getSpDate(now);
  if (days === 0) return { start: todaySP, end: todaySP };
  if (days === 1) {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    return { start: getSpDate(y), end: getSpDate(y) };
  }
  const s = new Date();
  s.setDate(s.getDate() - days);
  return { start: getSpDate(s), end: todaySP };
}

function flowLabel(type: string | null | undefined): string {
  if (!type) return "⚡ Outro";
  if (type === "satisfaction") return "😊 Satisfação";
  if (type === "testimonial") return "🎬 Depoimento";
  if (type === "objection") return "🔍 Objeções";
  return `⚡ ${type.charAt(0).toUpperCase() + type.slice(1)}`;
}

function getHealthColor(score: number): string {
  if (score >= 8) return "#10b981";
  if (score >= 6) return "#f59e0b";
  if (score >= 4) return "#f97316";
  return "#ef4444";
}

export default function PerformancePage() {
  const { user, isLoading: authLoading } = useAuth();
  const { apiFetch } = useApi();
  const navigate = useNavigate();

  // Navigation
  const [activeSection, setActiveSection] = useState<SectionId>("overview");

  // Periods per section
  const [periods, setPeriods] = useState<Record<SectionId, { start: string; end: string; activeDays: number }>>({
    overview: { ...calcPresetDates(0), activeDays: 0 },
    criativos: { ...calcPresetDates(0), activeDays: 0 },
    campanhas: { ...calcPresetDates(0), activeDays: 0 },
    analytics: { ...calcPresetDates(0), activeDays: 0 },
    followup_metrics: { ...calcPresetDates(0), activeDays: 0 },
    crm_metrics: { ...calcPresetDates(0), activeDays: 0 },
  });

  // Section extra filters
  const [filtroVolume, setFiltroVolume] = useState({ produto: "", pago: "" });
  const [filtroCriativo, setFiltroCriativo] = useState({ campanha: "" });
  const [filtroCampanha, setFiltroCampanha] = useState({ produto: "" });
  
  // CRM Dashboard Metrics States
  const [crmMetrics, setCrmMetrics] = useState<CrmDashboardMetrics | null>(null);
  const [loadingCrmMetrics, setLoadingCrmMetrics] = useState(false);
  const [selectedAutomationId, setSelectedAutomationId] = useState<string>("");

  // Options for filters
  const [options, setOptions] = useState<Filtros>({ campanhas: [], anuncios: [], produtos: [] });

  // Data states
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [leadsPorDia, setLeadsPorDia] = useState<LeadPorDia[]>([]);
  const [criativos, setCriativos] = useState<Criativo[]>([]);
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [funil, setFunil] = useState<Funil | null>(null);
  const [leads, setLeads] = useState<LeadsResponse | null>(null);
  const [analyticsData, setAnalyticsData] = useState<Analytics | null>(null);
  
  // Follow-up States
  const [dashData, setDashData] = useState<any | null>(null);
  const [loadingDash, setLoadingDash] = useState(false);
  const [followupAutomations, setFollowupAutomations] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);



  // Load filter options on mount
  useEffect(() => {
    if (user) {
      loadFiltros();
      loadFollowupAutomations();
    }
  }, [user]);

  async function loadFollowupAutomations() {
    try {
      const res = await apiFetch("/followup/automations");
      if (res.ok) {
        const data = (await res.json()) as { data: any[] };
        setFollowupAutomations(data.data || []);
      }
    } catch (err) {
      console.error("Erro ao carregar automações de follow-up:", err);
    }
  }

  async function loadFiltros() {
    try {
      const res = await apiFetch("/analytics/filtros");
      if (res.ok) {
        const data = await res.json() as Filtros;
        setOptions(data);
      }
    } catch (err) {
      console.error("Erro ao carregar filtros:", err);
    }
  }

  const currentPeriod = periods[activeSection];

  const handlePreset = (days: number) => {
    const dates = calcPresetDates(days);
    setPeriods(prev => ({ ...prev, [activeSection]: { ...dates, activeDays: days } }));
  };

  const handleCustomDate = (field: "start" | "end", value: string) => {
    setPeriods(prev => ({ ...prev, [activeSection]: { ...prev[activeSection], [field]: value, activeDays: -1 } }));
  };

  // Build request parameters
  function buildParams(sectionFilters: any): URLSearchParams {
    const params = new URLSearchParams();
    const p = periods[activeSection];
    
    params.set("data_inicio", p.start);
    params.set("data_fim", p.end);
    
    if (sectionFilters.campanhas) params.set("campanha", sectionFilters.campanhas);
    if (sectionFilters.anuncios) params.set("anuncio", sectionFilters.anuncios);
    if (sectionFilters.produto) params.set("produto", sectionFilters.produto);
    if (sectionFilters.pago) params.set("pago", sectionFilters.pago);
    if (sectionFilters.busca) params.set("busca", sectionFilters.busca);
    
    return params;
  }

  // Simple trigger state to manually refresh data
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Fetch data dynamically based on active tab
  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const p = periods[activeSection];

    try {
      let params = new URLSearchParams();
      params.set("data_inicio", p.start);
      params.set("data_fim", p.end);
      if (selectedAutomationId) params.set("automation_id", selectedAutomationId);

      switch (activeSection) {
        case "overview": {
          const res = await apiFetch(`/analytics/metrics?${params.toString()}`);
          if (res.ok) setMetrics(await res.json() as Metrics);
          break;
        }
        case "followup_metrics": {
          setLoadingDash(true);
          try {
            const queryParams = new URLSearchParams();
            if (selectedAutomationId) queryParams.set("automation_id", selectedAutomationId);
            queryParams.set("data_inicio", p.start);
            queryParams.set("data_fim", p.end);
            const res = await apiFetch(`/followup/dashboard?${queryParams.toString()}`);
            if (res.ok) {
              setDashData(await res.json());
            }
          } catch (err) {
            console.error("Erro ao carregar dashboard de follow-up:", err);
          } finally {
            setLoadingDash(false);
          }
          break;
        }
        case "crm_metrics": {
          setLoadingCrmMetrics(true);
          try {
            const queryParams = new URLSearchParams();
            if (selectedAutomationId) queryParams.set("automation_id", selectedAutomationId);
            queryParams.set("data_inicio", p.start);
            queryParams.set("data_fim", p.end);
            const res = await apiFetch(`/crm/dashboard?${queryParams.toString()}`);
            if (res.ok) {
              setCrmMetrics(await res.json() as CrmDashboardMetrics);
            }
          } catch (err) {
            console.error("Erro ao carregar dashboard de CRM:", err);
          } finally {
            setLoadingCrmMetrics(false);
          }
          break;
        }
        case "criativos": {
          if (filtroCriativo.campanha) params.set("campanha", filtroCriativo.campanha);
          const res = await apiFetch(`/analytics/criativos?${params.toString()}`);
          if (res.ok) setCriativos(await res.json() as Criativo[]);
          break;
        }
        case "campanhas": {
          if (filtroCampanha.produto) params.set("produto", filtroCampanha.produto);
          const res = await apiFetch(`/analytics/campanhas?${params.toString()}`);
          if (res.ok) setCampanhas(await res.json() as Campanha[]);
          break;
        }
        case "analytics": {
          const res = await apiFetch(`/analytics/analytics?${params.toString()}`);
          if (res.ok) setAnalyticsData(await res.json() as Analytics);
          break;
        }
      }
    } catch (err) {
      console.error("Erro ao carregar dados analíticos:", err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user,
    activeSection,
    currentPeriod.start,
    currentPeriod.end,
    filtroVolume.produto,
    filtroVolume.pago,
    filtroCriativo.campanha,
    filtroCampanha.produto,
    selectedAutomationId,
    refreshTrigger
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);



  return (
    <AppLayout title="Dashboard">
      {/* Navigation Tabs */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "24px", borderBottom: "1px solid rgba(255, 255, 255, 0.06)", paddingBottom: "12px", overflowX: "auto" }} className="tab-list">
        {(["overview", "criativos", "campanhas", "analytics", "followup_metrics", "crm_metrics"] as SectionId[]).map(section => {
          const isActive = activeSection === section;
          const label = 
            section === "overview" ? "Visão Geral" :
            section === "criativos" ? "Criativos" :
            section === "campanhas" ? "Campanhas" :
            section === "analytics" ? "Tempo de Conversão" :
            section === "followup_metrics" ? "Métricas de Follow-up" : "Métricas de CRM";
          
          return (
            <button
              key={section}
              onClick={() => { setActiveSection(section); setPage(1); }}
              className={`tab-item ${isActive ? "active" : ""}`}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                fontWeight: "600",
                fontSize: "13px",
                border: "none",
                background: isActive ? "rgba(45, 212, 191, 0.15)" : "transparent",
                color: isActive ? "#2dd4bf" : "var(--color-text-secondary)",
                cursor: "pointer",
                transition: "all 0.2s ease",
                borderBottom: isActive ? "2px solid #2dd4bf" : "2px solid transparent",
                whiteSpace: "nowrap"
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Date Range Preset & Filters bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 p-4 rounded-xl bg-[#0f1524]/60 border border-border" style={{ border: "1px solid rgba(255, 255, 255, 0.06)", background: "rgba(15, 21, 36, 0.4)" }}>
        <div className="flex flex-wrap gap-1">
          {DATE_PRESETS.map(p => (
            <button
              key={p.days}
              onClick={() => handlePreset(p.days)}
              className={`toggle-btn ${currentPeriod.activeDays === p.days ? "active" : ""}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full md:w-auto md:ml-auto">
          <div className="flex items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-start">
            <input
              type="date"
              value={currentPeriod.start}
              onChange={e => handleCustomDate("start", e.target.value)}
              className="date-input flex-1 sm:flex-none sm:w-[130px]"
            />
            <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>➔</span>
            <input
              type="date"
              value={currentPeriod.end}
              onChange={e => handleCustomDate("end", e.target.value)}
              className="date-input flex-1 sm:flex-none sm:w-[130px]"
            />
            
            <button
              onClick={() => setRefreshTrigger(prev => prev + 1)}
              disabled={loading || loadingDash || loadingCrmMetrics}
              className="btn-secondary"
              style={{ padding: "6px 12px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "8px", marginLeft: "12px" }}
              title="Atualizar dados"
            >
              <RefreshCw size={14} className={(loading || loadingDash || loadingCrmMetrics) ? "animate-spin" : ""} />
            </button>
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-start">
            <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--color-text-muted)", marginRight: "4px" }}>Automação:</span>
            <select
              value={selectedAutomationId}
              onChange={(e) => setSelectedAutomationId(e.target.value)}
              className="date-input flex-1 sm:flex-none"
              style={{ minWidth: "180px", cursor: "pointer" }}
            >
              <option value="">Todas as automações</option>
              {followupAutomations.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Dynamic Content Sections */}
      <div className="section-content">
        {/* OVERVIEW */}
        {activeSection === "overview" && (
          <div className="animate-fade-in-up">
            <MetricCards metrics={metrics} loading={loading} />
          </div>
        )}

        {/* MÉTRICAS DE FOLLOW-UP */}
        {activeSection === "followup_metrics" && (
          <div className="animate-fade-in-up">
            {loadingDash ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}>
                <div className="spinner" style={{ width: "30px", height: "30px" }} />
              </div>
            ) : !dashData ? (
              <div className="glass-card" style={{ textAlign: "center", padding: "60px", color: "var(--color-text-muted)" }}>
                Nenhum dado de follow-up disponível ainda.
              </div>
            ) : (
              <>
                {/* Metric Cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px", marginBottom: "28px" }}>
                  {[
                    { label: "Follow-ups Enviados", value: dashData.total_sent, icon: "📤", color: "#0c93f2" },
                    { label: "Respostas Recebidas", value: dashData.total_replies, icon: "💬", color: "#10b981" },
                    { label: "Conversões", value: dashData.total_conversions, icon: "🎯", color: "#c084fc" },
                    { label: "Taxa de Conversão", value: `${dashData.conversion_rate}%`, icon: "📊", color: "#f59e0b" },
                  ].map((card, i) => (
                    <div key={i} className="glass-card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "24px" }}>{card.icon}</span>
                        <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>{card.label}</span>
                      </div>
                      <div style={{ fontSize: "28px", fontWeight: "800", color: card.color }}>{card.value}</div>
                    </div>
                  ))}
                </div>

                {/* ── REENGAJAMENTO ── */}
                {(() => {
                  const reengRows = dashData.breakdown.filter((b: any) => REENGAJAMENTO_TYPES.includes(b.type));
                  const cobrancaRows = dashData.breakdown.filter((b: any) => COBRANCA_TYPES.includes(b.type));
                  const maxSent = Math.max(...dashData.breakdown.map((b: any) => b.sent), 1);

                  function renderBreakdownTable(rows: any[], maxSentGlobal: number) {
                    if (rows.length === 0) return null;
                    return (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
                            <th style={{ padding: "10px 12px", textAlign: "left" }}>Tipo</th>
                            <th style={{ padding: "10px 12px", textAlign: "center" }}>Enviados</th>
                            <th style={{ padding: "10px 12px", textAlign: "center" }}>Respostas</th>
                            <th style={{ padding: "10px 12px", textAlign: "center" }}>Conversões</th>
                            <th style={{ padding: "10px 12px", textAlign: "center" }}>Taxa</th>
                            <th style={{ padding: "10px 12px", textAlign: "left" }}>Eficiência</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.sort((a, b) => b.sent - a.sent).map((row, i) => {
                            const rate = row.sent > 0 ? Math.round((row.conversions / row.sent) * 1000) / 10 : 0;
                            const barPct = maxSentGlobal > 0 ? (row.sent / maxSentGlobal) * 100 : 0;
                            return (
                              <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                <td style={{ padding: "10px 12px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: typeBadgeColor(row.type), flexShrink: 0 }} />
                                    <span style={{ fontWeight: "600" }}>{typeShortLabel(row.type)}</span>
                                  </div>
                                </td>
                                <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: "700" }}>{row.sent}</td>
                                <td style={{ padding: "10px 12px", textAlign: "center", color: "#10b981" }}>{row.replies}</td>
                                <td style={{ padding: "10px 12px", textAlign: "center", color: "#c084fc", fontWeight: "700" }}>{row.conversions}</td>
                                <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: "600", color: rate >= 10 ? "#10b981" : rate >= 5 ? "#f59e0b" : "var(--color-text-muted)" }}>{rate}%</td>
                                <td style={{ padding: "10px 12px" }}>
                                  <div style={{ width: "100%", height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                                    <div style={{ width: `${barPct}%`, height: "100%", borderRadius: "3px", background: typeBadgeColor(row.type), transition: "width 0.5s ease" }} />
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    );
                  }

                  return (
                    <>
                      <div className="glass-card" style={{ padding: "24px", marginBottom: "16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                          <span style={{ fontSize: "20px" }}>🔔</span>
                          <h3 style={{ fontSize: "16px", fontWeight: "700", margin: 0 }}>Reengajamento</h3>
                          <span style={{ fontSize: "11px", color: "var(--color-text-muted)", background: "rgba(245,158,11,0.1)", padding: "3px 10px", borderRadius: "8px", fontWeight: "600" }}>
                            Leads que não responderam à primeira mensagem
                          </span>
                        </div>
                        <div style={{ border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflow: "auto", background: "var(--color-surface-900)" }}>
                          {renderBreakdownTable(reengRows, maxSent) || (
                            <div style={{ padding: "24px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "13px" }}>Nenhum follow-up de reengajamento executado ainda.</div>
                          )}
                        </div>
                      </div>

                      {/* ── COBRANÇA ── */}
                      <div className="glass-card" style={{ padding: "24px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                          <span style={{ fontSize: "20px" }}>💰</span>
                          <h3 style={{ fontSize: "16px", fontWeight: "700", margin: 0 }}>Cobrança</h3>
                          <span style={{ fontSize: "11px", color: "var(--color-text-muted)", background: "rgba(12,147,242,0.1)", padding: "3px 10px", borderRadius: "8px", fontWeight: "600" }}>
                            Leads que já receberam o produto mas não pagaram
                          </span>
                        </div>
                        <div style={{ border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflow: "auto", background: "var(--color-surface-900)" }}>
                          {renderBreakdownTable(cobrancaRows, maxSent) || (
                            <div style={{ padding: "24px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "13px" }}>Nenhum follow-up de cobrança executado ainda.</div>
                          )}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </>
            )}
          </div>
        )}



        {/* CRIATIVOS */}
        {activeSection === "criativos" && (
          <div className="animate-fade-in-up">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex items-center gap-1.5">
                <span className="filter-label" style={{ marginBottom: 0 }}>Campanha</span>
                <select
                  value={filtroCriativo.campanha}
                  onChange={e => setFiltroCriativo({ campanha: e.target.value })}
                  className="filter-select"
                  style={{ width: "160px" }}
                >
                  <option value="">Todas</option>
                  {options.campanhas.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="glass-card py-5 px-6 sm:px-8">
              <CriativosChart data={criativos} loading={loading} />
            </div>
          </div>
        )}

        {/* CAMPANHAS */}
        {activeSection === "campanhas" && (
          <div className="animate-fade-in-up">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex items-center gap-1.5">
                <span className="filter-label" style={{ marginBottom: 0 }}>Produto</span>
                <select
                  value={filtroCampanha.produto}
                  onChange={e => setFiltroCampanha({ produto: e.target.value })}
                  className="filter-select"
                  style={{ width: "140px" }}
                >
                  <option value="">Todos</option>
                  {options.produtos.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="glass-card py-5 px-6 sm:px-8">
              <CampanhasChart data={campanhas} loading={loading} />
            </div>
          </div>
        )}



        {/* ANALYTICS */}
        {activeSection === "analytics" && (
          <div className="animate-fade-in-up">
            <AnalyticsChart data={analyticsData} loading={loading} />
          </div>
        )}

        {/* MÉTRICAS DE CRM */}
        {activeSection === "crm_metrics" && (
          <div className="animate-fade-in-up">
            {loadingCrmMetrics ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}>
                <div className="spinner" style={{ width: "30px", height: "30px" }} />
              </div>
            ) : !crmMetrics ? (
              <div className="glass-card" style={{ textAlign: "center", padding: "60px", color: "var(--color-text-muted)" }}>
                Nenhum dado CRM disponível ainda para esta automação.
              </div>
            ) : (
              <>
                {/* Metric Cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "16px", marginBottom: "28px" }}>
                  {[
                    { label: "Mensagens Enviadas", value: crmMetrics.total_sent, icon: "📤", color: "#0c93f2" },
                    { label: "Respostas Coletadas", value: crmMetrics.total_answered, icon: "✅", color: "#10b981" },
                    { label: "Taxa de Conversão", value: `${crmMetrics.response_rate}%`, icon: "📊", color: "#2dd4bf" },
                  ].map((card, i) => (
                    <div key={i} className="glass-card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "24px" }}>{card.icon}</span>
                        <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>{card.label}</span>
                      </div>
                      <div style={{ fontSize: "28px", fontWeight: "800", color: card.color }}>{card.value}</div>
                    </div>
                  ))}
                </div>

                {/* Flow Type Breakdown */}
                <div className="glass-card" style={{ padding: "24px", marginBottom: "28px" }}>
                  <h3 style={{ fontSize: "15px", fontWeight: "750", marginBottom: "16px", color: "var(--color-text-primary)" }}>📊 Respostas Coletadas por Tipo</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "16px" }}>
                    {crmMetrics.by_flow_type && crmMetrics.by_flow_type.length > 0 ? (
                      crmMetrics.by_flow_type.map((item, i) => (
                        <div key={i} style={{ padding: "20px", background: "rgba(255,255,255,0.01)", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: "16px" }}>
                          <div style={{ fontSize: "32px" }}>{item.flow_type === "satisfaction" ? "😊" : item.flow_type === "testimonial" ? "🎬" : "🔍"}</div>
                          <div>
                            <div style={{ fontSize: "14px", fontWeight: "700" }}>{flowLabel(item.flow_type)}</div>
                            <div style={{ fontSize: "20px", fontWeight: "800", color: "var(--color-brand-400)", marginTop: "4px" }}>
                              {item.answered} <span style={{ fontSize: "12px", fontWeight: "500", color: "var(--color-text-muted)" }}>/ {item.total} envios</span>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: "var(--color-text-muted)", fontSize: "13px", padding: "12px" }}>Nenhum dado por fluxo nesta automação.</div>
                    )}
                  </div>
                </div>

                {/* Health Scores */}
                {crmMetrics.by_product && crmMetrics.by_product.length > 0 && !selectedAutomationId && (
                  <div className="glass-card" style={{ padding: "24px" }}>
                    <h3 style={{ fontSize: "15px", fontWeight: "750", marginBottom: "16px" }}>🏥 Saúde do Funil por Automação</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
                      {crmMetrics.by_product.map((p, i) => (
                        <div key={i} style={{
                          padding: "20px", borderRadius: "12px",
                          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
                          display: "flex", justifyContent: "space-between", alignItems: "center"
                        }}>
                          <div>
                            <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--color-text-primary)" }}>{p.product_name}</div>
                            <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "4px" }}>
                              {p.total_answered}/{p.total_sent} respostas ({p.response_rate}%)
                            </div>
                          </div>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: "28px", fontWeight: "800", color: getHealthColor(p.health_score) }}>
                              {p.health_score}/10
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: "600", textTransform: "uppercase", marginTop: "2px" }}>Nível</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
