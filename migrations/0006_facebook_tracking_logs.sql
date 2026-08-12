-- Migration 0006: Add facebook_tracking_logs table for Meta CAPI tracking logs with auto-cleanup capability

CREATE TABLE IF NOT EXISTS facebook_tracking_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  automation_id TEXT NOT NULL,
  event_name TEXT NOT NULL,       -- 'Lead' ou 'Purchase'
  event_id TEXT NOT NULL,         -- ID único do evento (usado para dedup)
  phone TEXT NOT NULL,            -- Telefone de destino do cliente
  status TEXT NOT NULL,           -- 'success' ou 'error'
  payload TEXT,                   -- Payload JSON enviado ao Meta CAPI
  response TEXT,                  -- Detalhes da resposta da API (ou mensagem de erro)
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fb_tracking_logs_automation ON facebook_tracking_logs(automation_id);
CREATE INDEX IF NOT EXISTS idx_fb_tracking_logs_created ON facebook_tracking_logs(created_at);
