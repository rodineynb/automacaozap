import { Hono } from "hono";
import type { Env } from "../app";
import { createJWT, hashPassword, verifyPassword } from "../middleware/auth";

export const authRoutes = new Hono<{ Bindings: Env; Variables: { userId: string; userEmail: string } }>();

// POST /api/auth/setup — Cria o admin padrão (primeiro acesso)
authRoutes.post("/setup", async (c) => {
  const db = c.env.DB;
  
  // Verificar se já existe algum usuário
  const existing = await db.prepare("SELECT COUNT(*) as count FROM users").first<{ count: number }>();
  if (existing && existing.count > 0) {
    return c.json({ error: "Sistema já foi configurado" }, 400);
  }
  
  // Criar admin padrão
  const id = crypto.randomUUID();
  const email = "admin@automacaozap.com";
  const password = "AutoZap@2026!";
  const passwordHash = await hashPassword(password);
  
  await db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role, allowed_sections, allowed_automations, allowed_products) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    id, 
    "Administrador", 
    email, 
    passwordHash, 
    "admin", 
    "dashboard,products,automations,funnel-messages,followup,crm,chat,reports,settings,users", 
    "all", 
    "all"
  ).run();
  
  return c.json({
    message: "Admin criado com sucesso",
    credentials: { email, password }
  });
});

// POST /api/auth/login
authRoutes.post("/login", async (c) => {
  const db = c.env.DB;
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  
  if (!email || !password) {
    return c.json({ error: "Email e senha são obrigatórios" }, 400);
  }
  
  // Buscar usuário
  const user = await db.prepare(
    "SELECT id, name, email, password_hash, role, allowed_sections, allowed_automations, allowed_products FROM users WHERE email = ?"
  ).bind(email).first<{
    id: string;
    name: string;
    email: string;
    password_hash: string;
    role: string;
    allowed_sections: string;
    allowed_automations: string;
    allowed_products: string;
  }>();
  
  if (!user) {
    return c.json({ error: "Credenciais inválidas" }, 401);
  }
  
  // Verificar senha
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return c.json({ error: "Credenciais inválidas" }, 401);
  }
  
  // Gerar JWT
  const jwtSecret = c.env.JWT_SECRET || "default-secret-change-me";
  const expiresIn = c.env.JWT_EXPIRES_IN || "7d";
  
  const token = await createJWT(
    { sub: user.id, email: user.email, name: user.name },
    jwtSecret,
    expiresIn
  );
  
  return c.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      allowed_sections: user.allowed_sections,
      allowed_automations: user.allowed_automations,
      allowed_products: user.allowed_products
    }
  });
});

// GET /api/auth/me — Dados do usuário logado
authRoutes.get("/me", async (c) => {
  const db = c.env.DB;
  const userId = c.get("userId");
  
  const user = await db.prepare(
    "SELECT id, name, email, role, allowed_sections, allowed_automations, allowed_products, created_at FROM users WHERE id = ?"
  ).bind(userId).first();
  
  if (!user) {
    return c.json({ error: "Usuário não encontrado" }, 404);
  }
  
  return c.json({ user });
});

// PUT /api/auth/profile — Atualizar perfil
authRoutes.put("/profile", async (c) => {
  const db = c.env.DB;
  const userId = c.get("userId");
  const { name, email, currentPassword, newPassword } = await c.req.json<{
    name?: string;
    email?: string;
    currentPassword?: string;
    newPassword?: string;
  }>();
  
  // Se está alterando senha, verificar a senha atual
  if (newPassword) {
    if (!currentPassword) {
      return c.json({ error: "Senha atual é obrigatória para alterar a senha" }, 400);
    }
    
    const user = await db.prepare(
      "SELECT password_hash FROM users WHERE id = ?"
    ).bind(userId).first<{ password_hash: string }>();
    
    if (!user || !(await verifyPassword(currentPassword, user.password_hash))) {
      return c.json({ error: "Senha atual incorreta" }, 401);
    }
    
    const newHash = await hashPassword(newPassword);
    await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(newHash, userId).run();
  }
  
  // Atualizar nome e/ou email
  if (name || email) {
    const updates: string[] = [];
    const values: string[] = [];
    
    if (name) { updates.push("name = ?"); values.push(name); }
    if (email) { updates.push("email = ?"); values.push(email); }
    
    values.push(userId);
    await db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run();
  }
  
  // Retornar dados atualizados
  const updated = await db.prepare(
    "SELECT id, name, email, created_at FROM users WHERE id = ?"
  ).bind(userId).first();
  
  return c.json({ user: updated, message: "Perfil atualizado com sucesso" });
});
