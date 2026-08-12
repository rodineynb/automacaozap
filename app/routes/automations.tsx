import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth, useApi } from "../contexts/auth-context";
import { AppLayout } from "../components/layout";

interface Automation {
  id: string; name: string; slug: string; status: string; whatsapp_number?: string;
  domain_id: string; whatsapp_api_id: string; ocr_service_id?: string; transcription_service_id?: string;
  domain_name: string; whatsapp_api_name: string; ocr_service_name: string; transcription_service_name: string;
  llms: Array<{ id: string; name: string; provider: string; priority_order: number }>;
  ocrs: Array<{ id: string; name: string; priority_order: number }>;
  transcriptions: Array<{ id: string; name: string; provider: string; priority_order: number }>;
  pixel_id?: string; facebook_token?: string; waba_id?: string; page_id?: string;
  product_name?: string;
  product_id?: string;
  product_assoc_name?: string;
  created_at: string;
  attendant_name?: string;
}

interface SelectOption { id: string; name?: string; domain?: string }

/* ─── Componentes do Diagrama de Fluxo ─── */

/** Nó visual do fluxo — card glassmorphism com ícone, título e descrição */
function FlowNode({ icon, title, desc, color = "brand", onClick }: { icon: string; title: string; desc: string; color?: string; onClick?: () => void }) {
  const colors: Record<string, string> = {
    brand:  "rgba(12,147,242,0.15)",
    green:  "rgba(16,185,129,0.15)",
    yellow: "rgba(245,158,11,0.15)",
    purple: "rgba(139,92,246,0.15)",
    orange: "rgba(249,115,22,0.15)",
    red:    "rgba(239,68,68,0.15)",
  };
  const borders: Record<string, string> = {
    brand:  "rgba(12,147,242,0.4)",
    green:  "rgba(16,185,129,0.4)",
    yellow: "rgba(245,158,11,0.4)",
    purple: "rgba(139,92,246,0.4)",
    orange: "rgba(249,115,22,0.4)",
    red:    "rgba(239,68,68,0.4)",
  };
  return (
    <div 
      onClick={onClick}
      style={{
        background: colors[color], border: `1px solid ${borders[color]}`,
        borderRadius: "12px", padding: "14px 18px", minWidth: "140px",
        textAlign: "center", transition: "all 0.2s",
        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
        cursor: onClick ? "pointer" : "default",
        boxShadow: color === "red" ? "0 0 10px rgba(239,68,68,0.25)" : "none",
      }}
      className={onClick ? "hover:scale-105 transition-all" : ""}
    >
      <div style={{ fontSize: "24px", marginBottom: "6px" }}>{icon}</div>
      <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--color-text-primary)" }}>{title}</div>
      <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "4px", lineHeight: "1.4" }}>{desc}</div>
    </div>
  );
}

/** Conector visual entre nós — linha vertical ou horizontal com setas SVG premium */
function Connector({ direction = "down", color = "rgba(255,255,255,0.15)" }: { direction?: "down" | "right"; color?: string }) {
  const isGlowing = color !== "rgba(255,255,255,0.15)";
  const shadowEffect = isGlowing ? `0 0 8px ${color}` : "none";

  return direction === "down" ? (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "4px 0" }}>
      <div style={{ width: "2px", height: "20px", background: color, boxShadow: shadowEffect, transition: "all 0.3s ease" }} />
      <svg width="10" height="8" viewBox="0 0 10 8" fill="none" style={{ marginTop: "-2px", filter: isGlowing ? `drop-shadow(0 0 3px ${color})` : "none" }}>
        <path d="M1 1L5 5L9 1" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  ) : (
    <div style={{ display: "flex", alignItems: "center", padding: "0 6px" }}>
      <div style={{ height: "2px", width: "20px", background: color, boxShadow: shadowEffect, transition: "all 0.3s ease" }} />
      <svg width="8" height="10" viewBox="0 0 8 10" fill="none" style={{ marginLeft: "-2px", filter: isGlowing ? `drop-shadow(0 0 3px ${color})` : "none" }}>
        <path d="M1 1L5 5L1 9" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** Conector bidirecional mostrando envio de solicitação e retorno de dados */
function ConnectorWithReturn({ color = "rgba(255,255,255,0.15)" }: { color?: string }) {
  const isGlowing = color !== "rgba(255,255,255,0.15)";
  const shadowEffect = isGlowing ? `0 0 8px ${color}` : "none";

  return (
    <div style={{ display: "flex", gap: "10px", justifyContent: "center", alignItems: "center", padding: "6px 0" }}>
      {/* Roteamento solid down arrow */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: "2px", height: "16px", background: color, boxShadow: shadowEffect }} />
        <svg width="8" height="6" viewBox="0 0 10 8" fill="none" style={{ marginTop: "-2px" }}>
          <path d="M1 1L5 5L9 1" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ fontSize: "8px", color: "var(--color-text-muted)", marginTop: "2px" }}>Roteia</span>
      </div>
      {/* Retorno dashed up arrow */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <svg width="8" height="6" viewBox="0 0 10 8" fill="none" style={{ marginBottom: "-2px", transform: "rotate(180deg)" }}>
          <path d="M1 1L5 5L9 1" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div style={{ width: "2px", height: "16px", borderLeft: `2px dashed ${color}`, boxShadow: shadowEffect }} />
        <span style={{ fontSize: "8px", color: "var(--color-text-muted)", marginTop: "2px" }}>Retorna</span>
      </div>
    </div>
  );
}

