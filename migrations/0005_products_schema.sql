-- Migration 0005: Central de Produtos, Ofertas e Mídias R2

-- 1. Tabela Principal de Produtos
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  deliver_pdfs INTEGER DEFAULT 0,  -- 1 para entregar PDFs no WhatsApp, 0 para não
  deliver_links INTEGER DEFAULT 0, -- 1 para entregar links de Área de Membros, 0 para não
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 2. Tabela de Ofertas/Valores Dinâmicos
CREATE TABLE IF NOT EXISTS product_offers (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  value REAL NOT NULL,
  tag TEXT NOT NULL,               -- ex: 'principal', 'downsell', 'especial'
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- 3. Tabela de Mídias e PDFs (Upload no R2)
CREATE TABLE IF NOT EXISTS product_assets (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  r2_key TEXT NOT NULL,            -- chave do objeto no R2 (ex: products/prod-id/audio.mp3)
  public_url TEXT NOT NULL,        -- ex: https://dominio.com/api/media/products/prod-id/audio.mp3
  file_type TEXT NOT NULL,         -- 'audio', 'video', 'image', 'pdf'
  tag TEXT,                        -- tag conversacional de marketing (opcional para mídias de funil)
  is_delivery_file INTEGER DEFAULT 0, -- 1 se for PDF de entrega de produto, 0 se for mídia de apoio do funil
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- 4. Tabela de Links de Acesso (Área de Membros)
CREATE TABLE IF NOT EXISTS product_delivery_links (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  title TEXT NOT NULL,             -- ex: 'Portal de Alunas - Kit Completo'
  login_url TEXT NOT NULL,         -- ex: 'https://app.promentor21.top/login'
  instructions TEXT,               -- instruções personalizadas de login
  video_url TEXT,                  -- link de vídeo explicativo opcional
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- 5. Tabela Pivô (Muitos para Muitos: Relação com Automações)
CREATE TABLE IF NOT EXISTS product_automations (
  product_id TEXT NOT NULL,
  automation_id TEXT NOT NULL,
  PRIMARY KEY (product_id, automation_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE
);
