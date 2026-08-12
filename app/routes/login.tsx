import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../contexts/auth-context";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [setupMessage, setSetupMessage] = useState("");
  const { login, user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && user) {
      navigate("/dashboard");
    }
  }, [user, authLoading, navigate]);

  async function handleSetup() {
    try {
      const res = await fetch("/api/auth/setup", { method: "POST" });
      const data = await res.json() as { message?: string; credentials?: { email: string; password: string }; error?: string };
      if (res.ok && data.credentials) {
        setSetupMessage(`Admin criado! Email: ${data.credentials.email} | Senha: ${data.credentials.password}`);
        setEmail(data.credentials.email);
        setPassword(data.credentials.password);
      } else {
        setSetupMessage(data.error || "Erro ao configurar");
      }
    } catch {
      setSetupMessage("Erro de conexão");
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao fazer login");
    } finally {
      setIsLoading(false);
    }
  }

  if (authLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div className="spinner" style={{ width: "40px", height: "40px" }} />
      </div>
    );
  }

  return (
    <div className="gradient-bg" style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      overflow: "hidden"
    }}>
      {/* Background decorative elements */}
      <div style={{
        position: "absolute",
        top: "-200px",
        right: "-200px",
        width: "600px",
        height: "600px",
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(12,147,242,0.08) 0%, transparent 70%)",
        pointerEvents: "none"
      }} />
      <div style={{
        position: "absolute",
        bottom: "-150px",
        left: "-150px",
        width: "400px",
        height: "400px",
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(12,147,242,0.05) 0%, transparent 70%)",
        pointerEvents: "none"
      }} />

      {/* Login Card */}
      <div className="fade-in" style={{
        background: "rgba(15, 20, 32, 0.8)",
        backdropFilter: "blur(24px)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "24px",
        padding: "48px",
        width: "100%",
        maxWidth: "420px",
        position: "relative",
        boxShadow: "0 32px 64px rgba(0,0,0,0.4)"
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <img src="/logo.png" style={{ height: "100px", width: "auto", objectFit: "contain", marginBottom: "20px" }} alt="Zapfy Logo" />
          <p style={{ fontSize: "14px", color: "var(--color-text-muted)" }}>
            Plataforma de atendimento inteligente
          </p>
        </div>

        {/* Setup message */}
        {setupMessage && (
          <div style={{
            background: "rgba(34,197,94,0.1)",
            border: "1px solid rgba(34,197,94,0.3)",
            borderRadius: "12px",
            padding: "14px 16px",
            marginBottom: "24px",
            fontSize: "13px",
            color: "var(--color-success)",
            lineHeight: "1.5"
          }}>
            {setupMessage}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: "12px",
            padding: "14px 16px",
            marginBottom: "24px",
            fontSize: "13px",
            color: "var(--color-danger)"
          }}>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "8px" }}>
              Email
            </label>
            <input
              type="email"
              className="input-field"
              placeholder="admin@automacaozap.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              id="login-email"
            />
          </div>

          <div style={{ marginBottom: "32px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "8px" }}>
              Senha
            </label>
            <input
              type="password"
              className="input-field"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              id="login-password"
            />
          </div>

          <button
            type="submit"
            className="btn-primary glow-pulse"
            disabled={isLoading}
            id="login-submit"
            style={{ width: "100%", justifyContent: "center", padding: "14px", fontSize: "15px", borderRadius: "12px" }}
          >
            {isLoading ? (
              <>
                <div className="spinner" />
                Entrando...
              </>
            ) : (
              "Entrar"
            )}
          </button>
        </form>

      </div>
    </div>
  );
}
