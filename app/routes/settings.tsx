import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth, useApi } from "../contexts/auth-context";
import { AppLayout } from "../components/layout";

type TabType = "whatsapp" | "llms" | "ocr" | "transcription" | "domains";

interface ApiItem { id: string; name: string; base_url?: string; api_key: string; docs_url?: string; provider?: string; endpoint?: string; domain?: string; active?: number; created_at: string }

const LLM_PROVIDERS: Record<string, string[]> = {
  "Google": [
    "gemini-3.5-flash",
    "gemini-3.1-pro",
    "gemini-3.1-flash-lite",
    "gemini-3-flash",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro"
  ],
  "Chat GPT": [
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-4o-mini",
    "gpt-4o",
    "o1-mini",
    "o3-mini",
    "o1"
  ],
  "DeepSeek": [
    "deepseek-v4-flash",
    "deepseek-v4-pro",
    "deepseek-chat",
    "deepseek-reasoner"
  ],
  "Cloud": [
    "claude-4.7-opus",
    "claude-4.6-sonnet",
    "claude-4.5-haiku",
    "claude-3-5-sonnet-latest",
    "claude-3-5-haiku-latest",
    "claude-3-opus-latest"
  ]
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabType>("whatsapp");
  const [items, setItems] = useState<ApiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ msg: "", type: "" });
  
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const navigate = useNavigate();

  useEffect(() => { if (user) loadItems(); }, [user, activeTab]);

  const tabConfig: Record<TabType, { label: string; endpoint: string; fields: { key: string; label: string; type?: string }[] }> = {
    whatsapp: { label: "APIs WhatsApp", endpoint: "/settings/whatsapp-apis", fields: [
      { key: "name", label: "Nome" }, { key: "base_url", label: "URL Base" },
      { key: "api_key", label: "API Key", type: "password" }, { key: "docs_url", label: "Link Documentação" }
    ]},
    llms: { label: "LLMs", endpoint: "/settings/llms", fields: [
      { key: "provider", label: "Provedor" },
      { key: "name", label: "Nome do Modelo" },
      { key: "api_key", label: "API Key", type: "password" }
    ]},
    ocr: { label: "OCR", endpoint: "/settings/ocr", fields: [
      { key: "name", label: "Nome" }, { key: "endpoint", label: "Endpoint" },
      { key: "api_key", label: "API Key", type: "password" }, { key: "docs_url", label: "Link Documentação" }
    ]},
    transcription: { label: "Transcrição de Áudio", endpoint: "/settings/transcription-services", fields: [
      { key: "name", label: "Nome" }, { key: "endpoint", label: "Endpoint" },
      { key: "api_key", label: "API Key", type: "password" }, { key: "docs_url", label: "Link Documentação" }
    ]},
    domains: { label: "Domínios", endpoint: "/settings/domains", fields: [
      { key: "domain", label: "Domínio" }
    ]}
  };

  const config = tabConfig[activeTab];

  async function loadItems() {
    setLoading(true);
    try {
      const res = await apiFetch(config.endpoint);
      if (res.ok) { const data = await res.json() as { data: ApiItem[] }; setItems(data.data); }
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  function openCreate() {
    setEditingId(null);
    if (activeTab === "llms") {
      setForm({ provider: "Google", name: "gemini-2.5-flash", api_key: "" });
    } else {
      const emptyForm: Record<string, string> = {};
      config.fields.forEach(f => emptyForm[f.key] = "");
      setForm(emptyForm);
    }
    setShowModal(true);
  }

  function openEdit(item: ApiItem) {
    setEditingId(item.id);
    if (activeTab === "llms") {
      let prov = item.provider || "Google";
      if (prov === "OpenAI") prov = "Chat GPT";
      if (prov === "Anthropic") prov = "Cloud";
      setForm({ 
        provider: prov, 
        name: item.name || "", 
        api_key: item.api_key || "" 
      });
    } else {
      const editForm: Record<string, string> = {};
      config.fields.forEach(f => editForm[f.key] = String((item as any)[f.key] || ""));
      setForm(editForm);
    }
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const method = editingId ? "PUT" : "POST";
      const url = editingId ? `${config.endpoint}/${editingId}` : config.endpoint;
      const res = await apiFetch(url, { method, body: JSON.stringify(form) });
      if (res.ok) {
        setShowModal(false);
        loadItems();
        showToast(editingId ? "Atualizado!" : "Cadastrado!", "success");
      } else {
        const data = await res.json() as { error: string };
        showToast(data.error || "Erro", "error");
      }
    } catch { showToast("Erro de conexão", "error"); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja remover?")) return;
    try {
      await apiFetch(`${config.endpoint}/${id}`, { method: "DELETE" });
      loadItems();
      showToast("Removido!", "success");
    } catch { showToast("Erro", "error"); }
  }

  async function handleReorder(id: string, direction: "up" | "down") {
    if (activeTab === "domains" || activeTab === "whatsapp") return;
    try {
      const res = await apiFetch("/settings/reorder", {
        method: "POST",
        body: JSON.stringify({ table: activeTab, id, direction })
      });
      if (res.ok) {
        loadItems();
      } else {
        showToast("Erro ao reordenar", "error");
      }
    } catch {
      showToast("Erro de conexão", "error");
    }
  }

  function showToast(msg: string, type: string) { setToast({ msg, type }); setTimeout(() => setToast({ msg: "", type: "" }), 3000); }

  return (
    <AppLayout title="Configurações">
      {/* Tabs */}
      <div className="tab-list" style={{ marginBottom: "32px", overflowX: "auto", WebkitOverflowScrolling: "touch", flexWrap: "nowrap" }}>
        {(Object.entries(tabConfig) as [TabType, typeof config][]).map(([key, val]) => (
          <button key={key} className={`tab-item ${activeTab === key ? "active" : ""}`}
            onClick={() => setActiveTab(key)} style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
            {val.label}
          </button>
        ))}
      </div>

      {/* Add button */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "20px" }}>
        <button className="btn-primary" onClick={openCreate}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Adicionar {config.label.replace(/s$/, '')}
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "60px" }}>
          <div className="spinner" style={{ width: "36px", height: "36px" }} />
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">⚙️</div>
          <div className="empty-state-title">Nenhum cadastro</div>
          <div className="empty-state-text">Clique em "Adicionar" para cadastrar</div>
        </div>
      ) : (
        <div className="glass-card" style={{ borderRadius: "14px", overflow: "auto", WebkitOverflowScrolling: "touch" }}>
          <table className="data-table">
            <thead>
              <tr>
                {activeTab === "llms" ? (
                  <>
                    <th>Provedor</th>
                    <th>Modelo</th>
                  </>
                ) : (
                  config.fields.filter(f => f.type !== "password").map(f => (
                    <th key={f.key}>{f.label}</th>
                  ))
                )}
                {activeTab === "domains" && <th>Status</th>}
                <th style={{ textAlign: "right" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  {activeTab === "llms" ? (
                    <>
                      <td style={{ fontWeight: "700", color: "var(--color-brand-400)" }}>
                        {item.provider === "OpenAI" ? "Chat GPT" : item.provider === "Anthropic" ? "Cloud" : (item.provider || "—")}
                      </td>
                      <td><code>{item.name || "—"}</code></td>
                    </>
                  ) : (
                    config.fields.filter(f => f.type !== "password").map(f => (
                      <td key={f.key}>
                        {f.key === "docs_url" && (item as any)[f.key] ? (
                          <a href={String((item as any)[f.key])} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-brand-400)", textDecoration: "none" }}>
                            📄 Ver docs
                          </a>
                        ) : (
                          String((item as any)[f.key] || "—")
                        )}
                      </td>
                    ))
                  )}
                  {activeTab === "domains" && (
                    <td>
                      <span className={`badge ${item.active ? 'badge-success' : 'badge-danger'}`}>
                        {item.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                  )}
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                      {activeTab !== "whatsapp" && activeTab !== "domains" && (
                        <>
                          <button onClick={() => handleReorder(item.id, "up")} className="btn-secondary" style={{ fontSize: "11px", padding: "6px 8px", minWidth: "28px" }} title="Aumentar Prioridade (Subir)">
                            ▲
                          </button>
                          <button onClick={() => handleReorder(item.id, "down")} className="btn-secondary" style={{ fontSize: "11px", padding: "6px 8px", minWidth: "28px" }} title="Diminuir Prioridade (Descer)">
                            ▼
                          </button>
                        </>
                      )}
                      <button onClick={() => openEdit(item)} className="btn-secondary" style={{ fontSize: "12px", padding: "6px 12px" }}>
                        Editar
                      </button>
                      <button onClick={() => handleDelete(item.id)} className="btn-danger" style={{ fontSize: "12px", padding: "6px 12px" }}>
                        Remover
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: "20px", fontWeight: "700", marginBottom: "24px" }}>
              {editingId ? "Editar" : "Novo"} {config.label.replace(/s$/, '')}
            </h2>
            <form onSubmit={handleSave}>
              {activeTab === "llms" ? (
                <>
                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>
                      Provedor
                    </label>
                    <select
                      className="input-field"
                      value={form.provider || "Google"}
                      onChange={(e) => {
                        const prov = e.target.value;
                        const models = LLM_PROVIDERS[prov] || [];
                        setForm({ ...form, provider: prov, name: models[0] || "" });
                      }}
                      required
                      style={{ margin: 0, height: "40px" }}
                    >
                      {Object.keys(LLM_PROVIDERS).map(prov => (
                        <option key={prov} value={prov}>{prov}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>
                      Modelo
                    </label>
                    <select
                      className="input-field"
                      value={form.name || ""}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                      style={{ margin: 0, height: "40px" }}
                    >
                      {(() => {
                        const providerModels = LLM_PROVIDERS[form.provider || "Google"] || [];
                        const allModels = [...providerModels];
                        if (form.name && !allModels.includes(form.name)) {
                          allModels.push(form.name);
                        }
                        return allModels.map(model => (
                          <option key={model} value={model}>{model}</option>
                        ));
                      })()}
                    </select>
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>
                      API Key
                    </label>
                    <input
                      className="input-field"
                      type="password"
                      value={form.api_key || ""}
                      onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                      required
                      placeholder="Insira a chave API da LLM"
                    />
                  </div>
                </>
              ) : (
                config.fields.map(f => (
                  <div key={f.key} style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>
                      {f.label}
                    </label>
                    <input
                      className="input-field"
                      type={f.type || "text"}
                      value={form[f.key] || ""}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      required={f.key !== "docs_url"}
                      placeholder={f.key === "docs_url" ? "https://docs.exemplo.com" : ""}
                    />
                  </div>
                ))
              )}
              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "24px" }}>
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? <><div className="spinner" /> Salvando...</> : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast.msg && <div className={`toast ${toast.type === "success" ? "toast-success" : "toast-error"}`}>{toast.msg}</div>}
    </AppLayout>
  );
}
