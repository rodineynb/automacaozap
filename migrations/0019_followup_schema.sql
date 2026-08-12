-- Migration 0019: Configurações de Follow-up por Produto
CREATE TABLE IF NOT EXISTS followup_product_config (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL UNIQUE,
  use_llm_variations INTEGER NOT NULL DEFAULT 0,
  
  -- Vigia (15min)
  vigia_enabled INTEGER NOT NULL DEFAULT 1,
  vigia_delay_minutes INTEGER NOT NULL DEFAULT 15,
  vigia_message TEXT,
  
  -- Finalizador (12h)
  finalizador_enabled INTEGER NOT NULL DEFAULT 1,
  finalizador_delay_minutes INTEGER NOT NULL DEFAULT 720,
  finalizador_message TEXT,
  
  -- Incentivador (1h)
  incentivador_enabled INTEGER NOT NULL DEFAULT 1,
  incentivador_delay_minutes INTEGER NOT NULL DEFAULT 60,
  incentivador_message TEXT,
  
  -- Cobrador Amigo (10h)
  cobrador_amigo_enabled INTEGER NOT NULL DEFAULT 1,
  cobrador_amigo_delay_minutes INTEGER NOT NULL DEFAULT 600,
  cobrador_amigo_message TEXT,
  
  -- Cobrador Curioso (34h)
  cobrador_curioso_enabled INTEGER NOT NULL DEFAULT 1,
  cobrador_curioso_delay_minutes INTEGER NOT NULL DEFAULT 2040,
  cobrador_curioso_message TEXT,
  
  -- Cobrador Final (58h)
  cobrador_final_enabled INTEGER NOT NULL DEFAULT 1,
  cobrador_final_delay_minutes INTEGER NOT NULL DEFAULT 3480,
  cobrador_final_message TEXT,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_followup_config_product ON followup_product_config(product_id);
