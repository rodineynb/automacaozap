import { Hono } from "hono";
import type { Env } from "../app";
import { hashPassword } from "../middleware/auth";

export const usersRoutes = new Hono<{ Bindings: Env; Variables: { userId: string; userEmail: string } }>();

// Helper para verificar se o usuário é administrador
async function checkAdmin(c: any): Promise<boolean> {
  const db = c.env.DB;
  const userId = c.get("userId");
  
  if (!userId) return false;
  
  const user = (await db.prepare("SELECT role FROM users WHERE id = ?").bind(userId).first()) as { role: string } | null;
  return user ? user.role === "admin" : false;
}

// GET /api/users — Listar todos os usuários (Apenas Admin)
usersRoutes.get("/", async (c) => {
  if (!(await checkAdmin(c))) {
    return c.json({ error: "Acesso negado. Apenas administradores podem gerenciar usuários." }, 403);
  }
  
  const db = c.env.DB;
  try {
    const list = await db.prepare("SELECT id, name, email, role, allowed_sections, allowed_automations, allowed_products, created_at FROM users ORDER BY created_at DESC").all();
    return c.json({ data: list.results });
  } catch (err: any) {
    return c.json({ error: `Erro ao buscar usuários: ${err.message || err}` }, 500);
  }
});

// POST /api/users — Cadastrar novo usuário (Apenas Admin)
usersRoutes.post("/", async (c) => {
  if (!(await checkAdmin(c))) {
    return c.json({ error: "Acesso negado." }, 403);
  }
  
  const db = c.env.DB;
  const { name, email, password, role, allowed_sections, allowed_automations, allowed_products } = await c.req.json<{
    name: string;
    email: string;
    password: string;
    role: string;
    allowed_sections: string;
    allowed_automations: string;
    allowed_products: string;
  }>();

  if (!name || !email || !password || !role) {
    return c.json({ error: "Nome, email, senha e cargo são obrigatórios." }, 400);
  }

  try {
    // Verificar se e-mail já existe
    const existing = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (existing) {
      return c.json({ error: "Já existe um usuário cadastrado com este e-mail." }, 400);
    }

    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(password);

    await db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, allowed_sections, allowed_automations, allowed_products)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      name,
      email,
      passwordHash,
      role,
      allowed_sections || "dashboard",
      allowed_automations || "all",
      allowed_products || "all"
    ).run();

    const created = await db.prepare("SELECT id, name, email, role, allowed_sections, allowed_automations, allowed_products, created_at FROM users WHERE id = ?").bind(id).first();
    return c.json({ data: created, message: "Usuário cadastrado com sucesso!" }, 201);
  } catch (err: any) {
    return c.json({ error: `Erro ao criar usuário: ${err.message || err}` }, 500);
  }
});

// PUT /api/users/:id — Atualizar usuário (Apenas Admin)
usersRoutes.put("/:id", async (c) => {
  if (!(await checkAdmin(c))) {
    return c.json({ error: "Acesso negado." }, 403);
  }
  
  const db = c.env.DB;
  const id = c.req.param("id");
  const { name, email, password, role, allowed_sections, allowed_automations, allowed_products } = await c.req.json<{
    name?: string;
    email?: string;
    password?: string;
    role?: string;
    allowed_sections?: string;
    allowed_automations?: string;
    allowed_products?: string;
  }>();

  try {
    const existingUser = await db.prepare("SELECT id FROM users WHERE id = ?").bind(id).first();
    if (!existingUser) {
      return c.json({ error: "Usuário não encontrado." }, 404);
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) { updates.push("name = ?"); values.push(name); }
    if (email !== undefined) {
      // Verificar se e-mail já existe em outro usuário
      const dup = await db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").bind(email, id).first();
      if (dup) {
        return c.json({ error: "Outro usuário já está usando este e-mail." }, 400);
      }
      updates.push("email = ?"); values.push(email);
    }
    if (password) {
      const passwordHash = await hashPassword(password);
      updates.push("password_hash = ?"); values.push(passwordHash);
    }
    if (role !== undefined) { updates.push("role = ?"); values.push(role); }
    if (allowed_sections !== undefined) { updates.push("allowed_sections = ?"); values.push(allowed_sections); }
    if (allowed_automations !== undefined) { updates.push("allowed_automations = ?"); values.push(allowed_automations); }
    if (allowed_products !== undefined) { updates.push("allowed_products = ?"); values.push(allowed_products); }

    if (updates.length === 0) {
      return c.json({ error: "Nenhum campo para atualizar." }, 400);
    }

    values.push(id);
    await db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run();

    const updated = await db.prepare("SELECT id, name, email, role, allowed_sections, allowed_automations, allowed_products, created_at FROM users WHERE id = ?").bind(id).first();
    return c.json({ data: updated, message: "Usuário atualizado com sucesso!" });
  } catch (err: any) {
    return c.json({ error: `Erro ao atualizar usuário: ${err.message || err}` }, 500);
  }
});

// DELETE /api/users/:id — Remover usuário (Apenas Admin)
usersRoutes.delete("/:id", async (c) => {
  if (!(await checkAdmin(c))) {
    return c.json({ error: "Acesso negado." }, 403);
  }
  
  const db = c.env.DB;
  const id = c.req.param("id");
  const loggedInUserId = c.get("userId");

  if (id === loggedInUserId) {
    return c.json({ error: "Você não pode excluir a sua própria conta." }, 400);
  }

  try {
    const existing = await db.prepare("SELECT id FROM users WHERE id = ?").bind(id).first();
    if (!existing) {
      return c.json({ error: "Usuário não encontrado." }, 404);
    }

    await db.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
    return c.json({ message: "Usuário removido com sucesso!" });
  } catch (err: any) {
    return c.json({ error: `Erro ao remover usuário: ${err.message || err}` }, 500);
  }
});
