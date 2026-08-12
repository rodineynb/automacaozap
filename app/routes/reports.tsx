import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth, useApi } from "../contexts/auth-context";
import { AppLayout } from "../components/layout";
import { RefreshCw, Download, MessageSquareText } from "lucide-react";
import LeadsTable from "../components/dashboard/LeadsTable";
import type { LeadsResponse, Filtros } from "../types/dashboard";


interface AutomationOption {
  id: string;
  name: string;
}

interface TrackingLog {
  id: number;
  event_name: string;
  phone: string;
  status: string;
  created_at: string;
  payload?: string;
  response?: string;
}

interface ErrorLog {
  id: string;
  automation_id: string;
  automation_name?: string;
  error_type: string;
  error_message: string;
  created_at: string;
}

interface FallbackLog {
  id: number;
  automation_id: string;
  automation_name?: string;
  lead_phone: string;
  lead_name: string | null;
  product_name: string | null;
  fallback_type: "llm" | "ocr" | "transcription";
  details: string;
  created_at: string;
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

export default function ReportsPage() {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  
  // Abas
  const [activeTab, setActiveTab] = useState<"explorar" | "dispatches" | "tracking" | "errors" | "fallbacks" | "followups" | "funnel">("explorar");
  const [automations, setAutomations] = useState<AutomationOption[]>([]);
  const [selectedFunnelAutomationId, setSelectedFunnelAutomationId] = useState<string>("");
  const [exportingFunnel, setExportingFunnel] = useState(false);
  
  // Estados de Logs de Disparos
  const [dispatchLogs, setDispatchLogs] = useState<any[]>([]);
  const [loadingDispatchLogs, setLoadingDispatchLogs] = useState(false);
  const [dispatchPage, setDispatchPage] = useState(1);
  const [dispatchTotalPages, setDispatchTotalPages] = useState(1);
  const [dispatchTotal, setDispatchTotal] = useState(0);
  const [dispatchAutomationId, setDispatchAutomationId] = useState<string>("");
  const [dispatchStatusFilter, setDispatchStatusFilter] = useState<string>("all");
  const [dispatchSearch, setDispatchSearch] = useState<string>("");
  const [dispatchStats, setDispatchStats] = useState<any>(null);
  const [selectedDispatchDetail, setSelectedDispatchDetail] = useState<any>(null);
  
  // Estados de Explorar Leads
  const [leads, setLeads] = useState<LeadsResponse | null>(null);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [page, setPage] = useState(1);
  const [filterOptions, setFilterOptions] = useState<Filtros>({ campanhas: [], anuncios: [], produtos: [] });
  const [explorerFilters, setExplorerFilters] = useState({
    campanhas: "",
    anuncios: "",
    automation_id: "",
    pago: "",
    busca: ""
  });

  const handleFilterChange = (field: string, value: string) => {
    setExplorerFilters(prev => ({ ...prev, [field]: value }));
    setPage(1);
  };

  
  // Estados de Rastreamento CAPI
  const [selectedTrackingAutomationId, setSelectedTrackingAutomationId] = useState<string>("");
  const [trackingStatusFilter, setTrackingStatusFilter] = useState<"all" | "success" | "error">("all");
  const [trackingLogs, setTrackingLogs] = useState<TrackingLog[]>([]);
  const [loadingTrackingLogs, setLoadingTrackingLogs] = useState(false);
  const [selectedLogDetail, setSelectedLogDetail] = useState<TrackingLog | null>(null);

  // Estados de Logs de Erros
  const [generalErrors, setGeneralErrors] = useState<ErrorLog[]>([]);
  const [loadingGeneralErrors, setLoadingGeneralErrors] = useState(false);

  // Estados de Fallbacks
  const [fallbackLogs, setFallbackLogs] = useState<FallbackLog[]>([]);
  const [loadingFallbackLogs, setLoadingFallbackLogs] = useState(false);
  const [fallbackTypeFilter, setFallbackTypeFilter] = useState<"all" | "llm" | "ocr" | "transcription">("all");
  const [selectedFallbackDetail, setSelectedFallbackDetail] = useState<FallbackLog | null>(null);

  // Estados de Filtros Globais de Data
  const initialDates = calcPresetDates(0);
  const [reportDateFrom, setReportDateFrom] = useState<string>(initialDates.start);
  const [reportDateTo, setReportDateTo] = useState<string>(initialDates.end);
  const [reportActiveDays, setReportActiveDays] = useState<number>(0);

  const handlePreset = (days: number) => {
    const dates = calcPresetDates(days);
    setReportDateFrom(dates.start);
    setReportDateTo(dates.end);
    setReportActiveDays(days);
  };

  const handleCustomDate = (field: "start" | "end", value: string) => {
    if (field === "start") {
      setReportDateFrom(value);
    } else {
      setReportDateTo(value);
    }
    setReportActiveDays(-1);
  };

  // Estados de Histórico de Follow-ups
  const [followupLogs, setFollowupLogs] = useState<any[]>([]);
  const [loadingFollowupLogs, setLoadingFollowupLogs] = useState(false);
  const [followupLogPage, setFollowupLogPage] = useState(1);
  const [followupLogTotalPages, setFollowupLogTotalPages] = useState(1);
  const [followupLogTotal, setFollowupLogTotal] = useState(0);
  const [followupLogAutomationSlug, setFollowupLogAutomationSlug] = useState<string>("");
  const [followupLogClassFilter, setFollowupLogClassFilter] = useState<string>("");
  const [followupAutomations, setFollowupAutomations] = useState<any[]>([]);

  async function loadDispatchLogs(page = 1) {
    setLoadingDispatchLogs(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "30");
      if (dispatchAutomationId) params.set("automation_id", dispatchAutomationId);
      if (dispatchStatusFilter && dispatchStatusFilter !== "all") params.set("status", dispatchStatusFilter);
      if (dispatchSearch) params.set("busca", dispatchSearch);
      if (reportDateFrom) params.set("data_inicio", reportDateFrom);
      if (reportDateTo) params.set("data_fim", reportDateTo);

      const res = await apiFetch(`/reports/dispatches?${params.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as {
          data: any[];
          pagination: { page: number; total: number; total_pages: number };
          stats: any;
        };
        setDispatchLogs(data.data || []);
        setDispatchPage(data.pagination.page);
        setDispatchTotalPages(data.pagination.total_pages);
        setDispatchTotal(data.pagination.total);
        setDispatchStats(data.stats);
      }
    } catch (err) {
      console.error("Erro ao carregar logs de disparos:", err);
    }
    setLoadingDispatchLogs(false);
  }

  function dispatchTypeBadgeColor(type: string): string {
    if (type === "text") return "#0c93f2";
    if (type === "image") return "#2dd4bf";
    if (type === "video") return "#10b981";
    if (type === "document") return "#0ea5e9";
    if (type === "audio") return "#8b5cf6";
    if (type === "pix_button") return "#f59e0b";
    return "#6b7280";
  }

  // Carregar ao montar
  useEffect(() => {
    if (user) {
      loadAutomations();
      loadFollowupAutomations();
      loadFilterOptions();
    }
  }, [user]);

  async function loadFilterOptions() {
    try {
      const res = await apiFetch("/analytics/filtros");
      if (res.ok) {
        const data = await res.json() as Filtros;
        setFilterOptions(data);
      }
    } catch (err) {
      console.error("Erro ao carregar filtros de leads:", err);
    }
  }

  async function loadLeads(pageNumber = 1) {
    setLoadingLeads(true);
    try {
      const params = new URLSearchParams();
      if (reportDateFrom && reportDateTo) {
        params.set("data_inicio", reportDateFrom);
        params.set("data_fim", reportDateTo);
      }
      if (explorerFilters.campanhas) params.set("campanha", explorerFilters.campanhas);
      if (explorerFilters.anuncios) params.set("anuncio", explorerFilters.anuncios);
      if (explorerFilters.automation_id) params.set("automation_id", explorerFilters.automation_id);
      if (explorerFilters.pago) params.set("pago", explorerFilters.pago);
      if (explorerFilters.busca) params.set("busca", explorerFilters.busca);
      params.set("page", String(pageNumber));

      const res = await apiFetch(`/analytics/leads?${params.toString()}`);
      if (res.ok) {
        setLeads(await res.json() as LeadsResponse);
        setPage(pageNumber);
      }
    } catch (err) {
      console.error("Erro ao carregar leads:", err);
    }
    setLoadingLeads(false);
  }


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

  // Carregar logs baseado na aba ativa e filtros de data e follow-up
  useEffect(() => {
    if (activeTab === "errors") {
      loadGeneralErrors();
    } else if (activeTab === "fallbacks") {
      loadFallbackLogs();
    } else if (activeTab === "followups") {
      loadFollowupLogs(1);
    } else if (activeTab === "explorar") {
      loadLeads(page);
    } else if (activeTab === "dispatches") {
      loadDispatchLogs(1);
    }
  }, [activeTab, followupLogAutomationSlug, followupLogClassFilter, reportDateFrom, reportDateTo, explorerFilters, page, dispatchAutomationId, dispatchStatusFilter, dispatchSearch]);

  // Carregar logs de rastreamento CAPI automaticamente ao mudar aba, seleção ou datas
  useEffect(() => {
    if (activeTab === "tracking" && selectedTrackingAutomationId) {
      loadTrackingLogs(selectedTrackingAutomationId);
    }
  }, [activeTab, selectedTrackingAutomationId, reportDateFrom, reportDateTo]);

  const handleRefresh = () => {
    if (activeTab === "errors") {
      loadGeneralErrors();
    } else if (activeTab === "fallbacks") {
      loadFallbackLogs();
    } else if (activeTab === "followups") {
      loadFollowupLogs(followupLogPage);
    } else if (activeTab === "tracking" && selectedTrackingAutomationId) {
      loadTrackingLogs(selectedTrackingAutomationId);
    } else if (activeTab === "explorar") {
      loadLeads(page);
    } else if (activeTab === "dispatches") {
      loadDispatchLogs(dispatchPage);
    }
  };


  async function loadAutomations() {
    try {
      const res = await apiFetch("/automations");
      if (res.ok) {
        const data = await res.json() as { data: any[] };
        const mapped = data.data.map((a: any) => ({ id: a.id, name: a.name }));
        setAutomations(mapped);
        if (mapped.length > 0) {
          if (!selectedTrackingAutomationId) {
            setSelectedTrackingAutomationId(mapped[0].id);
          }
          if (!selectedFunnelAutomationId) {
            setSelectedFunnelAutomationId(mapped[0].id);
          }
        }
      }
    } catch (err) {
      console.error("Erro ao carregar opções de automações:", err);
    }
  }

  async function loadTrackingLogs(automationId: string) {
    setLoadingTrackingLogs(true);
    try {
      const params = new URLSearchParams();
      if (reportDateFrom && reportDateTo) {
        params.set("data_inicio", reportDateFrom);
        params.set("data_fim", reportDateTo);
      }
      const res = await apiFetch(`/automations/${automationId}/tracking-logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json() as { data: TrackingLog[] };
        setTrackingLogs(data.data || []);
      }
    } catch (err) {
      console.error("Erro ao carregar logs de tracking:", err);
    }
    setLoadingTrackingLogs(false);
  }

