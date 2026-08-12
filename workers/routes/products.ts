import { Hono } from "hono";
import type { Env } from "../app";

export const productsRoutes = new Hono<{ Bindings: Env; Variables: { userId: string; userEmail: string } }>();

// Helper para gerar URLs públicas a partir da request atual
function getBaseUrl(reqUrl: string): string {
  try {
    const url = new URL(reqUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

// ─────────────────────────────────────────────────────────────
// 1. ENDPOINTS DE PRODUTOS (CRUD)
// ─────────────────────────────────────────────────────────────

// GET /api/products — Listar todos os produtos com suas mídias, ofertas e links
productsRoutes.get("/", async (c) => {
  const db = c.env.DB;
  const userId = c.get("userId");
  
  const userPerms = await db.prepare("SELECT role, allowed_products FROM users WHERE id = ?").bind(userId).first<{ role: string; allowed_products: string }>();
  
  try {
    const productsRes = await db.prepare("SELECT * FROM products ORDER BY created_at DESC").all();
    let products = productsRes.results || [];
    
    if (userPerms && userPerms.role !== 'admin' && userPerms.allowed_products !== 'all') {
      const allowed = userPerms.allowed_products.split(",");
      products = products.filter((p: any) => allowed.includes(p.id));
    }
    
    const result = [];
    for (const prod of products) {
      const productId = prod.id;
      
      // Buscar ofertas
      const offers = await db.prepare("SELECT * FROM product_offers WHERE product_id = ?").bind(productId).all();
      
      // Buscar mídias/assets
      const assets = await db.prepare("SELECT * FROM product_assets WHERE product_id = ?").bind(productId).all();
      
      // Buscar links de entrega
      const deliveryLinks = await db.prepare("SELECT * FROM product_delivery_links WHERE product_id = ?").bind(productId).all();
      
      // Buscar automações associadas
      const automations = await db.prepare(`
        SELECT a.id, a.name, a.slug, a.status 
        FROM product_automations pa
        JOIN automations a ON pa.automation_id = a.id
        WHERE pa.product_id = ?
      `).bind(productId).all();

      // Buscar configuração de upsell
      const upsell = await db.prepare("SELECT * FROM product_upsells WHERE product_id = ?").bind(productId).first();
      
      result.push({
        ...prod,
        offers: offers.results || [],
        assets: assets.results || [],
        deliveryLinks: deliveryLinks.results || [],
        automations: automations.results || [],
        upsell: upsell || null
      });
    }
    
    return c.json({ data: result });
  } catch (err: any) {
    console.error("[Products] Erro ao listar produtos:", err);
    return c.json({ error: String(err) }, 500);
  }
});

// GET /api/products/:id — Detalhes de um produto específico
productsRoutes.get("/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  
  try {
    const prod = await db.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();
    if (!prod) {
      return c.json({ error: "Produto não encontrado" }, 404);
    }
    
    // Buscar coleções filhas
    const offers = await db.prepare("SELECT * FROM product_offers WHERE product_id = ?").bind(id).all();
    const assets = await db.prepare("SELECT * FROM product_assets WHERE product_id = ?").bind(id).all();
    const deliveryLinks = await db.prepare("SELECT * FROM product_delivery_links WHERE product_id = ?").bind(id).all();
    const automations = await db.prepare(`
      SELECT a.id, a.name, a.slug, a.status 
      FROM product_automations pa
      JOIN automations a ON pa.automation_id = a.id
      WHERE pa.product_id = ?
    `).bind(id).all();

    const upsell = await db.prepare("SELECT * FROM product_upsells WHERE product_id = ?").bind(id).first();
    
    return c.json({
      data: {
        ...prod,
        offers: offers.results || [],
        assets: assets.results || [],
        deliveryLinks: deliveryLinks.results || [],
        automations: automations.results || [],
        upsell: upsell || null
      }
    });
  } catch (err: any) {
    console.error("[Products] Erro ao detalhar produto:", err);
    return c.json({ error: String(err) }, 500);
  }
});

// POST /api/products — Criar produto
productsRoutes.post("/", async (c) => {
  const db = c.env.DB;
  const { name, description, deliver_pdfs, deliver_links, automation_ids } = await c.req.json<{
    name: string;
    description?: string;
    deliver_pdfs?: number;
    deliver_links?: number;
    automation_ids?: string[];
  }>();
  
  if (!name) {
    return c.json({ error: "Nome do produto é obrigatório" }, 400);
  }
  
  const id = crypto.randomUUID();
  
  try {
    await db.prepare(
      "INSERT INTO products (id, name, description, deliver_pdfs, deliver_links) VALUES (?, ?, ?, ?, ?)"
    ).bind(id, name, description || null, deliver_pdfs || 0, deliver_links || 0).run();
    
    // Associar automações se fornecidas
    if (automation_ids && automation_ids.length > 0) {
      for (const autoId of automation_ids) {
        await db.prepare(
          "INSERT OR IGNORE INTO product_automations (product_id, automation_id) VALUES (?, ?)"
        ).bind(id, autoId).run();
      }
    }
    
    return c.json({ data: { id, name }, message: "Produto criado com sucesso" }, 201);
  } catch (err: any) {
    console.error("[Products] Erro ao criar produto:", err);
    return c.json({ error: String(err) }, 500);
  }
});

// PUT /api/products/:id — Editar produto
productsRoutes.put("/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const { name, description, deliver_pdfs, deliver_links, automation_ids } = await c.req.json<{
    name?: string;
    description?: string;
    deliver_pdfs?: number;
    deliver_links?: number;
    automation_ids?: string[];
  }>();
  
  try {
    const existing = await db.prepare("SELECT id FROM products WHERE id = ?").bind(id).first();
    if (!existing) {
      return c.json({ error: "Produto não encontrado" }, 404);
    }
    
    const updates: string[] = [];
    const values: any[] = [];
    
    if (name !== undefined) { updates.push("name = ?"); values.push(name); }
    if (description !== undefined) { updates.push("description = ?"); values.push(description); }
    if (deliver_pdfs !== undefined) { updates.push("deliver_pdfs = ?"); values.push(deliver_pdfs); }
    if (deliver_links !== undefined) { updates.push("deliver_links = ?"); values.push(deliver_links); }
    
    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      values.push(id);
      await db.prepare(`UPDATE products SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run();
    }
    
    // Atualizar associações de automação
    if (automation_ids !== undefined) {
      await db.prepare("DELETE FROM product_automations WHERE product_id = ?").bind(id).run();
      for (const autoId of automation_ids) {
        await db.prepare(
          "INSERT OR IGNORE INTO product_automations (product_id, automation_id) VALUES (?, ?)"
        ).bind(id, autoId).run();
      }
    }
    
    return c.json({ message: "Produto atualizado com sucesso" });
  } catch (err: any) {
    console.error("[Products] Erro ao atualizar produto:", err);
    return c.json({ error: String(err) }, 500);
  }
});

// PUT /api/products/:id/upsell — Salvar/atualizar configurações de upsell
productsRoutes.put("/:id/upsell", async (c) => {
  const db = c.env.DB;
  const productId = c.req.param("id");
  const { upsell_sku, upsell_name, upsell_url, use_main_login_url, delay_minutes, price } = await c.req.json<{
    upsell_sku: string;
    upsell_name?: string | null;
    upsell_url?: string | null;
    use_main_login_url?: number;
    delay_minutes?: number;
    price?: number;
  }>();

  if (!upsell_sku) {
    return c.json({ error: "SKU do upsell é obrigatório" }, 400);
  }

  try {
    const existingProduct = await db.prepare("SELECT id FROM products WHERE id = ?").bind(productId).first();
    if (!existingProduct) {
      return c.json({ error: "Produto não encontrado" }, 404);
    }

    const existingUpsell = await db.prepare("SELECT id FROM product_upsells WHERE product_id = ?").bind(productId).first();

    if (existingUpsell) {
      await db.prepare(`
        UPDATE product_upsells 
        SET upsell_sku = ?, upsell_name = ?, upsell_url = ?, use_main_login_url = ?, delay_minutes = ?, price = ?, updated_at = datetime('now')
        WHERE product_id = ?
      `).bind(upsell_sku, upsell_name || null, upsell_url || null, use_main_login_url ?? 1, delay_minutes ?? 5, price ?? 14.50, productId).run();
    } else {
      const id = crypto.randomUUID();
      await db.prepare(`
        INSERT INTO product_upsells (id, product_id, upsell_sku, upsell_name, upsell_url, use_main_login_url, delay_minutes, price)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, productId, upsell_sku, upsell_name || null, upsell_url || null, use_main_login_url ?? 1, delay_minutes ?? 5, price ?? 14.50).run();
    }

    return c.json({ message: "Configurações de upsell atualizadas com sucesso" });
  } catch (err: any) {
    console.error("[Products] Erro ao salvar upsell:", err);
    return c.json({ error: String(err) }, 500);
  }
});

