import { useState, useEffect } from "react";
import { useAuth, useApi } from "../contexts/auth-context";
import { AppLayout } from "../components/layout";
import { RefreshCw } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────

interface Automation {
  id: string;
  name: string;
}

interface CrmResponse {
  id: number;
  product_id: string;
  product_name: string;
  automation_id: string;
  phone: string;
  lead_name: string | null;
  flow_type: string;
  question_sent: string | null;
  response_text: string | null;
  response_media_url: string | null;
  response_media_type: string | null;
  ai_summary: string | null;
  ai_tags: string | null;
  status: "pending" | "sent" | "answered" | "expired";
  sent_at: string | null;
  answered_at: string | null;
  created_at: string;
}

interface DashboardMetrics {
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

interface Field {
  id?: string;
  type: "text" | "audio" | "video" | "image" | "document";
  content: string;
  file_name?: string | null;
}

interface ProductAsset {
  id: string;
  product_id: string;
  name: string;
  public_url: string;
  file_type: string;
  tag: string | null;
  is_delivery_file: number;
}

interface Product {
  id: string;
  name: string;
  assets: ProductAsset[];
  automations: { id: string }[];
}

interface CrmStage {
  id: string | number;
  automation_id: string;
  name: string;
  flow_type: string;
  delay_hours: number;
  message_template: string;
  enabled: number;
  is_custom?: number;
  sort_order?: number;
  created_at?: string;
  rewrite_mode?: "none" | "dynamic" | "static";
  rewrite_count?: number;
  variations?: string;
  class: "sucesso" | "sem_sucesso";
  fields: Field[];
}

interface TagCount {
  tag: string;
  count: number;
}

// ── Helpers ──────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + "Z");
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch { return dateStr; }
}

function flowLabel(type: string | null | undefined): string {
  if (!type) return "⚡ Outro";
  if (type === "satisfaction") return "😊 Satisfação";
  if (type === "testimonial") return "🎬 Depoimento";
  if (type === "objection") return "🔍 Objeções";
  return `⚡ ${type.charAt(0).toUpperCase() + type.slice(1)}`;
}

function flowBadgeClass(type: string | null | undefined): string {
  if (!type) return "badge-secondary";
  if (type === "satisfaction") return "badge-success";
  if (type === "testimonial") return "badge-brand";
  if (type === "objection") return "badge-warning";
  return "badge-secondary";
}

function statusLabel(status: string): string {
  if (status === "pending") return "⏳ Pendente";
  if (status === "sent") return "📤 Enviado";
  if (status === "answered") return "✅ Respondido";
  if (status === "expired") return "⌛ Expirado";
  return status;
}

function statusBadgeClass(status: string): string {
  if (status === "answered") return "badge-success";
  if (status === "sent") return "badge-brand";
  if (status === "expired") return "badge-danger";
  return "badge-secondary";
}

function parseTags(tagsJson: string | null): string[] {
  if (!tagsJson) return [];
  try { return JSON.parse(tagsJson); } catch { return []; }
}

