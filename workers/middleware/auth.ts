import type { Context, Next } from "hono";
import type { Env } from "../app";

// Funções simples de JWT sem dependências externas (compatível com Workers)
async function createJWT(payload: Record<string, unknown>, secret: string, expiresIn: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  
  // Calcular expiração
  const now = Math.floor(Date.now() / 1000);
  const duration = parseDuration(expiresIn);
  const exp = now + duration;
  
  const fullPayload = { ...payload, iat: now, exp };
  
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const encodedPayload = btoa(JSON.stringify(fullPayload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  
  const data = `${encodedHeader}.${encodedPayload}`;
  
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  
  return `${data}.${encodedSignature}`;
}

async function verifyJWT(token: string, secret: string): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    
    const [header, payload, signature] = parts;
    const data = `${header}.${payload}`;
    
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    
    // Decodificar a assinatura
    const sigString = signature.replace(/-/g, "+").replace(/_/g, "/");
    const sigPadded = sigString + "=".repeat((4 - sigString.length % 4) % 4);
    const sigBytes = Uint8Array.from(atob(sigPadded), c => c.charCodeAt(0));
    
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(data));
    if (!valid) return null;
    
    // Decodificar payload
    const payloadString = payload.replace(/-/g, "+").replace(/_/g, "/");
    const payloadPadded = payloadString + "=".repeat((4 - payloadString.length % 4) % 4);
    const decoded = JSON.parse(atob(payloadPadded));
    
    // Verificar expiração
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    
    return decoded;
  } catch {
    return null;
  }
}

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 7 * 24 * 3600; // default 7 days
  const value = parseInt(match[1]);
  switch (match[2]) {
    case "s": return value;
    case "m": return value * 60;
    case "h": return value * 3600;
    case "d": return value * 86400;
    default: return 7 * 86400;
  }
}

// Hash de senha usando SHA-256 (compatível com Workers)
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("");
  
  const data = new TextEncoder().encode(saltHex + password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  
  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  const data = new TextEncoder().encode(salt + password);
  const computed = await crypto.subtle.digest("SHA-256", data);
  const computedHex = Array.from(new Uint8Array(computed)).map(b => b.toString(16).padStart(2, "0")).join("");
  return computedHex === hash;
}

export { createJWT, verifyJWT };

// Middleware de autenticação
export async function authMiddleware(c: Context<{ Bindings: Env; Variables: { userId: string; userEmail: string } }>, next: Next) {
  const path = new URL(c.req.url).pathname;
  
  // Rotas públicas que não precisam de autenticação
  const publicPaths = ["/api/auth/login", "/api/auth/setup"];
  if (publicPaths.some(p => path.startsWith(p))) {
    return next();
  }
  
  // Webhooks não precisam de autenticação
  if (path.startsWith("/api/webhook")) {
    return next();
  }
  
  let token = "";
  const authHeader = c.req.header("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.replace("Bearer ", "");
  } else {
    // Permitir token via query param (especialmente para conexões WebSocket)
    const queryToken = c.req.query("token");
    if (queryToken) {
      token = queryToken;
    }
  }

  if (!token) {
    return c.json({ error: "Token não fornecido" }, 401);
  }
  const jwtSecret = c.env.JWT_SECRET || "default-secret-change-me";
  
  const payload = await verifyJWT(token, jwtSecret);
  if (!payload) {
    return c.json({ error: "Token inválido ou expirado" }, 401);
  }
  
  // Adicionar dados do usuário ao contexto
  c.set("userId", String(payload.sub || ""));
  c.set("userEmail", String(payload.email || ""));
  
  return next();
}
