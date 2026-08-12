import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth, useApi } from "../contexts/auth-context";
import { AppLayout } from "../components/layout";

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  allowed_sections: string;
  allowed_automations: string;
  allowed_products: string;
  created_at: string;
}

interface ItemOption {
  id: string;
  name: string;
  slug?: string;
}

const SECTIONS = [
  { key: "dashboard", label: "Dashboard (Performance)" },
  { key: "products", label: "Produtos" },
  { key: "automations", label: "Automações" },
  { key: "funnel-messages", label: "Mensagens do Funil" },
  { key: "followup", label: "Follow-up" },
  { key: "crm", label: "CRM" },
  { key: "chat", label: "Chat Realtime" },
  { key: "reports", label: "Relatórios" },
  { key: "settings", label: "Configurações" }
];

export default function UsersPage() {
  const { user, updateUser } = useAuth();
  const { apiFetch } = useApi();
  const navigate = useNavigate();

  const [usersList, setUsersList] = useState<UserItem[]>([]);
  const [automations, setAutomations] = useState<ItemOption[]>([]);
  const [products, setProducts] = useState<ItemOption[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ msg: "", type: "" });

  // Form States (for Admin CRUD and Profile edit)
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState("normal");
  
  // Sections Access State
  const [formSections, setFormSections] = useState<string[]>(["dashboard"]);
  
  // Automations Scope State ("all" or list of IDs)
  const [automationsScope, setAutomationsScope] = useState<"all" | "custom">("all");
  const [formAutomations, setFormAutomations] = useState<string[]>([]);
  
  // Products Scope State ("all" or list of IDs)
  const [productsScope, setProductsScope] = useState<"all" | "custom">("all");
  const [formProducts, setFormProducts] = useState<string[]>([]);

  // Profile-specific States (for normal users)
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  useEffect(() => {
    if (user) {
      if (user.role === "admin") {
        loadData();
      } else {
        // For non-admin users, populate their own profile data directly
        setFormName(user.name || "");
        setFormEmail(user.email || "");
        setLoading(false);
      }
    }
  }, [user]);

  async function loadData() {
    setLoading(true);
    try {
      const [uRes, aRes, pRes] = await Promise.all([
        apiFetch("/users"),
        apiFetch("/automations"),
        apiFetch("/products")
      ]);

      if (uRes.ok) {
        const uData = await uRes.json() as { data: UserItem[] };
        setUsersList(uData.data);
      }
      if (aRes.ok) {
        const aData = await aRes.json() as { data: any[] };
        setAutomations(aData.data.map(item => ({ id: item.id, name: item.name, slug: item.slug })));
      }
      if (pRes.ok) {
        const pData = await pRes.json() as { data: any[] };
        setProducts(pData.data.map(item => ({ id: item.id, name: item.name })));
      }
    } catch (err) {
      console.error("Erro ao carregar dados dos usuários:", err);
      showToast("Falha ao carregar dados.", "error");
    }
    setLoading(false);
  }

  function showToast(msg: string, type: string = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: "", type: "" }), 3500);
  }

  function openCreateModal() {
    setEditingId(null);
    setFormName("");
    setFormEmail("");
    setFormPassword("");
    setFormRole("normal");
    setFormSections(["dashboard", "chat"]);
    setAutomationsScope("all");
    setFormAutomations([]);
    setProductsScope("all");
    setFormProducts([]);
    setShowModal(true);
  }

  function openEditModal(u: UserItem) {
    setEditingId(u.id);
    setFormName(u.name);
    setFormEmail(u.email);
    setFormPassword("");
    setFormRole(u.role);
    
    // Parse allowed sections
    setFormSections(u.allowed_sections ? u.allowed_sections.split(",").map(s => s.trim()) : []);
    
    // Parse allowed automations
    if (u.allowed_automations === "all" || !u.allowed_automations) {
      setAutomationsScope("all");
      setFormAutomations([]);
    } else {
      setAutomationsScope("custom");
      setFormAutomations(u.allowed_automations.split(",").map(s => s.trim()));
    }

    // Parse allowed products
    if (u.allowed_products === "all" || !u.allowed_products) {
      setProductsScope("all");
      setFormProducts([]);
    } else {
      setProductsScope("custom");
      setFormProducts(u.allowed_products.split(",").map(s => s.trim()));
    }

    setShowModal(true);
  }

  function toggleSection(sectionKey: string) {
    setFormSections(prev => 
      prev.includes(sectionKey) ? prev.filter(k => k !== sectionKey) : [...prev, sectionKey]
    );
  }

  // Admin user saving handler
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!formName || !formEmail || (editingId === null && !formPassword)) {
      showToast("Por favor, preencha todos os campos obrigatórios.", "error");
      return;
    }

    setSaving(true);

    const payload = {
      name: formName,
      email: formEmail,
      password: formPassword || undefined,
      role: formRole,
      allowed_sections: formRole === "admin" ? "dashboard,products,automations,funnel-messages,followup,crm,chat,reports,settings,users" : formSections.join(","),
      allowed_automations: formRole === "admin" || automationsScope === "all" ? "all" : formAutomations.join(","),
      allowed_products: formRole === "admin" || productsScope === "all" ? "all" : formProducts.join(",")
    };

    try {
      const url = editingId ? `/users/${editingId}` : "/users";
      const method = editingId ? "PUT" : "POST";
      
      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(payload)
      });

      const data = await res.json() as { error?: string; message?: string };
      if (res.ok) {
        showToast(editingId ? "Usuário atualizado com sucesso!" : "Usuário cadastrado com sucesso!", "success");
        setShowModal(false);
        loadData();
      } else {
        showToast(data.error || "Erro ao salvar usuário.", "error");
      }
    } catch (err) {
      showToast("Erro de conexão.", "error");
    }
    setSaving(false);
  }

  // Non-admin own profile saving handler
  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    if (!formName || !formEmail) {
      showToast("Nome e E-mail são obrigatórios.", "error");
      return;
    }
    if (newPassword && !currentPassword) {
      showToast("Você precisa informar a senha atual para cadastrar uma nova.", "error");
      return;
    }
    if (newPassword && newPassword !== confirmNewPassword) {
      showToast("A nova senha e a confirmação não conferem.", "error");
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        name: formName,
        email: formEmail,
      };
      if (newPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }

      const res = await apiFetch("/auth/profile", {
        method: "PUT",
        body: JSON.stringify(payload)
      });

      const data = await res.json() as { error?: string; user?: any };
      if (res.ok) {
        showToast("Perfil atualizado com sucesso!", "success");
        if (data.user && updateUser) {
          updateUser({
            ...user!,
            name: data.user.name,
            email: data.user.email
          });
        }
        setCurrentPassword("");
        setNewPassword("");
        setConfirmNewPassword("");
      } else {
        showToast(data.error || "Erro ao salvar perfil.", "error");
      }
    } catch (err) {
      showToast("Erro de conexão.", "error");
    }
    setSaving(false);
  }

  async function handleDelete(u: UserItem) {
    if (u.id === user?.id) {
      showToast("Você não pode excluir a sua própria conta.", "error");
      return;
    }

    if (!confirm(`Tem certeza que deseja excluir o usuário "${u.name}"?`)) {
      return;
    }

    try {
      const res = await apiFetch(`/users/${u.id}`, { method: "DELETE" });
      const data = await res.json() as { error?: string };
      if (res.ok) {
        showToast("Usuário removido!", "success");
        loadData();
      } else {
        showToast(data.error || "Erro ao excluir usuário.", "error");
      }
    } catch {
      showToast("Erro de conexão.", "error");
    }
  }

  function toggleAutomation(id: string) {
    setFormAutomations(prev => 
      prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]
    );
  }

  function toggleProduct(id: string) {
    setFormProducts(prev => 
      prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]
    );
  }

  // ==================== RENDERING FOR REGULAR USER ====================
  if (user && user.role !== "admin") {
    return (
      <AppLayout title="Minha Conta">
        <div style={{ display: "flex", flexDirection: "column", gap: "24px", alignItems: "center" }}>
          <div style={{ width: "100%", maxWidth: "600px" }}>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "14px", marginTop: "4px", marginBottom: "20px", textAlign: "center" }}>
              Gerencie seus dados de acesso ao sistema
            </p>

            {/* Profile Edit Form */}
            <div className="glass-card" style={{ padding: "32px", borderRadius: "16px", background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(255, 255, 255, 0.08)", boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)" }}>
              <h3 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "24px", color: "#2dd4bf" }}>
                Informações de Perfil
              </h3>
              
              <form onSubmit={handleProfileSave} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Nome Completo</label>
                  <input 
                    className="input-field" 
                    value={formName} 
                    onChange={(e) => setFormName(e.target.value)} 
                    required 
                    placeholder="Nome de exibição"
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>E-mail (Login)</label>
                  <input 
                    className="input-field" 
                    type="email"
                    value={formEmail} 
                    onChange={(e) => setFormEmail(e.target.value)} 
                    required 
                    placeholder="seuemail@empresa.com"
                  />
                </div>

                <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.06)", margin: "8px 0" }} />

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>
                    Senha Atual <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>(Necessária se for alterar a senha)</span>
                  </label>
                  <input 
                    className="input-field" 
                    type="password"
                    value={currentPassword} 
                    onChange={(e) => setCurrentPassword(e.target.value)} 
                    placeholder="Sua senha atual"
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Nova Senha</label>
                    <input 
                      className="input-field" 
                      type="password"
                      value={newPassword} 
                      onChange={(e) => setNewPassword(e.target.value)} 
                      placeholder="Mínimo 6 caracteres"
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Confirmar Senha</label>
                    <input 
                      className="input-field" 
                      type="password"
                      value={confirmNewPassword} 
                      onChange={(e) => setConfirmNewPassword(e.target.value)} 
                      placeholder="Repita a nova senha"
                    />
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
                  <button type="submit" className="btn-primary" disabled={saving} style={{ padding: "12px 24px" }}>
                    {saving ? <><div className="spinner" style={{ marginRight: "6px" }} /> Salvando...</> : "Salvar Alterações"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Toast Alert */}
        {toast.msg && (
          <div className={`toast ${toast.type === "success" ? "toast-success" : "toast-error"}`}>
            {toast.msg}
          </div>
        )}
      </AppLayout>
    );
  }

  // ==================== RENDERING FOR ADMIN USER ====================
  return (
    <AppLayout title="Usuários & Permissões">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "14px", marginTop: "4px" }}>
            Gerencie os usuários do sistema e defina suas permissões de acesso
          </p>
        </div>
        <button className="btn-primary" onClick={openCreateModal}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: "6px" }}>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Novo Usuário
        </button>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "80px" }}>
          <div className="spinner" style={{ width: "40px", height: "40px" }} />
        </div>
      ) : usersList.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">👥</div>
          <div className="empty-state-title">Nenhum usuário cadastrado</div>
          <div className="empty-state-text">Clique em "Novo Usuário" para cadastrar</div>
        </div>
      ) : (
        <div className="glass-card" style={{ borderRadius: "14px", overflow: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Cargo / Perfil</th>
                <th>Seções Habilitadas</th>
                <th style={{ textAlign: "right" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {usersList.map((u) => {
                const isCurrentUser = u.id === user?.id;
                return (
                  <tr key={u.id}>
                    <td style={{ fontWeight: "700" }}>
                      {u.name} {isCurrentUser && <span className="badge badge-success" style={{ fontSize: "10px", marginLeft: "6px" }}>Você</span>}
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <span className={`badge ${u.role === "admin" ? "badge-success" : "badge-info"}`}>
                        {u.role === "admin" ? "⚙️ Administrador" : "💼 Operador / Trabalho"}
                      </span>
                    </td>
                    <td>
                      {u.role === "admin" ? (
                        <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Acesso Total</span>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", maxWidth: "400px" }}>
                          {u.allowed_sections ? u.allowed_sections.split(",").map((s) => {
                            const found = SECTIONS.find(item => item.key === s);
                            return (
                              <span key={s} className="badge badge-info" style={{ fontSize: "10px", padding: "2px 6px", opacity: 0.8 }}>
                                {found?.label || s}
                              </span>
                            );
                          }) : <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>Nenhuma</span>}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                        <button onClick={() => openEditModal(u)} className="btn-secondary" style={{ fontSize: "12px", padding: "6px 12px" }}>
                          Permissões & Editar
                        </button>
                        <button 
                          onClick={() => handleDelete(u)} 
                          className="btn-danger" 
                          style={{ fontSize: "12px", padding: "6px 12px" }}
                          disabled={isCurrentUser}
                        >
                          Remover
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal - Cadastro e Permissões de Usuários */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div 
            className="modal-content" 
            onClick={(e) => e.stopPropagation()} 
            style={{ 
              maxWidth: "680px", 
              width: "95%", 
              maxHeight: "85vh", 
              overflowY: "auto", 
              borderRadius: "16px",
              padding: "32px",
              background: "rgba(15, 23, 42, 0.95)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)"
            }}
          >
            <h2 style={{ fontSize: "22px", fontWeight: "800", marginBottom: "20px", letterSpacing: "-0.02em" }}>
              {editingId ? "Editar Permissões do Usuário" : "Novo Usuário & Permissões"}
            </h2>
            
            <form onSubmit={handleSave}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Nome Completo</label>
                  <input 
                    className="input-field" 
                    value={formName} 
                    onChange={(e) => setFormName(e.target.value)} 
                    required 
                    placeholder="Ex: João da Silva"
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>E-mail (Login)</label>
                  <input 
                    className="input-field" 
                    type="email"
                    value={formEmail} 
                    onChange={(e) => setFormEmail(e.target.value)} 
                    required 
                    placeholder="joao@empresa.com"
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>
                    Senha {editingId && <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>(Preencha apenas para alterar)</span>}
                  </label>
                  <input 
                    className="input-field" 
                    type="password"
                    value={formPassword} 
                    onChange={(e) => setFormPassword(e.target.value)} 
                    required={!editingId} 
                    placeholder={editingId ? "Manter senha atual" : "Senha forte de acesso"}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Perfil de Conta</label>
                  <select
                    className="input-field"
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    style={{ height: "40px" }}
                  >
                    <option value="normal">Normal (Operador / Trabalho)</option>
                    <option value="admin">Administrador (Acesso Total)</option>
                  </select>
                </div>
              </div>

              {formRole === "normal" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                  <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.06)", margin: "0" }} />
                  
                  {/* Seções Habilitadas */}
                  <div>
                    <h4 style={{ fontSize: "14px", fontWeight: "700", marginBottom: "12px", color: "var(--color-brand-400)" }}>
                      Seções do Sistema Habilitadas
                    </h4>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      {SECTIONS.map((sec) => (
                        <label 
                          key={sec.key} 
                          style={{ 
                            display: "flex", 
                            alignItems: "center", 
                            gap: "10px", 
                            padding: "8px 12px", 
                            background: "rgba(255,255,255,0.02)", 
                            border: "1px solid rgba(255,255,255,0.05)", 
                            borderRadius: "8px", 
                            cursor: "pointer",
                            fontSize: "13px"
                          }}
                        >
                          <input 
                            type="checkbox" 
                            checked={formSections.includes(sec.key)} 
                            onChange={() => toggleSection(sec.key)} 
                          />
                          {sec.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.06)", margin: "0" }} />

                  {/* Escopo de Automações */}
                  <div>
                    <h4 style={{ fontSize: "14px", fontWeight: "700", marginBottom: "8px", color: "var(--color-brand-400)" }}>
                      Automações Autorizadas
                    </h4>
                    <div style={{ display: "flex", gap: "16px", marginBottom: "12px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }}>
                        <input 
                          type="radio" 
                          name="autoScope" 
                          checked={automationsScope === "all"} 
                          onChange={() => setAutomationsScope("all")}
                        />
                        Todas as Automações
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }}>
                        <input 
                          type="radio" 
                          name="autoScope" 
                          checked={automationsScope === "custom"} 
                          onChange={() => setAutomationsScope("custom")}
                        />
                        Automações Selecionadas
                      </label>
                    </div>

                    {automationsScope === "custom" && (
                      <div 
                        style={{ 
                          display: "grid", 
                          gridTemplateColumns: "1fr 1fr", 
                          gap: "8px", 
                          maxHeight: "150px", 
                          overflowY: "auto", 
                          background: "rgba(0,0,0,0.2)", 
                          padding: "12px", 
                          borderRadius: "8px",
                          border: "1px solid rgba(255,255,255,0.04)"
                        }}
                      >
                        {automations.length === 0 ? (
                          <div style={{ fontSize: "12px", color: "var(--color-text-muted)", gridColumn: "1/-1" }}>Nenhuma automação cadastrada no sistema.</div>
                        ) : (
                          automations.map(auto => (
                            <label key={auto.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", cursor: "pointer" }}>
                              <input 
                                type="checkbox" 
                                checked={formAutomations.includes(auto.id)} 
                                onChange={() => toggleAutomation(auto.id)}
                              />
                              {auto.name} <span style={{ color: "var(--color-text-muted)", fontSize: "10px" }}>/{auto.slug}</span>
                            </label>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.06)", margin: "0" }} />

                  {/* Escopo de Produtos */}
                  <div>
                    <h4 style={{ fontSize: "14px", fontWeight: "700", marginBottom: "8px", color: "var(--color-brand-400)" }}>
                      Produtos Autorizados
                    </h4>
                    <div style={{ display: "flex", gap: "16px", marginBottom: "12px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }}>
                        <input 
                          type="radio" 
                          name="prodScope" 
                          checked={productsScope === "all"} 
                          onChange={() => setProductsScope("all")}
                        />
                        Todos os Produtos
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }}>
                        <input 
                          type="radio" 
                          name="prodScope" 
                          checked={productsScope === "custom"} 
                          onChange={() => setProductsScope("custom")}
                        />
                        Produtos Selecionados
                      </label>
                    </div>

                    {productsScope === "custom" && (
                      <div 
                        style={{ 
                          display: "grid", 
                          gridTemplateColumns: "1fr 1fr", 
                          gap: "8px", 
                          maxHeight: "150px", 
                          overflowY: "auto", 
                          background: "rgba(0,0,0,0.2)", 
                          padding: "12px", 
                          borderRadius: "8px",
                          border: "1px solid rgba(255,255,255,0.04)"
                        }}
                      >
                        {products.length === 0 ? (
                          <div style={{ fontSize: "12px", color: "var(--color-text-muted)", gridColumn: "1/-1" }}>Nenhum produto cadastrado no sistema.</div>
                        ) : (
                          products.map(prod => (
                            <label key={prod.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", cursor: "pointer" }}>
                              <input 
                                type="checkbox" 
                                checked={formProducts.includes(prod.id)} 
                                onChange={() => toggleProduct(prod.id)}
                              />
                              {prod.name}
                            </label>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "32px" }}>
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? <><div className="spinner" style={{ marginRight: "6px" }} /> Salvando...</> : "Salvar Configurações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Alert */}
      {toast.msg && (
        <div className={`toast ${toast.type === "success" ? "toast-success" : "toast-error"}`}>
          {toast.msg}
        </div>
      )}
    </AppLayout>
  );
}
