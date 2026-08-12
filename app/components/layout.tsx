import { useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router";
import { useAuth } from "../contexts/auth-context";
import type { ReactNode } from "react";

interface AppLayoutProps {
  children: ReactNode;
  title: string;
}

function WhatsAppStatusIndicator({ statuses, isCollapsed, isMobile }: {
  statuses: Array<{ id: string; name: string; connected: boolean; details: string }>;
  isCollapsed: boolean;
  isMobile: boolean;
}) {
  const navigate = useNavigate();
  if (statuses.length === 0) return null;

  const allConnected = statuses.every(s => s.connected);
  const someDisconnected = statuses.some(s => !s.connected);

  return (
    <div
      onClick={() => navigate('/settings')}
      style={{
        padding: isCollapsed ? "10px 6px" : "10px 12px",
        borderTop: "1px solid rgba(255, 255, 255, 0.06)",
        cursor: "pointer",
        transition: "all 0.3s ease",
      }}
      title="Status das APIs WhatsApp — Clique para configurações"
    >
      {statuses.map(api => (
        <div
          key={api.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: isCollapsed ? "0" : "8px",
            justifyContent: isCollapsed ? "center" : "flex-start",
            padding: "6px 8px",
            borderRadius: "8px",
            background: api.connected
              ? "rgba(34, 197, 94, 0.08)"
              : "rgba(239, 68, 68, 0.08)",
            marginBottom: "4px",
            transition: "background 0.2s ease",
          }}
        >
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: api.connected ? "#22c55e" : "#ef4444",
              boxShadow: api.connected
                ? "0 0 6px rgba(34, 197, 94, 0.5)"
                : "0 0 6px rgba(239, 68, 68, 0.5)",
              flexShrink: 0,
              animation: !api.connected ? "pulse 2s infinite" : "none",
            }}
          />
          {(isMobile || !isCollapsed) && (
            <div style={{ overflow: "hidden", animation: "fadeIn 0.2s ease" }}>
              <div style={{
                fontSize: "11px",
                fontWeight: "600",
                color: api.connected ? "#22c55e" : "#ef4444",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {api.name}
              </div>
              <div style={{
                fontSize: "9px",
                color: "var(--color-text-muted)",
                whiteSpace: "nowrap",
              }}>
                {api.connected ? "Conectado" : (typeof api.details === 'string' ? api.details : 'Desconectado') || "Desconectado"}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function AppLayout({ children, title }: AppLayoutProps) {
  const { user, logout, hasSectionAccess } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Estados de Colapso e Visualização Mobile
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [whatsappStatuses, setWhatsappStatuses] = useState<Array<{ id: string; name: string; connected: boolean; details: string }>>([]);

  // Efeito para carregar colapso salvo do localStorage
  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") {
      setIsCollapsed(true);
    }
  }, []);

  // Efeito para detector de largura de viewport
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 1024;
      setIsMobile(mobile);
      if (!mobile) {
        setIsMobileMenuOpen(false);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fechar o menu móvel automaticamente ao mudar de rota
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  const toggleSidebar = () => {
    const nextState = !isCollapsed;
    setIsCollapsed(nextState);
    localStorage.setItem("sidebar-collapsed", String(nextState));
  };

  // Polling de status WhatsApp a cada 60 segundos
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        if (!token) return;
        const res = await fetch('/api/settings/whatsapp-status', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json() as any;
          setWhatsappStatuses(json.data || []);
        }
      } catch {}
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--color-surface-900)", overflowX: "auto", maxWidth: "100vw", width: "100%" }}>
      
      {/* 📱 HEADER SUPERIOR MÓVEL (Visibilidade e exibição controladas via CSS) */}
      <header
        className="mobile-header"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: "72px",
          background: "rgba(15, 20, 32, 0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
          display: "none", // Ativado via CSS no mobile
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          zIndex: 90,
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <img src="/logo.png" style={{ height: "56px", width: "auto", objectFit: "contain" }} alt="Zapfy Logo" />
        </div>

        <button
          onClick={() => setIsMobileMenuOpen(true)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--color-text-primary)",
            padding: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
          title="Abrir Menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </header>

      {/* 📱 OVERLAY ESCURO COM BLUR (Ativado quando o Drawer está aberto no mobile) */}
      <div
        className="mobile-overlay"
        onClick={() => setIsMobileMenuOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.65)",
          backdropFilter: "blur(4px)",
          zIndex: 98,
          animation: "fadeIn 0.2s ease",
          display: isMobileMenuOpen ? "block" : "none"
        }}
      />

      {/* 🧭 SIDEBAR / DRAWER GAVETA DESLIZANTE */}
      <aside
        className={`sidebar ${isCollapsed ? "collapsed" : ""} ${isMobileMenuOpen ? "mobile-open" : ""}`}
        style={{
          width: isCollapsed ? "80px" : "260px",
          position: "fixed",
          top: 0,
          bottom: 0,
          left: 0,
          background: "rgba(15, 20, 32, 0.95)",
          borderRight: "1px solid rgba(255, 255, 255, 0.06)",
          display: "flex",
          flexDirection: "column",
          overflowX: "hidden",
          overflowY: "auto"
        }}
      >
        <div
          className="sidebar-logo"
          style={{
            padding: isCollapsed ? "20px 10px" : "24px 20px",
            position: "relative",
            display: "flex",
            flexDirection: isCollapsed ? "column" : "row",
            justifyContent: isCollapsed ? "center" : "space-between",
            alignItems: "center",
            borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
            transition: "all 0.3s ease"
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            {isCollapsed ? (
              <div style={{ width: "48px", height: "48px", overflow: "hidden", display: "flex", alignItems: "center", flexShrink: 0 }} title="Zapfy">
                <img src="/logo.png" style={{ height: "48px", objectFit: "cover", objectPosition: "left" }} alt="Zapfy Icon" />
              </div>
            ) : (
              <img src="/logo.png" style={{ height: "64px", width: "auto", objectFit: "contain", animation: "fadeIn 0.2s ease" }} alt="Zapfy Logo" />
            )}
          </div>

          {/* Toggle Button flutuante integrado no topo da sidebar (oculto no mobile via CSS) */}
          <button
            className="desktop-toggle-btn"
            onClick={toggleSidebar}
            style={{
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              cursor: "pointer",
              color: "var(--color-text-secondary)",
              width: "26px",
              height: "26px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "11px",
              transition: "all 0.2s ease",
              marginLeft: isCollapsed ? "0" : "8px",
              marginTop: isCollapsed ? "12px" : "0",
              position: isCollapsed ? "absolute" : "static",
              bottom: isCollapsed ? "-13px" : "auto",
              left: isCollapsed ? "50%" : "auto",
              transform: isCollapsed ? "translateX(-50%)" : "none",
              zIndex: 50,
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--color-brand-400)";
              e.currentTarget.style.background = "rgba(12, 147, 242, 0.1)";
              e.currentTarget.style.borderColor = "rgba(12, 147, 242, 0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--color-text-secondary)";
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
            }}
            title={isCollapsed ? "Expandir menu" : "Recolher menu"}
          >
            {isCollapsed ? "▶" : "◀"}
          </button>

          {/* Botão fechar no topo do Drawer no mobile (exibido apenas via CSS) */}
          <button
            className="mobile-close-btn"
            onClick={() => setIsMobileMenuOpen(false)}
            style={{
              background: "rgba(255, 255, 255, 0.04)",
              border: "none",
              cursor: "pointer",
              color: "var(--color-text-secondary)",
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px"
            }}
            title="Fechar Menu"
          >
            ✕
          </button>
        </div>

        <nav className="sidebar-nav" style={{ padding: !isMobile && isCollapsed ? "16px 6px" : "16px 12px", transition: "padding 0.3s ease" }}>
          {hasSectionAccess("dashboard") && (
            <NavLink
              to="/dashboard"
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
              style={{
                justifyContent: !isMobile && isCollapsed ? "center" : "flex-start",
                padding: !isMobile && isCollapsed ? "12px" : "12px 16px",
                gap: !isMobile && isCollapsed ? "0" : "12px"
              }}
              title={!isMobile && isCollapsed ? "Dashboard" : undefined}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              {(isMobile || !isCollapsed) && <span style={{ animation: "fadeIn 0.2s ease" }}>Dashboard</span>}
            </NavLink>
          )}

          {hasSectionAccess("products") && (
            <NavLink
              to="/products"
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
              style={{
                justifyContent: !isMobile && isCollapsed ? "center" : "flex-start",
                padding: !isMobile && isCollapsed ? "12px" : "12px 16px",
                gap: !isMobile && isCollapsed ? "0" : "12px"
              }}
              title={!isMobile && isCollapsed ? "Produtos" : undefined}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
              {(isMobile || !isCollapsed) && <span style={{ animation: "fadeIn 0.2s ease" }}>Produtos</span>}
            </NavLink>
          )}

          {hasSectionAccess("automations") && (
            <NavLink
              to="/automations"
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
              style={{
                justifyContent: !isMobile && isCollapsed ? "center" : "flex-start",
                padding: !isMobile && isCollapsed ? "12px" : "12px 16px",
                gap: !isMobile && isCollapsed ? "0" : "12px"
              }}
              title={!isMobile && isCollapsed ? "Automações" : undefined}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
              </svg>
              {(isMobile || !isCollapsed) && <span style={{ animation: "fadeIn 0.2s ease" }}>Automações</span>}
            </NavLink>
          )}

          {hasSectionAccess("funnel-messages") && (
            <NavLink
              to="/funnel-messages"
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
              style={{
                justifyContent: !isMobile && isCollapsed ? "center" : "flex-start",
                padding: !isMobile && isCollapsed ? "12px" : "12px 16px",
                gap: !isMobile && isCollapsed ? "0" : "12px"
              }}
              title={!isMobile && isCollapsed ? "Mensagens do Funil" : undefined}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              {(isMobile || !isCollapsed) && <span style={{ animation: "fadeIn 0.2s ease" }}>Mensagens do Funil</span>}
            </NavLink>
          )}

          {hasSectionAccess("followup") && (
            <NavLink
              to="/followup"
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
              style={{
                justifyContent: !isMobile && isCollapsed ? "center" : "flex-start",
                padding: !isMobile && isCollapsed ? "12px" : "12px 16px",
                gap: !isMobile && isCollapsed ? "0" : "12px"
              }}
              title={!isMobile && isCollapsed ? "Follow-up" : undefined}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {(isMobile || !isCollapsed) && <span style={{ animation: "fadeIn 0.2s ease" }}>Follow-up</span>}
            </NavLink>
          )}

          {hasSectionAccess("crm") && (
            <NavLink
              to="/crm"
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
              style={{
                justifyContent: !isMobile && isCollapsed ? "center" : "flex-start",
                padding: !isMobile && isCollapsed ? "12px" : "12px 16px",
                gap: !isMobile && isCollapsed ? "0" : "12px"
              }}
              title={!isMobile && isCollapsed ? "CRM" : undefined}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="2" />
              </svg>
              {(isMobile || !isCollapsed) && <span style={{ animation: "fadeIn 0.2s ease" }}>CRM</span>}
            </NavLink>
          )}

          {hasSectionAccess("chat") && (
            <NavLink
              to="/chat"
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
              style={{
                justifyContent: !isMobile && isCollapsed ? "center" : "flex-start",
                padding: !isMobile && isCollapsed ? "12px" : "12px 16px",
                gap: !isMobile && isCollapsed ? "0" : "12px"
              }}
              title={!isMobile && isCollapsed ? "Chat" : undefined}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {(isMobile || !isCollapsed) && <span style={{ animation: "fadeIn 0.2s ease" }}>Chat</span>}
            </NavLink>
          )}

          {hasSectionAccess("reports") && (
            <NavLink
              to="/reports"
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
              style={{
                justifyContent: !isMobile && isCollapsed ? "center" : "flex-start",
                padding: !isMobile && isCollapsed ? "12px" : "12px 16px",
                gap: !isMobile && isCollapsed ? "0" : "12px"
              }}
              title={!isMobile && isCollapsed ? "Relatórios" : undefined}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              {(isMobile || !isCollapsed) && <span style={{ animation: "fadeIn 0.2s ease" }}>Relatórios</span>}
            </NavLink>
          )}

          {hasSectionAccess("settings") && (
            <NavLink
              to="/settings"
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
              style={{
                justifyContent: !isMobile && isCollapsed ? "center" : "flex-start",
                padding: !isMobile && isCollapsed ? "12px" : "12px 16px",
                gap: !isMobile && isCollapsed ? "0" : "12px"
              }}
              title={!isMobile && isCollapsed ? "Configurações" : undefined}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
              {(isMobile || !isCollapsed) && <span style={{ animation: "fadeIn 0.2s ease" }}>Configurações</span>}
            </NavLink>
          )}

          {user && (
            <NavLink
              to="/users"
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
              style={{
                justifyContent: !isMobile && isCollapsed ? "center" : "flex-start",
                padding: !isMobile && isCollapsed ? "12px" : "12px 16px",
                gap: !isMobile && isCollapsed ? "0" : "12px",
                marginTop: "4px"
              }}
              title={!isMobile && isCollapsed ? (user.role === "admin" ? "Usuários" : "Minha Conta") : undefined}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              {(isMobile || !isCollapsed) && <span style={{ animation: "fadeIn 0.2s ease" }}>{user.role === "admin" ? "Usuários" : "Minha Conta"}</span>}
            </NavLink>
          )}
        </nav>

        {/* WhatsApp API Status */}
        <WhatsAppStatusIndicator
          statuses={whatsappStatuses}
          isCollapsed={!isMobile && isCollapsed}
          isMobile={isMobile}
        />

        {/* User section */}
        <div style={{
          padding: !isMobile && isCollapsed ? "16px 6px" : "16px 12px",
          borderTop: "1px solid rgba(255, 255, 255, 0.06)",
          display: "flex",
          flexDirection: !isMobile && isCollapsed ? "column" : "row",
          alignItems: "center",
          gap: "12px",
          justifyContent: !isMobile && isCollapsed ? "center" : "flex-start",
          transition: "all 0.3s ease"
        }}>
          <div style={{
            width: "36px",
            height: "36px",
            borderRadius: "10px",
            background: "var(--color-surface-500)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "14px",
            fontWeight: "700",
            color: "var(--color-brand-400)",
            flexShrink: 0
          }} title={!isMobile && isCollapsed ? `${user?.name || "Admin"} (${user?.email || ""})` : undefined}>
            {user?.name?.charAt(0)?.toUpperCase() || "A"}
          </div>
          {(isMobile || !isCollapsed) && (
            <div style={{ flex: 1, overflow: "hidden", animation: "fadeIn 0.2s ease" }}>
              <div style={{ fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {user?.name || "Admin"}
              </div>
              <div style={{ fontSize: "11px", color: "var(--color-text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {user?.email || ""}
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--color-text-muted)",
              padding: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
            title="Sair"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main
        className={`main-content ${!isMobile && isCollapsed ? "collapsed" : ""}`}
        style={{
          marginLeft: isMobile ? "0" : isCollapsed ? "80px" : "260px",
          minHeight: "100vh",
          padding: isMobile ? "80px 16px 24px 16px" : "32px",
          transition: "margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1), padding 0.3s ease",
          background: "var(--color-surface-900)",
          flex: 1
        }}
      >
        {!isMobile && (
          <header style={{ marginBottom: "32px" }}>
            <h1 style={{ fontSize: "28px", fontWeight: "800", letterSpacing: "-0.03em" }}>
              {title}
            </h1>
          </header>
        )}
        <div className="fade-in">
          {(() => {
            // Validar rotas de administrador e permissões do usuário comum
            const path = location.pathname;
            let isRouteAllowed = true;
            
            if (user) {
              if (path.startsWith("/users")) {
                isRouteAllowed = true;
              } else if (path.startsWith("/dashboard") || path === "/") {
                isRouteAllowed = hasSectionAccess("dashboard");
              } else if (path.startsWith("/products")) {
                isRouteAllowed = hasSectionAccess("products");
              } else if (path.startsWith("/automations")) {
                isRouteAllowed = hasSectionAccess("automations");
              } else if (path.startsWith("/funnel-messages")) {
                isRouteAllowed = hasSectionAccess("funnel-messages");
              } else if (path.startsWith("/followup")) {
                isRouteAllowed = hasSectionAccess("followup");
              } else if (path.startsWith("/crm")) {
                isRouteAllowed = hasSectionAccess("crm");
              } else if (path.startsWith("/chat")) {
                isRouteAllowed = hasSectionAccess("chat");
              } else if (path.startsWith("/reports")) {
                isRouteAllowed = hasSectionAccess("reports");
              } else if (path.startsWith("/settings")) {
                isRouteAllowed = hasSectionAccess("settings");
              }
            }

            if (!isRouteAllowed) {
              return (
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "60vh",
                  textAlign: "center",
                  padding: "24px"
                }}>
                  <div style={{
                    width: "80px",
                    height: "80px",
                    borderRadius: "50%",
                    background: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid rgba(239, 68, 68, 0.25)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "36px",
                    marginBottom: "24px",
                    boxShadow: "0 0 20px rgba(239, 68, 68, 0.15)"
                  }}>
                    🔒
                  </div>
                  <h2 style={{ fontSize: "24px", fontWeight: "800", marginBottom: "12px", letterSpacing: "-0.02em" }}>
                    Acesso Restrito
                  </h2>
                  <p style={{ color: "var(--color-text-secondary)", fontSize: "15px", maxWidth: "420px", lineHeight: "1.6", marginBottom: "32px" }}>
                    Seu perfil de acesso não tem permissão para visualizar esta seção. Entre em contato com o administrador caso necessite de acesso.
                  </p>
                  <button
                    onClick={() => navigate("/dashboard")}
                    className="btn-primary"
                    style={{
                      padding: "12px 24px",
                      borderRadius: "10px",
                      fontWeight: "600"
                    }}
                  >
                    Voltar ao Dashboard
                  </button>
                </div>
              );
            }

            return children;
          })()}
        </div>
      </main>
    </div>
  );
}