// DELETE /api/products/:id — Deletar produto (e mídias do R2 vinculadas)
productsRoutes.delete("/:id", async (c) => {
  const db = c.env.DB;
  const r2 = c.env.STORAGE;
  const id = c.req.param("id");
  
  try {
    const existing = await db.prepare("SELECT id FROM products WHERE id = ?").bind(id).first();
    if (!existing) {
      return c.json({ error: "Produto não encontrado" }, 404);
    }
    
    // Deletar mídias físicas no R2
    const assets = await db.prepare("SELECT r2_key FROM product_assets WHERE product_id = ?").bind(id).all<{ r2_key: string }>();
    if (assets.results) {
      for (const asset of assets.results) {
        try {
          await r2.delete(asset.r2_key);
          console.log(`[R2] Removido arquivo ${asset.r2_key} por deleção do produto`);
        } catch (r2Err) {
          console.error(`[R2] Falha ao deletar arquivo ${asset.r2_key}:`, r2Err);
        }
      }
    }
    
    // O banco de dados executará o cascade nas tabelas filhas automaticamente (product_offers, product_assets, etc.)
    await db.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
    
    return c.json({ message: "Produto e mídias vinculadas removidos com sucesso" });
  } catch (err: any) {
    console.error("[Products] Erro ao deletar produto:", err);
    return c.json({ error: String(err) }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// 2. ENDPOINTS DE UPLOAD DE ARQUIVOS PARA R2 (Assets/PDFs)
// ─────────────────────────────────────────────────────────────

// POST /api/products/:id/assets-link — Cadastrar link de asset externo (sem upload R2)
productsRoutes.post("/:id/assets-link", async (c) => {
  const db = c.env.DB;
  const productId = c.req.param("id");
  const { name, public_url, file_type, tag, is_delivery_file } = await c.req.json<{
    name: string;
    public_url: string;
    file_type: string;
    tag?: string;
    is_delivery_file?: number;
  }>();

  if (!name || !public_url || !file_type) {
    return c.json({ error: "Nome, URL e Tipo do arquivo são obrigatórios" }, 400);
  }

  const id = crypto.randomUUID();
  try {
    await db.prepare(`
      INSERT INTO product_assets (id, product_id, name, r2_key, public_url, file_type, tag, is_delivery_file)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, productId, name, "external", public_url, file_type, tag || null, is_delivery_file || 0).run();

    return c.json({ data: { id, name, public_url }, message: "Mídia externa cadastrada com sucesso" }, 201);
  } catch (err: any) {
    console.error("[Products] Erro ao cadastrar asset externo:", err);
    return c.json({ error: String(err) }, 500);
  }
});

// POST /api/products/:id/upload — Subir mídia ou PDF para o R2 e criar asset
productsRoutes.post("/:id/upload", async (c) => {
  const db = c.env.DB;
  const r2 = c.env.STORAGE;
  const productId = c.req.param("id");
  
  try {
    const product = await db.prepare("SELECT name FROM products WHERE id = ?").bind(productId).first();
    if (!product) {
      return c.json({ error: "Produto associado não encontrado" }, 404);
    }
    
    // Tratar multipart request
    const formData = await c.req.parseBody();
    const file = formData.file;
    const isDeliveryFile = formData.is_delivery_file === "true" || formData.is_delivery_file === "1" ? 1 : 0;
    const tag = formData.tag ? String(formData.tag) : null;
    
    if (!file || !(file instanceof File)) {
      return c.json({ error: "Nenhum arquivo válido enviado" }, 400);
    }
    
    const arrayBuffer = await file.arrayBuffer();
    const assetId = crypto.randomUUID();
    
    // Limpar nome do arquivo para usar na key do R2
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const fileExtension = file.name.split(".").pop() || "";
    
    // Determinar o tipo de arquivo
    let fileType = "unknown";
    if (file.type.startsWith("image/")) fileType = "image";
    else if (file.type.startsWith("audio/")) fileType = "audio";
    else if (file.type.startsWith("video/")) fileType = "video";
    else if (file.type === "application/pdf" || fileExtension.toLowerCase() === "pdf") fileType = "pdf";
    
    // Chave única de armazenamento do R2
    const r2Key = `products/${productId}/${assetId}-${cleanFileName}`;
    
    // Salvar arquivo físico no R2
    console.log(`[R2] Fazendo upload de ${cleanFileName} (${fileType}, ${file.size} bytes) para o R2 com chave: ${r2Key}`);
    await r2.put(r2Key, arrayBuffer, {
      httpMetadata: { contentType: file.type }
    });
    
    // URL de retorno público do Worker serve
    const baseUrl = getBaseUrl(c.req.url);
    const publicUrl = `${baseUrl}/api/media/${r2Key}`;
    
    // Registrar na tabela de assets do banco
    await db.prepare(`
      INSERT INTO product_assets (id, product_id, name, r2_key, public_url, file_type, tag, is_delivery_file)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(assetId, productId, file.name, r2Key, publicUrl, fileType, tag, isDeliveryFile).run();
    
    return c.json({
      data: {
        id: assetId,
        name: file.name,
        public_url: publicUrl,
        file_type: fileType,
        tag,
        is_delivery_file: isDeliveryFile
      },
      message: "Upload concluído e arquivo registrado no R2 com sucesso"
    }, 201);
  } catch (err: any) {
    console.error("[Products] Falha no upload R2:", err);
    return c.json({ error: `Falha no upload: ${err.message || err}` }, 500);
  }
});

// DELETE /api/products/assets/:assetId — Deletar arquivo físico do R2 e registro
productsRoutes.delete("/assets/:assetId", async (c) => {
  const db = c.env.DB;
  const r2 = c.env.STORAGE;
  const assetId = c.req.param("assetId");
  
  try {
    const asset = await db.prepare("SELECT r2_key FROM product_assets WHERE id = ?").bind(assetId).first<{ r2_key: string }>();
    if (!asset) {
      return c.json({ error: "Arquivo não encontrado no banco de dados" }, 404);
    }
    
    // Remover do R2
    try {
      await r2.delete(asset.r2_key);
      console.log(`[R2] Removido com sucesso: ${asset.r2_key}`);
    } catch (r2Err) {
      console.error(`[R2] Erro ao deletar no R2:`, r2Err);
    }
    
    // Remover do banco
    await db.prepare("DELETE FROM product_assets WHERE id = ?").bind(assetId).run();
    
    return c.json({ message: "Arquivo removido do R2 e do banco de dados com sucesso" });
  } catch (err: any) {
    console.error("[Products] Erro ao deletar arquivo:", err);
    return c.json({ error: String(err) }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// 3. ENDPOINTS DE OFERTAS (VALUES)
// ─────────────────────────────────────────────────────────────

// POST /api/products/:id/offers — Cadastrar oferta
productsRoutes.post("/:id/offers", async (c) => {
  const db = c.env.DB;
  const productId = c.req.param("id");
  const { name, value, tag } = await c.req.json<{ name: string; value: number; tag: string }>();
  
  if (!name || value === undefined || !tag) {
    return c.json({ error: "Nome, valor e tag são obrigatórios" }, 400);
  }
  
  const id = crypto.randomUUID();
  
  try {
    await db.prepare(
      "INSERT INTO product_offers (id, product_id, name, value, tag) VALUES (?, ?, ?, ?, ?)"
    ).bind(id, productId, name, value, tag).run();
    
    return c.json({ data: { id, name, value, tag }, message: "Oferta cadastrada com sucesso" }, 201);
  } catch (err: any) {
    console.error("[Products] Erro ao cadastrar oferta:", err);
    return c.json({ error: String(err) }, 500);
  }
});

// DELETE /api/products/offers/:offerId — Deletar oferta
productsRoutes.delete("/offers/:offerId", async (c) => {
  const db = c.env.DB;
  const offerId = c.req.param("offerId");
  
  try {
    await db.prepare("DELETE FROM product_offers WHERE id = ?").bind(offerId).run();
    return c.json({ message: "Oferta removida com sucesso" });
  } catch (err: any) {
    console.error("[Products] Erro ao deletar oferta:", err);
    return c.json({ error: String(err) }, 500);
  }
});

// PUT /api/products/offers/:offerId — Editar oferta
productsRoutes.put("/offers/:offerId", async (c) => {
  const db = c.env.DB;
  const offerId = c.req.param("offerId");
  const { name, value, tag } = await c.req.json<{ name: string; value: number; tag: string }>();
  
  if (!name || value === undefined || !tag) {
    return c.json({ error: "Nome, valor e tag são obrigatórios" }, 400);
  }
  
  try {
    await db.prepare(
      "UPDATE product_offers SET name = ?, value = ?, tag = ? WHERE id = ?"
    ).bind(name, value, tag, offerId).run();
    
    return c.json({ message: "Oferta atualizada com sucesso" });
  } catch (err: any) {
    console.error("[Products] Erro ao editar oferta:", err);
    return c.json({ error: String(err) }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// 4. ENDPOINTS DE LINKS (DELIVERY LINKS)
// ─────────────────────────────────────────────────────────────

// POST /api/products/:id/delivery-links — Cadastrar link de Área de Membros
productsRoutes.post("/:id/delivery-links", async (c) => {
  const db = c.env.DB;
  const productId = c.req.param("id");
  const { title, login_url, instructions, video_url, product_code } = await c.req.json<{
    title: string;
    login_url: string;
    instructions?: string;
    video_url?: string;
    product_code?: string;
  }>();
  
  if (!title || !login_url) {
    return c.json({ error: "Título e link de login são obrigatórios" }, 400);
  }
  
  const id = crypto.randomUUID();
  
  try {
    await db.prepare(`
      INSERT INTO product_delivery_links (id, product_id, title, login_url, instructions, video_url, product_code)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, productId, title, login_url, instructions || null, video_url || null, product_code || null).run();
    
    return c.json({ data: { id, title, login_url }, message: "Acesso de área de membros cadastrado com sucesso" }, 201);
  } catch (err: any) {
    console.error("[Products] Erro ao cadastrar link de entrega:", err);
    return c.json({ error: String(err) }, 500);
  }
});

// DELETE /api/products/delivery-links/:linkId — Deletar link de Área de Membros
productsRoutes.delete("/delivery-links/:linkId", async (c) => {
  const db = c.env.DB;
  const linkId = c.req.param("linkId");
  
  try {
    await db.prepare("DELETE FROM product_delivery_links WHERE id = ?").bind(linkId).run();
    return c.json({ message: "Link de entrega removido com sucesso" });
  } catch (err: any) {
    console.error("[Products] Erro ao deletar link de entrega:", err);
    return c.json({ error: String(err) }, 500);
  }
});

// PUT /api/products/delivery-links/:linkId — Editar link de Área de Membros
productsRoutes.put("/delivery-links/:linkId", async (c) => {
  const db = c.env.DB;
  const linkId = c.req.param("linkId");
  const { title, login_url, instructions, video_url, product_code } = await c.req.json<{
    title?: string;
    login_url?: string;
    instructions?: string;
    video_url?: string;
    product_code?: string;
  }>();

  if (!title || !login_url) {
    return c.json({ error: "Título e link de login são obrigatórios" }, 400);
  }
  
  try {
    const updates: string[] = [];
    const values: any[] = [];
    
    if (title !== undefined) { updates.push("title = ?"); values.push(title); }
    if (login_url !== undefined) { updates.push("login_url = ?"); values.push(login_url); }
    if (instructions !== undefined) { updates.push("instructions = ?"); values.push(instructions || null); }
    if (video_url !== undefined) { updates.push("video_url = ?"); values.push(video_url || null); }
    if (product_code !== undefined) { updates.push("product_code = ?"); values.push(product_code || null); }
    
    if (updates.length > 0) {
      values.push(linkId);
      await db.prepare(`UPDATE product_delivery_links SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run();
    }
    
    return c.json({ message: "Link de entrega atualizado com sucesso" });
  } catch (err: any) {
    console.error("[Products] Erro ao editar link de entrega:", err);
    return c.json({ error: String(err) }, 500);
  }
});

