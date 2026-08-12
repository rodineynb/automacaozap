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
}

interface FollowupStage {
  id: string;
  automation_id: string;
  key: string;
  name: string;
  class: "reengajamento" | "cobranca";
  delay_minutes: number;
  message: string | null;
  media_url?: string | null;
  enabled: number;
  tag_to_add?: string | null;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
  rewrite_mode?: "none" | "dynamic" | "static";
  rewrite_count?: number;
  variations?: string; // JSON de variações estáticas
  fields: Field[]; // Parseado localmente
}

interface FollowupConfig {
  automation_id: string;
  use_llm_variations: number;
  stages: FollowupStage[];
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

// ── Helpers ──────────────────────────────────────────────────────

function formatDelayHuman(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  const d = Math.floor(h / 24);
  const remainingH = h % 24;
  if (d > 0) {
    if (remainingH === 0) return `${d}d`;
    return `${d}d ${remainingH}h`;
  }
  return `${h}h ${m}min`;
}

// ── Componente Principal ──────────────────────────────────────────

export default function FollowupPage() {
  const { user } = useAuth();
  const { apiFetch } = useApi();

  // Estados principais
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [selectedAutomationId, setSelectedAutomationId] = useState<string>("");
  const [stages, setStages] = useState<FollowupStage[]>([]);
  const [productsList, setProductsList] = useState<Product[]>([]);
  
  // Abas de classe (Reengajamento / Cobrança)
  const [activeClass, setActiveClass] = useState<"reengajamento" | "cobranca">("reengajamento");
  
  // Estágio ativo selecionado na classe
  const [activeStageId, setActiveStageId] = useState<string>("");

  // Loadings e Feedback
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Modal para Criar Novo Estágio
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [newStageDelay, setNewStageDelay] = useState<number>(30);
  const [newStageTag, setNewStageTag] = useState("");
  const [creatingStage, setCreatingStage] = useState(false);

  // Estados de Reordenação por Arraste
  const [draggedStageIndex, setDraggedStageIndex] = useState<number | null>(null);

  const handleStageDragStart = (e: React.DragEvent, index: number) => {
    setDraggedStageIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleStageDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
  };

  const handleStageDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedStageIndex === null || draggedStageIndex === targetIndex) return;

    // Obter todos os estágios da classe ativa e reordenar
    const activeClassStages = stages.filter((s) => s.class === activeClass);
    const otherClassStages = stages.filter((s) => s.class !== activeClass);

    const reorderedActiveStages = [...activeClassStages];
    const [draggedStage] = reorderedActiveStages.splice(draggedStageIndex, 1);
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
    setDraggedStageIndex(null);