  async function handleExportFunnel() {
    if (!selectedFunnelAutomationId) return;
    setExportingFunnel(true);
    try {
      const res = await apiFetch(`/reports/funnel/${selectedFunnelAutomationId}/export`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const autoName = automations.find(a => a.id === selectedFunnelAutomationId)?.name || "funil";
        const slugSafe = autoName.toLowerCase().replace(/[^a-z0-9]+/g, "_");
        a.download = `mensagens_funil_${slugSafe}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        alert("Erro ao exportar as mensagens do funil.");
      }
    } catch (err) {
      console.error("[ExportFunnel]", err);
      alert("Erro de conexão ao exportar.");
    } finally {
      setExportingFunnel(false);
    }
  }

  async function loadGeneralErrors() {
    setLoadingGeneralErrors(true);
    try {
      const params = new URLSearchParams();
      if (reportDateFrom && reportDateTo) {
        params.set("data_inicio", reportDateFrom);
        params.set("data_fim", reportDateTo);
      }
      const res = await apiFetch(`/automations/all-errors?${params.toString()}`);
      if (res.ok) {
        const data = await res.json() as { data: ErrorLog[] };
        setGeneralErrors(data.data || []);
      }
    } catch (err) {
      console.error("Erro ao carregar logs de erros:", err);
    }
    setLoadingGeneralErrors(false);
  }

  async function loadFallbackLogs() {
    setLoadingFallbackLogs(true);
    try {
      const params = new URLSearchParams();
      if (reportDateFrom && reportDateTo) {
        params.set("data_inicio", reportDateFrom);
        params.set("data_fim", reportDateTo);
      }
      const res = await apiFetch(`/reports/fallbacks?${params.toString()}`);
      if (res.ok) {
        const data = await res.json() as { data: FallbackLog[] };
        setFallbackLogs(data.data || []);
      }
    } catch (err) {
      console.error("Erro ao carregar logs de fallbacks:", err);
    }
    setLoadingFallbackLogs(false);
  }

  async function loadFollowupLogs(page = 1) {
    setLoadingFollowupLogs(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "30");
      if (followupLogAutomationSlug) params.set("automation_slug", followupLogAutomationSlug);
      if (reportDateFrom) params.set("date_from", reportDateFrom);
      if (reportDateTo) params.set("date_to", reportDateTo);
      if (followupLogClassFilter) params.set("class", followupLogClassFilter);

      const res = await apiFetch(`/followup/logs?${params.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as {
          data: any[];
          pagination: { page: number; total: number; total_pages: number };
        };
        setFollowupLogs(data.data || []);
        setFollowupLogPage(data.pagination.page);
        setFollowupLogTotalPages(data.pagination.total_pages);
        setFollowupLogTotal(data.pagination.total);
      }
    } catch (err) {
      console.error("Erro ao carregar logs de follow-up:", err);
    }
    setLoadingFollowupLogs(false);
  }

  function getFallbackBadgeClass(type: string) {
    if (type === "llm") return "badge-teal";
    if (type === "ocr") return "badge-brand";
    return "badge-warning";
  }

  function getFallbackLabel(type: string) {
    if (type === "llm") return "🧠 LLM Fallback";
    if (type === "ocr") return "📸 OCR Comprovante";
    return "🎙️ Transcrição Áudio";
  }

  // Helpers do Follow-up
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
    if (type.includes("vigia")) return "#2dd4bf";
    if (type.includes("finalizador")) return "#10b981";
    if (type.includes("incentivador")) return "#34d399";
    if (type.includes("cobrador_amigo")) return "#0c93f2";
    if (type.includes("cobrador_curioso")) return "#2dd4bf";
    if (type.includes("cobrador_final")) return "#0ea5e9";
    if (type.includes("upsell")) return "#36adff";
    return "#6b7280";
  }

