-- Migration 0017: Fallback logs schema
-- Registra eventos de fallback de LLM, OCR e áudio com retenção de 15 dias

CREATE TABLE IF NOT EXISTS fallback_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  automation_id TEXT NOT NULL,
  lead_phone TEXT NOT NULL,
  lead_name TEXT,
  product_name TEXT,
  fallback_type TEXT NOT NULL, -- 'llm', 'ocr', 'transcription'
  details TEXT, -- qual serviço falhou, qual assumiu e erro
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fallback_logs_created_at ON fallback_logs(created_at);