function getHealthColor(score: number): string {
  if (score >= 8) return "#10b981";
  if (score >= 6) return "#f59e0b";
  if (score >= 4) return "#f97316";
  return "#ef4444";
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

// ── Component ──────────────────────────────────────────────────────

export default function CrmPage() {
  const { user } = useAuth();
  const { apiFetch } = useApi();

  // Tab state
  type TabId = "config" | "analysis" | "responses" | "testimonials" | "tags";
  const [activeTab, setActiveTab] = useState<TabId>("config");

  // Global Filter: Automations
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [selectedAutomationId, setSelectedAutomationId] = useState<string>("");

  // Global Filter: Date Range
  const initialDates = calcPresetDates(0);
  const [crmDateFrom, setCrmDateFrom] = useState<string>(initialDates.start);
  const [crmDateTo, setCrmDateTo] = useState<string>(initialDates.end);
  const [crmActiveDays, setCrmActiveDays] = useState<number>(0);

  const handlePreset = (days: number) => {
    const dates = calcPresetDates(days);
    setCrmDateFrom(dates.start);
    setCrmDateTo(dates.end);
    setCrmActiveDays(days);
  };

  const handleCustomDate = (field: "start" | "end", value: string) => {
    if (field === "start") {
      setCrmDateFrom(value);
    } else {
      setCrmDateTo(value);
    }
    setCrmActiveDays(-1);
  };

  // Dashboard
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  // AI Analysis
  const [analysisPeriod, setAnalysisPeriod] = useState<string>("7d");
  const [analysisResult, setAnalysisResult] = useState<string>("");
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  // Responses
  const [responses, setResponses] = useState<CrmResponse[]>([]);
  const [loadingResponses, setLoadingResponses] = useState(false);
  const [responseFlowFilter, setResponseFlowFilter] = useState<string>("all");
  const [responseStatusFilter, setResponseStatusFilter] = useState<string>("all");
  const [expandedResponseId, setExpandedResponseId] = useState<number | null>(null);

  // Testimonials
  const [testimonials, setTestimonials] = useState<CrmResponse[]>([]);
  const [loadingTestimonials, setLoadingTestimonials] = useState(false);

  // Tags
  const [tags, setTags] = useState<TagCount[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);

  // Config (Dynamic Stages)
  const [stages, setStages] = useState<CrmStage[]>([]);
  const [loadingStages, setLoadingStages] = useState(false);
  const [productsList, setProductsList] = useState<Product[]>([]);
  const [activeStageId, setActiveStageId] = useState<string | number>("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeClass, setActiveClass] = useState<"sucesso" | "sem_sucesso">("sucesso");

  const classStages = stages.filter((s) => s.class === activeClass);
  const currentStage = stages.find((s) => s.id === activeStageId);

  // Estados de Reordenação por Arraste para CRM
  const [draggedCrmStageIndex, setDraggedCrmStageIndex] = useState<number | null>(null);

  const handleCrmStageDragStart = (e: React.DragEvent, index: number) => {
    setDraggedCrmStageIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleCrmStageDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
  };

  const handleCrmStageDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedCrmStageIndex === null || draggedCrmStageIndex === targetIndex) return;

    // Obter todos os estágios da classe ativa e reordenar
    const activeClassStages = stages.filter((s) => s.class === activeClass);
    const otherClassStages = stages.filter((s) => s.class !== activeClass);

    const reorderedActiveStages = [...activeClassStages];
    const [draggedStage] = reorderedActiveStages.splice(draggedCrmStageIndex, 1);
    reorderedActiveStages.splice(targetIndex, 0, draggedStage);

    // Juntar tudo e atualizar o sort_order global
    const newStages = [
      ...otherClassStages,
      ...reorderedActiveStages
    ];

    const updatedStages = newStages.map((stage, idx) => ({
      ...stage,
      sort_order: idx + 1
    }));

    setStages(updatedStages);
    setDraggedCrmStageIndex(null);

    try {
      const reorderList = updatedStages.map((s) => ({ id: s.id, sort_order: s.sort_order }));
      await apiFetch(`/crm/config/${selectedAutomationId}/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stages: reorderList })
      });
    } catch (err) {
      console.error("Erro ao salvar ordenação de estágios de CRM:", err);
    }
  };

  // Modal Stage State
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingStageId, setEditingStageId] = useState<string | number | null>(null);
  const [modalStageName, setModalStageName] = useState("");
  const [modalDelayHours, setModalDelayHours] = useState<number>(24);
  const [modalStageClass, setModalStageClass] = useState<"sucesso" | "sem_sucesso">("sucesso");
  const [savingStage, setSavingStage] = useState(false);

  // ── Load active automations on mount ──
  useEffect(() => {
    if (user) {
      loadAutomations();
      loadProducts();
    }
  }, [user]);

  // Auto-select the first stage of the active class when class or stages change
  useEffect(() => {
    const classStages = stages.filter(s => s.class === activeClass);
    if (classStages.length > 0) {
      const stillValid = classStages.some(s => s.id === activeStageId);
      if (!stillValid) {
        setActiveStageId(classStages[0].id);
      }
    } else {
      setActiveStageId("");
    }
  }, [activeClass, stages]);

  // ── Fetch data on tab or global filter change ──
  useEffect(() => {
    if (!user) return;
    if (!selectedAutomationId) return;
    if (activeTab === "responses") loadResponses();
    else if (activeTab === "testimonials") loadTestimonials();
    else if (activeTab === "tags") loadTags();
    else if (activeTab === "config") loadStages();
  }, [activeTab, selectedAutomationId, crmDateFrom, crmDateTo, user]);

  // ── API Calls ──

  async function loadAutomations() {
    try {
      const res = await apiFetch("/followup/automations");
      if (res.ok) {
        const data = await res.json() as { data: Automation[] };
        const list = data.data || [];
        setAutomations(list);
        if (list.length > 0) {
          setSelectedAutomationId(list[0].id);
        }
      }
    } catch (err) {
      console.error("Erro ao carregar automações:", err);
    }
  }

  async function loadMetrics() {
    setLoadingMetrics(true);
    try {
      const params = new URLSearchParams();
      if (selectedAutomationId !== "all") params.set("automation_id", selectedAutomationId);
      if (crmDateFrom && crmDateTo) {
        params.set("data_inicio", crmDateFrom);
        params.set("data_fim", crmDateTo);
      }
      const res = await apiFetch(`/crm/dashboard?${params.toString()}`);
      if (res.ok) {
        const data = await res.json() as DashboardMetrics;
        setMetrics(data);
      }
    } catch (err) {
      console.error("Erro ao carregar métricas CRM:", err);
    }
    setLoadingMetrics(false);
  }

  async function loadResponses() {
    setLoadingResponses(true);
    try {
      const params = new URLSearchParams();
      if (selectedAutomationId !== "all") params.set("automation_id", selectedAutomationId);
      if (responseFlowFilter !== "all") params.set("flow_type", responseFlowFilter);
      if (responseStatusFilter !== "all") params.set("status", responseStatusFilter);
      if (crmDateFrom && crmDateTo) {
        params.set("data_inicio", crmDateFrom);
        params.set("data_fim", crmDateTo);
      }
      const res = await apiFetch(`/crm/responses?${params.toString()}`);
      if (res.ok) {
        const data = await res.json() as { data: CrmResponse[] };
        setResponses(data.data || []);
      }
    } catch (err) {
      console.error("Erro ao carregar respostas:", err);
    }
    setLoadingResponses(false);
  }

  async function loadTestimonials() {
    setLoadingTestimonials(true);
    try {
      const params = new URLSearchParams();
      if (selectedAutomationId !== "all") params.set("automation_id", selectedAutomationId);
      if (crmDateFrom && crmDateTo) {
        params.set("data_inicio", crmDateFrom);
        params.set("data_fim", crmDateTo);
      }
      const res = await apiFetch(`/crm/testimonials?${params.toString()}`);
      if (res.ok) {
        const data = await res.json() as { data: CrmResponse[] };
        setTestimonials(data.data || []);
      }
    } catch (err) {
      console.error("Erro ao carregar depoimentos:", err);
    }
    setLoadingTestimonials(false);
  }

  async function loadTags() {
    setLoadingTags(true);
    try {
      const params = new URLSearchParams();
      if (selectedAutomationId !== "all") params.set("automation_id", selectedAutomationId);
      if (crmDateFrom && crmDateTo) {
        params.set("data_inicio", crmDateFrom);
        params.set("data_fim", crmDateTo);
      }
      const res = await apiFetch(`/crm/tags?${params.toString()}`);
      if (res.ok) {
        const data = await res.json() as { data: TagCount[] };
        setTags(data.data || []);
      }
    } catch (err) {
      console.error("Erro ao carregar tags:", err);
    }
    setLoadingTags(false);
  }

  async function loadProducts() {
    try {
      const res = await apiFetch("/products");
      if (res.ok) {
        const data = (await res.json()) as { data: Product[] };
        setProductsList(data.data || []);
      }
    } catch (err) {
      console.error("Erro ao carregar produtos:", err);
    }
  }

  async function loadStages() {
    if (!selectedAutomationId || selectedAutomationId === "all") {
      setStages([]);
      return;
    }
    setLoadingStages(true);
    try {
      const res = await apiFetch(`/crm/config/${selectedAutomationId}`);
      if (res.ok) {
        const data = await res.json() as any;
        const rawStages = data.data?.stages || [];
        const mappedStages = rawStages.map((s: any) => {
          let fields: Field[] = [];
          const msg = s.message || "";
          if (msg) {
            if (msg.startsWith("[")) {
              try {
                fields = JSON.parse(msg) as Field[];
              } catch (e) {
                console.error("Erro parsing message blocks for CRM:", e);
                fields = [{ id: `legacy_${Date.now()}`, type: "text", content: msg }];
              }
            } else {
              fields = [{ id: `legacy_${Date.now()}`, type: "text", content: msg }];
            }
          }
          return {
            id: s.id,
            automation_id: s.automation_id,
            name: s.name,
            flow_type: s.key || "satisfaction",
            delay_hours: s.delay_hours,
            message_template: s.message || "",
            enabled: s.enabled,
            is_custom: (s.key !== 'satisfaction' && s.key !== 'testimonial' && s.key !== 'objection') ? 1 : 0,
            created_at: s.created_at,
            rewrite_mode: s.rewrite_mode || "none",
            rewrite_count: s.rewrite_count || 5,
            variations: s.variations || "[]",
            class: s.class || "sucesso",
            fields
          };
        });
        setStages(mappedStages);
      }
    } catch (err) {
      console.error("Erro ao carregar estágios de CRM:", err);
    }
    setLoadingStages(false);
  }

  async function runAnalysis() {
    setLoadingAnalysis(true);
    setAnalysisResult("");
    try {
      const body: any = { period: analysisPeriod };
      if (selectedAutomationId !== "all") body.automation_id = selectedAutomationId;
      const res = await apiFetch("/crm/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const data = await res.json() as { analysis: string };
        setAnalysisResult(data.analysis);
      } else {
        const err = await res.json() as any;
        setAnalysisResult(`❌ Erro: ${err.error || "Falha na análise"}`);
      }
    } catch (err) {
      setAnalysisResult("❌ Erro de conexão ao executar análise");
    }
    setLoadingAnalysis(false);
  }

  // Toggle stage state (enabled/disabled)
  async function toggleStage(stageId: string | number, currentStatus: number) {
    try {
      const newStatus = currentStatus === 1 ? 0 : 1;
      const res = await apiFetch(`/crm/config/${selectedAutomationId}/stages/${stageId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newStatus })
      });
      if (res.ok) {
        // Atualizar lista localmente
        setStages(prev => prev.map(s => s.id === stageId ? { ...s, enabled: newStatus } : s));
      }
    } catch (err) {
      console.error("Erro ao alternar status do estágio:", err);
    }
  }

  // Open modal for Creation
  function handleOpenCreateModal() {
    setModalMode("create");
    setEditingStageId(null);
    setModalStageName("");
    setModalDelayHours(24);
    setModalStageClass(activeClass);
    setShowModal(true);
  }

  // Create Stage
  async function handleCreateStage() {
    if (!modalStageName.trim()) {
      alert("Por favor, preencha o nome do estágio.");
      return;
    }
    setSavingStage(true);
    try {
      const body = {
        name: modalStageName.trim(),
        delay_hours: modalDelayHours,
        message: "[]",
        rewrite_mode: "none",
        rewrite_count: 5,
        class: modalStageClass,
        enabled: 1
      };

      const res = await apiFetch(`/crm/config/${selectedAutomationId}/stages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        setShowModal(false);
        setModalStageName("");
        setModalDelayHours(24);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        await loadStages();
      } else {
        const err = await res.json() as any;
        alert(`Erro ao criar estágio: ${err.error || "Tente novamente"}`);
      }
    } catch (err) {
      console.error("Erro ao criar estágio de CRM:", err);
      alert("Erro de conexão ao criar estágio.");
    }
    setSavingStage(false);
  }

  // Save stage changes (inline edit)
  async function handleSaveStage() {
    if (!selectedAutomationId || !currentStage) return;

    setSaving(true);
    const hasEmptyFields = currentStage.fields.some(f => !f.content.trim());
    if (hasEmptyFields) {
      alert("Por favor, preencha todos os blocos de texto ou selecione os arquivos das mídias antes de salvar.");
      setSaving(false);
      return;
    }

    try {
      const cleanedFields = currentStage.fields.map(f => ({
        type: f.type,
        content: f.content,
        file_name: f.file_name || null
      }));

      const body = {
        name: currentStage.name,
        delay_hours: Number(currentStage.delay_hours),
        enabled: currentStage.enabled,
        rewrite_mode: currentStage.rewrite_mode || "none",
        rewrite_count: currentStage.rewrite_count || 5,
        class: currentStage.class,
        message: JSON.stringify(cleanedFields)
      };

      const res = await apiFetch(`/crm/config/${selectedAutomationId}/stages/${currentStage.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        await loadStages();
      } else {
        const err = await res.json() as any;
        alert(err.error || "Ocorreu um erro ao salvar as alterações do estágio.");
      }
    } catch (err) {
      console.error("Erro ao salvar estágio:", err);
      alert("Erro de conexão ao tentar salvar as configurações.");
    }
    setSaving(false);
  }

  // Delete stage
  async function handleDeleteStage(stageId: string | number) {
    if (!confirm("Tem certeza que deseja excluir permanentemente este estágio de CRM?")) return;
    try {
      const res = await apiFetch(`/crm/config/${selectedAutomationId}/stages/${stageId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        if (activeStageId === stageId) {
          setActiveStageId("");
        }
        await loadStages();
      } else {
        const err = await res.json() as any;
        alert(`Erro ao excluir estágio: ${err.error || "Tente novamente"}`);
      }
    } catch (err) {
      console.error("Erro ao excluir estágio de CRM:", err);
    }
  }

  async function handleDeleteActiveStage() {
    if (currentStage) {
      await handleDeleteStage(currentStage.id);
    }
  }

  // Local State modification helpers
  function updateStageMeta<K extends keyof CrmStage>(key: K, value: CrmStage[K]) {
    setStages(prev => prev.map(s => s.id === activeStageId ? { ...s, [key]: value } : s));
  }

  function addField(type: Field["type"]) {
    if (!currentStage) return;
    const newField: Field = {
      id: `new_${Date.now()}`,
      type,
      content: "",
      file_name: ""
    };
    const newFields = [...currentStage.fields, newField];
    updateStageMeta("fields", newFields);
  }

  function deleteField(index: number) {
    if (!currentStage) return;
    if (!confirm("Deseja realmente remover este bloco de mensagem?")) return;
    const newFields = currentStage.fields.filter((_, idx) => idx !== index);
    updateStageMeta("fields", newFields);
  }

  function moveField(index: number, direction: "up" | "down") {
    if (!currentStage) return;
    const newFields = [...currentStage.fields];
    const targetIdx = direction === "up" ? index - 1 : index + 1;

    if (targetIdx < 0 || targetIdx >= newFields.length) return;

    const temp = newFields[index];
    newFields[index] = newFields[targetIdx];
    newFields[targetIdx] = temp;

    updateStageMeta("fields", newFields);
  }

  function handleFieldContentChange(index: number, text: string) {
    if (!currentStage) return;
    const newFields = currentStage.fields.map((f, idx) => 
      idx === index ? { ...f, content: text } : f
    );
    updateStageMeta("fields", newFields);
  }

  function renderMediaPreview(field: Field) {
    if (!field.content) return null;

    const isImage = field.type === "image" || field.content.match(/\.(jpeg|jpg|gif|png|webp)/i);
    const isAudio = field.type === "audio" || field.content.match(/\.(mp3|ogg|wav)/i);
    const isVideo = field.type === "video" || field.content.match(/\.(mp4|webm|avi)/i);

    return (
      <div style={{ marginTop: "12px", padding: "10px", background: "rgba(0,0,0,0.15)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ fontSize: "10px", color: "var(--color-text-muted)", marginBottom: "6px", display: "flex", justifyContent: "space-between" }}>
          <span>📂 Arquivo: <strong>{field.type === 'document' ? (field.file_name || "documento.pdf") : (field.content.split('/').pop() || "mídia")}</strong></span>
          <a href={field.content} target="_blank" rel="noreferrer" style={{ color: "var(--color-brand-400)", textDecoration: "none", fontWeight: "700" }}>Abrir Link ↗</a>
        </div>
        
        {isImage && (
          <img 
            src={field.content} 
            alt="Preview" 
            style={{ maxWidth: "100%", maxHeight: "150px", borderRadius: "6px", objectFit: "contain", border: "1px solid rgba(255,255,255,0.1)" }} 
          />
        )}
        
        {isAudio && (
          <audio 
            controls 
            src={field.content} 
            style={{ width: "100%", height: "32px", marginTop: "4px" }} 
          />
        )}
        
        {isVideo && (
          <video 
            controls 
            src={field.content} 
            style={{ maxWidth: "100%", maxHeight: "180px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.1)" }} 
          />
        )}

        {!isImage && !isAudio && !isVideo && (
          <div style={{ fontSize: "12px", color: "#e9edef", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>📄 Documento PDF ou Outro</span>
          </div>
        )}
      </div>
    );
  }

  function renderFieldCard(field: Field, index: number) {
    const isFirst = index === 0;
    const isLast = currentStage ? index === currentStage.fields.length - 1 : true;

    return (
      <div 
        key={index}
        className="glass-card"
        style={{
          padding: "16px 20px",
          background: "rgba(255, 255, 255, 0.01)",
          border: "1px solid rgba(255, 255, 255, 0.05)",
          borderRadius: "14px",
          display: "flex",
          gap: "16px",
          position: "relative",
          animation: "fadeIn 0.25s ease"
        }}
      >
        {/* Controle de ordenação e exclusão */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", justifyContent: "center", flexShrink: 0 }}>
          <button 
            type="button"
            className="btn-secondary"
            onClick={() => moveField(index, "up")}
            disabled={isFirst}
            style={{ width: "28px", height: "28px", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "6px" }}
            title="Mover para cima"
          >
            ▲
          </button>
          <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: "700", textAlign: "center" }}>
            {index + 1}
          </span>
          <button 
            type="button"
            className="btn-secondary"
            onClick={() => moveField(index, "down")}
            disabled={isLast}
            style={{ width: "28px", height: "28px", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "6px" }}
            title="Mover para baixo"
          >
            ▼
          </button>
        </div>

        {/* Editor do Bloco */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ 
              fontSize: "11px", 
              fontWeight: "800", 
              textTransform: "uppercase", 
              padding: "2px 8px", 
              borderRadius: "4px",
              background: field.type === "text" ? "rgba(12, 147, 242, 0.12)" : "rgba(234, 179, 8, 0.12)",
              color: field.type === "text" ? "#0c93f2" : "#eab308"
            }}>
              {field.type === "text" ? "💬 Bloco de Texto" : `📁 Mídia: ${field.type}`}
            </span>

            <button 
              type="button"
              className="btn-danger"
              onClick={() => deleteField(index)}
              style={{ width: "28px", height: "28px", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "6px" }}
              title="Excluir bloco"
            >
              🗑️
            </button>
          </div>

          {field.type === "text" ? (
            <div>
              <textarea
                className="input-field"
                placeholder="Escreva a mensagem do CRM aqui..."
                value={field.content}
                onChange={(e) => handleFieldContentChange(index, e.target.value)}
                rows={4}
                style={{ margin: 0, width: "100%", fontSize: "13px", resize: "vertical", background: "rgba(0,0,0,0.15)", border: "1px solid rgba(255,255,255,0.06)", fontFamily: "inherit" }}
              />
              <div style={{ fontSize: "10px", color: "var(--color-text-muted)", marginTop: "4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  Variáveis: <code style={{ color: "#2dd4bf" }}>{"{{nome}}"}</code>, <code style={{ color: "#2dd4bf" }}>{"{{produto}}"}</code>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    const parent = e.currentTarget.closest("div")?.parentElement;
                    const textarea = parent?.querySelector("textarea");
                    if (textarea) {
                      if (textarea.rows === 4) {
                        textarea.rows = 16;
                        e.currentTarget.textContent = "↕️ Recolher";
                      } else {
                        textarea.rows = 4;
                        e.currentTarget.textContent = "↕️ Expandir";
                      }
                    }
                  }}
                  style={{
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "6px",
                    padding: "2px 8px",
                    color: "#e2e8f0",
                    cursor: "pointer",
                    fontSize: "10px",
                    fontWeight: "600",
                    transition: "background 0.2s"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)"}
                >
                  ↕️ Expandir
                </button>
              </div>
            </div>
          ) : (
            <div>
              {(() => {
                const activeProducts = productsList.filter((p) =>
                  p.automations?.some((a) => a.id === selectedAutomationId)
                );
                const availableAssets = activeProducts.flatMap((p) => p.assets || []);
                const typeFilteredAssets = availableAssets.filter((a) => {
                  if (field.type === "document") {
                    return a.file_type === "pdf" || a.file_type === "document";
                  }
                  return a.file_type === field.type;
                });

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "var(--color-text-secondary)" }}>
                      Selecionar arquivo do produto:
                    </label>
                    <select
                      className="input-field"
                      value={field.content || ""}
                      onChange={(e) => {
                        const selectedUrl = e.target.value;
                        const selectedAsset = typeFilteredAssets.find((a) => a.public_url === selectedUrl);
                        if (selectedAsset) {
                          setStages((prev) =>
                            prev.map((s) =>
                              s.id === activeStageId
                                ? {
                                    ...s,
                                    fields: s.fields.map((f, idx) =>
                                      idx === index
                                        ? { ...f, content: selectedAsset.public_url, file_name: f.type === 'document' ? selectedAsset.name : "" }
                                        : f
                                    ),
                                  }
                                : s
                            )
                          );
                        } else {
                          setStages((prev) =>
                            prev.map((s) =>
                              s.id === activeStageId
                                ? {
                                    ...s,
                                    fields: s.fields.map((f, idx) =>
                                      idx === index ? { ...f, content: "", file_name: "" } : f
                                    ),
                                  }
                                : s
                            )
                          );
                        }
                      }}
                      style={{ margin: 0, fontSize: "12px", background: "rgba(0,0,0,0.15)", border: "1px solid rgba(255,255,255,0.06)", fontWeight: "600" }}
                    >
                      <option value="">-- Selecione um arquivo --</option>
                      {typeFilteredAssets.map((asset) => (
                        <option key={asset.id} value={asset.public_url}>
                          📦 {asset.name} {asset.tag ? `[Tag: ${asset.tag}]` : ""}
                        </option>
                      ))}
                    </select>

                    {typeFilteredAssets.length === 0 && (
                      <div style={{ fontSize: "11px", color: "#eab308", display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
                        <span>⚠️</span> Nenhum arquivo <strong>{field.type}</strong> associado aos produtos desta automação. Cadastre na aba <strong>Produtos</strong>.
                      </div>
                    )}

                    {field.content && renderMediaPreview(field)}

                    {(field.type === "image" || field.type === "video") && field.content && (
                      <div style={{ marginTop: "10px" }}>
                        <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "var(--color-text-secondary)", marginBottom: "4px" }}>
                          Legenda da imagem/vídeo (Opcional):
                        </label>
                        <textarea
                          className="input-field"
                          placeholder="Digite uma legenda para enviar junto com a mídia..."
                          value={field.file_name || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (currentStage) {
                              const newFields = currentStage.fields.map((f, idx) =>
                                idx === index ? { ...f, file_name: val } : f
                              );
                              updateStageMeta("fields", newFields);
                            }
                          }}
                          rows={2}
                          style={{ margin: 0, width: "100%", fontSize: "12px", background: "rgba(0,0,0,0.15)", border: "1px solid rgba(255,255,255,0.06)", resize: "vertical" }}
                        />
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Tabs definition ──
  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "config", label: "📋 Mensagens" },
    { id: "analysis", label: "🤖 AI Analysis" },
    { id: "responses", label: "💬 Respostas" },
    { id: "testimonials", label: "🎬 Depoimentos" },
    { id: "tags", label: "🏷️ Tags" },
  ];

  return (
    <AppLayout title="CRM / Pesquisa Pós-Término de Funil">

      {/* ── Filtro Global de Automação ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px",
        padding: "14px 20px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: "14px", flexWrap: "wrap", backdropFilter: "blur(8px)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          <span style={{ fontSize: "14px", fontWeight: "700", color: "var(--color-text-secondary)" }}>Automação:</span>
        </div>
        <select
          className="input-field"
          value={selectedAutomationId}
          onChange={(e) => setSelectedAutomationId(e.target.value)}
          style={{ margin: 0, height: "38px", minWidth: "240px", flex: "1", maxWidth: "340px", fontWeight: "600" }}
        >
          {automations.map(a => <option key={a.id} value={a.id}>🤖 {a.name}</option>)}
        </select>
        
        {saveSuccess && (
          <span style={{ fontSize: "13px", color: "#10b981", fontWeight: "700", marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px", animation: "fadeIn 0.3s ease" }}>
            <span>💾</span> Salvo com sucesso!
          </span>
        )}
      </div>

      {/* Date Range Preset & Filters bar matching Image 2 */}
      {activeTab !== "config" && (
        <div className="flex flex-wrap items-center gap-2 mb-8 p-4 rounded-xl bg-[#0f1524]/60 border border-border" style={{ border: "1px solid rgba(255, 255, 255, 0.06)", background: "rgba(15, 21, 36, 0.4)" }}>
          <div className="flex flex-wrap gap-1">
            {DATE_PRESETS.map(p => (
              <button
                key={p.days}
                onClick={() => handlePreset(p.days)}
                className={`toggle-btn ${crmActiveDays === p.days ? "active" : ""}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <input
              type="date"
              value={crmDateFrom}
              onChange={e => handleCustomDate("start", e.target.value)}
              className="date-input"
            />
            <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>➔</span>
            <input
              type="date"
              value={crmDateTo}
              onChange={e => handleCustomDate("end", e.target.value)}
              className="date-input"
            />
            
            <button
              onClick={() => {
                if (activeTab === "responses") loadResponses();
                else if (activeTab === "testimonials") loadTestimonials();
                else if (activeTab === "tags") loadTags();
              }}
              className="btn-secondary"
              style={{ padding: "6px 12px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "8px", marginLeft: "12px" }}
              title="Atualizar dados"
            >
              <RefreshCw size={14} className={(loadingResponses || loadingTestimonials || loadingTags) ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      )}

      {/* ── Tab Navigation ── */}
      <div
        style={{
          display: "flex", gap: "8px", padding: "6px",
          background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "14px", marginBottom: "28px", backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)", overflowX: "auto"
        }}
        className="tab-list"
      >
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "10px 18px",
              borderRadius: "10px",
              border: "none",
              background: activeTab === tab.id ? "rgba(45, 212, 191, 0.15)" : "transparent",
              color: activeTab === tab.id ? "#2dd4bf" : "var(--color-text-secondary)",
              fontWeight: "700",
              cursor: "pointer",
              transition: "all 0.2s",
              whiteSpace: "nowrap"
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ABA 2: AI ANALYSIS                                         */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === "analysis" && (
        <div className="glass-card animate-fade-in-up" style={{ padding: "28px" }}>
          <div style={{ marginBottom: "24px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: "800", margin: 0 }}>🤖 Análise de Sentimento (LLM)</h2>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "13px", marginTop: "4px" }}>
              Analise qualitativamente as respostas coletadas via IA para entender pontos fortes, fracos e sugestões de funil.
            </p>
          </div>

          <div style={{ display: "flex", gap: "12px", marginBottom: "24px", flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <label style={{ display: "block", fontSize: "11px", color: "var(--color-text-muted)", marginBottom: "4px", fontWeight: "600" }}>Período de Análise</label>
              <select
                className="input-field"
                value={analysisPeriod}
                onChange={(e) => setAnalysisPeriod(e.target.value)}
                style={{ margin: 0, height: "40px", minWidth: "180px" }}
              >
                <option value="7d">📅 Últimos 7 dias</option>
                <option value="15d">📅 Últimos 15 dias</option>
                <option value="30d">📅 Últimos 30 dias</option>
              </select>
            </div>

            <button
              className="btn-primary"
              onClick={runAnalysis}
              disabled={loadingAnalysis}
              style={{
                height: "40px", display: "flex", alignItems: "center", gap: "8px",
                padding: "0 24px", fontSize: "14px", fontWeight: "700"
              }}
            >
              {loadingAnalysis ? (
                <><div className="spinner" style={{ width: "16px", height: "16px", borderWidth: "2px" }} /> Gerando Insight...</>
              ) : (
                <>🧠 Analisar com IA</>
              )}
            </button>
          </div>

          {analysisResult && (
            <div style={{
              padding: "24px", borderRadius: "14px",
              background: "rgba(45, 212, 191, 0.05)", border: "1px solid rgba(45, 212, 191, 0.15)",
              whiteSpace: "pre-wrap", lineHeight: "1.7", fontSize: "14px",
              color: "var(--color-text-primary)", boxShadow: "0 8px 32px rgba(45,212,191,0.05)"
            }}>
              {analysisResult}
            </div>
          )}

          {!analysisResult && !loadingAnalysis && (
            <div style={{
              textAlign: "center", padding: "60px", color: "var(--color-text-muted)",
              border: "1px dashed rgba(255,255,255,0.08)", borderRadius: "12px"
            }}>
              Selecione o período e execute a análise para obter feedback estruturado da IA.
              <br /><br />
              <span style={{ fontSize: "12px", color: "var(--color-brand-400)", fontWeight: "600" }}>
                {selectedAutomationId !== "all" ? "🎯 Analisando respostas da automação selecionada" : "🌐 Analisando todas as automações de forma cruzada"}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ABA 3: RESPOSTAS                                           */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === "responses" && (
        <div className="glass-card animate-fade-in-up" style={{ padding: "28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <h2 style={{ fontSize: "20px", fontWeight: "800", margin: 0 }}>💬 Histórico de Respostas</h2>
              <p style={{ color: "var(--color-text-secondary)", fontSize: "13px", marginTop: "4px" }}>
                Feedback completo enviado pelos seus clientes em tempo real.
              </p>
            </div>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--color-text-muted)", marginBottom: "4px", fontWeight: "600" }}>Fluxo</label>
                <select className="input-field" value={responseFlowFilter} onChange={(e) => setResponseFlowFilter(e.target.value)} style={{ margin: 0, height: "38px", minWidth: "140px" }}>
                  <option value="all">Todos os tipos</option>
                  <option value="satisfaction">😊 Satisfação</option>
                  <option value="testimonial">🎬 Depoimento</option>
                  <option value="objection">🔍 Objeções</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--color-text-muted)", marginBottom: "4px", fontWeight: "600" }}>Status</label>
                <select className="input-field" value={responseStatusFilter} onChange={(e) => setResponseStatusFilter(e.target.value)} style={{ margin: 0, height: "38px", minWidth: "140px" }}>
                  <option value="all">Todos os status</option>
                  <option value="sent">📤 Enviado</option>
                  <option value="answered">✅ Respondido</option>
                  <option value="expired">⌛ Expirado</option>
                </select>
              </div>
              <button className="btn-secondary" onClick={loadResponses} disabled={loadingResponses} style={{ height: "38px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "0 14px" }}>
                <span>🔄</span> Atualizar
              </button>
            </div>
          </div>

          {loadingResponses ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}><div className="spinner" style={{ width: "30px", height: "30px" }} /></div>
          ) : responses.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--color-text-muted)", border: "1px dashed rgba(255,255,255,0.08)", borderRadius: "12px" }}>
              Nenhuma resposta localizada no filtro atual.
            </div>
          ) : (
            <div style={{ border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflow: "auto", background: "var(--color-surface-900)", WebkitOverflowScrolling: "touch" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
                    <th style={{ padding: "12px" }}>Lead</th>
                    <th style={{ padding: "12px" }}>Automação</th>
                    <th style={{ padding: "12px" }}>Tipo</th>
                    <th style={{ padding: "12px" }}>Resposta do Cliente</th>
                    <th style={{ padding: "12px" }}>Tags IA</th>
                    <th style={{ padding: "12px" }}>Status</th>
                    <th style={{ padding: "12px" }}>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {responses.map((r) => (
                    <>
                      <tr
                        key={r.id}
                        onClick={() => setExpandedResponseId(expandedResponseId === r.id ? null : r.id)}
                        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", transition: "background 0.2s" }}
                        className="hover:bg-white/2"
                      >
                        <td style={{ padding: "12px" }}>
                          <div style={{ fontWeight: "700" }}>{r.lead_name || "Sem nome"}</div>
                          <div style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>{r.phone}</div>
                        </td>
                        <td style={{ padding: "12px", color: "var(--color-brand-400)", fontWeight: "600" }}>{r.product_name}</td>
                        <td style={{ padding: "12px" }}>
                          <span className={`badge ${flowBadgeClass(r.flow_type)}`} style={{ fontSize: "11px", padding: "3px 8px" }}>{flowLabel(r.flow_type)}</span>
                        </td>
                        <td style={{ padding: "12px", maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--color-text-secondary)" }}>
                          {r.response_text || (r.response_media_type ? `📎 ${r.response_media_type}` : "—")}
                        </td>
                        <td style={{ padding: "12px" }}>
                          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                            {parseTags(r.ai_tags).slice(0, 3).map((tag, i) => (
                              <span key={i} style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "6px", background: "rgba(12, 147, 242, 0.12)", color: "var(--color-brand-400)", whiteSpace: "nowrap" }}>{tag}</span>
                            ))}
                          </div>
                        </td>
                        <td style={{ padding: "12px" }}>
                          <span className={`badge ${statusBadgeClass(r.status)}`} style={{ fontSize: "11px", padding: "2px 8px" }}>{statusLabel(r.status)}</span>
                        </td>
                        <td style={{ padding: "12px", color: "var(--color-text-muted)", whiteSpace: "nowrap", fontSize: "12px" }}>{formatDate(r.created_at)}</td>
                      </tr>
                      {expandedResponseId === r.id && (
                        <tr key={`${r.id}-detail`}>
                          <td colSpan={7} style={{ padding: "20px 24px", background: "rgba(12, 147, 242, 0.02)", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px" }}>
                              <div>
                                <strong style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Pergunta enviada pelo bot:</strong>
                                <p style={{ marginTop: "4px", fontSize: "13px", color: "var(--color-text-secondary)", background: "rgba(255,255,255,0.02)", padding: "10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.04)" }}>{r.question_sent || "Não registrado"}</p>
                                <strong style={{ fontSize: "12px", color: "var(--color-text-muted)", display: "block", marginTop: "12px" }}>Resposta do cliente:</strong>
                                <p style={{ marginTop: "6px", fontSize: "14px", fontWeight: "600", lineHeight: "1.6" }}>{r.response_text || "Sem resposta de texto"}</p>
                                {r.response_media_url && (
                                  <div style={{ marginTop: "12px" }}>
                                    {r.response_media_type === "video" ? (
                                      <video controls src={r.response_media_url} style={{ maxWidth: "100%", borderRadius: "8px" }} />
                                    ) : r.response_media_type === "audio" ? (
                                      <audio controls src={r.response_media_url} style={{ width: "100%" }} />
                                    ) : null}
                                  </div>
                                )}
                              </div>
                              <div>
                                <strong style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Análise da IA / Resumo:</strong>
                                <p style={{ marginTop: "6px", fontSize: "13px", lineHeight: "1.6", color: "#2dd4bf", background: "rgba(45, 212, 191, 0.04)", border: "1px solid rgba(45, 212, 191, 0.15)" }}>{r.ai_summary || "Análise pendente..."}</p>
                                <div style={{ marginTop: "12px" }}>
                                  <strong style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Tags extraídas por IA:</strong>
                                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
                                    {parseTags(r.ai_tags).map((tag, i) => (
                                      <span key={i} style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "8px", background: "rgba(12, 147, 242, 0.12)", color: "var(--color-brand-400)", fontWeight: "600" }}>{tag}</span>
                                    ))}
                                    {parseTags(r.ai_tags).length === 0 && <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Sem tags no momento</span>}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ABA 4: DEPOIMENTOS                                        */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === "testimonials" && (
        <div className="animate-fade-in-up">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h2 style={{ fontSize: "20px", fontWeight: "800", margin: 0 }}>🎬 Depoimentos de Clientes</h2>
              <p style={{ color: "var(--color-text-secondary)", fontSize: "13px", marginTop: "4px" }}>
                Depoimentos, vídeos e áudios enviados voluntariamente pelos clientes.
              </p>
            </div>
            <button className="btn-secondary" onClick={loadTestimonials} disabled={loadingTestimonials} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              🔄 Atualizar
            </button>
          </div>

          {loadingTestimonials ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}><div className="spinner" style={{ width: "30px", height: "30px" }} /></div>
          ) : testimonials.length === 0 ? (
            <div className="glass-card" style={{ textAlign: "center", padding: "60px", color: "var(--color-text-muted)" }}>
              Nenhum depoimento coletado no momento.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "20px" }}>
              {testimonials.map((t) => (
                <div key={t.id} className="glass-card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "12px", transition: "transform 0.2s" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: "700", fontSize: "14px" }}>{t.lead_name || t.phone}</div>
                      <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{t.product_name}</div>
                    </div>
                    <span className={`badge ${t.response_media_type === "video" ? "badge-success" : t.response_media_type === "audio" ? "badge-brand" : "badge-secondary"}`} style={{ fontSize: "10px" }}>
                      {t.response_media_type === "video" ? "🎬 Vídeo" : t.response_media_type === "audio" ? "🎙️ Áudio" : "💬 Texto"}
                    </span>
                  </div>

                  {t.response_media_url && t.response_media_type === "video" && (
                    <video controls src={t.response_media_url} style={{ width: "100%", borderRadius: "10px", maxHeight: "200px", objectFit: "cover" }} />
                  )}
                  {t.response_media_url && t.response_media_type === "audio" && (
                    <audio controls src={t.response_media_url} style={{ width: "100%" }} />
                  )}

                  {t.response_text && (
                    <p style={{ fontSize: "13px", lineHeight: "1.6", color: "var(--color-text-secondary)", margin: 0, fontStyle: "italic" }}>
                      "{t.response_text}"
                    </p>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "10px" }}>
                    <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{formatDate(t.answered_at || t.created_at)}</span>
                    {t.response_media_url && (
                      <a href={t.response_media_url} target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ fontSize: "11px", padding: "4px 10px", textDecoration: "none" }}>
                        ⬇️ Download
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ABA 5: TAGS                                                */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === "tags" && (
        <div className="glass-card animate-fade-in-up" style={{ padding: "28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h2 style={{ fontSize: "20px", fontWeight: "800", margin: 0 }}>🏷️ Tags Inteligentes</h2>
              <p style={{ color: "var(--color-text-secondary)", fontSize: "13px", marginTop: "4px" }}>
                Tags geradas dinamicamente pela IA para mapear padrões de resposta.
              </p>
            </div>
            <button className="btn-secondary" onClick={loadTags} disabled={loadingTags} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              🔄 Atualizar
            </button>
          </div>

          {loadingTags ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}><div className="spinner" style={{ width: "30px", height: "30px" }} /></div>
          ) : tags.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "var(--color-text-muted)", border: "1px dashed rgba(255,255,255,0.08)", borderRadius: "12px" }}>
              Nenhuma tag categorizada ainda.
            </div>
          ) : (
            <>
              {/* Tag Cloud */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "center", marginBottom: "32px", padding: "24px", background: "rgba(255,255,255,0.02)", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.06)" }}>
                {tags.map((t, i) => {
                  const maxCount = Math.max(...tags.map(tg => tg.count));
                  const ratio = t.count / maxCount;
                  const fontSize = 12 + ratio * 16;
                  const opacity = 0.6 + ratio * 0.4;
                  return (
                    <span key={i} style={{
                      fontSize: `${fontSize}px`, padding: "6px 14px", borderRadius: "10px",
                      background: `rgba(45, 212, 191, ${0.08 + ratio * 0.15})`,
                      color: `rgba(94, 234, 212, ${opacity})`,
                      fontWeight: ratio > 0.5 ? "700" : "500", cursor: "default",
                      transition: "all 0.2s", border: "1px solid rgba(45, 212, 191, 0.15)",
                      boxShadow: ratio > 0.6 ? "0 4px 16px rgba(45, 212, 191, 0.1)" : "none"
                    }}>
                      {t.tag} <span style={{ fontSize: "11px", opacity: 0.7 }}>({t.count})</span>
                    </span>
                  );
                })}
              </div>

              {/* Tag Table */}
              <div style={{ border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflow: "auto", background: "var(--color-surface-900)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
                      <th style={{ padding: "12px", textAlign: "left" }}>Marcador</th>
                      <th style={{ padding: "12px", textAlign: "center" }}>Frequência</th>
                      <th style={{ padding: "12px", textAlign: "left" }}>Proporção</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tags.sort((a, b) => b.count - a.count).map((t, i) => {
                      const maxCount = Math.max(...tags.map(tg => tg.count));
                      const pct = (t.count / maxCount) * 100;
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <td style={{ padding: "12px" }}>
                            <span style={{ fontSize: "12px", padding: "3px 8px", borderRadius: "6px", background: "rgba(12, 147, 242, 0.12)", color: "var(--color-brand-400)", fontWeight: "600" }}>{t.tag}</span>
                          </td>
                          <td style={{ padding: "12px", textAlign: "center", fontWeight: "700", color: "var(--color-brand-400)" }}>{t.count}</td>
                          <td style={{ padding: "12px" }}>
                            <div style={{ height: "8px", borderRadius: "4px", background: "rgba(255,255,255,0.04)", overflow: "hidden", maxWidth: "250px" }}>
                              <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg, #0c93f2, #2dd4bf)", borderRadius: "4px", transition: "width 0.5s ease" }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ABA 6: CONFIGURAÇÕES (Dinâmicas)                            */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === "config" && (
        <div className="animate-fade-in-up" style={{ display: "flex", flexDirection: "column" }}>
          
          {/* Topo do Estágio */}
          <div style={{ marginBottom: "20px" }}>
            <p style={{ color: "var(--color-text-primary)", fontSize: "14px", fontWeight: "700", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              ⚙️ Configure mensagens de pesquisa de acordo com a finalização do funil abaixo:
            </p>
          </div>

          {selectedAutomationId === "all" ? (
            <div className="glass-card" style={{ textAlign: "center", padding: "60px", color: "var(--color-text-secondary)" }}>
              <div style={{ fontSize: "40px", marginBottom: "16px" }}>🎯</div>
              <h3 style={{ fontSize: "16px", fontWeight: "700", color: "var(--color-text-primary)" }}>Selecione uma Automação</h3>
              <p style={{ maxWidth: "450px", margin: "8px auto 0 auto", fontSize: "13px", color: "var(--color-text-muted)" }}>
                Para gerenciar ou cadastrar estágios de CRM de pós-venda, por favor selecione uma automação específica no filtro superior da tela.
              </p>
            </div>
          ) : loadingStages ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}><div className="spinner" style={{ width: "30px", height: "30px" }} /></div>
          ) : (
            <>
              {/* Abas Principais de Classes (Horizontal) */}
              <div style={{
                display: "flex", gap: "8px", padding: "6px",
                background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "14px", marginBottom: "20px", backdropFilter: "blur(12px)",
                width: "fit-content", overflowX: "auto"
              }}>
                <button
                  type="button"
                  onClick={() => setActiveClass("sucesso")}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "10px",
                    border: "none",
                    background: activeClass === "sucesso" ? "rgba(45, 212, 191, 0.15)" : "transparent",
                    color: activeClass === "sucesso" ? "#2dd4bf" : "var(--color-text-secondary)",
                    fontWeight: "700",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    whiteSpace: "nowrap",
                    fontSize: "13px"
                  }}
                >
                  🎉 Finalizado com Sucesso
                </button>
                <button
                  type="button"
                  onClick={() => setActiveClass("sem_sucesso")}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "10px",
                    border: "none",
                    background: activeClass === "sem_sucesso" ? "rgba(239, 68, 68, 0.15)" : "transparent",
                    color: activeClass === "sem_sucesso" ? "#ef4444" : "var(--color-text-secondary)",
                    fontWeight: "700",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    whiteSpace: "nowrap",
                    fontSize: "13px"
                  }}
                >
                  ❌ Finalizado sem Sucesso
                </button>
              </div>

              {/* Abas de Estágios da Classe (Sub-tabs) */}
              <div style={{ display: "flex", gap: "8px", marginBottom: "28px", overflowX: "auto", paddingBottom: "4px", alignItems: "center" }}>
                {classStages.map((stage, index) => (
                  <button
                    key={stage.id}
                    onClick={() => setActiveStageId(stage.id)}
                    className={`btn-secondary ${activeStageId === stage.id ? "active-button-glow" : ""}`}
                    draggable={true}
                    onDragStart={(e) => handleCrmStageDragStart(e, index)}
                    onDragOver={(e) => handleCrmStageDragOver(e, index)}
                    onDrop={(e) => handleCrmStageDrop(e, index)}
                    style={{
                      background: activeStageId === stage.id ? "rgba(45, 212, 191, 0.1)" : "rgba(255,255,255,0.02)",
                      border: activeStageId === stage.id ? "1px solid #2dd4bf" : "1px solid rgba(255,255,255,0.06)",
                      color: activeStageId === stage.id ? "#2dd4bf" : "var(--color-text-secondary)",
                      borderRadius: "8px",
                      fontSize: "12px",
                      fontWeight: "700",
                      padding: "8px 16px",
                      whiteSpace: "nowrap",
                      opacity: stage.enabled ? 1 : 0.6,
                      cursor: "grab"
                    }}
                  >
                    {stage.enabled ? "🟢" : "⚫"} {stage.name} ({stage.delay_hours}h)
                  </button>
                ))}

                <button
                  onClick={handleOpenCreateModal}
                  className="btn-secondary"
                  style={{
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: "800",
                    padding: "8px 16px",
                    background: "rgba(45, 212, 191, 0.05)",
                    border: "1px dashed rgba(45, 212, 191, 0.3)",
                    color: "#2dd4bf",
                    whiteSpace: "nowrap"
                  }}
                >
                  ＋ Novo Estágio
                </button>
              </div>

              {!currentStage ? (
                <div className="glass-card" style={{ textAlign: "center", padding: "60px", color: "var(--color-text-muted)" }}>
                  Nenhum estágio de CRM cadastrado. Clique em "Novo Estágio" para criar um!
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px]" style={{ gap: "28px", alignItems: "start" }}>
                  
                  {/* Coluna da Esquerda: Configurações e Bloco de Mensagens */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    <div className="glass-card" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
                      
                      {/* Topo do Estágio */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "16px" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <h3 style={{ fontSize: "16px", fontWeight: "800", color: "var(--color-text-primary)" }}>
                              Configurações do Estágio: {currentStage.name}
                            </h3>
                            {currentStage.is_custom === 1 && (
                              <span style={{ fontSize: "9px", padding: "2px 6px", borderRadius: "4px", background: "rgba(59,130,246,0.15)", color: "#3b82f6", fontWeight: "700" }}>CUSTOM</span>
                            )}
                          </div>
                          <p style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "4px" }}>
                            Defina o delay e as regras deste follow-up de CRM.
                          </p>
                        </div>

                        {/* Ativar / Desativar Estágio */}
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ fontSize: "12px", fontWeight: "700", color: currentStage.enabled ? "#2dd4bf" : "var(--color-text-muted)" }}>
                            {currentStage.enabled ? "✅ Habilitado" : "❌ Desabilitado"}
                          </span>
                          <label style={{ display: "flex", alignItems: "center", cursor: "pointer", position: "relative" }}>
                            <input
                              type="checkbox"
                              checked={currentStage.enabled === 1}
                              onChange={(e) => updateStageMeta("enabled", e.target.checked ? 1 : 0)}
                              style={{ display: "none" }}
                            />
                            <div style={{
                              width: "38px",
                              height: "20px",
                              borderRadius: "10px",
                              background: currentStage.enabled ? "linear-gradient(90deg, #2dd4bf, #059669)" : "rgba(255,255,255,0.1)",
                              position: "relative",
                              transition: "background 0.3s"
                            }}>
                              <div style={{
                                width: "16px",
                                height: "16px",
                                borderRadius: "50%",
                                background: "#fff",
                                position: "absolute",
                                top: "2px",
                                left: currentStage.enabled ? "20px" : "2px",
                                transition: "left 0.25s ease",
                                boxShadow: "0 1px 3px rgba(0,0,0,0.3)"
                              }} />
                            </div>
                          </label>
                        </div>
                      </div>

                      {/* Metadados do Estágio */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "16px" }}>
                        <div>
                          <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--color-text-secondary)", marginBottom: "6px" }}>
                            Nome do Estágio
                          </label>
                          <input
                            type="text"
                            className="input-field"
                            value={currentStage.name}
                            onChange={(e) => updateStageMeta("name", e.target.value)}
                            style={{ margin: 0, fontSize: "12px" }}
                          />
                        </div>
                        
                        <div>
                          <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--color-text-secondary)", marginBottom: "6px" }}>
                            Delay do Disparo (horas)
                          </label>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <input
                              type="number"
                              className="input-field"
                              value={currentStage.delay_hours}
                              onChange={(e) => updateStageMeta("delay_hours", parseInt(e.target.value) || 0)}
                              style={{ margin: 0, fontSize: "12px", width: "80px" }}
                              min={1}
                            />
                            <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: "600" }}>
                              horas
                            </span>
                          </div>
                        </div>

                        <div>
                          <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--color-text-secondary)", marginBottom: "6px" }}>
                            Categoria do Estágio
                          </label>
                          <select
                            className="input-field"
                            value={currentStage.class || "sucesso"}
                            onChange={(e) => updateStageMeta("class", e.target.value as any)}
                            style={{ margin: 0, fontSize: "12px" }}
                          >
                            <option value="sucesso">🎉 Finalizado com Sucesso</option>
                            <option value="sem_sucesso">❌ Finalizado sem Sucesso</option>
                          </select>
                        </div>
                      </div>

                      {/* IA Variabilidade */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "10px", padding: "12px" }}>
                        <div>
                          <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "var(--color-text-secondary)", marginBottom: "4px" }}>
                            Modo de Reescrita de IA (Anti-Bloqueio)
                          </label>
                          <select
                            className="input-field"
                            value={currentStage.rewrite_mode || "none"}
                            onChange={(e) => updateStageMeta("rewrite_mode", e.target.value as any)}
                            style={{ margin: 0, fontSize: "12px" }}
                          >
                            <option value="none">Nenhum (Texto fixo)</option>
                            <option value="dynamic">⚡ Dinâmico (LLM reescreve no disparo)</option>
                            <option value="static">📋 Estático (Gera N variações e rotaciona)</option>
                          </select>
                        </div>

                        {currentStage.rewrite_mode === "static" && (
                          <div>
                            <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "var(--color-text-secondary)", marginBottom: "4px" }}>
                              Quantidade de Variações
                            </label>
                            <input
                              type="number"
                              className="input-field"
                              value={currentStage.rewrite_count || 5}
                              onChange={(e) => updateStageMeta("rewrite_count", Math.max(2, parseInt(e.target.value) || 2))}
                              style={{ margin: 0, fontSize: "12px", width: "80px" }}
                              min={2}
                              max={20}
                            />
                          </div>
                        )}
                      </div>

                      {/* Sequência de blocos */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "10px" }}>
                        <h4 style={{ fontSize: "13px", fontWeight: "800", color: "var(--color-text-secondary)" }}>
                          Sequência de Blocos do CRM
                        </h4>

                        {currentStage.fields.length === 0 ? (
                          <div style={{ padding: "40px 20px", border: "1px dashed rgba(255,255,255,0.06)", borderRadius: "14px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "12px" }}>
                            Nenhum bloco de mensagem cadastrado. Use os botões abaixo para adicionar texto e mídias!
                          </div>
                        ) : (
                          currentStage.fields.map((field, idx) => renderFieldCard(field, idx))
                        )}
                      </div>

                      {/* Botões para Adicionar Novos Blocos */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "20px", marginTop: "10px" }}>
                        <button 
                          type="button" 
                          className="btn-secondary" 
                          onClick={() => addField("text")}
                          style={{ fontSize: "12px", fontWeight: "700", padding: "6px 14px", borderRadius: "8px" }}
                        >
                          ＋ Texto
                        </button>
                        <button 
                          type="button" 
                          className="btn-secondary" 
                          onClick={() => addField("audio")}
                          style={{ fontSize: "12px", fontWeight: "700", padding: "6px 14px", borderRadius: "8px" }}
                        >
                          ＋ Áudio
                        </button>
                        <button 
                          type="button" 
                          className="btn-secondary" 
                          onClick={() => addField("image")}
                          style={{ fontSize: "12px", fontWeight: "700", padding: "6px 14px", borderRadius: "8px" }}
                        >
                          ＋ Imagem
                        </button>
                        <button 
                          type="button" 
                          className="btn-secondary" 
                          onClick={() => addField("video")}
                          style={{ fontSize: "12px", fontWeight: "700", padding: "6px 14px", borderRadius: "8px" }}
                        >
                          ＋ Vídeo
                        </button>
                        <button 
                          type="button" 
                          className="btn-secondary" 
                          onClick={() => addField("document")}
                          style={{ fontSize: "12px", fontWeight: "700", padding: "6px 14px", borderRadius: "8px" }}
                        >
                          ＋ PDF / Doc
                        </button>
                      </div>

                      {/* Rodapé de Ações do Estágio */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "20px", marginTop: "10px" }}>
                        {currentStage.is_custom === 1 ? (
                          <button
                            type="button"
                            className="btn-danger"
                            onClick={handleDeleteActiveStage}
                            disabled={saving}
                            style={{ height: "42px", fontWeight: "700", borderRadius: "10px", padding: "0 18px" }}
                          >
                            🗑️ Excluir Estágio
                          </button>
                        ) : (
                          <div />
                        )}

                        <button
                          type="button"
                          className="btn-primary"
                          onClick={handleSaveStage}
                          disabled={saving}
                          style={{ minWidth: "140px", height: "42px", fontWeight: "700", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}
                        >
                          {saving ? (
                            <div className="spinner" style={{ width: "20px", height: "20px" }} />
                          ) : (
                            "💾 Salvar Alterações"
                          )}
                        </button>
                      </div>

                    </div>
                  </div>

                  {/* Coluna da Direita: Preview e Variações de IA */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    {/* Preview WhatsApp */}
                    <div className="glass-card" style={{ padding: "20px" }}>
                      <h4 style={{ fontSize: "13px", fontWeight: "800", color: "var(--color-text-primary)", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>📱</span> Preview da Conversa (Aproximado)
                      </h4>
                      
                      <div style={{
                        background: "#121b22",
                        backgroundImage: "radial-gradient(rgba(255,255,255,0.01) 1px, transparent 0)",
                        backgroundSize: "14px 14px",
                        padding: "16px 12px",
                        borderRadius: "12px",
                        border: "1px solid rgba(255,255,255,0.04)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                        maxHeight: "360px",
                        overflowY: "auto",
                        minHeight: "160px"
                      }}>
                        {currentStage.fields.length === 0 ? (
                          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "11px", textAlign: "center", margin: "auto" }}>
                            Nenhum bloco cadastrado.
                          </div>
                        ) : (
                          currentStage.fields.map((f, i) => {
                            if (!f.content && !f.file_name) return null;
                            return (
                              <div 
                                key={i} 
                                style={{
                                  alignSelf: "flex-start",
                                  background: "#005c4b",
                                  color: "#e9edef",
                                  padding: "8px 10px 6px 10px",
                                  borderRadius: "0px 8px 8px 8px",
                                  fontSize: "11.5px",
                                  lineHeight: "1.4",
                                  maxWidth: "90%",
                                  wordBreak: "break-word",
                                  whiteSpace: "pre-wrap",
                                  boxShadow: "0 1px 1px rgba(0,0,0,0.15)",
                                  position: "relative"
                                }}
                              >
                                {f.type === "text" ? (
                                    f.content
                                      .replace(/{{primeiro_nome}}/g, "Maria")
                                      .replace(/{primeiro_nome}/g, "Maria")
                                      .replace(/{{nome}}/g, "Maria")
                                      .replace(/{nome}/g, "Maria")
                                      .replace(/{{produto}}/g, "Curso de Recheios")
                                      .replace(/{produto}/g, "Curso de Recheios")
                                ) : (
                                  <div style={{ color: "#36adff", fontWeight: "700" }}>
                                    {f.type === "audio" ? "🎵 Áudio do CRM" : f.type === "image" ? "🖼️ Imagem enviada" : f.type === "video" ? "📹 Vídeo enviado" : "📄 PDF enviado"}
                                    <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.6)", fontWeight: "normal", marginTop: "2px" }}>
                                      {f.file_name || "mídia"}
                                    </div>
                                  </div>
                                )}
                                <div style={{ display: "flex", justifyContent: "flex-end", fontSize: "8px", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>
                                  <span>12:00</span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Box de Variações de IA (se static estiver selecionado) */}
                    {currentStage.rewrite_mode === "static" && (
                      <div className="glass-card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
                        <h4 style={{ fontSize: "13px", fontWeight: "800", color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                          <span>🤖</span> Variações Estáticas da IA
                        </h4>
                        <p style={{ fontSize: "10px", color: "var(--color-text-muted)", lineHeight: "1.4" }}>
                          As variações abaixo são rotacionadas sequencialmente entre os clientes.
                        </p>
                        
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "250px", overflowY: "auto" }}>
                          {(() => {
                            try {
                              const vars = JSON.parse(currentStage.variations || "[]") as string[];
                              if (vars.length === 0) {
                                return (
                                  <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontStyle: "italic", textAlign: "center", padding: "10px" }}>
                                    Salve as alterações do estágio para gerar as variações.
                                  </span>
                                );
                              }
                              return vars.map((v, idx) => (
                                <div key={idx} style={{ 
                                  fontSize: "11.5px",
                                  padding: "8px 12px",
                                  background: "rgba(0,0,0,0.25)",
                                  borderRadius: "8px",
                                  borderLeft: "3px solid #0c93f2",
                                  color: "var(--color-text-secondary)",
                                  whiteSpace: "pre-wrap"
                                }}>
                                  <strong>Variação {idx + 1}:</strong> {v}
                                </div>
                              ));
                            } catch {
                              return <span style={{ fontSize: "11px", color: "#ef4444" }}>Erro de parseamento das variações.</span>;
                            }
                          })()}
                        </div>
                      </div>
                    )}

                  </div>

                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* MODAL DE CRIAÇÃO DE ESTÁGIO                                 */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {showModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center",
          justifyContent: "center", zIndex: 1000, padding: "20px", backdropFilter: "blur(4px)"
        }}>
          <div className="glass-card animate-scale-in" style={{ width: "100%", maxWidth: "480px", padding: "28px", display: "flex", flexDirection: "column", gap: "20px", background: "rgba(10,14,23,0.95)", border: "1px solid rgba(12,147,242,0.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: "18px", fontWeight: "800", margin: 0, color: "var(--color-text-primary)" }}>
                ➕ Criar Novo Estágio de CRM
              </h3>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer", color: "var(--color-text-muted)" }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Nome */}
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Nome do Estágio *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ex: Satisfação Inicial, Cobrança de Depoimento"
                  value={modalStageName}
                  onChange={(e) => setModalStageName(e.target.value)}
                  style={{ margin: 0 }}
                />
              </div>

              {/* Delay */}
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Delay (horas) *</label>
                <input
                  type="number"
                  className="input-field"
                  placeholder="Ex: 24"
                  value={modalDelayHours}
                  onChange={(e) => setModalDelayHours(parseInt(e.target.value) || 0)}
                  style={{ margin: 0 }}
                  min={1}
                />
              </div>

              {/* Categoria */}
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Categoria do Estágio *</label>
                <select
                  className="input-field"
                  value={modalStageClass}
                  onChange={(e) => setModalStageClass(e.target.value as any)}
                  style={{ margin: 0 }}
                >
                  <option value="sucesso">🎉 Finalizado com Sucesso (Pós-venda/Satisfação)</option>
                  <option value="sem_sucesso">❌ Finalizado sem Sucesso (Objeções/Feedback)</option>
                </select>
              </div>
            </div>

            {/* Ações */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "18px" }}>
              <button
                className="btn-secondary"
                onClick={() => setShowModal(false)}
                disabled={savingStage}
                style={{ height: "38px", padding: "0 20px" }}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleCreateStage}
                disabled={savingStage}
                style={{ height: "38px", padding: "0 24px", display: "flex", alignItems: "center", gap: "6px", fontWeight: "700" }}
              >
                {savingStage ? <div className="spinner" style={{ width: "14px", height: "14px", borderWidth: "2px" }} /> : "💾 Criar"}
              </button>
            </div>
          </div>
        </div>
      )}

    </AppLayout>
  );
}
