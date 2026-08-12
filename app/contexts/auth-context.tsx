import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  role?: string;
  allowed_sections?: string;
  allowed_automations?: string;
  allowed_products?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (user: User) => void;
  hasSectionAccess: (sectionKey: string) => boolean;
  isAutomationAllowed: (id: string) => boolean;
  isProductAllowed: (id: string) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const API_BASE = "/api";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Verificar token salvo
    const savedToken = localStorage.getItem("auth_token");
    if (savedToken) {
      setToken(savedToken);
      fetchUser(savedToken);
    } else {
      setIsLoading(false);
    }
  }, []);

  async function fetchUser(authToken: string) {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json() as { user: User };
        setUser(data.user);
      } else {
        localStorage.removeItem("auth_token");
        setToken(null);
      }
    } catch {
      localStorage.removeItem("auth_token");
      setToken(null);
    }
    setIsLoading(false);
  }

  async function login(email: string, password: string) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json() as { token?: string; user?: User; error?: string };
    
    if (!res.ok) {
      throw new Error(data.error || "Erro ao fazer login");
    }

    if (data.token && data.user) {
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem("auth_token", data.token);
    }
  }

  function logout() {
    setUser(null);
    setToken(null);
    localStorage.removeItem("auth_token");
  }

  function updateUser(updatedUser: User) {
    setUser(updatedUser);
  }

  function hasSectionAccess(sectionKey: string): boolean {
    if (!user) return false;
    if (user.role === "admin") return true;
    if (!user.allowed_sections) return false;
    return user.allowed_sections.split(",").map(s => s.trim()).includes(sectionKey);
  }

  function isAutomationAllowed(id: string): boolean {
    if (!user) return false;
    if (user.role === "admin") return true;
    if (!user.allowed_automations || user.allowed_automations === "all") return true;
    return user.allowed_automations.split(",").map(s => s.trim()).includes(id);
  }

  function isProductAllowed(id: string): boolean {
    if (!user) return false;
    if (user.role === "admin") return true;
    if (!user.allowed_products || user.allowed_products === "all") return true;
    return user.allowed_products.split(",").map(s => s.trim()).includes(id);
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, updateUser, hasSectionAccess, isAutomationAllowed, isProductAllowed }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// Hook para fazer requisições autenticadas
export function useApi() {
  const { token, logout } = useAuth();

  async function apiFetch(path: string, options: RequestInit = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    if (res.status === 401) {
      logout();
      throw new Error("Sessão expirada");
    }

    return res;
  }

  return { apiFetch };
}
