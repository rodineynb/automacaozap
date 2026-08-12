import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
  useNavigate,
} from "react-router";
import { AuthProvider, useAuth } from "./contexts/auth-context";
import { useEffect } from "react";
import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Zapfy — Plataforma de automação de atendimento via WhatsApp com IA" />
        <title>Zapfy — Automação WhatsApp</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
        <Meta />
        <Links />
      </head>
      <body className="gradient-bg">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading) {
      const isLoginPage = location.pathname === "/";
      if (!user && !isLoginPage) {
        navigate("/");
      } else if (user && isLoginPage) {
        navigate("/dashboard");
      }
    }
  }, [user, isLoading, location.pathname, navigate]);

  if (isLoading) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "rgba(10, 14, 23, 1)",
        flexDirection: "column",
        gap: "20px"
      }}>
        {/* Spinner grande de carregamento */}
        <div style={{
          width: "48px",
          height: "48px",
          border: "3px solid rgba(12, 147, 242, 0.1)",
          borderTopColor: "var(--color-brand-400)",
          borderRadius: "50%",
          animation: "spin 1s linear infinite"
        }} />
        <div style={{
          color: "var(--color-text-secondary)",
          fontSize: "14px",
          fontWeight: "600",
          letterSpacing: "0.02em"
        }}>
          Carregando plataforma...
        </div>
      </div>
    );
  }

  const isLoginPage = location.pathname === "/";
  if (!user && !isLoginPage) return null;
  if (user && isLoginPage) return null;

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGuard>
        <Outlet />
      </AuthGuard>
    </AuthProvider>
  );
}