/** Rótulo de bifurcação */
function BranchLabel({ text, color = "var(--color-text-muted)" }: { text: string; color?: string }) {
  return (
    <div style={{ fontSize: "10px", fontWeight: "600", color, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center", padding: "2px 0" }}>
      {text}
    </div>
  );
}

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [duplicateSourceId, setDuplicateSourceId] = useState<string | null>(null);
  
  // Abas e estados de visualização premium
  const [activeTab, setActiveTab] = useState<"automations" | "flow" | "purge">("automations");
  const [selectedFlowSlug, setSelectedFlowSlug] = useState<string>("");
  const [flowPhone, setFlowPhone] = useState("");
  const [flowData, setFlowData] = useState<any | null>(null);
  const [loadingFlow, setLoadingFlow] = useState(false);
  const [selectedTrackingAutomationId, setSelectedTrackingAutomationId] = useState<string>("");
  const [trackingStatusFilter, setTrackingStatusFilter] = useState<"all" | "success" | "error">("all");
  const [generalErrors, setGeneralErrors] = useState<any[]>([]);
  const [loadingGeneralErrors, setLoadingGeneralErrors] = useState(false);
  const [selectedFlowErrorDetail, setSelectedFlowErrorDetail] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const handleAutoFit = () => {
    if (typeof window !== "undefined") {
      const isSmallScreen = window.innerWidth < 1024;
      if (isSmallScreen) {
        // Dynamic fit with safe breathing margins (1200px target to prevent any overflow)
        const targetWidth = 1200;
        const calculatedZoom = Math.max(0.2, Math.min(0.8, (window.innerWidth - 64) / targetWidth));
        setZoomLevel(Number(calculatedZoom.toFixed(2)));
      } else {
        setZoomLevel(1);
      }
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      handleAutoFit();
      window.addEventListener("resize", handleAutoFit);
      return () => window.removeEventListener("resize", handleAutoFit);
    }
  }, []);

  const [showFlow, setShowFlow] = useState<string | null>(null);
  const [showTrackingLogs, setShowTrackingLogs] = useState<string | null>(null);
  const [trackingLogsName, setTrackingLogsName] = useState("");
  const [trackingLogs, setTrackingLogs] = useState<any[]>([]);
  const [loadingTrackingLogs, setLoadingTrackingLogs] = useState(false);
  const [selectedLogDetail, setSelectedLogDetail] = useState<any | null>(null);
  const [formName, setFormName] = useState("");
  const [formProductName, setFormProductName] = useState("");
  const [formDomain, setFormDomain] = useState("");
  const [formWhatsapp, setFormWhatsapp] = useState("");
  const [formOcr, setFormOcr] = useState("");
  const [formOcr2, setFormOcr2] = useState("");
  const [formOcr3, setFormOcr3] = useState("");
  const [formTranscription, setFormTranscription] = useState("");
  const [formTranscription2, setFormTranscription2] = useState("");
  const [formTranscription3, setFormTranscription3] = useState("");
  const [formLlms, setFormLlms] = useState<string[]>([]);
  const [formWhatsappNumber, setFormWhatsappNumber] = useState("");
  const [formPixelId, setFormPixelId] = useState("");
  const [formFacebookToken, setFormFacebookToken] = useState("");
  const [formWabaId, setFormWabaId] = useState("");
  const [formPageId, setFormPageId] = useState("");
  const [formProductId, setFormProductId] = useState("");
  const [formAttendantName, setFormAttendantName] = useState("");
  const [products, setProducts] = useState<any[]>([]);
  const [domains, setDomains] = useState<SelectOption[]>([]);
  const [whatsappApis, setWhatsappApis] = useState<SelectOption[]>([]);
  const [ocrServices, setOcrServices] = useState<SelectOption[]>([]);
  const [transcriptionServices, setTranscriptionServices] = useState<SelectOption[]>([]);
  const [llms, setLlms] = useState<SelectOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [purgePhone, setPurgePhone] = useState("");
  const [purging, setPurging] = useState(false);
  const { user, isLoading: authLoading } = useAuth();
  const { apiFetch } = useApi();
  const navigate = useNavigate();

  useEffect(() => { if (user) { loadAutomations(); loadOptions(); } }, [user]);
  
  // Sincronizar automações com as abas e seleções padrão
  useEffect(() => {
    if (automations.length > 0) {
      if (!selectedFlowSlug) {
        setSelectedFlowSlug(automations[0].slug);
      }
      if (!selectedTrackingAutomationId) {
        setSelectedTrackingAutomationId(automations[0].id);
      }
    }
  }, [automations]);

  // Carregar logs de rastreamento automaticamente quando a automação for alterada
  useEffect(() => {
    if (selectedTrackingAutomationId) {
      loadTrackingLogs(selectedTrackingAutomationId);
    }
  }, [selectedTrackingAutomationId]);


  // Recarregar fluxo de cliente quando a automação ativa for mudada
  useEffect(() => {
    if (flowPhone) {
      handleSearchFlow();
    } else {
      setFlowData(null);
    }
  }, [selectedFlowSlug]);

  useEffect(() => {
    if (showTrackingLogs) {
      loadTrackingLogs(showTrackingLogs);
    }
  }, [showTrackingLogs]);

  async function loadGeneralErrors() {
    setLoadingGeneralErrors(true);
    try {
      const res = await apiFetch("/automations/all-errors");
      if (res.ok) {
        const data = await res.json() as { data: any[] };
        setGeneralErrors(data.data);
      }
    } catch (err) {
      console.error("Erro ao carregar logs gerais:", err);
    }
    setLoadingGeneralErrors(false);
  }

  async function handleSearchFlow(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!flowPhone) {
      setFlowData(null);
      return;
    }
    
    const cleaned = flowPhone.trim().replace(/\D/g, "");
    if (!cleaned) {
      showToast("Número de telefone inválido.");
      return;
    }
    
    const activeAuto = automations.find(a => a.slug === selectedFlowSlug);
    if (!activeAuto) {
      showToast("Selecione uma automação válida.");
      return;
    }
    
    setLoadingFlow(true);
    try {
      const res = await apiFetch(`/automations/${activeAuto.id}/lead-flow?phone=${cleaned}`);
      if (res.ok) {
        const data = await res.json() as { data: any };
        setFlowData(data.data);
      } else {
        const errData = await res.json() as { error: string };
        showToast(errData.error || "Lead não encontrado.");
        setFlowData(null);
      }
    } catch {
      showToast("Erro ao buscar dados do lead.");
      setFlowData(null);
    }
    setLoadingFlow(false);
  }

  async function loadTrackingLogs(automationId: string) {
    setLoadingTrackingLogs(true);
    try {
      const res = await apiFetch(`/automations/${automationId}/tracking-logs`);
      if (res.ok) {
        const data = await res.json() as { data: any[] };
        setTrackingLogs(data.data);
      } else {
        showToast("Erro ao carregar logs");
      }
    } catch {
      showToast("Erro de conexão ao carregar logs");
    }
    setLoadingTrackingLogs(false);
  }

  async function loadAutomations() {
    try {
      const res = await apiFetch("/automations");
      if (res.ok) { const data = await res.json() as { data: Automation[] }; setAutomations(data.data); }
    } catch (err) { console.error(err); }
    setLoading(false);
  }


  async function loadOptions() {
    const [d, w, o, t, l, p] = await Promise.all([
      apiFetch("/settings/domains"), apiFetch("/settings/whatsapp-apis"),
      apiFetch("/settings/ocr"), apiFetch("/settings/transcription-services"),
      apiFetch("/settings/llms"), apiFetch("/products")
    ]);
    if (d.ok) { const data = await d.json() as { data: SelectOption[] }; setDomains(data.data); }
    if (w.ok) { const data = await w.json() as { data: SelectOption[] }; setWhatsappApis(data.data); }
    if (o.ok) { const data = await o.json() as { data: SelectOption[] }; setOcrServices(data.data); }
    if (t.ok) { const data = await t.json() as { data: SelectOption[] }; setTranscriptionServices(data.data); }
    if (l.ok) { const data = await l.json() as { data: SelectOption[] }; setLlms(data.data); }
    if (p.ok) { const data = await p.json() as { data: any[] }; setProducts(data.data); }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const ocr_ids = [formOcr, formOcr2, formOcr3].filter(Boolean);
    const transcription_ids = [formTranscription, formTranscription2, formTranscription3].filter(Boolean);
    try {
      const res = await apiFetch("/automations", {
        method: "POST",
        body: JSON.stringify({ name: formName, product_name: formProductName || undefined, domain_id: formDomain, whatsapp_api_id: formWhatsapp, ocr_ids, transcription_ids, llm_ids: formLlms, whatsapp_number: formWhatsappNumber || undefined, pixel_id: formPixelId || undefined, facebook_token: formFacebookToken || undefined, waba_id: formWabaId || undefined, page_id: formPageId || undefined, product_id: formProductId || undefined, source_automation_id: duplicateSourceId || undefined, attendant_name: formAttendantName || undefined })
      });
      if (res.ok) {
        closeModal(); loadAutomations(); showToast("Automação criada com sucesso!");
      } else {
        const data = await res.json() as { error: string }; showToast(data.error || "Erro");
      }
    } catch { showToast("Erro de conexão"); }
    setSaving(false);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setSaving(true);
    const ocr_ids = [formOcr, formOcr2, formOcr3].filter(Boolean);
    const transcription_ids = [formTranscription, formTranscription2, formTranscription3].filter(Boolean);
    try {
      const res = await apiFetch(`/automations/${editingId}`, {
        method: "PUT",
        body: JSON.stringify({ name: formName, product_name: formProductName || undefined, domain_id: formDomain, whatsapp_api_id: formWhatsapp, ocr_ids, transcription_ids, llm_ids: formLlms, whatsapp_number: formWhatsappNumber || undefined, pixel_id: formPixelId || undefined, facebook_token: formFacebookToken || undefined, waba_id: formWabaId || undefined, page_id: formPageId || undefined, product_id: formProductId || null, attendant_name: formAttendantName || undefined })
      });
      if (res.ok) {
        closeModal(); loadAutomations(); showToast("Automação atualizada!");
      } else {
        const data = await res.json() as { error: string }; showToast(data.error || "Erro");
      }
    } catch { showToast("Erro de conexão"); }
    setSaving(false);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Tem certeza que deseja excluir a automação "${name}"?\n\nIsso removerá todos os contatos, conversas e mensagens associados.`)) return;
    try {
      const res = await apiFetch(`/automations/${id}`, { method: "DELETE" });
      if (res.ok) { loadAutomations(); showToast("Automação excluída!"); }
      else { showToast("Erro ao excluir"); }
    } catch { showToast("Erro de conexão"); }
  }

  function openEditModal(a: Automation) {
    setEditingId(a.id);
    setFormName(a.name);
    setFormProductName(a.product_name || "");
    setFormProductId(a.product_id || "");
    setFormDomain(a.domain_id || "");
    setFormWhatsapp(a.whatsapp_api_id || "");
    
    const ocrList = a.ocrs || [];
    setFormOcr(ocrList.find(o => o.priority_order === 1)?.id || a.ocr_service_id || "");
    setFormOcr2(ocrList.find(o => o.priority_order === 2)?.id || "");
    setFormOcr3(ocrList.find(o => o.priority_order === 3)?.id || "");
    
    const transList = a.transcriptions || [];
    setFormTranscription(transList.find(t => t.priority_order === 1)?.id || a.transcription_service_id || "");
    setFormTranscription2(transList.find(t => t.priority_order === 2)?.id || "");
    setFormTranscription3(transList.find(t => t.priority_order === 3)?.id || "");
    
    setFormLlms(a.llms.map(l => l.id));
    setFormWhatsappNumber(a.whatsapp_number || "");
    setFormPixelId(a.pixel_id || "");
    setFormFacebookToken(a.facebook_token || "");
    setFormWabaId(a.waba_id || "");
    setFormPageId(a.page_id || "");
    setFormAttendantName(a.attendant_name || "");
    setShowModal(true);
  }

  function handleDuplicate(a: Automation) {
    setEditingId(null);
    setDuplicateSourceId(a.id);
    setFormName(`Cópia de ${a.name}`);
    setFormProductName(a.product_name || "");
    setFormProductId(a.product_id || "");
    setFormDomain(a.domain_id || "");
    setFormWhatsapp(a.whatsapp_api_id || "");
    
    const ocrList = a.ocrs || [];
    setFormOcr(ocrList.find(o => o.priority_order === 1)?.id || a.ocr_service_id || "");
    setFormOcr2(ocrList.find(o => o.priority_order === 2)?.id || "");
    setFormOcr3(ocrList.find(o => o.priority_order === 3)?.id || "");
    
    const transList = a.transcriptions || [];
    setFormTranscription(transList.find(t => t.priority_order === 1)?.id || a.transcription_service_id || "");
    setFormTranscription2(transList.find(t => t.priority_order === 2)?.id || "");
    setFormTranscription3(transList.find(t => t.priority_order === 3)?.id || "");
    
    setFormLlms(a.llms.map(l => l.id));
    setFormWhatsappNumber(a.whatsapp_number || "");
    setFormPixelId(a.pixel_id || "");
    setFormFacebookToken(a.facebook_token || "");
    setFormWabaId(a.waba_id || "");
    setFormPageId(a.page_id || "");
    setFormAttendantName(a.attendant_name || "");
    setShowModal(true);
    showToast("Configurações copiadas! Dê um novo nome ou ajuste as opções desejadas.");
  }

  function closeModal() {
    setShowModal(false); setEditingId(null); setDuplicateSourceId(null);
    setFormName(""); setFormProductName(""); setFormProductId(""); setFormDomain(""); setFormWhatsapp(""); 
    setFormOcr(""); setFormOcr2(""); setFormOcr3("");
    setFormTranscription(""); setFormTranscription2(""); setFormTranscription3("");
    setFormLlms([]); setFormWhatsappNumber("");
    setFormPixelId(""); setFormFacebookToken("");
    setFormWabaId(""); setFormPageId("");
    setFormAttendantName("");
  }

  async function toggleStatus(id: string, current: string) {
    const newStatus = current === "active" ? "paused" : "active";
    await apiFetch(`/automations/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: newStatus }) });
    loadAutomations();
    showToast(`Automação ${newStatus === 'active' ? 'ativada' : 'pausada'}`);
  }

  function toggleLlm(llmId: string) {
    setFormLlms(prev => prev.includes(llmId) ? prev.filter(id => id !== llmId) : [...prev, llmId]);
  }

  function showToast(msg: string) {
    setToast(msg); setTimeout(() => setToast(""), 3000);
  }

  function copyWebhook(slug: string) {
    const domain = domains.find(d => d.id === formDomain)?.domain || window.location.hostname;
    navigator.clipboard.writeText(`https://${domain}/api/webhook/${slug}`);
    showToast("Webhook copiado!");
  }

  async function handlePurgeLead() {
    if (!purgePhone) {
      showToast("Por favor, digite o número do telefone.");
      return;
    }
    
    const cleaned = purgePhone.trim().replace(/\D/g, "");
    if (!cleaned) {
      showToast("Número de telefone inválido.");
      return;
    }
    
    if (!confirm(`Tem certeza absoluta que deseja excluir TODOS os dados do telefone ${cleaned}?\n\nIsso apagará contatos, mensagens, estados, logs CAPI e follow-ups agendados. Esta ação não pode ser desfeita.`)) {
      return;
    }
    
    setPurging(true);
    try {
      const res = await apiFetch("/automations/purge-lead", {
        method: "POST",
        body: JSON.stringify({ phone: cleaned })
      });
      
      if (res.ok) {
        setPurgePhone("");
        showToast("Dados do lead excluídos com sucesso!");
        loadAutomations();
      } else {
        const data = await res.json() as { error: string };
        showToast(data.error || "Erro ao excluir dados");
      }
    } catch {
      showToast("Erro de conexão");
    }
    setPurging(false);
  }



  function getNodeColor(nodeKey: string) {
    if (!flowPhone || !flowData) return "brand";
    
    const state = flowData.state || {};
    const errors = flowData.errors || [];
    
    const hasError = (keyword: string) => {
      return errors.some((e: any) => e.error_message.toLowerCase().includes(keyword.toLowerCase()));
    };

    switch (nodeKey) {
      case "webhook":
      case "tratamento":
      case "debounce":
        return "green";
        
      case "porteiro":
        if (hasError("porteiro") || hasError("gateway") || hasError("seq1")) return "red";
        if (state.seq1_called === 1) return "green";
        return "yellow";
        
      case "anunciador":
        if (hasError("anunciador") || hasError("herald") || hasError("anuncio")) return "red";
        if (state.seq1_called === 1) return "green";
        if (state.seq1_called === 0) return "yellow";
        return "brand";

      case "crm_agent":
        if (hasError("crm") || hasError("pesquisa")) return "red";
        const hasCrmReplied = flowData.crmResponses?.some((r: any) => r.status === "answered");
        if (hasCrmReplied) return "green";
        const hasCrmSent = flowData.crmResponses?.some((r: any) => r.status === "sent" || r.status === "delivered");
        if (hasCrmSent) return "yellow";
        return "brand";

      case "followups_iniciais":
        if (state.seq1_called === 1) {
          const hasExecuted = flowData.followups.some((f: any) => 
            (f.type.toLowerCase().includes("vigia") || f.type.toLowerCase().includes("finalizador")) && f.status === "executed"
          );
          return hasExecuted ? "green" : "yellow";
        }
        return "brand";
        
      case "triagem":
        if (hasError("triagem") || hasError("classifier") || hasError("intent")) return "red";
        if (state.seq2_called === 1) return "green";
        if (state.seq1_called === 1) return "yellow";
        return "brand";
        
      case "entregador":
        if (hasError("entregador") || hasError("delivery") || hasError("pdf")) return "red";
        if (state.payment_confirmed === 1) return "green";
        if (state.seq2_called === 1) return "yellow";
        return "brand";

      case "cobradores":
        if (state.seq2_called === 1) {
          if (state.payment_confirmed === 1) return "green";
          return "yellow";
        }
        return "brand";
        
      case "caixa":
        if (hasError("caixa") || hasError("ocr") || hasError("comprovante")) return "red";
        if (state.access_delivered === 1) return "green";
        if (state.payment_confirmed === 1) return "yellow";
        return "brand";
        
      case "agente_unificado":
        if (hasError("caixa") || hasError("suporte") || hasError("negociador")) return "red";
        if (state.access_delivered === 1) return "green";
        if (state.seq1_called === 1) return "yellow";
        return "brand";
        
      case "suporte_agent":
        if (hasError("suporte") || hasError("support")) return "red";
        if (state.access_delivered === 1) return "green";
        if (state.seq2_called === 1) return "yellow";
        return "brand";

      case "variantes_agent":
        if (state.seq2_called === 1) return "green";
        if (state.seq1_called === 1) return "yellow";
        return "brand";

      case "negociador":
        if (hasError("negociador") || hasError("objection")) return "red";
        if (state.seq2_called === 1) return "green";
        return "brand";
        
      default:
        return "brand";
    }
  }

  function getPathColor(fromNode: string, toNode: string) {
    if (!flowPhone || !flowData) return "rgba(255,255,255,0.15)";
    const state = flowData.state || {};
    const errors = flowData.errors || [];
    
    const hasError = (keyword: string) => {
      return errors.some((e: any) => e.error_message.toLowerCase().includes(keyword.toLowerCase()));
    };

    if (fromNode === "webhook" || fromNode === "debounce" || fromNode === "tratamento") {
      return "#10b981";
    }
    
    if (fromNode === "porteiro") {
      if (toNode === "anunciador") {
        if (hasError("porteiro") || hasError("gateway") || hasError("seq1")) return "#ef4444";
        if (state.seq1_called === 1) return "#10b981";
        return "#f59e0b";
      }
      if (toNode === "crm_agent") {
        if (hasError("crm") || hasError("pesquisa")) return "#ef4444";
        const hasCrm = flowData.crmResponses?.length > 0;
        if (hasCrm) return "#2dd4bf"; // Ciano/Teal brilhante
        return "rgba(255,255,255,0.15)";
      }
      if (toNode === "caixa") {
        if (hasError("caixa") || hasError("ocr")) return "#ef4444";
        if (state.access_delivered === 1) return "#10b981";
        if (state.payment_confirmed === 1) return "#f59e0b";
        return "rgba(255,255,255,0.15)";
      }
      if (toNode === "agente_unificado") {
        if (hasError("caixa") || hasError("suporte") || hasError("negociador")) return "#ef4444";
        if (state.access_delivered === 1) return "#10b981";
        if (state.seq1_called === 1) return "#f59e0b";
      }
      if (toNode === "suporte_agent") {
        if (hasError("suporte") || hasError("support")) return "#ef4444";
        if (state.access_delivered === 1) return "#10b981";
        if (state.seq2_called === 1) return "#f59e0b";
        return "rgba(255,255,255,0.15)";
      }
      if (toNode === "variantes_agent") {
        if (state.seq2_called === 1) return "#10b981";
        if (state.seq1_called === 1) return "#f59e0b";
        return "rgba(255,255,255,0.15)";
      }
      if (toNode === "triagem") {
        if (hasError("triagem") || hasError("classifier")) return "#ef4444";
        if (state.seq2_called === 1) return "#10b981";
        if (state.seq1_called === 1) return "#f59e0b";
      }
    }
    
    if (fromNode === "anunciador") {
      if (toNode === "followups_iniciais") {
        if (state.seq1_called === 1) return "#10b981";
      }
    }

    if (fromNode === "entregador") {
      if (toNode === "cobradores") {
        if (state.seq2_called === 1) {
          if (state.payment_confirmed === 1) return "#10b981";
          return "#f59e0b";
        }
      }
    }

    if (fromNode === "triagem") {
      if (toNode === "entregador") {
        if (hasError("entregador") || hasError("delivery") || hasError("pdf")) return "#ef4444";
        if (state.payment_confirmed === 1 || state.seq2_called === 1) return "#10b981";
        if (state.seq1_called === 1) return "#f59e0b";
      }
      if (toNode === "caixa") {
        if (hasError("caixa") || hasError("ocr")) return "#ef4444";
        if (state.access_delivered === 1) return "#10b981";
        if (state.payment_confirmed === 1) return "#f59e0b";
      }
      if (toNode === "agente_unificado") {
        if (state.access_delivered === 1) return "#10b981";
        if (state.seq2_called === 1) return "#10b981";
        if (state.seq1_called === 1) return "#f59e0b";
      }
      if (toNode === "negociador") {
        if (hasError("negociador") || hasError("objection")) return "#ef4444";
        if (state.seq2_called === 1) return "#10b981";
      }
    }

    if (fromNode === "agente_unificado") {
      if (toNode === "entregador") {
        if (state.payment_confirmed === 1 || state.seq2_called === 1) return "#10b981";
        if (state.seq1_called === 1) return "#f59e0b";
      }
      if (toNode === "caixa") {
        if (state.access_delivered === 1) return "#10b981";
        if (state.payment_confirmed === 1) return "#f59e0b";
      }
      if (toNode === "suporte_agent") {
        if (state.access_delivered === 1) return "#10b981";
      }
    }

    if (fromNode === "caixa") {
      if (toNode === "sistema") {
        if (state.access_delivered === 1) return "#10b981";
        if (state.payment_confirmed === 1) return "#f59e0b";
      }
    }

    if (fromNode === "suporte_agent") {
      if (toNode === "suporte_box") {
        if (state.access_delivered === 1) return "#10b981";
      }
    }
    
    return "rgba(255,255,255,0.15)";
  }

  function handleNodeClick(nodeKey: string) {
    if (!flowPhone || !flowData) return;
    
    const errors = flowData.errors || [];
    const nodeErrors = errors.filter((e: any) => {
      const msg = e.error_message.toLowerCase();
      if (nodeKey === "porteiro") return msg.includes("porteiro") || msg.includes("gateway") || msg.includes("seq1");
      if (nodeKey === "anunciador") return msg.includes("anunciador") || msg.includes("herald") || msg.includes("anuncio");
      if (nodeKey === "followups_iniciais") return msg.includes("vigia") || msg.includes("finalizador");
      if (nodeKey === "crm_agent") return msg.includes("crm") || msg.includes("pesquisa") || msg.includes("scheduled");
      if (nodeKey === "triagem") return msg.includes("triagem") || msg.includes("classifier") || msg.includes("intent");
      if (nodeKey === "entregador") return msg.includes("entregador") || msg.includes("delivery") || msg.includes("pdf");
      if (nodeKey === "cobradores") return msg.includes("cobrador") || msg.includes("cora") || msg.includes("pix");
      if (nodeKey === "caixa") return msg.includes("caixa") || msg.includes("ocr") || msg.includes("comprovante");
      if (nodeKey === "negociador") return msg.includes("negociador") || msg.includes("objection");
      return false;
    });

    if (nodeErrors.length > 0) {
      setSelectedFlowErrorDetail(
        nodeErrors.map((e: any) => `[${new Date(e.created_at + "Z").toLocaleString("pt-BR")}] ${e.error_message}`).join("\n\n")
      );
    } else {
      setSelectedFlowErrorDetail(null);
    }
  }

  return (
    <AppLayout title="Automações">
      {/* Premium Glassmorphic Tab Bar */}
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
      >
        {[
          { id: "automations", label: "🤖 Automações" },
          { id: "flow", label: "📊 Visualizar Fluxo" },
          { id: "purge", label: "🧹 Limpar Dados" }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: "10px 18px",
              borderRadius: "10px",
              border: "none",
              background: activeTab === tab.id ? "rgba(12,147,242,0.15)" : "transparent",
              color: activeTab === tab.id ? "var(--color-brand-400)" : "var(--color-text-secondary)",
              fontWeight: "600",
              fontSize: "13px",
              cursor: "pointer",
              transition: "all 0.25s ease",
              boxShadow: activeTab === tab.id ? "0 0 12px rgba(12,147,242,0.15)" : "none",
              borderBottom: activeTab === tab.id ? "2px solid var(--color-brand-400)" : "2px solid transparent",
              whiteSpace: "nowrap"
            }}
            className="hover:text-white transition-all"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ABA 1: AUTOMATIZACAO */}
      {activeTab === "automations" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
            <div>
              <h2 style={{ fontSize: "20px", fontWeight: "800", margin: 0 }}>Suas Automações</h2>
              <p style={{ color: "var(--color-text-secondary)", fontSize: "14px", marginTop: "4px" }}>
                Gerencie os fluxos de atendimento por produto/serviço
              </p>
            </div>
            <button className="btn-primary" onClick={() => setShowModal(true)} id="new-automation-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Nova Automação
            </button>
          </div>

          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "80px" }}><div className="spinner" style={{ width: "40px", height: "40px" }} /></div>
          ) : automations.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🤖</div>
              <div className="empty-state-title">Nenhuma automação criada</div>
              <div className="empty-state-text">Antes de criar automações, cadastre domínios, APIs WhatsApp e LLMs em Configurações</div>
              <button className="btn-primary" style={{ marginTop: "20px" }} onClick={() => navigate("/settings")}>Ir para Configurações</button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(380px, 100%), 1fr))", gap: "20px" }}>
              {automations.map((a) => (
                <div key={a.id} className="glass-card" style={{ padding: "24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                    <div>
                      <h3 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "4px" }}>{a.name}</h3>
                      <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>/{a.slug}</div>
                    </div>
                    <span className={`badge ${a.status === "active" ? "badge-success" : "badge-warning"}`}>
                      {a.status === "active" ? "Ativa" : "Pausada"}
                    </span>
                  </div>

                  {/* Webhook */}
                  <div style={{ background: "var(--color-surface-800)", borderRadius: "10px", padding: "12px 14px", marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <code style={{ fontSize: "12px", color: "var(--color-brand-400)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      /api/webhook/{a.slug}
                    </code>
                    <button onClick={() => copyWebhook(a.slug)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", fontSize: "14px" }} title="Copiar">📋</button>
                  </div>

                  {/* Info */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px", fontSize: "13px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--color-text-muted)" }}>📦 Produto</span>
                      <span style={{ fontWeight: "600", color: "var(--color-brand-400)" }}>
                        {a.product_assoc_name ? `📦 ${a.product_assoc_name}` : (a.product_name || "—")}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--color-text-muted)" }}>👩 Atendente</span>
                      <span style={{ fontWeight: "600", color: "var(--color-text-primary)" }}>
                        {a.attendant_name || "Julia"}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--color-text-muted)" }}>WhatsApp API</span>
                      <span style={{ fontWeight: "500" }}>{a.whatsapp_api_name || "—"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--color-text-muted)" }}>Nº Origem</span>
                      <span style={{ fontWeight: "500" }}>{a.whatsapp_number || "—"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--color-text-muted)" }}>Domínio</span>
                      <span style={{ fontWeight: "500" }}>{a.domain_name || "—"}</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "var(--color-text-muted)" }}>OCR</span>
                        <span style={{ fontWeight: "500" }}>
                          {a.ocrs && a.ocrs.length > 0 ? (
                            <span style={{ display: "flex", flexWrap: "wrap", gap: "4px", justifyContent: "flex-end" }}>
                              {a.ocrs.map((o, idx) => (
                                <span key={o.id} className="badge badge-info" style={{ fontSize: "11px", padding: "1px 6px" }}>
                                  {idx + 1}. {o.name}
                                </span>
                              ))}
                            </span>
                          ) : (
                            a.ocr_service_name || "—"
                          )}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "4px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "var(--color-text-muted)" }}>Transcrição</span>
                        <span style={{ fontWeight: "500" }}>
                          {a.transcriptions && a.transcriptions.length > 0 ? (
                            <span style={{ display: "flex", flexWrap: "wrap", gap: "4px", justifyContent: "flex-end" }}>
                              {a.transcriptions.map((t, idx) => (
                                <span key={t.id} className="badge badge-info" style={{ fontSize: "11px", padding: "1px 6px" }}>
                                  {idx + 1}. {t.name}
                                </span>
                              ))}
                            </span>
                          ) : (
                            a.transcription_service_name || "—"
                          )}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--color-text-muted)" }}>Pixel</span>
                      <span style={{ fontWeight: "500" }}>{a.pixel_id ? "✅ Configurado" : "—"}</span>
                    </div>
                    {a.pixel_id && (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ color: "var(--color-text-muted)" }}>WABA ID</span>
                          <span style={{ fontWeight: "500" }}>{a.waba_id || "—"}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ color: "var(--color-text-muted)" }}>Page ID</span>
                          <span style={{ fontWeight: "500" }}>{a.page_id || "—"}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* LLMs */}
                  {a.llms.length > 0 && (
                    <div style={{ marginBottom: "16px" }}>
                      <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "8px" }}>LLMs (prioridade):</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {a.llms.map((llm, i) => (
                          <span key={llm.id} className="badge badge-info" style={{ fontSize: "11px" }}>
                            {i + 1}. {llm.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button onClick={() => toggleStatus(a.id, a.status)} className={a.status === "active" ? "btn-secondary" : "btn-primary"} style={{ fontSize: "12px", padding: "8px 14px" }}>
                      {a.status === "active" ? "⏸️ Pausar" : "▶️ Ativar"}
                    </button>
                    <button onClick={() => handleDuplicate(a)} className="btn-secondary" style={{ fontSize: "12px", padding: "8px 14px" }}>
                      📋 Duplicar
                    </button>
                    <button onClick={() => navigate(`/chat?automation_id=${a.id}`)} className="btn-secondary" style={{ fontSize: "12px", padding: "8px 14px" }}>
                      💬 Conversas
                    </button>
                    <button onClick={() => openEditModal(a)} className="btn-secondary" style={{ fontSize: "12px", padding: "8px 14px" }}>
                      ✏️ Editar
                    </button>
                    <button onClick={() => handleDelete(a.id, a.name)} style={{ fontSize: "12px", padding: "8px 14px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", color: "#ef4444", cursor: "pointer", transition: "all 0.2s" }}>
                      🗑️ Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ABA 2: VISUALIZAR FLUXO */}
      {activeTab === "flow" && (
        <div className="glass-card" style={{ padding: "28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <h2 style={{ fontSize: "20px", fontWeight: "800", margin: 0 }}>📊 Fluxo de Atendimento</h2>
              <p style={{ color: "var(--color-text-secondary)", fontSize: "13px", marginTop: "4px" }}>
                Visualize as etapas da automação. Insira o celular de um cliente para rastrear o progresso dele no funil.
              </p>
            </div>
            
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--color-text-muted)", marginBottom: "4px", fontWeight: "600" }}>Automação</label>
                <select 
                  className="input-field" 
                  value={selectedFlowSlug} 
                  onChange={(e) => setSelectedFlowSlug(e.target.value)}
                  style={{ margin: 0, height: "38px", minWidth: "180px" }}
                >
                  <option value="">Selecione...</option>
                  {automations.map(a => <option key={a.slug} value={a.slug}>{a.name}</option>)}
                </select>
              </div>
              
              <form onSubmit={handleSearchFlow} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "var(--color-text-muted)", marginBottom: "4px", fontWeight: "600" }}>Celular do Cliente</label>
                  <input
                    className="input-field"
                    placeholder="Ex: 5522998513392"
                    value={flowPhone}
                    onChange={(e) => setFlowPhone(e.target.value)}
                    style={{ margin: 0, height: "38px", width: "160px" }}
                  />
                </div>
                <div style={{ marginTop: "17px" }}>
                  <button type="submit" className="btn-primary" style={{ height: "38px" }} disabled={loadingFlow}>
                    {loadingFlow ? "Buscando..." : "🔍"}
                  </button>
                </div>
                {flowData && (
                  <div style={{ marginTop: "17px" }}>
                    <button 
                      type="button" 
                      className="btn-secondary" 
                      style={{ height: "38px" }}
                      onClick={() => {
                        setFlowPhone("");
                        setFlowData(null);
                        setSelectedFlowErrorDetail(null);
                      }}
                    >
                      Limpar
                    </button>
                  </div>
                )}
              </form>
            </div>
          </div>

          {/* Legenda Dinâmica baseada na busca */}
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "10px", padding: "12px 16px", marginBottom: "24px", display: "flex", flexWrap: "wrap", gap: "16px", justifyContent: "center" }}>
            {[
              { color: "brand", label: flowPhone ? "Não Iniciado" : "Fluxo Principal" },
              { color: "green", label: flowPhone ? "Concluído com Sucesso" : "Ações de Sucesso" },
              { color: "yellow", label: flowPhone ? "Aguardando / Próxima Ação" : "Condicionais" },
              { color: "purple", label: "Agentes / LLM" },
              { color: "red", label: flowPhone ? "Falha / Erro (Clique p/ ver)" : "Erros e Alertas" }
            ].map((item) => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "12px", height: "12px", borderRadius: "4px", background: item.color === "brand" ? "rgba(12,147,242,0.15)" : item.color === "green" ? "rgba(16,185,129,0.15)" : item.color === "yellow" ? "rgba(245,158,11,0.15)" : item.color === "purple" ? "rgba(139,92,246,0.15)" : "rgba(239,68,68,0.15)", border: `1px solid ${item.color === "brand" ? "rgba(12,147,242,0.4)" : item.color === "green" ? "rgba(16,185,129,0.4)" : item.color === "yellow" ? "rgba(245,158,11,0.4)" : item.color === "purple" ? "rgba(139,92,246,0.4)" : "rgba(239,68,68,0.4)"}` }} />
                <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{item.label}</span>
              </div>
            ))}
          </div>

          {/* Lead State Info Pane */}
          {flowData && flowData.state && (
            <div 
              style={{ 
                background: "rgba(16, 185, 129, 0.05)", 
                border: "1px solid rgba(16, 185, 129, 0.2)", 
                borderRadius: "12px", 
                padding: "16px 20px", 
                marginBottom: "24px",
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "16px",
                alignItems: "center"
              }}
            >
              <div>
                <h4 style={{ fontSize: "14px", fontWeight: "700", color: "#10b981", margin: 0 }}>🟢 Lead Ativo Identificado</h4>
                <p style={{ fontSize: "12px", color: "var(--color-text-muted)", margin: "4px 0 0" }}>
                  Acompanhando o número <strong>{flowPhone}</strong> na automação <strong>{selectedFlowSlug}</strong>.
                </p>
              </div>
              <div style={{ display: "flex", gap: "16px", fontSize: "12px", flexWrap: "wrap" }}>
                <div><strong>Porteiro:</strong> {flowData.state.seq1_called ? "✅ Concluído" : "⏳ Aguardando"}</div>
                <div><strong>Anunciador:</strong> {flowData.state.seq1_called ? "✅ Disparado" : "⏳ Pendente"}</div>
                <div><strong>Agente CRM:</strong> {flowData.crmResponses?.length > 0 ? "🟢 Ativo" : "⏳ Inativo"}</div>
                <div><strong>Triagem:</strong> {flowData.state.seq2_called ? "✅ Realizada" : "⏳ Pendente"}</div>
                <div><strong>Entregador:</strong> {flowData.state.payment_confirmed ? "✅ Confirmado" : "⏳ Aguardando Pix"}</div>
                <div><strong>Caixa:</strong> {flowData.state.access_delivered ? "✅ Entregue" : "⏳ Aguardando Comp."}</div>
              </div>
            </div>
          )}

          {/* Error Message Bubble */}
          {selectedFlowErrorDetail && (
            <div 
              style={{ 
                background: "rgba(239, 68, 68, 0.06)", 
                border: "1px solid rgba(239, 68, 68, 0.25)", 
                borderRadius: "12px", 
                padding: "16px 20px", 
                marginBottom: "24px",
                position: "relative",
                animation: "fadeIn 0.2s ease"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                <h4 style={{ fontSize: "14px", fontWeight: "700", color: "#ef4444", margin: 0 }}>⚠️ Relatório de Erro no Filtro do Nó</h4>
                <button 
                  onClick={() => setSelectedFlowErrorDetail(null)}
                  style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", fontSize: "14px" }}
                >
                  ✕
                </button>
              </div>
              <pre style={{ 
                background: "rgba(0,0,0,0.3)", 
                padding: "12px", 
                borderRadius: "8px", 
                fontSize: "12px", 
                color: "#fca5a5",
                whiteSpace: "pre-wrap",
                fontFamily: "monospace",
                maxHeight: "150px",
                overflowY: "auto",
                margin: 0
              }}>
                {selectedFlowErrorDetail}
              </pre>
            </div>
          )}

          {/* Render Flowchart Graph */}
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", width: "100%", paddingBottom: "8px" }}>
            <div style={{ 
              display: "flex", 
              flexDirection: "column", 
              alignItems: "center", 
              padding: "20px 0", 
              minWidth: "1050px", 
              zoom: zoomLevel,
              transformOrigin: "top center",
              transition: "zoom 0.15s ease-in-out"
            }}>
            
            {/* ── Etapa 1: Webhook → Tratamento → Debounce → Porteiro (Cima para Baixo) ── */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", position: "relative", width: "100%" }}>
              <FlowNode icon="🔔" title="Webhook WhatsApp" desc="Mensagem de entrada no webhook" color={getNodeColor("webhook")} onClick={() => handleNodeClick("webhook")} />
              <Connector direction="down" color={getPathColor("webhook", "tratamento")} />
              <FlowNode icon="⚙️" title="Tratamento de Dados" desc="Normaliza payloads e salva tráfego síncrono" color={getNodeColor("tratamento")} onClick={() => handleNodeClick("tratamento")} />
              <Connector direction="down" color={getPathColor("tratamento", "debounce")} />
              <FlowNode icon="⏳" title="Debounce (15s)" desc="Agrupa mensagens consecutivas" color={getNodeColor("debounce")} onClick={() => handleNodeClick("debounce")} />
              <Connector direction="down" color={getPathColor("debounce", "porteiro")} />
              
              {/* Porteiro and Welcome (Seq 1) side by side */}
              <div style={{ display: "flex", alignItems: "center", gap: "20px", width: "100%", justifyContent: "center" }}>
                {/* Spacer on the left to keep Porteiro centered */}
                <div style={{ width: "220px" }} />
                
                <FlowNode icon="🚪" title="Porteiro (Gateway)" desc="Roteia a mensagem conforme o estado" color={getNodeColor("porteiro")} onClick={() => handleNodeClick("porteiro")} />
                
                <div style={{ display: "flex", alignItems: "center", width: "220px", textAlign: "left" }}>
                  <Connector direction="right" color={getPathColor("porteiro", "anunciador")} />
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <FlowNode icon="📢" title="Boas-Vindas (Seq 1)" desc="Envia boas-vindas determinística" color={getNodeColor("anunciador")} onClick={() => handleNodeClick("anunciador")} />
                    <Connector direction="down" color={getPathColor("anunciador", "followups_iniciais")} />
                    <FlowNode icon="🔄" title="Reengajamento" desc="Vigia (15m) e Finalizador (12h)" color={getNodeColor("followups_iniciais")} onClick={() => handleNodeClick("followups_iniciais")} />
                  </div>
                </div>
              </div>
            </div>

            {/* Split from Porteiro to: 1. Códigos/Variantes | 2. Agente Unificado | 3. CRM */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", marginTop: "10px" }}>
              {/* Downward line from Porteiro */}
              <div style={{ width: "2px", height: "20px", background: flowPhone && flowData ? "#10b981" : "rgba(255,255,255,0.15)" }} />
              
              {/* Horizontal line for the 3-way split fork */}
              <div style={{ 
                display: "flex", 
                width: "80%", 
                justifyContent: "space-between", 
                alignItems: "center",
                position: "relative" 
              }}>
                <div style={{ 
                  width: "100%", 
                  height: "2px", 
                  background: flowPhone && flowData ? "#10b981" : "rgba(255,255,255,0.15)" 
                }} />
                {/* Branch point (dot) in the middle */}
                <div style={{ 
                  width: "8px", 
                  height: "8px", 
                  borderRadius: "50%", 
                  background: flowPhone && flowData ? "#10b981" : "rgba(255,255,255,0.3)",
                  position: "absolute",
                  left: "50%",
                  transform: "translateX(-50%)"
                }} />
              </div>
              
              {/* Downward lines from the fork to the 3 columns */}
              <div style={{ display: "flex", width: "80%", justifyContent: "space-between" }}>
                {[1, 2, 3].map(idx => (
                  <div key={idx} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "2px" }}>
                    <div style={{ width: "2px", height: "20px", background: flowPhone && flowData ? "#10b981" : "rgba(255,255,255,0.15)" }} />
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none" style={{ marginTop: "-2px" }}>
                      <path d="M1 1L5 5L9 1" stroke={flowPhone && flowData ? "#10b981" : "rgba(255,255,255,0.15)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Etapa 2: Ramificação Principal em 3 Colunas ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: "20px", width: "100%", maxWidth: "1400px", marginTop: "10px" }}>
              
              {/* COLUNA 1: RESPOSTAS FIXAS / VARIANTES */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", borderRight: "1px dashed rgba(255,255,255,0.08)", paddingRight: "10px" }}>
                <BranchLabel text="OU: Códigos / Variantes (Sem LLM)" color="var(--color-yellow-400)" />
                <div style={{ height: "12px" }} />
                
                <FlowNode icon="📝" title="Códigos / Variantes" desc="Respostas por código/palavras-chave" color={getNodeColor("variantes_agent")} onClick={() => handleNodeClick("variantes_agent")} />
                
                <ConnectorWithReturn color={getPathColor("porteiro", "variantes_agent")} />

                <div style={{ background: "rgba(245,158,11,0.03)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: "12px", padding: "12px", width: "100%", minHeight: "100px", textAlign: "center" }}>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-text-primary)", marginBottom: "6px" }}>
                    🤖 Bypassa LLM
                  </div>
                  <div style={{ fontSize: "9px", color: "var(--color-text-muted)", lineHeight: "1.4" }}>
                    Se <code style={{ color: "#f59e0b" }}>use_llm_variations = 0</code>, responde com variações estáticas cadastradas via código ou banco de dados.
                  </div>
                </div>
              </div>

              {/* COLUNA 2: AGENTE UNIFICADO (Vendas + Checkout + Suporte) */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", borderRight: "1px dashed rgba(255,255,255,0.08)", paddingRight: "10px", paddingLeft: "10px" }}>
                <BranchLabel text="Agente Principal (Vendas + Checkout + Suporte)" color="var(--color-success-400)" />
                <div style={{ height: "12px" }} />
                
                {/* 1. Scout Classifier */}
                <FlowNode icon="🔍" title="Scout Classifier" desc="Identifica intenção (aceite, dúvida, comprovante...)" color={getNodeColor("triagem")} onClick={() => handleNodeClick("triagem")} />
                
                <Connector direction="down" color={getPathColor("porteiro", "triagem")} />
                
                {/* 2. Agente Unificado */}
                <FlowNode icon="🧠" title="Agente Unificado" desc="Controla a conversa e o tom de voz (Julia/Sara)" color={getNodeColor("agente_unificado")} onClick={() => handleNodeClick("agente_unificado")} />
                
                <div style={{ width: "2px", height: "12px", background: "rgba(255,255,255,0.15)" }} />
                
                {/* Horizontal line for internal tools fork */}
                <div style={{ width: "80%", height: "2px", background: "rgba(255,255,255,0.15)", position: "relative" }}>
                  <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "rgba(255,255,255,0.3)", position: "absolute", left: "50%", transform: "translate(-50%, -2px)" }} />
                </div>
                
                <div style={{ display: "flex", width: "80%", justifyContent: "space-between" }}>
                  {[1, 2, 3].map(idx => (
                    <div key={idx} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "2px" }}>
                      <div style={{ width: "2px", height: "10px", background: "rgba(255,255,255,0.15)" }} />
                      <svg width="8" height="6" viewBox="0 0 10 8" fill="none" style={{ marginTop: "-2px" }}>
                        <path d="M1 1L5 5L9 1" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  ))}
                </div>
                
                {/* 3. Internal Tools row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", width: "100%", marginTop: "6px", marginBottom: "16px" }}>
                  {/* Tool: seq2 */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <FlowNode icon="📦" title="Entrega (Seq 2)" desc="Envia PDFs do produto" color={getNodeColor("entregador")} onClick={() => handleNodeClick("entregador")} />
                    <Connector direction="down" color={getPathColor("entregador", "cobradores")} />
                    
                    {/* Cobrança Box */}
                    <div style={{ background: "rgba(16,185,129,0.03)", border: "1px solid rgba(16,185,129,0.15)", borderRadius: "12px", padding: "10px", width: "100%", minHeight: "150px", textAlign: "left" }}>
                      <div style={{ fontSize: "10px", fontWeight: "700", color: "#10b981", marginBottom: "6px", textAlign: "center" }}>
                        💸 Cobrança (Seq 2)
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "6px", padding: "4px 6px", fontSize: "9px" }}>
                          <strong>🚀 Incentivador (1h)</strong>
                        </div>
                        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "6px", padding: "4px 6px", fontSize: "9px" }}>
                          <strong>🤝 Amigo (10h)</strong>
                        </div>
                        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "6px", padding: "4px 6px", fontSize: "9px" }}>
                          <strong>🧐 Curioso (34h)</strong>
                        </div>
                        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "6px", padding: "4px 6px", fontSize: "9px" }}>
                          <strong>👑 Final (58h)</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Tool: pagamento & sistema */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <FlowNode icon="💳" title="Auditoria Pix" desc="Valida comprovantes via OCR" color={getNodeColor("caixa")} onClick={() => handleNodeClick("caixa")} />
                    <Connector direction="down" color={getPathColor("caixa", "sistema")} />
                    
                    {/* Apoiador & Upsell Box */}
                    <div style={{ background: "rgba(12,147,242,0.03)", border: "1px solid rgba(12,147,242,0.15)", borderRadius: "12px", padding: "10px", width: "100%", minHeight: "150px", textAlign: "left" }}>
                      <div style={{ fontSize: "10px", fontWeight: "700", color: "var(--color-brand-400)", marginBottom: "6px", textAlign: "center" }}>
                        📈 Upsell & Acesso
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "6px", padding: "4px 6px", fontSize: "9px" }}>
                          <strong>🎁 Upsell R$5 (5m/10m)</strong>
                        </div>
                        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "6px", padding: "4px 6px", fontSize: "9px" }}>
                          <strong>🔑 Liberação Acesso</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Support Mode */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <FlowNode icon="🛠️" title="Suporte Técnico" desc="Auxílio de login/tutoriais" color={getNodeColor("suporte_agent")} onClick={() => handleNodeClick("suporte_agent")} />
                    <Connector direction="down" color={getPathColor("suporte_agent", "suporte_box")} />
                    
                    {/* Support Box */}
                    <div style={{ background: "rgba(245,158,11,0.03)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: "12px", padding: "10px", width: "100%", minHeight: "150px", textAlign: "left" }}>
                      <div style={{ fontSize: "10px", fontWeight: "700", color: "#f59e0b", marginBottom: "6px", textAlign: "center" }}>
                        🛠️ Pós-Acesso
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "6px", padding: "4px 6px", fontSize: "9px" }}>
                          <strong>👤 Confirma Nome/E-mail</strong>
                        </div>
                        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "6px", padding: "4px 6px", fontSize: "9px" }}>
                          <strong>📺 Link de Login & Short</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* COLUNA 3: AGENTE DE CRM */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingLeft: "10px" }}>
                <BranchLabel text="CRM & Pesquisas" color="#2dd4bf" />
                <div style={{ height: "12px" }} />
                
                <FlowNode icon="🎯" title="Agente CRM" desc="Coleta feedbacks, depoimentos e trata objeções" color={getNodeColor("crm_agent")} onClick={() => handleNodeClick("crm_agent")} />
                
                <ConnectorWithReturn color={getPathColor("porteiro", "crm_agent")} />

                <div style={{ fontSize: "10px", fontWeight: "700", color: "#2dd4bf", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center", marginBottom: "8px" }}>
                  ⚡ E (Fundo)
                </div>

                <div style={{ background: "rgba(45,212,191,0.03)", border: "1px solid rgba(45,212,191,0.15)", borderRadius: "12px", padding: "12px", width: "100%" }}>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-text-primary)", marginBottom: "10px", textAlign: "center" }}>
                    📋 Pesquisas de CRM
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" }}>
                    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "8px 12px", width: "100%", textAlign: "center" }}>
                      <div style={{ fontSize: "11px", fontWeight: "700" }}>😊 Satisfação (48h)</div>
                      <div style={{ fontSize: "9px", color: "var(--color-text-muted)", marginTop: "2px" }}>Pós-compra ➔ Avaliação e suporte</div>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "8px 12px", width: "100%", textAlign: "center" }}>
                      <div style={{ fontSize: "11px", fontWeight: "700" }}>🎬 Depoimento (5d)</div>
                      <div style={{ fontSize: "9px", color: "var(--color-text-muted)", marginTop: "2px" }}>Pós-compra ➔ Coleta de áudio/vídeo</div>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "8px 12px", width: "100%", textAlign: "center" }}>
                      <div style={{ fontSize: "11px", fontWeight: "700" }}>🤔 Objeções (24h)</div>
                      <div style={{ fontSize: "9px", color: "var(--color-text-muted)", marginTop: "2px" }}>Não-compra ➔ Condição R$ 12 / R$ 10</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
          </div>

          {/* CRM Scheduled Timeline */}
          {flowData && flowData.crmScheduled && flowData.crmScheduled.length > 0 && (
            <div 
              style={{ 
                background: "rgba(45, 212, 191, 0.02)", 
                border: "1px solid rgba(45, 212, 191, 0.15)", 
                borderRadius: "16px", 
                padding: "24px", 
                marginTop: "24px",
                width: "100%",
                backdropFilter: "blur(10px)"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
                <span style={{ fontSize: "20px" }}>🎯</span>
                <div style={{ textAlign: "left" }}>
                  <h4 style={{ fontSize: "15px", fontWeight: "800", color: "var(--color-text-primary)", margin: 0 }}>
                    Pesquisas Pós-Venda Programadas (CRM)
                  </h4>
                  <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: "2px 0 0" }}>
                    Cronograma de disparos agendados de pesquisas de satisfação, depoimento e objeções.
                  </p>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "16px" }}>
                {flowData.crmScheduled.map((f: any, idx: number) => {
                  const statusConfig: Record<string, { bg: string, border: string, color: string, icon: string, label: string }> = {
                    executed: { bg: "rgba(16, 185, 129, 0.05)", border: "rgba(16, 185, 129, 0.25)", color: "#10b981", icon: "✓", label: "Enviado" },
                    pending: { bg: "rgba(245, 158, 11, 0.05)", border: "rgba(245, 158, 11, 0.25)", color: "#f59e0b", icon: "⏳", label: "Agendado" },
                    cancelled: { bg: "rgba(255, 255, 255, 0.02)", border: "rgba(255, 255, 255, 0.06)", color: "var(--color-text-muted)", icon: "✕", label: "Cancelado" },
                    error: { bg: "rgba(239, 68, 68, 0.05)", border: "rgba(239, 68, 68, 0.25)", color: "#ef4444", icon: "⚠️", label: "Erro" }
                  };
                  const config = statusConfig[f.status] || statusConfig.cancelled;
                  
                  const nameMap: Record<string, { title: string, desc: string }> = {
                    satisfaction: { title: "😊 Satisfação", desc: "Pós-compra ➔ Avaliação e suporte portal" },
                    testimonial: { title: "🎬 Depoimento", desc: "Pós-compra ➔ Coleta de áudio/vídeo" },
                    objection: { title: "🤔 Objeção", desc: "Não-compra ➔ Fechamento (R$12 / R$10)" }
                  };
                  const info = nameMap[f.flow_type] || { title: `🤖 Pesquisa (${f.flow_type})`, desc: "Disparo do CRM" };

                  const dateObj = new Date(f.scheduled_for + "Z");
                  const formattedDate = isNaN(dateObj.getTime()) ? f.scheduled_for : dateObj.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

                  return (
                    <div 
                      key={idx} 
                      style={{ 
                        background: config.bg, 
                        border: `1px solid ${config.border}`, 
                        borderRadius: "12px", 
                        padding: "16px",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        minHeight: "120px",
                        position: "relative",
                        transition: "all 0.2s ease",
                        textAlign: "left"
                      }}
                      className="hover:scale-102"
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                        <span style={{ fontWeight: "700", fontSize: "12px", color: "var(--color-text-primary)" }}>
                          {info.title}
                        </span>
                        <span 
                          style={{ 
                            fontSize: "9px", 
                            fontWeight: "700", 
                            color: config.color,
                            background: config.border,
                            padding: "2px 6px",
                            borderRadius: "6px",
                            textTransform: "uppercase"
                          }}
                        >
                          {config.icon} {config.label}
                        </span>
                      </div>

                      <div style={{ fontSize: "10px", color: "var(--color-text-muted)", marginBottom: "12px", lineHeight: "1.4" }}>
                        {info.desc}
                      </div>

                      <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: "8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "9px", color: "var(--color-text-muted)" }}>Agendado para:</span>
                        <span style={{ fontSize: "10px", fontWeight: "600", color: "var(--color-text-secondary)" }}>
                          {formattedDate.split(", ")[0]} às {formattedDate.split(", ")[1]?.substring(0, 5)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Follow-ups Timeline */}
          {flowData && flowData.followups && flowData.followups.length > 0 && (
            <div 
              style={{ 
                background: "rgba(255, 255, 255, 0.02)", 
                border: "1px solid rgba(255, 255, 255, 0.05)", 
                borderRadius: "16px", 
                padding: "24px", 
                marginTop: "28px",
                width: "100%",
                backdropFilter: "blur(10px)"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
                <span style={{ fontSize: "20px" }}>⏰</span>
                <div style={{ textAlign: "left" }}>
                  <h4 style={{ fontSize: "15px", fontWeight: "800", color: "var(--color-text-primary)", margin: 0 }}>
                    Cronograma e Status dos Agentes de Follow-up
                  </h4>
                  <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: "2px 0 0" }}>
                    Linha do tempo real dos disparos programados de reengajamento para este cliente.
                  </p>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "16px" }}>
                {flowData.followups.map((f: any, idx: number) => {
                  const statusConfig: Record<string, { bg: string, border: string, color: string, icon: string, label: string }> = {
                    executed: { bg: "rgba(16, 185, 129, 0.05)", border: "rgba(16, 185, 129, 0.25)", color: "#10b981", icon: "✓", label: "Disparado" },
                    pending: { bg: "rgba(245, 158, 11, 0.05)", border: "rgba(245, 158, 11, 0.25)", color: "#f59e0b", icon: "⏳", label: "Agendado" },
                    cancelled: { bg: "rgba(255, 255, 255, 0.02)", border: "rgba(255, 255, 255, 0.06)", color: "var(--color-text-muted)", icon: "✕", label: "Cancelado" }
                  };
                  const config = statusConfig[f.status] || statusConfig.cancelled;
                  
                  // Mapeamento de nomes de follow-ups bonitos
                  const nameMap: Record<string, { title: string, desc: string }> = {
                    followup_vigia_15min: { title: "👀 Vigia (15m)", desc: "Se silêncio ➔ Vídeo doces + R$19,90" },
                    followup_finalizador_12h: { title: "🏁 Finalizador (12h)", desc: "Se silêncio ➔ Última oferta R$12,90" },
                    followup_incentivador_1h: { title: "🚀 Incentivador (1h)", desc: "Se entregue ➔ Faturamento fatias" },
                    followup_cobrador_amigo_10h: { title: "🤝 Cobrador Amigo (10h)", desc: "Lembrete suave do Pix Cora" },
                    followup_cobrador_curioso_34h: { title: "🎂 Cobrador Curioso (34h)", desc: "Pergunta sobre as receitas" },
                    followup_cobrador_final_58h: { title: "👑 Cobrador Final (58h)", desc: "Oferta Kit R$10 e encerramento" },
                    upsell_5min: { title: "📈 Apoiador/Upsell (5m)", desc: "Oferta Pós-Matrícula Máquina de Vendas Online" },
                    upsell_10min: { title: "📈 Apoiador/Upsell (10m)", desc: "Oferta Pós-Matrícula Máquina de Clientes" }
                  };
                  const info = nameMap[f.type.toLowerCase()] || { title: `🤖 Follow-up (${f.type})`, desc: "Disparo programado" };

                  const dateObj = new Date(f.scheduled_for + "Z");
                  const formattedDate = isNaN(dateObj.getTime()) ? f.scheduled_for : dateObj.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

                  return (
                    <div 
                      key={idx} 
                      style={{ 
                        background: config.bg, 
                        border: `1px solid ${config.border}`, 
                        borderRadius: "12px", 
                        padding: "16px",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        minHeight: "120px",
                        position: "relative",
                        transition: "all 0.2s ease",
                        textAlign: "left"
                      }}
                      className="hover:scale-102"
                    >
                      {/* Header com badge */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                        <span style={{ fontWeight: "700", fontSize: "12px", color: "var(--color-text-primary)" }}>
                          {info.title}
                        </span>
                        <span 
                          style={{ 
                            fontSize: "9px", 
                            fontWeight: "700", 
                            color: config.color,
                            background: config.border,
                            padding: "2px 6px",
                            borderRadius: "6px",
                            textTransform: "uppercase"
                          }}
                        >
                          {config.icon} {config.label}
                        </span>
                      </div>

                      {/* Descrição resumida */}
                      <div style={{ fontSize: "10px", color: "var(--color-text-muted)", marginBottom: "12px", lineHeight: "1.4" }}>
                        {info.desc}
                      </div>

                      {/* Footer com hora */}
                      <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: "8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "9px", color: "var(--color-text-muted)" }}>Agendado para:</span>
                        <span style={{ fontSize: "10px", fontWeight: "600", color: "var(--color-text-secondary)" }}>
                          {formattedDate.split(", ")[0]} às {formattedDate.split(", ")[1]?.substring(0, 5)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Barra de Zoom Premium Flutuante estilo Miro/Figma (Fixed na Viewport) */}
          <div style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "30px",
            padding: "6px 12px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)",
            transition: "all 0.2s ease"
          }}>
            <button 
              type="button" 
              onClick={() => setZoomLevel(prev => Math.max(0.2, Number((prev - 0.05).toFixed(2))))} 
              style={{ 
                background: "none", 
                border: "none", 
                color: "var(--color-text-primary)", 
                cursor: "pointer", 
                width: "28px", 
                height: "28px", 
                borderRadius: "50%", 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center", 
                fontSize: "16px", 
                fontWeight: "bold",
                transition: "background 0.2s" 
              }}
              onMouseOver={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
              onMouseOut={(e) => e.currentTarget.style.background = "none"}
              title="Diminuir Zoom"
            >
              −
            </button>
            
            <span style={{ 
              fontSize: "11px", 
              fontWeight: "600", 
              color: "var(--color-text-secondary)", 
              minWidth: "40px", 
              textAlign: "center",
              userSelect: "none"
            }}>
              {Math.round(zoomLevel * 100)}%
            </span>
            
            <button 
              type="button" 
              onClick={() => setZoomLevel(prev => Math.min(2.0, Number((prev + 0.05).toFixed(2))))} 
              style={{ 
                background: "none", 
                border: "none", 
                color: "var(--color-text-primary)", 
                cursor: "pointer", 
                width: "28px", 
                height: "28px", 
                borderRadius: "50%", 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center", 
                fontSize: "16px", 
                fontWeight: "bold",
                transition: "background 0.2s" 
              }}
              onMouseOver={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
              onMouseOut={(e) => e.currentTarget.style.background = "none"}
              title="Aumentar Zoom"
            >
              +
            </button>
            
            <div style={{ width: "1px", height: "16px", background: "rgba(255,255,255,0.15)" }} />
            
            <button 
              type="button" 
              onClick={handleAutoFit} 
              style={{ 
                background: "rgba(255,255,255,0.05)", 
                border: "1px solid rgba(255,255,255,0.08)", 
                color: "var(--color-text-secondary)", 
                cursor: "pointer", 
                borderRadius: "20px", 
                padding: "4px 10px", 
                fontSize: "10px", 
                fontWeight: "600",
                transition: "all 0.2s" 
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                e.currentTarget.style.color = "var(--color-text-primary)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                e.currentTarget.style.color = "var(--color-text-secondary)";
              }}
            >
              Ajustar
            </button>
          </div>
        </div>
      )}



      {/* ABA 4: LIMPAR DADOS */}
      {activeTab === "purge" && (
        <div style={{ maxWidth: "600px", margin: "0 auto" }}>
          <div className="glass-card" style={{ padding: "32px", background: "rgba(239, 68, 68, 0.02)", border: "1px solid rgba(239, 68, 68, 0.15)" }}>
            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <span style={{ fontSize: "40px" }}>🧹</span>
              <h2 style={{ fontSize: "20px", fontWeight: "800", color: "var(--color-text-primary)", marginTop: "12px" }}>
                Limpar Dados de Teste (Lead Purge)
              </h2>
              <p style={{ color: "var(--color-text-muted)", fontSize: "13px", marginTop: "6px" }}>
                Reinicie totalmente os fluxos de automação e campanhas para um número de teste.
              </p>
            </div>

            <div style={{ background: "rgba(239, 68, 68, 0.06)", border: "1px solid rgba(239, 68, 68, 0.15)", borderRadius: "10px", padding: "14px", marginBottom: "24px" }}>
              <p style={{ fontSize: "12px", color: "#fca5a5", margin: 0, lineHeight: "1.5" }}>
                ⚠️ <strong>Aviso Importante:</strong> Esta ação apagará permanentemente do banco de dados:
              </p>
              <ul style={{ fontSize: "11px", color: "var(--color-text-secondary)", margin: "8px 0 0", paddingLeft: "20px" }}>
                <li>O cadastro do lead / contato</li>
                <li>O histórico de mensagens enviadas e recebidas</li>
                <li>O estado atual no fluxograma (porteiro, triagem, entregador...)</li>
                <li>Todos os follow-ups agendados (timers de vigia e cobradores)</li>
                <li>Os logs de rastreamento CAPI associados</li>
              </ul>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "8px" }}>
                Número de Celular (apenas números, com DDI e DDD)
              </label>
              <input 
                className="input-field" 
                placeholder="Ex: 5522998513392" 
                value={purgePhone} 
                onChange={(e) => setPurgePhone(e.target.value)} 
                style={{ height: "42px", margin: 0 }}
              />
            </div>

            <button 
              onClick={handlePurgeLead} 
              disabled={purging}
              className="btn-primary" 
              style={{ 
                background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)", 
                border: "none", 
                width: "100%",
                height: "42px",
                fontSize: "14px",
                fontWeight: "700"
              }}
            >
              {purging ? "Limpando todos os registros..." : "Confirmar e Apagar Dados"}
            </button>
          </div>
        </div>
      )}



      {/* Modal Nova/Editar Automação */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: "20px", fontWeight: "700", marginBottom: "24px" }}>{editingId ? "Editar Automação" : "Nova Automação"}</h2>
            <form onSubmit={editingId ? handleEdit : handleCreate}>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Nome da Automação</label>
                <input className="input-field" placeholder="Ex: Produto Premium" value={formName} onChange={(e) => setFormName(e.target.value)} required />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Nome da Atendente</label>
                <input className="input-field" placeholder="Ex: Julia" value={formAttendantName} onChange={(e) => setFormAttendantName(e.target.value)} />
                <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "4px" }}>Nome da persona que a IA assumirá nesta automação (padrão: Julia)</div>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Vincular a um Produto Cadastrado</label>
                <select className="input-field" value={formProductId} onChange={(e) => setFormProductId(e.target.value)}>
                  <option value="">Nenhum (usar apenas nome de texto abaixo)</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "4px" }}>
                  Associa este funil a um produto centralizado com suas ofertas, mídias R2 e PDFs.
                </div>
              </div>



              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Número WhatsApp de Origem</label>
                <input className="input-field" placeholder="Ex: 5561982277206" value={formWhatsappNumber} onChange={(e) => setFormWhatsappNumber(e.target.value)} />
                <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "4px" }}>Número que atende nesta automação (sem +, apenas números)</div>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Domínio</label>
                <select className="input-field" value={formDomain} onChange={(e) => setFormDomain(e.target.value)} required>
                  <option value="">Selecione...</option>
                  {domains.map(d => <option key={d.id} value={d.id}>{d.domain}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>API WhatsApp</label>
                <select className="input-field" value={formWhatsapp} onChange={(e) => setFormWhatsapp(e.target.value)} required>
                  <option value="">Selecione...</option>
                  {whatsappApis.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>

              {/* Seção de OCRs com Fallbacks */}
              <div style={{ marginBottom: "16px", padding: "16px", background: "rgba(139,92,246,0.04)", borderRadius: "10px", border: "1px solid rgba(139,92,246,0.1)" }}>
                <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--color-brand-400)", marginBottom: "12px" }}>📸 Serviços de OCR (Leitura de Comprovantes)</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: "600", color: "var(--color-text-muted)", marginBottom: "4px" }}>Prioridade 1 (Principal)</label>
                    <select className="input-field" style={{ margin: 0 }} value={formOcr} onChange={(e) => {
                      const val = e.target.value;
                      setFormOcr(val);
                      if (!val) { setFormOcr2(""); setFormOcr3(""); }
                    }}>
                      <option value="">Nenhum</option>
                      {ocrServices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: "600", color: "var(--color-text-muted)", marginBottom: "4px" }}>Prioridade 2 (1º Fallback)</label>
                    <select className="input-field" style={{ margin: 0 }} value={formOcr2} onChange={(e) => {
                      const val = e.target.value;
                      setFormOcr2(val);
                      if (!val) setFormOcr3("");
                    }} disabled={!formOcr}>
                      <option value="">Nenhum</option>
                      {ocrServices.filter(o => o.id !== formOcr).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: "600", color: "var(--color-text-muted)", marginBottom: "4px" }}>Prioridade 3 (2º Fallback)</label>
                    <select className="input-field" style={{ margin: 0 }} value={formOcr3} onChange={(e) => setFormOcr3(e.target.value)} disabled={!formOcr2}>
                      <option value="">Nenhum</option>
                      {ocrServices.filter(o => o.id !== formOcr && o.id !== formOcr2).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Seção de Transcrições com Fallbacks */}
              <div style={{ marginBottom: "16px", padding: "16px", background: "rgba(139,92,246,0.04)", borderRadius: "10px", border: "1px solid rgba(139,92,246,0.1)" }}>
                <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--color-brand-400)", marginBottom: "12px" }}>🎙️ Serviços de Transcrição de Áudio</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: "600", color: "var(--color-text-muted)", marginBottom: "4px" }}>Prioridade 1 (Principal)</label>
                    <select className="input-field" style={{ margin: 0 }} value={formTranscription} onChange={(e) => {
                      const val = e.target.value;
                      setFormTranscription(val);
                      if (!val) { setFormTranscription2(""); setFormTranscription3(""); }
                    }}>
                      <option value="">Nenhum</option>
                      {transcriptionServices.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: "600", color: "var(--color-text-muted)", marginBottom: "4px" }}>Prioridade 2 (1º Fallback)</label>
                    <select className="input-field" style={{ margin: 0 }} value={formTranscription2} onChange={(e) => {
                      const val = e.target.value;
                      setFormTranscription2(val);
                      if (!val) setFormTranscription3("");
                    }} disabled={!formTranscription}>
                      <option value="">Nenhum</option>
                      {transcriptionServices.filter(t => t.id !== formTranscription).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: "600", color: "var(--color-text-muted)", marginBottom: "4px" }}>Prioridade 3 (2º Fallback)</label>
                    <select className="input-field" style={{ margin: 0 }} value={formTranscription3} onChange={(e) => setFormTranscription3(e.target.value)} disabled={!formTranscription2}>
                      <option value="">Nenhum</option>
                      {transcriptionServices.filter(t => t.id !== formTranscription && t.id !== formTranscription2).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>LLM Principal (1ª Prioridade)</label>
                <select className="input-field" value={formLlms[0] || ""} onChange={(e) => {
                  const val = e.target.value;
                  setFormLlms(prev => {
                    const next = [...prev];
                    next[0] = val;
                    return next.filter(Boolean);
                  });
                }} required>
                  <option value="">Selecione...</option>
                  {llms.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>LLM Secundária (2ª Prioridade - opcional)</label>
                <select className="input-field" value={formLlms[1] || ""} onChange={(e) => {
                  const val = e.target.value;
                  setFormLlms(prev => {
                    const next = [...prev];
                    if (val) {
                      next[1] = val;
                    } else {
                      next.splice(1, 1);
                    }
                    return next.filter(Boolean);
                  });
                }} disabled={!formLlms[0]}>
                  <option value="">Nenhuma</option>
                  {llms.filter(l => l.id !== formLlms[0]).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: "24px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>LLM Terciária (3ª Prioridade - opcional)</label>
                <select className="input-field" value={formLlms[2] || ""} onChange={(e) => {
                  const val = e.target.value;
                  setFormLlms(prev => {
                    const next = [...prev];
                    if (val) {
                      next[2] = val;
                    } else {
                      next.splice(2, 1);
                    }
                    return next.filter(Boolean);
                  });
                }} disabled={!formLlms[1]}>
                  <option value="">Nenhuma</option>
                  {llms.filter(l => l.id !== formLlms[0] && l.id !== formLlms[1]).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: "16px", padding: "16px", background: "rgba(59,130,246,0.06)", borderRadius: "10px", border: "1px solid rgba(59,130,246,0.15)" }}>
                <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--color-brand-400)", marginBottom: "12px" }}>📊 Facebook Tracking (CAPI)</div>
                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Nome do Produto (CAPI)</label>
                  <input className="input-field" placeholder="Ex: Recheios a Prova de Fogo" value={formProductName} onChange={(e) => setFormProductName(e.target.value)} />
                </div>
                <div style={{ marginBottom: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Pixel ID</label>
                    <input className="input-field" placeholder="Ex: 902857339356269" value={formPixelId} onChange={(e) => setFormPixelId(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>WABA ID</label>
                    <input className="input-field" placeholder="Ex: 104847291748293" value={formWabaId} onChange={(e) => setFormWabaId(e.target.value)} />
                  </div>
                </div>
                <div style={{ marginBottom: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Facebook Access Token</label>
                    <input className="input-field" type="password" placeholder="EAATJ3ZBU..." value={formFacebookToken} onChange={(e) => setFormFacebookToken(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Page ID</label>
                    <input className="input-field" placeholder="Ex: 109283746501928" value={formPageId} onChange={(e) => setFormPageId(e.target.value)} />
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <button type="button" className="btn-secondary" onClick={closeModal}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={saving || formLlms.length === 0}>
                  {saving ? <><div className="spinner" /> {editingId ? "Salvando..." : "Criando..."}</> : (editingId ? "Salvar Alterações" : "Criar Automação")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Detalhes do Log */}
      {selectedLogDetail && (
        <div className="modal-overlay" onClick={() => setSelectedLogDetail(null)} style={{ zIndex: 60 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "650px", width: "90%", background: "rgba(15, 23, 42, 0.95)", border: "1px solid rgba(255, 255, 255, 0.1)" }}>
            <h3 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "16px" }}>
              📄 Detalhes do Rastreamento
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px", fontSize: "13px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "8px" }}>
                <span style={{ color: "var(--color-text-muted)" }}>Evento:</span>
                <span style={{ fontWeight: "600", color: "var(--color-brand-400)" }}>{selectedLogDetail.event_name}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "8px" }}>
                <span style={{ color: "var(--color-text-muted)" }}>Event ID:</span>
                <code>{selectedLogDetail.event_id}</code>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "8px" }}>
                <span style={{ color: "var(--color-text-muted)" }}>Telefone:</span>
                <span>{selectedLogDetail.phone}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "8px" }}>
                <span style={{ color: "var(--color-text-muted)" }}>Status:</span>
                <span className={`badge ${selectedLogDetail.status === "success" ? "badge-success" : "badge-danger"}`}>
                  {selectedLogDetail.status === "success" ? "Sucesso" : "Erro"}
                </span>
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Payload Enviado (Meta CAPI JSON)</label>
              <pre style={{ background: "rgba(0,0,0,0.4)", padding: "12px", borderRadius: "8px", overflowX: "auto", fontSize: "11px", maxHeight: "150px", border: "1px solid rgba(255,255,255,0.04)", fontFamily: "monospace" }}>
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(selectedLogDetail.payload), null, 2);
                  } catch {
                    return selectedLogDetail.payload;
                  }
                })()}
              </pre>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Resposta / Erro da API</label>
              <pre style={{ background: "rgba(0,0,0,0.4)", padding: "12px", borderRadius: "8px", overflowX: "auto", fontSize: "11px", maxHeight: "150px", border: "1px solid rgba(255,255,255,0.04)", color: selectedLogDetail.status === "success" ? "#a7f3d0" : "#fca5a5", fontFamily: "monospace" }}>
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(selectedLogDetail.response), null, 2);
                  } catch {
                    return selectedLogDetail.response;
                  }
                })()}
              </pre>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn-primary" onClick={() => setSelectedLogDetail(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="toast toast-success">{toast}</div>}
    </AppLayout>
  );
}

