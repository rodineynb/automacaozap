import { useState, useEffect } from "react";
import { useAuth, useApi } from "../contexts/auth-context";
import { AppLayout } from "../components/layout";

// ── Tipos ────────────────────────────────────────────────────────

interface Automation {
  id: string;
  name: string;
  slug: string;
}

interface Field {
  id?: string;
  type: "text" | "audio" | "video" | "image" | "document";
  content: string;
  file_name?: string | null;
  uploading?: boolean; // Controle local de loading de upload
}

interface Stage {
  id: string;
  automation_id: string;
  stage_key: string;
  name?: string | null;
  sort_order?: number;
  enabled: number;
  delay_minutes: number;
  rewrite_mode: "none" | "dynamic" | "static";
  rewrite_count: number;
  variations: string; // JSON de variações estáticas
  fields: Field[];
}

interface StageConfigResponse {
  data: {
    automation_id: string;
    stages: Stage[];
  };
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

export default function FunnelMessagesPage() {
  const { user } = useAuth();
  const { apiFetch } = useApi();

  // Estados principais
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [selectedAutomationId, setSelectedAutomationId] = useState<string>("");
  const [stages, setStages] = useState<Stage[]>([]);
  const [productsList, setProductsList] = useState<Product[]>([]);
  
  // Navegação
  const [activeTab, setActiveTab] = useState<string>("welcome");
  
  // Loadings e Feedback
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Dicionário de informações padrão das abas
  const defaultTabInfo: Record<string, { name: string; icon: string; description: string }> = {
    welcome: { name: "Boas-vindas", icon: "👋", description: "Sequência enviada no primeiro contato do cliente. Geralmente contém uma saudação, áudio explicativo e a pergunta se pode enviar as receitas." },
    delivery: { name: "Entrega / Oferta", icon: "📦", description: "Sequência disparada quando o cliente aceita receber o produto. Contém os PDFs, dados para Pix de R$ 10,00 e imagens dos pacotes/oferta." },
    ticket_boost: { name: "Oferta Especial", icon: "⚡", description: "Disparado imediatamente após a confirmação do Pix de R$ 10. Oferece o upgrade de Confeitaria Completa por mais R$ 5,00." },
    ticket_boost_declined: { name: "Presente Especial", icon: "💝", description: "Disparado caso o cliente rejeite a Oferta Especial de R$ 5. Entrega o Kit Completo vitalício de presente e solicita os dados de cadastro." },
    upsell: { name: "Upsell", icon: "🚀", description: "Disparado após um tempo determinado da entrega do kit. Oferece o treinamento Máquina de Vendas Online por R$ 14,50." },
    downsell: { name: "Downsell", icon: "🎁", description: "Disparado caso o cliente recuse o Upsell de R$ 14,50. Oferece o treinamento de Vendas Online por R$ 7,50." },
    promise: { name: "Agendamento", icon: "🗓️", description: "Estágio de promessa de pagamento. Disparado para agendamento de cobrança amigável." }
  };

  const standardKeys = ["welcome", "delivery", "ticket_boost", "ticket_boost_declined", "upsell", "downsell", "promise"];

  // Estados de Gerenciamento de Estágios e Reordenação
  const [showNewStageModal, setShowNewStageModal] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [draggedTabIndex, setDraggedTabIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedTabIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedTabIndex === null || draggedTabIndex === targetIndex) return;

    const reorderedStages = [...stages];
    const [draggedStage] = reorderedStages.splice(draggedTabIndex, 1);
    reorderedStages.splice(targetIndex, 0, draggedStage);

    const updatedStages = reorderedStages.map((stage, idx) => ({
      ...stage,
      sort_order: idx + 1
    }));

    setStages(updatedStages);
    setDraggedTabIndex(null);

    try {
      const reorderList = updatedStages.map((s) => ({ id: s.id, sort_order: s.sort_order }));
      await apiFetch(`/funnel-messages/config/${selectedAutomationId}/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stages: reorderList })
      });
    } catch (err) {
      console.error("Erro ao salvar ordenação de estágios:", err);
    }
  };

  async function handleCreateStage() {
    if (!newStageName.trim()) {
      alert("O nome do estágio é obrigatório");
      return;
    }

    try {
      const res = await apiFetch(`/funnel-messages/config/${selectedAutomationId}/stages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newStageName.trim() })
      });

      if (res.ok) {
        const data = await res.json() as { data: Stage };
        setStages(prev => [...prev, data.data]);
        setActiveTab(data.data.stage_key);
        setShowNewStageModal(false);
        setNewStageName("");
      } else {
        const err = await res.json() as { error?: string };
        alert(err.error || "Erro ao criar estágio");
      }
    } catch (err) {
      console.error("Erro ao criar estágio:", err);
      alert("Erro de conexão ao criar estágio.");
    }
  }

  async function handleDeleteStage(stageId: string, stageKey: string) {
    if (standardKeys.includes(stageKey)) {
      alert("Os estágios padrão não podem ser excluídos.");
      return;
    }

    if (!confirm("Tem certeza que deseja excluir este estágio personalizado? Todos os blocos e mensagens dele serão excluídos permanentemente.")) {
      return;
    }

    try {
      const res = await apiFetch(`/funnel-messages/config/${selectedAutomationId}/stages/${stageId}`, {
        method: "DELETE"
      });

      if (res.ok) {
        setStages(prev => prev.filter(s => s.id !== stageId));
        if (activeTab === stageKey) {
          setActiveTab("welcome");
        }
      } else {
        const err = await res.json() as { error?: string };
        alert(err.error || "Erro ao excluir estágio");
      }
    } catch (err) {
      console.error("Erro ao excluir estágio:", err);
      alert("Erro de conexão ao excluir estágio.");
    }
  }

  // Carregar automações e produtos ao montar
  useEffect(() => {
    if (user) {
      loadAutomations();
      loadProducts();
    }
  }, [user]);

  // Carregar configurações de funil ao selecionar uma automação
  useEffect(() => {
    if (selectedAutomationId) {
      loadFunnelConfig(selectedAutomationId);
    } else {
      setStages([]);
    }
  }, [selectedAutomationId]);

  async function loadAutomations() {
    try {
      const res = await apiFetch("/automations");
      if (res.ok) {
        const data = (await res.json()) as { data: Automation[] };
        setAutomations(data.data || []);
        if (data.data && data.data.length > 0 && !selectedAutomationId) {
          setSelectedAutomationId(data.data[0].id);
        }
      }
    } catch (err) {
      console.error("Erro ao carregar automações:", err);
    }
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

  async function loadFunnelConfig(automationId: string) {
    setLoadingConfig(true);
    setSaveError(null);
    try {
      const res = await apiFetch(`/funnel-messages/config/${automationId}`);
      if (res.ok) {
        const resData = (await res.json()) as StageConfigResponse;
        setStages(resData.data.stages || []);
      } else {
        const errData = await res.json() as { error?: string };
        setSaveError(errData.error || "Erro ao buscar configurações do funil");
      }
    } catch (err) {
      console.error("Erro ao carregar configurações do funil:", err);
      setSaveError("Erro de conexão ao carregar configurações do funil.");
    }
    setLoadingConfig(false);
  }

  // Obter estágio ativo atualmente configurado
  const currentStage = stages.find((s) => s.stage_key === activeTab);

  // ── Atualizações no Estado Local (Configurações do Estágio) ──

  function updateStageMeta<K extends keyof Stage>(key: K, value: Stage[K]) {
    setStages(prev => prev.map(s => s.stage_key === activeTab ? { ...s, [key]: value } : s));
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

    // Swap
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

  // Upload de arquivos direto para o R2 no backend hono
  async function handleFileUpload(index: number, file: File) {
    if (!selectedAutomationId || !currentStage) return;

    // Sinalizar loading de upload para o bloco específico
    setStages(prev => prev.map(s => s.stage_key === activeTab ? {
      ...s,
      fields: s.fields.map((f, idx) => idx === index ? { ...f, uploading: true } : f)
    } : s));

    try {
      const formData = new FormData();
      formData.append("file", file);

      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/funnel-messages/upload/${selectedAutomationId}`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: formData
      });

      if (res.ok) {
        const resData = await res.json() as { data: { public_url: string; file_name: string } };
        setStages(prev => prev.map(s => s.stage_key === activeTab ? {
          ...s,
          fields: s.fields.map((f, idx) => idx === index ? { 
            ...f, 
            content: resData.data.public_url, 
            file_name: resData.data.file_name,
            uploading: false 
          } : f)
        } : s));
      } else {
        const err = await res.json() as { error?: string };
        alert(err.error || "Ocorreu um erro no upload do arquivo.");
        resetUploadingFlag(index);
      }
    } catch (err) {
      console.error("Erro no upload do arquivo:", err);
      alert("Falha de rede ao tentar subir o arquivo.");
      resetUploadingFlag(index);
    }
  }

  function resetUploadingFlag(index: number) {
    setStages(prev => prev.map(s => s.stage_key === activeTab ? {
      ...s,
      fields: s.fields.map((f, idx) => idx === index ? { ...f, uploading: false } : f)
    } : s));
  }

  // Enviar alterações para o D1
  async function handleSaveStage() {
    if (!selectedAutomationId || !currentStage) return;

    setSaving(true);
    setSaveError(null);

    // Validação básica
    const hasEmptyFields = currentStage.fields.some(f => !f.content.trim() && !f.uploading);
    if (hasEmptyFields) {
      alert("Por favor, preencha todos os campos de texto ou faça upload das mídias antes de salvar.");
      setSaving(false);
      return;
    }

    try {
      const cleanedFields = currentStage.fields.map(f => ({
        type: f.type,
        content: f.content,
        file_name: f.file_name
      }));

      const body = {
        enabled: currentStage.enabled,
        delay_minutes: currentStage.delay_minutes,
        rewrite_mode: currentStage.rewrite_mode,
        rewrite_count: currentStage.rewrite_count,
        fields: cleanedFields
      };

      const res = await apiFetch(`/funnel-messages/config/${selectedAutomationId}/${activeTab}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);

        // Recarregar os dados do estágio para atualizar variações inteligentes (se geradas)
        const resData = await res.json() as { data: Stage };
        setStages(prev => prev.map(s => s.stage_key === activeTab ? resData.data : s));
      } else {
        const err = await res.json() as { error?: string };
        alert(err.error || "Ocorreu um erro ao salvar o estágio do funil.");
      }
    } catch (err) {
      console.error("Erro ao salvar estágio do funil:", err);
      alert("Erro de conexão ao tentar salvar as configurações.");
    }
    setSaving(false);
  }

  // ── Renderizadores ────────────────────────────────────────────────

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
        key={field.id || index}
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
                placeholder="Insira a mensagem do funil aqui..."
                value={field.content}
                onChange={(e) => handleFieldContentChange(index, e.target.value)}
                rows={4}
                style={{ margin: 0, width: "100%", fontSize: "13px", resize: "vertical", background: "rgba(0,0,0,0.15)", border: "1px solid rgba(255,255,255,0.06)", fontFamily: "inherit" }}
              />
              <div style={{ fontSize: "10px", color: "var(--color-text-muted)", marginTop: "4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  Variáveis disponíveis: <code style={{ color: "#2dd4bf" }}>{"{primeiro_name}"}</code>, <code style={{ color: "#2dd4bf" }}>{"{nome}"}</code>, <code style={{ color: "#2dd4bf" }}>{"{email_cliente}"}</code>, <code style={{ color: "#2dd4bf" }}>{"{valor_pago}"}</code>
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
                              s.stage_key === activeTab
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
                          // Limpar seleção
                          setStages((prev) =>
                            prev.map((s) =>
                              s.stage_key === activeTab
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
                        <span>⚠️</span> Nenhum arquivo do tipo <strong>{field.type}</strong> cadastrado para os produtos desta automação.
                        Cadastre-o na seção <strong>Produtos</strong> primeiro.
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
                            setStages((prev) =>
                              prev.map((s) =>
                                s.stage_key === activeTab
                                  ? {
                                      ...s,
                                      fields: s.fields.map((f, idx) =>
                                        idx === index ? { ...f, file_name: val } : f
                                      ),
                                    }
                                  : s
                              )
                            );
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

  return (
    <AppLayout title="Mensagens do Funil">
      {/* ── Filtro Global de Automação ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          marginBottom: "24px",
          padding: "14px 20px",
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: "14px",
          flexWrap: "wrap",
          backdropFilter: "blur(8px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0c93f2" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--color-text-secondary)" }}>Automação ativa:</span>
        </div>
        <select
          className="input-field"
          value={selectedAutomationId}
          onChange={(e) => setSelectedAutomationId(e.target.value)}
          style={{ margin: 0, height: "38px", minWidth: "220px", flex: "1", maxWidth: "340px", fontWeight: "600" }}
        >
          {automations.length === 0 && <option value="">Nenhuma automação cadastrada</option>}
          {automations.map((a) => (
            <option key={a.id} value={a.id}>
              🤖 {a.name} ({a.slug})
            </option>
          ))}
        </select>

        {saveSuccess && (
          <span style={{ fontSize: "13px", color: "#10b981", fontWeight: "700", marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px", animation: "fadeIn 0.3s ease" }}>
            <span>💾</span> Salvo com sucesso!
          </span>
        )}
      </div>

      {loadingConfig ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}>
          <div className="spinner" style={{ width: "30px", height: "30px" }} />
        </div>
      ) : saveError ? (
        <div className="glass-card" style={{ padding: "30px", textAlign: "center", border: "1px solid rgba(239,68,68,0.2)" }}>
          <span style={{ fontSize: "28px" }}>⚠️</span>
          <h3 style={{ fontSize: "16px", color: "#ef4444", fontWeight: "700", marginTop: "12px" }}>Falha ao Carregar</h3>
          <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "6px" }}>{saveError}</p>
          <button className="btn-secondary" onClick={() => selectedAutomationId && loadFunnelConfig(selectedAutomationId)} style={{ marginTop: "16px" }}>
            🔄 Tentar Novamente
          </button>
        </div>
      ) : !currentStage ? (
        <div className="glass-card" style={{ textAlign: "center", padding: "60px", color: "var(--color-text-muted)" }}>
          Selecione uma automação para gerenciar as mensagens do funil.
        </div>
      ) : (
        <div className="animate-fade-in-up" style={{ display: "flex", flexDirection: "column" }}>
          {/* Seletor de Abas Horizontal com Drag and Drop e Criação */}
          <div className="tab-list" style={{ marginBottom: "28px", overflowX: "auto", WebkitOverflowScrolling: "touch", flexWrap: "nowrap", display: "flex", gap: "8px", alignItems: "center" }}>
            {stages.map((stage, index) => {
              const info = defaultTabInfo[stage.stage_key];
              const tabName = info ? `${info.icon} ${info.name}` : `⭐ ${stage.name || stage.stage_key}`;
              return (
                <button
                  key={stage.stage_key}
                  className={`tab-item ${activeTab === stage.stage_key ? "active" : ""}`}
                  onClick={() => setActiveTab(stage.stage_key)}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  style={{ whiteSpace: "nowrap", flexShrink: 0, cursor: "grab" }}
                >
                  {tabName}
                </button>
              );
            })}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowNewStageModal(true)}
              style={{ whiteSpace: "nowrap", flexShrink: 0, padding: "8px 16px", borderRadius: "10px", fontSize: "12px", fontWeight: "700" }}
            >
              ＋ Novo Estágio
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px]" style={{ gap: "28px", alignItems: "start" }}>
            {/* Bloco de Mensagens Principal */}
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div className="glass-card" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
                {/* Meta Configs da Aba */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "16px" }}>
                  <div>
                    <h3 style={{ fontSize: "16px", fontWeight: "800", color: "var(--color-text-primary)" }}>
                      Configurações do Estágio
                    </h3>
                    <p style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "4px", maxWidth: "450px" }}>
                      {defaultTabInfo[activeTab]?.description || "Estágio personalizado configurado pelo usuário."}
                    </p>
                  </div>

                  {!standardKeys.includes(activeTab) && (
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => handleDeleteStage(currentStage.id, currentStage.stage_key)}
                      style={{ fontSize: "11px", fontWeight: "700", padding: "6px 12px", borderRadius: "8px", marginRight: "12px" }}
                    >
                      🗑️ Excluir Estágio
                    </button>
                  )}

                  {/* Ativar/Desativar Ciclo do Estágio */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "12px", fontWeight: "700", color: currentStage.enabled ? "#2dd4bf" : "var(--color-text-muted)" }}>
                      {currentStage.enabled ? "✅ Ativo" : "❌ Inativo"}
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

                {/* Parâmetros Específicos */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  {/* Reescrita de IA */}
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--color-text-secondary)", marginBottom: "6px" }}>
                      Variabilidade de Texto (Reescrita por IA)
                    </label>
                    <select
                      className="input-field"
                      value={currentStage.rewrite_mode}
                      onChange={(e) => updateStageMeta("rewrite_mode", e.target.value as any)}
                      style={{ margin: 0, fontSize: "12px", fontWeight: "600" }}
                    >
                      <option value="none">Nenhuma (Sempre envia a cópia padrão)</option>
                      <option value="dynamic">Dinâmica (Reescreve com LLM em tempo real no envio)</option>
                      <option value="static">Estática (Pré-gera 5 variações ao salvar e rotaciona)</option>
                    </select>
                  </div>

                  {/* Delay (Apenas no Upsell) */}
                  {activeTab === "upsell" && (
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--color-text-secondary)", marginBottom: "6px" }}>
                        Tempo de Atraso após Entrega
                      </label>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <input
                          type="number"
                          className="input-field"
                          placeholder="Minutos"
                          value={currentStage.delay_minutes}
                          onChange={(e) => updateStageMeta("delay_minutes", parseInt(e.target.value) || 0)}
                          style={{ margin: 0, fontSize: "12px", fontWeight: "600", width: "100px" }}
                          min={1}
                        />
                        <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: "600" }}>
                          minutos
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Lista de Blocos de Mensagem */}
                <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "10px" }}>
                  <h4 style={{ fontSize: "13px", fontWeight: "800", color: "var(--color-text-secondary)" }}>
                    Sequência de Disparo do Funil
                  </h4>

                  {currentStage.fields.length === 0 ? (
                    <div style={{ padding: "40px 20px", border: "1px dashed rgba(255,255,255,0.06)", borderRadius: "14px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "12px" }}>
                      Nenhum bloco de mensagem cadastrado nesta etapa. Use os botões abaixo para adicionar!
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

                {/* Salvar Botão */}
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "10px" }}>
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

            {/* Sidebar Lateral de Previsão de Conteúdo e Inteligência Artificial */}
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Box de Pré-visualização do WhatsApp */}
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
                      Nenhuma mensagem cadastrada.
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
                              .replace(/{{primeiro_nome}}/g, "Aluna")
                              .replace(/{primeiro_nome}/g, "Aluna")
                              .replace(/{{primeiro_name}}/g, "Aluna")
                              .replace(/{primeiro_name}/g, "Aluna")
                              .replace(/{{nome}}/g, "Maria")
                              .replace(/{nome}/g, "Maria")
                              .replace(/{{valor_pago}}/g, "10,00")
                              .replace(/{valor_pago}/g, "10,00")
                          ) : (
                            <div style={{ color: "#36adff", fontWeight: "700" }}>
                              {f.type === "audio" ? "🎵 Áudio enviado" : f.type === "image" ? "🖼️ Imagem enviada" : f.type === "video" ? "📹 Vídeo enviado" : "📄 PDF enviado"}
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
                    As 5 variações abaixo foram geradas automaticamente pelo modelo do Gemini ao salvar o estágio e serão rotacionadas sequencialmente entre os clientes.
                  </p>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "250px", overflowY: "auto" }}>
                    {(() => {
                      try {
                        const vars = JSON.parse(currentStage.variations || "[]") as string[];
                        if (vars.length === 0) {
                          return (
                            <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontStyle: "italic", textAlign: "center", padding: "10px" }}>
                              Nenhuma variação pré-gerada ainda. Edite o texto do primeiro bloco de texto e clique em "Salvar Alterações" para gerar.
                            </span>
                          );
                        }
                        return vars.map((v, i) => (
                          <div key={i} style={{ padding: "8px 10px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "8px", fontSize: "11px", color: "var(--color-text-secondary)", lineHeight: "1.4" }}>
                            <strong>Variação #{i + 1}:</strong>
                            <p style={{ marginTop: "4px", whiteSpace: "pre-wrap" }}>{v.substring(0, 160)}...</p>
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
        </div>
      )}

      {/* Modal Premium Glassmorphic para criar novo estágio */}
      {showNewStageModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(10px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          animation: "fadeIn 0.2s ease"
        }}>
          <div className="glass-card" style={{
            width: "400px",
            padding: "24px",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            display: "flex",
            flexDirection: "column",
            gap: "16px"
          }}>
            <h3 style={{ fontSize: "16px", fontWeight: "800", color: "#fff", margin: 0 }}>
              Criar Novo Estágio
            </h3>
            <div>
              <label style={{ display: "block", fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "6px", fontWeight: "600" }}>
                Nome do Estágio
              </label>
              <input
                type="text"
                className="input-field"
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                placeholder="Ex: Oferta Relâmpago"
                style={{ width: "100%", margin: 0 }}
                autoFocus
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowNewStageModal(false);
                  setNewStageName("");
                }}
                style={{ padding: "8px 16px", fontSize: "12px", fontWeight: "700" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleCreateStage}
                style={{ padding: "8px 16px", fontSize: "12px", fontWeight: "700" }}
              >
                Criar Estágio
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