    try {
      const reorderList = updatedStages.map((s) => ({ id: s.id, sort_order: s.sort_order }));
      await apiFetch(`/followup/config/${selectedAutomationId}/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stages: reorderList })
      });
    } catch (err) {
      console.error("Erro ao salvar ordenação de estágios:", err);
    }
  };

  // Carregar dados iniciais
  useEffect(() => {
    if (user) {
      loadAutomations();
      loadProducts();
    }
  }, [user]);

  // Carregar configurações ao mudar automação
  useEffect(() => {
    if (selectedAutomationId) {
      loadConfig(selectedAutomationId);
    } else {
      setStages([]);
      setActiveStageId("");
    }
  }, [selectedAutomationId]);

  // Auto-selecionar o primeiro estágio da classe ativa quando ela ou os estágios mudarem
  useEffect(() => {
    const classStages = stages.filter(s => s.class === activeClass);
    if (classStages.length > 0) {
      // Verificar se o estágio atualmente ativo ainda pertence à classe
      const currentStillValid = classStages.some(s => s.id === activeStageId);
      if (!currentStillValid) {
        setActiveStageId(classStages[0].id);
      }
    } else {
      setActiveStageId("");
    }
  }, [activeClass, stages]);

  async function loadAutomations() {
    try {
      const res = await apiFetch("/followup/automations");
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

  async function loadConfig(automationId: string) {
    setLoadingConfig(true);
    setSaveError(null);
    try {
      const res = await apiFetch(`/followup/config/${automationId}`);
      if (res.ok) {
        const resData = (await res.json()) as { data: FollowupConfig };
        const rawStages = resData.data.stages || [];
        
        // Parsear os campos salvos em JSON na propriedade 'message'
        const mappedStages = rawStages.map((s) => {
          let fields: Field[] = [];
          if (s.message) {
            if (s.message.startsWith("[")) {
              try {
                fields = JSON.parse(s.message) as Field[];
              } catch (e) {
                console.error("Erro parsing message blocks:", e);
                fields = [{ id: `legacy_${Date.now()}`, type: "text", content: s.message }];
              }
            } else {
              fields = [{ id: `legacy_${Date.now()}`, type: "text", content: s.message }];
            }
          }
          return { ...s, fields };
        });

        setStages(mappedStages);
      } else {
        const errData = await res.json() as { error?: string };
        setSaveError(errData.error || "Erro ao carregar configurações de follow-up");
      }
    } catch (err) {
      console.error("Erro ao carregar config:", err);
      setSaveError("Erro de conexão ao carregar configurações.");
    }
    setLoadingConfig(false);
  }

  // Estágio ativo selecionado atualmente
  const currentStage = stages.find((s) => s.id === activeStageId);

  // ── Atualizações no Estado Local (Configurações do Estágio) ──

  function updateStageMeta<K extends keyof FollowupStage>(key: K, value: FollowupStage[K]) {
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

  // Criar Novo Estágio
  async function handleCreateStage() {
    if (!newStageName || !selectedAutomationId) {
      alert("Por favor, preencha o nome do estágio.");
      return;
    }

    setCreatingStage(true);
    try {
      const body = {
        name: newStageName,
        class: activeClass,
        delay_minutes: Number(newStageDelay),
        message: "[]", // Inicializa vazio (JSON de blocos)
        tag_to_add: newStageTag || null,
        enabled: 1,
        rewrite_mode: "none"
      };

      const res = await apiFetch(`/followup/config/${selectedAutomationId}/stages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setShowCreateModal(false);
        setNewStageName("");
        setNewStageDelay(30);
        setNewStageTag("");
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        await loadConfig(selectedAutomationId);
      } else {
        const errData = await res.json() as { error?: string };
        alert(errData.error || "Erro ao criar estágio de follow-up.");
      }
    } catch (err) {
      console.error("Erro ao criar estágio:", err);
      alert("Erro de conexão ao criar estágio.");
    }
    setCreatingStage(false);
  }

  // Deletar Estágio Ativo
  async function handleDeleteActiveStage() {
    if (!currentStage || !selectedAutomationId) return;

    if (!confirm(`Tem certeza que deseja excluir permanentemente o estágio "${currentStage.name}"?`)) {
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch(`/followup/config/${selectedAutomationId}/stages/${currentStage.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        await loadConfig(selectedAutomationId);
      } else {
        alert("Falha ao excluir o estágio.");
      }
    } catch (err) {
      console.error("Erro ao deletar estágio:", err);
      alert("Erro de conexão ao remover o estágio.");
    }
    setSaving(false);
  }

  // Salvar Alterações do Estágio
  async function handleSaveStage() {
    if (!selectedAutomationId || !currentStage) return;

    setSaving(true);
    setSaveError(null);

    // Validação básica
    const hasEmptyFields = currentStage.fields.some(f => !f.content.trim());
    if (hasEmptyFields) {
      alert("Por favor, preencha todos os campos de texto ou selecione os arquivos das mídias antes de salvar.");
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
        class: currentStage.class,
        delay_minutes: Number(currentStage.delay_minutes),
        tag_to_add: currentStage.tag_to_add || null,
        enabled: currentStage.enabled,
        rewrite_mode: currentStage.rewrite_mode || "none",
        rewrite_count: currentStage.rewrite_count || 5,
        message: JSON.stringify(cleanedFields) // Salva como string JSON de blocos
      };

      const res = await apiFetch(`/followup/config/${selectedAutomationId}/stages/${currentStage.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        
        // Recarregar os dados para atualizar variações estáticas (se geradas)
        await loadConfig(selectedAutomationId);
      } else {
        const err = await res.json() as { error?: string };
        alert(err.error || "Ocorreu um erro ao salvar as alterações do estágio.");
      }
    } catch (err) {
      console.error("Erro ao salvar estágio:", err);
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
                placeholder="Escreva a mensagem do follow-up aqui..."
                value={field.content}
                onChange={(e) => handleFieldContentChange(index, e.target.value)}
                rows={4}
                style={{ margin: 0, width: "100%", fontSize: "13px", resize: "vertical", background: "rgba(0,0,0,0.15)", border: "1px solid rgba(255,255,255,0.06)", fontFamily: "inherit" }}
              />
              <div style={{ fontSize: "10px", color: "var(--color-text-muted)", marginTop: "4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  Variáveis: <code style={{ color: "#2dd4bf" }}>{"{nome}"}</code>, <code style={{ color: "#2dd4bf" }}>{"{primeiro_nome}"}</code>, <code style={{ color: "#2dd4bf" }}>{"{valor}"}</code> (Upsell)
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

  // Filtro de estágios pela classe ativa
  const classStages = stages.filter(s => s.class === activeClass);

  return (
    <AppLayout title="Configurações de Follow-up">
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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          </svg>
          <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--color-text-secondary)" }}>Automação:</span>
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
          <button className="btn-secondary" onClick={() => selectedAutomationId && loadConfig(selectedAutomationId)} style={{ marginTop: "16px" }}>
            🔄 Tentar Novamente
          </button>
        </div>
      ) : (
        <div className="animate-fade-in-up" style={{ display: "flex", flexDirection: "column" }}>
          {/* Abas Principais de Classes (Horizontal) */}
          <div className="tab-list" style={{ marginBottom: "20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <button
              className={`tab-item ${activeClass === "reengajamento" ? "active" : ""}`}
              onClick={() => setActiveClass("reengajamento")}
              style={{ fontSize: "14px", fontWeight: "700", paddingBottom: "12px" }}
            >
              🔔 Régua de Reengajamento
            </button>
            <button
              className={`tab-item ${activeClass === "cobranca" ? "active" : ""}`}
              onClick={() => setActiveClass("cobranca")}
              style={{ fontSize: "14px", fontWeight: "700", paddingBottom: "12px" }}
            >
              💰 Régua de Cobrança
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
                onDragStart={(e) => handleStageDragStart(e, index)}
                onDragOver={(e) => handleStageDragOver(e, index)}
                onDrop={(e) => handleStageDrop(e, index)}
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
                {stage.enabled ? "🟢" : "⚫"} {stage.name} ({formatDelayHuman(stage.delay_minutes)})
              </button>
            ))}

            <button
              onClick={() => setShowCreateModal(true)}
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
              Nenhum estágio de {activeClass === "reengajamento" ? "reengajamento" : "cobrança"} cadastrado. Clique em "Novo Estágio" para criar um!
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px]" style={{ gap: "28px", alignItems: "start" }}>
              
              {/* Coluna da Esquerda: Configurações e Bloco de Mensagens */}
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div className="glass-card" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
                  
                  {/* Topo do Estágio */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "16px" }}>
                    <div>
                      <h3 style={{ fontSize: "16px", fontWeight: "800", color: "var(--color-text-primary)" }}>
                        Configurações do Estágio: {currentStage.name}
                      </h3>
                      <p style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "4px" }}>
                        Defina o delay e as regras deste follow-up.
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
                        Delay do Disparo
                      </label>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <input
                          type="number"
                          className="input-field"
                          value={currentStage.delay_minutes}
                          onChange={(e) => updateStageMeta("delay_minutes", parseInt(e.target.value) || 0)}
                          style={{ margin: 0, fontSize: "12px", width: "80px" }}
                          min={1}
                        />
                        <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: "600" }}>
                          minutos ({formatDelayHuman(currentStage.delay_minutes)})
                        </span>
                      </div>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--color-text-secondary)", marginBottom: "6px" }}>
                        Tag ao Lead (Opcional)
                      </label>
                      <input
                        type="text"
                        className="input-field"
                        value={currentStage.tag_to_add || ""}
                        onChange={(e) => updateStageMeta("tag_to_add", e.target.value || null)}
                        placeholder="Ex: lead_reengajado"
                        style={{ margin: 0, fontSize: "12px" }}
                      />
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
                        <option value="static">📋 Estático (Gera 5 variações e rotaciona)</option>
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
                      Sequência de Blocos do Follow-up
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
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={handleDeleteActiveStage}
                      disabled={saving}
                      style={{ height: "42px", fontWeight: "700", borderRadius: "10px", padding: "0 18px" }}
                    >
                      🗑️ Excluir Estágio
                    </button>

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
                                .replace(/{{primeiro_nome}}/g, "Aluna")
                                .replace(/{primeiro_nome}/g, "Aluna")
                                .replace(/{{primeiro_name}}/g, "Aluna")
                                .replace(/{primeiro_name}/g, "Aluna")
                                .replace(/{{nome}}/g, "Maria")
                                .replace(/{nome}/g, "Maria")
                                .replace(/{{valor}}/g, "14,50")
                                .replace(/{valor}/g, "14,50")
                            ) : (
                              <div style={{ color: "#36adff", fontWeight: "700" }}>
                                {f.type === "audio" ? "🎵 Áudio de follow-up" : f.type === "image" ? "🖼️ Imagem enviada" : f.type === "video" ? "📹 Vídeo enviado" : "📄 PDF enviado"}
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
          )}
        </div>
      )}

      {/* ── MODAL DE CRIAÇÃO DE ESTÁGIO ── */}
      {showCreateModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center",
          justifyContent: "center", zIndex: 1000, padding: "20px", backdropFilter: "blur(5px)"
        }}>
          <div className="glass-card animate-scale-in" style={{ width: "100%", maxWidth: "480px", padding: "28px", display: "flex", flexDirection: "column", gap: "20px", background: "rgba(21, 27, 43, 0.95)", border: "1px solid rgba(45, 212, 191, 0.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: "18px", fontWeight: "800", margin: 0, color: "var(--color-text-primary)" }}>
                ➕ Criar Estágio ({activeClass === "reengajamento" ? "Reengajamento" : "Cobrança"})
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: "transparent", border: "none", fontSize: "18px", cursor: "pointer", color: "var(--color-text-muted)" }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Nome do Estágio *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ex: Vigia, Cobrador Amigo, Aviso Final"
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  style={{ margin: 0 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Delay (Minutos) *</label>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="number"
                    className="input-field"
                    value={newStageDelay}
                    onChange={(e) => setNewStageDelay(parseInt(e.target.value) || 0)}
                    style={{ margin: 0, width: "120px" }}
                    min={1}
                  />
                  <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: "600" }}>
                    = {formatDelayHuman(newStageDelay)}
                  </span>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Adicionar Tag ao Lead (Opcional)</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ex: lead_frio, cobranca_vigia"
                  value={newStageTag}
                  onChange={(e) => setNewStageTag(e.target.value)}
                  style={{ margin: 0 }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "18px" }}>
              <button
                className="btn-secondary"
                onClick={() => setShowCreateModal(false)}
                disabled={creatingStage}
                style={{ height: "38px", padding: "0 20px" }}
              >
                Cancelar
              </button>
              <button
                className="btn-primary"
                onClick={handleCreateStage}
                disabled={creatingStage}
                style={{ height: "38px", padding: "0 24px", display: "flex", alignItems: "center", gap: "6px", fontWeight: "700" }}
              >
                {creatingStage ? <div className="spinner" style={{ width: "14px", height: "14px", borderWidth: "2px" }} /> : "💾 Salvar"}
              </button>
            </div>

          </div>
        </div>
      )}
    </AppLayout>
  );
}