  function typeLabel(type: string): string {
    const map: Record<string, string> = {
      followup_vigia_15min: "⏰ Vigia (15min)",
      followup_finalizador_12h: "🔔 Finalizador (12h)",
      followup_incentivador_1h: "💪 Incentivador (1h)",
      followup_cobrador_amigo_10h: "🤗 Cobrador Amigo (10h)",
      followup_cobrador_curioso_34h: "🤭 Cobrador Curioso (34h)",
      followup_cobrador_final_58h: "🎯 Cobrador Final (58h)",
      upsell_5min: "🚀 Upsell (5min)",
      upsell_10min: "🚀 Upsell (10min)",
    };
    return map[type] || type;
  }

  function followupStatusLabel(status: string): string {
    if (status === "pending") return "⏳ Pendente";
    if (status === "executed") return "✅ Executado";
    if (status === "cancelled") return "❌ Cancelado";
    return status;
  }

  function followupStatusBadgeClass(status: string): string {
    if (status === "executed") return "badge-success";
    if (status === "cancelled") return "badge-danger";
    return "badge-secondary";
  }

  return (
    <AppLayout title="Relatórios e Monitoramento">
      
      {/* Tab Menu Horizontal Premium */}
      <div 
        style={{ 
          display: "flex", 
          gap: "8px", 
          padding: "6px", 
          background: "rgba(255, 255, 255, 0.03)", 
          border: "1px solid rgba(255, 255, 255, 0.08)", 
          borderRadius: "14px", 
          marginBottom: "28px",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          overflowX: "auto"
        }}
        className="tab-list"
      >
        {[
          { id: "explorar", label: "🔍 Explorar Leads" },
          { id: "dispatches", label: "📋 Logs de Disparos" },
          { id: "fallbacks", label: "🔄 Relatório de Fallbacks" },
          { id: "followups", label: "📋 Histórico de Follow-ups" },
          { id: "tracking", label: "🎯 Rastreamento CAPI" },
          { id: "funnel", label: "💬 Mensagens do Funil" }
        ].map(tab => (

          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: "10px 18px",
              borderRadius: "10px",
              border: "none",
              background: activeTab === tab.id ? "rgba(45, 212, 191, 0.15)" : "transparent",
              color: activeTab === tab.id ? "#2dd4bf" : "var(--color-text-secondary)",
              fontWeight: "600",
              fontSize: "13px",
              cursor: "pointer",
              transition: "all 0.25s ease",
              boxShadow: activeTab === tab.id ? "0 0 12px rgba(45, 212, 191, 0.15)" : "none",
              borderBottom: activeTab === tab.id ? "2px solid #2dd4bf" : "2px solid transparent",
              whiteSpace: "nowrap"
            }}
            className="tab-item"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Date Range Preset & Filters bar matching Image 2 */}
      <div className="flex flex-wrap items-center gap-2 mb-8 p-4 rounded-xl bg-[#0f1524]/60 border border-border" style={{ border: "1px solid rgba(255, 255, 255, 0.06)", background: "rgba(15, 21, 36, 0.4)" }}>
        <div className="flex flex-wrap gap-1">
          {DATE_PRESETS.filter(p => activeTab !== "dispatches" || p.days <= 7).map(p => (
            <button
              key={p.days}
              onClick={() => handlePreset(p.days)}
              className={`toggle-btn ${reportActiveDays === p.days ? "active" : ""}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <input
            type="date"
            value={reportDateFrom}
            onChange={e => handleCustomDate("start", e.target.value)}
            className="date-input"
          />
          <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>➔</span>
          <input
            type="date"
            value={reportDateTo}
            onChange={e => handleCustomDate("end", e.target.value)}
            className="date-input"
          />
          
          <button
            onClick={handleRefresh}
            disabled={loadingGeneralErrors || loadingFallbackLogs || loadingFollowupLogs || loadingTrackingLogs || loadingLeads || loadingDispatchLogs}
            className="btn-secondary"
            style={{ padding: "6px 12px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "8px", marginLeft: "12px" }}
            title="Atualizar dados"
          >
            <RefreshCw 
              size={14} 
              className={(loadingGeneralErrors || loadingFallbackLogs || loadingFollowupLogs || loadingTrackingLogs || loadingLeads || loadingDispatchLogs) ? "animate-spin" : ""} 
            />

          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ABA: MENSAGENS DO FUNIL (NOVO)                                           */}
      {/* ========================================================================= */}
      {activeTab === "funnel" && (
        <div className="glass-card animate-fade-in-up" style={{ padding: "28px" }}>
          <div style={{ marginBottom: "24px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: "800", margin: 0 }}>💬 Mensagens do Funil</h2>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "13px", marginTop: "4px" }}>
              Gere e exporte todas as mensagens cadastradas no seu funil (boas-vindas, entrega, ofertas, follow-ups e CRM) em formato Markdown.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "500px" }}>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "8px" }}>
                Selecione a Automação:
              </label>
              <select
                className="input-field"
                value={selectedFunnelAutomationId}
                onChange={(e) => setSelectedFunnelAutomationId(e.target.value)}
                style={{ margin: 0, height: "42px", fontSize: "14px" }}
              >
                <option value="">Selecione...</option>
                {automations.map((a) => (
                  <option key={a.id} value={a.id}>🤖 {a.name}</option>
                ))}
              </select>
            </div>

            <div style={{ 
              marginTop: "8px", 
              padding: "16px", 
              background: "rgba(45, 212, 191, 0.04)", 
              border: "1px dashed rgba(45, 212, 191, 0.2)", 
              borderRadius: "10px",
              textAlign: "center"
            }}>
              <span style={{ fontSize: "14px", fontWeight: "600", color: "#2dd4bf" }}>
                Clique no botão abaixo e gere o documento de mensagens do seu funil.
              </span>
            </div>

            <button
              onClick={handleExportFunnel}
              disabled={!selectedFunnelAutomationId || exportingFunnel}
              className="btn-primary"
              style={{
                height: "44px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                fontWeight: "700",
                fontSize: "14px",
                width: "100%",
                marginTop: "4px"
              }}
            >
              {exportingFunnel ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  <span>Gerando Mensagens...</span>
                </>
              ) : (
                <>
                  <Download size={16} />
                  <span>Gerar e Exportar Mensagens</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA -1: EXPLORAR LEADS (NOVO)                                             */}
      {/* ========================================================================= */}
      {activeTab === "explorar" && (
        <div className="animate-fade-in-up">
          {/* ── Barra de Filtros ── */}
          <div className="glass-card mb-6" style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>🔍 Filtros:</span>

              {/* Campanha */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Campanha:</span>
                <select
                  className="input-field"
                  value={explorerFilters.campanhas}
                  onChange={(e) => handleFilterChange("campanhas", e.target.value)}
                  style={{ margin: 0, height: "34px", minWidth: "140px", fontSize: "12px", background: "#0f172a", color: "white", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <option value="" style={{ background: "#0f172a", color: "white" }}>Todas</option>
                  {filterOptions.campanhas.map(c => <option key={c} value={c} style={{ background: "#0f172a", color: "white" }}>{c}</option>)}
                </select>
              </div>

              {/* Anúncio */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Anúncio:</span>
                <select
                  className="input-field"
                  value={explorerFilters.anuncios}
                  onChange={(e) => handleFilterChange("anuncios", e.target.value)}
                  style={{ margin: 0, height: "34px", minWidth: "140px", fontSize: "12px", background: "#0f172a", color: "white", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <option value="" style={{ background: "#0f172a", color: "white" }}>Todos</option>
                  {filterOptions.anuncios.map(a => <option key={a} value={a} style={{ background: "#0f172a", color: "white" }}>{a}</option>)}
                </select>
              </div>

              {/* Automação */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Automação:</span>
                <select
                  className="input-field"
                  value={explorerFilters.automation_id}
                  onChange={(e) => handleFilterChange("automation_id", e.target.value)}
                  style={{ margin: 0, height: "34px", minWidth: "130px", fontSize: "12px", background: "#0f172a", color: "white", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <option value="" style={{ background: "#0f172a", color: "white" }}>Todas</option>
                  {automations.map(a => <option key={a.id} value={a.id} style={{ background: "#0f172a", color: "white" }}>{a.name}</option>)}
                </select>
              </div>

              {/* Pagamento */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Pagamento:</span>
                <select
                  className="input-field"
                  value={explorerFilters.pago}
                  onChange={(e) => handleFilterChange("pago", e.target.value)}
                  style={{ margin: 0, height: "34px", minWidth: "110px", fontSize: "12px", background: "#0f172a", color: "white", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <option value="" style={{ background: "#0f172a", color: "white" }}>Todos</option>
                  <option value="true" style={{ background: "#0f172a", color: "white" }}>Pago</option>
                  <option value="false" style={{ background: "#0f172a", color: "white" }}>Não Pago</option>
                </select>
              </div>


              {/* Busca */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Busca:</span>
                <input
                  type="text"
                  placeholder="Nome ou telefone..."
                  value={explorerFilters.busca}
                  onChange={(e) => handleFilterChange("busca", e.target.value)}
                  style={{ margin: 0, height: "34px", width: "160px", padding: "0 12px", fontSize: "12px", background: "#0f172a", color: "white", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px" }}
                />
              </div>

            </div>
          </div>

          {/* ── Botões de Exportação ── */}
          <div className="flex flex-wrap gap-2 mb-6 items-center">
            <a href={`/api/analytics/export-meta?tipo=compradores&data_inicio=${reportDateFrom}&data_fim=${reportDateTo}${explorerFilters.automation_id ? `&automation_id=${explorerFilters.automation_id}` : ""}`} download className="export-btn">
              <Download size={14} />
              <span>Compradores</span>
            </a>
            <a href={`/api/analytics/export-meta?tipo=acesso&data_inicio=${reportDateFrom}&data_fim=${reportDateTo}${explorerFilters.automation_id ? `&automation_id=${explorerFilters.automation_id}` : ""}`} download className="export-btn">
              <Download size={14} />
              <span>Receberam Acesso</span>
            </a>
            <a href={`/api/analytics/export-meta?tipo=acesso_sem_pagar&data_inicio=${reportDateFrom}&data_fim=${reportDateTo}${explorerFilters.automation_id ? `&automation_id=${explorerFilters.automation_id}` : ""}`} download className="export-btn">
              <Download size={14} />
              <span>Acesso s/ Pgto</span>
            </a>
            <a href={`/api/analytics/export-meta?tipo=sem_acesso&data_inicio=${reportDateFrom}&data_fim=${reportDateTo}${explorerFilters.automation_id ? `&automation_id=${explorerFilters.automation_id}` : ""}`} download className="export-btn">
              <Download size={14} />
              <span>Sem Acesso</span>
            </a>
            <a href={`/api/analytics/export-meta?tipo=todos&data_inicio=${reportDateFrom}&data_fim=${reportDateTo}${explorerFilters.automation_id ? `&automation_id=${explorerFilters.automation_id}` : ""}`} download className="export-btn">
              <Download size={14} />
              <span>Todos os Leads</span>
            </a>

            <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.08)", margin: "0 8px" }} />

            <a
              href={`/api/analytics/export-conversas?data_inicio=${reportDateFrom}&data_fim=${reportDateTo}`}
              download
              className="export-btn"
              style={{
                background: "linear-gradient(135deg, rgba(12, 147, 242, 0.15), rgba(12, 147, 242, 0.08))",
                borderColor: "rgba(12, 147, 242, 0.3)",
                color: "#38bdf8"
              }}
            >
              <MessageSquareText size={14} style={{ color: "#0c93f2" }} />
              <span>Exportar Conversas (Relatório)</span>
            </a>
          </div>

          {/* ── Tabela de Leads ── */}
          <div className="glass-card py-5 px-6 sm:px-8">
            <LeadsTable data={leads} loading={loadingLeads} page={page} onPageChange={setPage} />
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 0: HISTÓRICO DE FOLLOW-UPS (NOVO)                                    */}
      {/* ========================================================================= */}
      {activeTab === "followups" && (
        <div className="animate-fade-in-up">
          {/* ── Barra de Filtros ── */}
          <div className="glass-card" style={{ padding: "16px 20px", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>🔍 Filtros:</span>

              {/* Automação */}
              <select
                className="input-field"
                value={followupLogAutomationSlug}
                onChange={(e) => setFollowupLogAutomationSlug(e.target.value)}
                style={{ margin: 0, height: "34px", minWidth: "160px", fontSize: "12px", background: "#0f172a", color: "white", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <option value="" style={{ background: "#0f172a", color: "white" }}>Todas automações</option>
                {followupAutomations.map((a) => (
                  <option key={a.slug} value={a.slug} style={{ background: "#0f172a", color: "white" }}>{a.name}</option>
                ))}
              </select>

              {/* Classe */}
              <select
                className="input-field"
                value={followupLogClassFilter}
                onChange={(e) => setFollowupLogClassFilter(e.target.value)}
                style={{ margin: 0, height: "34px", minWidth: "140px", fontSize: "12px", background: "#0f172a", color: "white", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <option value="" style={{ background: "#0f172a", color: "white" }}>Todas classes</option>
                <option value="reengajamento" style={{ background: "#0f172a", color: "white" }}>🔔 Reengajamento</option>
                <option value="cobranca" style={{ background: "#0f172a", color: "white" }}>💰 Cobrança</option>
              </select>

            </div>
          </div>

          {/* ── Tabela de Logs ── */}
          <div className="glass-card" style={{ padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: "800", margin: 0 }}>📋 Histórico de Execuções</h2>
                <p style={{ color: "var(--color-text-secondary)", fontSize: "13px", marginTop: "4px" }}>
                  {followupLogTotal} registros — página {followupLogPage} de {followupLogTotalPages}
                </p>
              </div>
              <button className="btn-secondary" onClick={() => loadFollowupLogs(followupLogPage)} disabled={loadingFollowupLogs} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                🔄 Atualizar
              </button>
            </div>

            {loadingFollowupLogs ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}>
                <div className="spinner" style={{ width: "30px", height: "30px" }} />
              </div>
            ) : followupLogs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "var(--color-text-muted)", border: "1px dashed rgba(255,255,255,0.08)", borderRadius: "12px" }}>
                Nenhum follow-up encontrado com os filtros aplicados.
              </div>
            ) : (
              <>
                <div style={{ border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflow: "auto", background: "var(--color-surface-900)", WebkitOverflowScrolling: "touch" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
                        <th style={{ padding: "12px" }}>Lead</th>
                        <th style={{ padding: "12px" }}>Automação</th>
                        <th style={{ padding: "12px" }}>Tipo</th>
                        <th style={{ padding: "12px" }}>Status</th>
                        <th style={{ padding: "12px" }}>Agendado</th>
                        <th style={{ padding: "12px" }}>Executado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {followupLogs.map((log: any) => {
                        const scheduledDate = new Date(log.scheduled_for + (log.scheduled_for.includes("Z") ? "" : "Z"));
                        const executedDate = log.executed_at ? new Date(log.executed_at + (log.executed_at.includes("Z") ? "" : "Z")) : null;
                        
                        const formattedScheduled = isNaN(scheduledDate.getTime()) ? log.scheduled_for : scheduledDate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
                        const formattedExecuted = executedDate && !isNaN(executedDate.getTime()) ? executedDate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

                        return (
                          <tr key={log.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                            <td style={{ padding: "12px" }}>
                              <div style={{ fontWeight: "700" }}>{log.customer_name || "Sem nome"}</div>
                              <div style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>{log.phone}</div>
                            </td>
                            <td style={{ padding: "12px", color: "var(--color-brand-400)", fontWeight: "600", fontSize: "12px" }}>
                              {log.automation_name || log.automation_slug}
                            </td>
                            <td style={{ padding: "12px" }}>
                              <span style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "8px", background: `${typeBadgeColor(log.type)}15`, color: typeBadgeColor(log.type), fontWeight: "600", whiteSpace: "nowrap" }}>
                                {typeLabel(log.type)}
                              </span>
                            </td>
                            <td style={{ padding: "12px" }}>
                              <span className={`badge ${followupStatusBadgeClass(log.status)}`} style={{ fontSize: "11px", padding: "2px 8px" }}>
                                {followupStatusLabel(log.status)}
                              </span>
                            </td>
                            <td style={{ padding: "12px", color: "var(--color-text-muted)", whiteSpace: "nowrap", fontSize: "12px" }}>
                              {formattedScheduled}
                            </td>
                            <td style={{ padding: "12px", color: log.executed_at ? "var(--color-text-secondary)" : "var(--color-text-muted)", whiteSpace: "nowrap", fontSize: "12px" }}>
                              {formattedExecuted}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {followupLogTotalPages > 1 && (
                  <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "20px" }}>
                    <button className="btn-secondary" onClick={() => loadFollowupLogs(followupLogPage - 1)} disabled={followupLogPage <= 1 || loadingFollowupLogs} style={{ padding: "8px 16px", fontSize: "12px" }}>
                      ← Anterior
                    </button>
                    <span style={{ display: "flex", alignItems: "center", fontSize: "13px", color: "var(--color-text-secondary)", fontWeight: "600", padding: "0 12px" }}>
                      {followupLogPage} / {followupLogTotalPages}
                    </span>
                    <button className="btn-secondary" onClick={() => loadFollowupLogs(followupLogPage + 1)} disabled={followupLogPage >= followupLogTotalPages || loadingFollowupLogs} style={{ padding: "8px 16px", fontSize: "12px" }}>
                      Próxima →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA: LOGS DE DISPAROS (NOVO)                                             */}
      {/* ========================================================================= */}
      {activeTab === "dispatches" && (
        <div className="animate-fade-in-up">
          {/* Stats Cards Section */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="glass-card flex flex-col justify-between" style={{ padding: "16px 20px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Total Enviado
              </span>
              <h3 style={{ fontSize: "28px", fontWeight: "800", marginTop: "8px", color: "#0c93f2" }}>
                {dispatchStats?.last7days?.total || 0}
              </h3>
              <p style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "4px" }}>
                Total de envios
              </p>
            </div>
            <div className="glass-card flex flex-col justify-between" style={{ padding: "16px 20px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Sucessos
              </span>
              <h3 style={{ fontSize: "28px", fontWeight: "800", marginTop: "8px", color: "#2dd4bf" }}>
                {dispatchStats?.last7days?.success || 0}
              </h3>
              <p style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "4px" }}>
                Entregues com sucesso
              </p>
            </div>
            <div className="glass-card flex flex-col justify-between" style={{ padding: "16px 20px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Falhas
              </span>
              <h3 style={{ fontSize: "28px", fontWeight: "800", marginTop: "8px", color: "#fca5a5" }}>
                {dispatchStats?.last7days?.error || 0}
              </h3>
              <p style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "4px" }}>
                Erros ou rejeições
              </p>
            </div>
            <div className="glass-card flex flex-col justify-between" style={{ padding: "16px 20px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Taxa de Entrega
              </span>
              <h3 style={{ fontSize: "28px", fontWeight: "800", marginTop: "8px", color: "#2dd4bf" }}>
                {dispatchStats?.last7days?.success_rate || 0}%
              </h3>
              <p style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "4px" }}>
                Eficiência dos canais
              </p>
            </div>
          </div>

          {/* Stats for currently selected date range (only if custom period active) */}
          {reportActiveDays !== 0 && dispatchStats?.filtered && (
            <div className="glass-card mb-6" style={{ padding: "12px 20px", display: "flex", gap: "24px", alignItems: "center", border: "1px solid rgba(45, 212, 191, 0.2)", background: "rgba(45, 212, 191, 0.02)" }}>
              <span style={{ fontSize: "12px", fontWeight: "700", color: "#2dd4bf" }}>📊 No Período Filtrado:</span>
              <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>Total: <strong style={{ color: "white" }}>{dispatchStats.filtered.total}</strong></span>
              <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>Sucesso: <strong style={{ color: "#2dd4bf" }}>{dispatchStats.filtered.success}</strong></span>
              <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>Falhas: <strong style={{ color: "#fca5a5" }}>{dispatchStats.filtered.error}</strong></span>
              <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>Taxa: <strong style={{ color: "#2dd4bf" }}>{dispatchStats.filtered.success_rate}%</strong></span>
            </div>
          )}

          {/* ── Barra de Filtros ── */}
          <div className="glass-card mb-6" style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>🔍 Filtros:</span>

              {/* Automação */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Automação:</span>
                <select
                  className="input-field"
                  value={dispatchAutomationId}
                  onChange={(e) => {
                    setDispatchAutomationId(e.target.value);
                    setDispatchPage(1);
                  }}
                  style={{ margin: 0, height: "34px", minWidth: "160px", fontSize: "12px", background: "#0f172a", color: "white", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <option value="all" style={{ background: "#0f172a", color: "white" }}>Todas automações</option>
                  {automations.map(a => (
                    <option key={a.id} value={a.id} style={{ background: "#0f172a", color: "white" }}>{a.name}</option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Status:</span>
                <select
                  className="input-field"
                  value={dispatchStatusFilter}
                  onChange={(e) => {
                    setDispatchStatusFilter(e.target.value);
                    setDispatchPage(1);
                  }}
                  style={{ margin: 0, height: "34px", minWidth: "130px", fontSize: "12px", background: "#0f172a", color: "white", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <option value="all" style={{ background: "#0f172a", color: "white" }}>Todos status</option>
                  <option value="success" style={{ background: "#0f172a", color: "white" }}>🟢 Sucesso</option>
                  <option value="error" style={{ background: "#0f172a", color: "white" }}>🔴 Erro</option>
                </select>
              </div>

              {/* Busca */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Busca:</span>
                <input
                  type="text"
                  placeholder="Fone ou conteúdo..."
                  value={dispatchSearch}
                  onChange={(e) => {
                    setDispatchSearch(e.target.value);
                    setDispatchPage(1);
                  }}
                  style={{ margin: 0, height: "34px", width: "180px", padding: "0 12px", fontSize: "12px", background: "#0f172a", color: "white", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px" }}
                />
              </div>

            </div>
          </div>

          {/* ── Tabela de Logs de Disparos ── */}
          <div className="glass-card" style={{ padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: "800", margin: 0 }}>📋 Registro de Envios</h2>
                <p style={{ color: "var(--color-text-secondary)", fontSize: "13px", marginTop: "4px" }}>
                  {dispatchTotal} envios registrados — página {dispatchPage} de {dispatchTotalPages}
                </p>
              </div>
              <button 
                className="btn-secondary" 
                onClick={() => loadDispatchLogs(dispatchPage)} 
                disabled={loadingDispatchLogs} 
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                🔄 Atualizar
              </button>
            </div>

            {loadingDispatchLogs ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}>
                <div className="spinner" style={{ width: "30px", height: "30px" }} />
              </div>
            ) : dispatchLogs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "var(--color-text-muted)", border: "1px dashed rgba(255,255,255,0.08)", borderRadius: "12px" }}>
                Nenhum log de disparo encontrado com os filtros aplicados.
              </div>
            ) : (
              <>
                <div style={{ border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflow: "auto", background: "var(--color-surface-900)", WebkitOverflowScrolling: "touch" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
                        <th style={{ padding: "12px" }}>Contato (WhatsApp)</th>
                        <th style={{ padding: "12px" }}>Automação</th>
                        <th style={{ padding: "12px" }}>Tipo de Mensagem</th>
                        <th style={{ padding: "12px" }}>Conteúdo</th>
                        <th style={{ padding: "12px" }}>Status</th>
                        <th style={{ padding: "12px" }}>Data/Hora</th>
                        <th style={{ padding: "12px", textAlign: "center" }}>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dispatchLogs.map((log: any) => {
                        const dateObj = new Date(log.sent_at + (log.sent_at.includes("Z") ? "" : "Z"));
                        const formattedDate = isNaN(dateObj.getTime())
                          ? log.sent_at
                          : dateObj.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

                        // Truncar conteúdo
                        const truncatedContent = log.message_content.length > 55
                          ? log.message_content.substring(0, 52) + "..."
                          : log.message_content;

                        return (
                          <tr key={log.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                            <td style={{ padding: "12px" }}>
                              <div style={{ fontWeight: "700" }}>{log.phone}</div>
                            </td>
                            <td style={{ padding: "12px", color: "var(--color-brand-400)", fontWeight: "600", fontSize: "12px" }}>
                              {log.automation_name || "Desconhecida"}
                            </td>
                            <td style={{ padding: "12px" }}>
                              <span style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "8px", background: `${dispatchTypeBadgeColor(log.message_type)}15`, color: dispatchTypeBadgeColor(log.message_type), fontWeight: "600", whiteSpace: "nowrap" }}>
                                {log.message_type.toUpperCase()}
                              </span>
                            </td>
                            <td style={{ padding: "12px", color: "var(--color-text-secondary)", maxWidth: "250px", wordBreak: "break-all" }}>
                              {truncatedContent}
                            </td>
                            <td style={{ padding: "12px" }}>
                              <span className={`badge ${log.status === "success" ? "badge-success" : "badge-danger"}`} style={{ fontSize: "11px", padding: "2px 8px" }}>
                                {log.status === "success" ? "Sucesso" : "Erro"}
                              </span>
                            </td>
                            <td style={{ padding: "12px", color: "var(--color-text-muted)", whiteSpace: "nowrap", fontSize: "12px" }}>
                              {formattedDate}
                            </td>
                            <td style={{ padding: "12px", textAlign: "center" }}>
                              <button
                                onClick={() => setSelectedDispatchDetail(log)}
                                className="btn-secondary"
                                style={{ padding: "4px 8px", fontSize: "12px" }}
                              >
                                🔍 Detalhes
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {dispatchTotalPages > 1 && (
                  <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "20px" }}>
                    <button 
                      className="btn-secondary" 
                      onClick={() => loadDispatchLogs(dispatchPage - 1)} 
                      disabled={dispatchPage <= 1 || loadingDispatchLogs} 
                      style={{ padding: "8px 16px", fontSize: "12px" }}
                    >
                      ← Anterior
                    </button>
                    <span style={{ display: "flex", alignItems: "center", fontSize: "13px", color: "var(--color-text-secondary)", fontWeight: "600", padding: "0 12px" }}>
                      {dispatchPage} / {dispatchTotalPages}
                    </span>
                    <button 
                      className="btn-secondary" 
                      onClick={() => loadDispatchLogs(dispatchPage + 1)} 
                      disabled={dispatchPage >= dispatchTotalPages || loadingDispatchLogs} 
                      style={{ padding: "8px 16px", fontSize: "12px" }}
                    >
                      Próxima →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 1: RELATÓRIO DE FALLBACKS (NOVO)                                      */}
      {/* ========================================================================= */}
      {activeTab === "fallbacks" && (
        <div className="glass-card animate-fade-in-up" style={{ padding: "28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <h2 style={{ fontSize: "20px", fontWeight: "800", margin: 0 }}>🔄 Relatório de Fallbacks Tolerantes a Falhas</h2>
              <p style={{ color: "var(--color-text-secondary)", fontSize: "13px", marginTop: "4px" }}>
                Histórico de ativação das redundâncias em LLM, OCR ou Transcrição de Áudio (retenção de 15 dias).
              </p>
            </div>
            
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--color-text-muted)", marginBottom: "4px", fontWeight: "600" }}>Filtrar Categoria</label>
                <select 
                  className="input-field" 
                  value={fallbackTypeFilter} 
                  onChange={(e) => setFallbackTypeFilter(e.target.value as any)}
                  style={{ margin: 0, height: "38px", minWidth: "160px" }}
                >
                  <option value="all">🔍 Todos os Tipos</option>
                  <option value="llm">🧠 Fallbacks de LLM</option>
                  <option value="ocr">📸 Fallbacks de OCR</option>
                  <option value="transcription">🎙️ Fallbacks de Áudio</option>
                </select>
              </div>

              <div>
                <button 
                  className="btn-secondary" 
                  onClick={loadFallbackLogs}
                  disabled={loadingFallbackLogs}
                  style={{ height: "38px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "0 14px" }}
                  title="Atualizar Logs"
                >
                  <span>🔄</span> Atualizar
                </button>
              </div>
            </div>
          </div>

          {loadingFallbackLogs ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}><div className="spinner" style={{ width: "30px", height: "30px" }} /></div>
          ) : fallbackLogs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--color-text-muted)", border: "1px dashed rgba(255,255,255,0.08)", borderRadius: "12px" }}>
              Nenhum evento de fallback registrado nos últimos 15 dias. O sistema operou com os serviços primários estáveis! 🚀
            </div>
          ) : (
            (() => {
              const filtered = fallbackLogs.filter(log => {
                if (fallbackTypeFilter === "all") return true;
                return log.fallback_type === fallbackTypeFilter;
              });

              if (filtered.length === 0) {
                return (
                  <div style={{ textAlign: "center", padding: "40px", color: "var(--color-text-muted)", background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "12px" }}>
                    Nenhum log encontrado para a categoria filtrada.
                  </div>
                );
              }

              return (
                <div style={{ border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflow: "auto", background: "var(--color-surface-900)", WebkitOverflowScrolling: "touch" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
                        <th style={{ padding: "12px" }}>Tipo</th>
                        <th style={{ padding: "12px" }}>Lead (Telefone / Nome)</th>
                        <th style={{ padding: "12px" }}>Automação / Produto</th>
                        <th style={{ padding: "12px" }}>Detalhes da Redundância</th>
                        <th style={{ padding: "12px" }}>Data/Hora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((log) => {
                        const dateObj = new Date(log.created_at + "Z");
                        const formattedDate = isNaN(dateObj.getTime())
                          ? log.created_at
                          : dateObj.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

                        return (
                          <tr key={log.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", transition: "background 0.2s" }} className="hover:bg-white/2">
                            <td style={{ padding: "12px", whiteSpace: "nowrap" }}>
                              <span className={`badge ${getFallbackBadgeClass(log.fallback_type)}`} style={{ fontSize: "11px", padding: "3px 8px" }}>
                                {getFallbackLabel(log.fallback_type)}
                              </span>
                            </td>
                            <td style={{ padding: "12px" }}>
                              <div style={{ fontWeight: "700" }}>{log.lead_name || "Sem nome"}</div>
                              <div style={{ color: "var(--color-text-muted)", fontSize: "11px", marginTop: "2px" }}>{log.lead_phone}</div>
                            </td>
                            <td style={{ padding: "12px" }}>
                              <div style={{ fontWeight: "600", color: "var(--color-brand-400)" }}>{log.automation_name || "Desconhecida"}</div>
                              <div style={{ color: "var(--color-text-muted)", fontSize: "11px", marginTop: "2px" }}>Prod: {log.product_name || "N/A"}</div>
                            </td>
                            <td style={{ padding: "12px", color: "var(--color-text-secondary)", maxWidth: "320px", wordBreak: "break-word" }}>
                              {log.details}
                            </td>
                            <td style={{ padding: "12px", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>{formattedDate}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 2: RASTREAMENTO CAPI                                                 */}
      {/* ========================================================================= */}
      {activeTab === "tracking" && (
        <div className="glass-card animate-fade-in-up" style={{ padding: "28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <h2 style={{ fontSize: "20px", fontWeight: "800", margin: 0 }}>🎯 Logs de Rastreamento (CAPI)</h2>
              <p style={{ color: "var(--color-text-secondary)", fontSize: "13px", marginTop: "4px" }}>
                Acompanhe o disparo de Pixel e Facebook Conversions API (últimas 48 horas).
              </p>
            </div>
            
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--color-text-muted)", marginBottom: "4px", fontWeight: "600" }}>Automação</label>
                <select 
                  className="input-field" 
                  value={selectedTrackingAutomationId} 
                  onChange={(e) => setSelectedTrackingAutomationId(e.target.value)}
                  style={{ margin: 0, height: "38px", minWidth: "180px" }}
                >
                  <option value="">Selecione...</option>
                  {automations.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--color-text-muted)", marginBottom: "4px", fontWeight: "600" }}>Filtrar Status</label>
                <select 
                  className="input-field" 
                  value={trackingStatusFilter} 
                  onChange={(e) => setTrackingStatusFilter(e.target.value as any)}
                  style={{ margin: 0, height: "38px", minWidth: "130px" }}
                >
                  <option value="all">🟢🔴 Todos</option>
                  <option value="success">🟢 Apenas Sucessos</option>
                  <option value="error">🔴 Apenas Erros</option>
                </select>
              </div>

              <div>
                <button 
                  className="btn-secondary" 
                  onClick={() => selectedTrackingAutomationId && loadTrackingLogs(selectedTrackingAutomationId)}
                  style={{ height: "38px", width: "38px", display: "flex", alignItems: "center", justifyContent: "center" }}
                  title="Atualizar Logs"
                >
                  🔄
                </button>
              </div>
            </div>
          </div>

          {loadingTrackingLogs ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}><div className="spinner" style={{ width: "30px", height: "30px" }} /></div>
          ) : !selectedTrackingAutomationId ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--color-text-muted)", border: "1px dashed rgba(255,255,255,0.08)", borderRadius: "12px" }}>
              Selecione uma automação acima para ver a lista de disparos Meta CAPI.
            </div>
          ) : (
            (() => {
              const filteredLogs = trackingLogs.filter(log => {
                if (trackingStatusFilter === "all") return true;
                return log.status === trackingStatusFilter;
              });

              if (filteredLogs.length === 0) {
                return (
                  <div style={{ textAlign: "center", padding: "40px", color: "var(--color-text-muted)", background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "12px" }}>
                    Nenhum log encontrado correspondente ao filtro de status.
                  </div>
                );
              }

              return (
                <div style={{ border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflow: "auto", background: "var(--color-surface-900)", WebkitOverflowScrolling: "touch" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
                        <th style={{ padding: "12px" }}>Evento</th>
                        <th style={{ padding: "12px" }}>Telefone</th>
                        <th style={{ padding: "12px" }}>Status</th>
                        <th style={{ padding: "12px" }}>Data/Hora</th>
                        <th style={{ padding: "12px", textAlign: "center" }}>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLogs.map((log) => {
                        const dateObj = new Date(log.created_at + "Z");
                        const formattedDate = isNaN(dateObj.getTime())
                          ? log.created_at
                          : dateObj.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

                        return (
                          <tr key={log.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", transition: "background 0.2s" }} className="hover:bg-white/2">
                            <td style={{ padding: "12px" }}>
                              <span style={{ fontWeight: "600", color: "var(--color-brand-400)" }}>{log.event_name}</span>
                            </td>
                            <td style={{ padding: "12px" }}>{log.phone}</td>
                            <td style={{ padding: "12px" }}>
                              <span className={`badge ${log.status === "success" ? "badge-success" : log.status === "organic" || log.status === "orgânico" || log.status === "skipped" ? "badge-warning" : "badge-danger"}`} style={{ fontSize: "11px", padding: "2px 8px" }}>
                                {log.status === "success" ? "Sucesso" : log.status === "organic" || log.status === "orgânico" || log.status === "skipped" ? "Orgânico" : "Erro"}
                              </span>
                            </td>
                            <td style={{ padding: "12px", color: "var(--color-text-muted)" }}>{formattedDate}</td>
                            <td style={{ padding: "12px", textAlign: "center" }}>
                              <button
                                onClick={() => setSelectedLogDetail(log)}
                                className="btn-secondary"
                                style={{ padding: "4px 8px", fontSize: "12px" }}
                              >
                                🔍 Detalhes
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 3: LOGS DE ERROS GERAIS                                              */}
      {/* ========================================================================= */}
      {activeTab === "errors" && (
        <div className="glass-card animate-fade-in-up" style={{ padding: "28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <h2 style={{ fontSize: "20px", fontWeight: "800", margin: 0 }}>⚠️ Logs de Erros (Últimas 48h)</h2>
              <p style={{ color: "var(--color-text-secondary)", fontSize: "13px", marginTop: "4px" }}>
                Monitore em tempo real falhas de LLM, conexões de API WhatsApp, Pix ou erros de OCR.
              </p>
            </div>
            <button className="btn-secondary" onClick={loadGeneralErrors} disabled={loadingGeneralErrors}>
              {loadingGeneralErrors ? "Carregando..." : "🔄 Atualizar Logs"}
            </button>
          </div>

          {loadingGeneralErrors ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}><div className="spinner" style={{ width: "30px", height: "30px" }} /></div>
          ) : generalErrors.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--color-text-muted)", border: "1px dashed rgba(255,255,255,0.08)", borderRadius: "12px" }}>
              Nenhum erro registrado nas últimas 48 horas. Incrível! 🚀
            </div>
          ) : (
            <div style={{ border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflow: "auto", background: "var(--color-surface-900)", WebkitOverflowScrolling: "touch" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
                    <th style={{ padding: "12px" }}>Automação</th>
                    <th style={{ padding: "12px" }}>Data/Hora</th>
                    <th style={{ padding: "12px" }}>Mensagem de Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {generalErrors.map((err) => {
                    const dateObj = new Date(err.created_at + "Z");
                    const formattedDate = isNaN(dateObj.getTime())
                      ? err.created_at
                      : dateObj.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

                    return (
                      <tr key={err.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", transition: "background 0.2s" }} className="hover:bg-white/2">
                        <td style={{ padding: "12px", whiteSpace: "nowrap" }}>
                          <span style={{ fontWeight: "700", color: "var(--color-brand-400)" }}>
                            {err.automation_name || `ID: ${err.automation_id}`}
                          </span>
                        </td>
                        <td style={{ padding: "12px", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>{formattedDate}</td>
                        <td style={{ padding: "12px", color: "#fca5a5", fontFamily: "monospace", fontSize: "12px", wordBreak: "break-all" }}>
                          {err.error_message}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* DETALHES DE DISPARO DE MENSAGENS (MODAL)                                 */}
      {selectedDispatchDetail && (
        <div className="modal-overlay" onClick={() => setSelectedDispatchDetail(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "700px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "16px" }}>📋 Detalhes do Disparo</h2>
            
            <div style={{ marginBottom: "16px", display: "flex", gap: "8px" }}>
              <span className={`badge ${selectedDispatchDetail.status === "success" ? "badge-success" : "badge-danger"}`}>
                {selectedDispatchDetail.status === "success" ? "Sucesso" : "Erro"}
              </span>
              <span style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "8px", background: `${dispatchTypeBadgeColor(selectedDispatchDetail.message_type)}15`, color: dispatchTypeBadgeColor(selectedDispatchDetail.message_type), fontWeight: "600" }}>
                {selectedDispatchDetail.message_type.toUpperCase()}
              </span>
              <span style={{ color: "var(--color-text-muted)", fontSize: "12px", marginLeft: "auto" }}>
                {new Date(selectedDispatchDetail.sent_at + (selectedDispatchDetail.sent_at.includes("Z") ? "" : "Z")).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </span>
            </div>

            <div style={{ marginBottom: "14px" }}>
              <strong style={{ fontSize: "13px", display: "block", marginBottom: "4px" }}>Contato:</strong>
              <div style={{ background: "rgba(255,255,255,0.02)", padding: "10px", borderRadius: "8px", fontSize: "13px", border: "1px solid rgba(255,255,255,0.05)" }}>
                {selectedDispatchDetail.phone}
              </div>
            </div>

            <div style={{ marginBottom: "14px" }}>
              <strong style={{ fontSize: "13px", display: "block", marginBottom: "4px" }}>Conteúdo da Mensagem:</strong>
              <pre style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", overflow: "auto", maxHeight: "250px", fontSize: "12px", fontFamily: "inherit", whiteSpace: "pre-wrap", wordBreak: "break-word", border: "1px solid rgba(255,255,255,0.05)" }}>
                {selectedDispatchDetail.message_content}
              </pre>
            </div>

            {selectedDispatchDetail.error_message && (
              <div style={{ marginBottom: "20px" }}>
                <strong style={{ fontSize: "13px", display: "block", marginBottom: "4px", color: "#fca5a5" }}>Log de Erro:</strong>
                <pre style={{ background: "rgba(255,0,0,0.05)", padding: "12px", borderRadius: "8px", overflow: "auto", maxHeight: "150px", fontSize: "11px", fontFamily: "monospace", border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5" }}>
                  {selectedDispatchDetail.error_message}
                </pre>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn-primary" onClick={() => setSelectedDispatchDetail(null)} style={{ padding: "8px 20px" }}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DETALHES DE LOG PIXEL / CAPI (MODAL)                                     */}
      {/* ========================================================================= */}
      {selectedLogDetail && (
        <div className="modal-overlay" onClick={() => setSelectedLogDetail(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "700px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "16px" }}>🔍 Detalhes do Disparo Meta CAPI</h2>
            
            <div style={{ marginBottom: "16px" }}>
              <span className="badge badge-brand" style={{ marginRight: "8px" }}>{selectedLogDetail.event_name}</span>
              <span className={`badge ${selectedLogDetail.status === "success" ? "badge-success" : "badge-danger"}`}>{selectedLogDetail.status}</span>
              <span style={{ marginLeft: "12px", color: "var(--color-text-muted)", fontSize: "12px" }}>
                {new Date(selectedLogDetail.created_at + "Z").toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </span>
            </div>

            <div style={{ marginBottom: "14px" }}>
              <strong style={{ fontSize: "13px", display: "block", marginBottom: "4px" }}>Payload Enviado:</strong>
              <pre style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", overflow: "auto", maxHeight: "150px", fontSize: "11px", fontFamily: "monospace", border: "1px solid rgba(255,255,255,0.05)" }}>
                {selectedLogDetail.payload ? JSON.stringify(JSON.parse(selectedLogDetail.payload), null, 2) : "—"}
              </pre>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <strong style={{ fontSize: "13px", display: "block", marginBottom: "4px" }}>Resposta do Servidor Meta:</strong>
              <pre style={{ background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", overflow: "auto", maxHeight: "150px", fontSize: "11px", fontFamily: "monospace", border: "1px solid rgba(255,255,255,0.05)", color: selectedLogDetail.status === "success" ? "#a7f3d0" : "#fca5a5" }}>
                {selectedLogDetail.response ? JSON.stringify(JSON.parse(selectedLogDetail.response), null, 2) : "—"}
              </pre>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn-primary" onClick={() => setSelectedLogDetail(null)} style={{ padding: "8px 20px" }}>Fechar</button>
            </div>
          </div>
        </div>
      )}

    </AppLayout>
  );
}
