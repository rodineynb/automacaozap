-- Migration 0014: Tabela de Configurações de Upsell Pós-Venda por Produto

CREATE TABLE IF NOT EXISTS product_upsells (
  id TEXT PRIMARY KEY,
  product_id TEXT UNIQUE NOT NULL,
  upsell_sku TEXT NOT NULL,
  upsell_url TEXT,
  use_main_login_url INTEGER DEFAULT 1, -- 1 para usar a mesma URL do produto principal, 0 para URL customizada
  delay_minutes INTEGER DEFAULT 5,       -- Tempo em minutos após a liberação principal
  price REAL DEFAULT 14.50,              -- Preço do upsell para checkout do funil
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
