-- Migration 0018: CRM / Pós-Venda
-- Sistema de pesquisa e inteligência de mercado vinculado por produto

-- ================================================
-- Configuração CRM por produto
-- ================================================
CREATE TABLE IF NOT EXISTS crm_product_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  satisfaction_enabled INTEGER DEFAULT 1,
  satisfaction_delay_hours INTEGER DEFAULT 48,
  satisfaction_message TEXT,
  testimonial_enabled INTEGER DEFAULT 1,
  testimonial_delay_hours INTEGER DEFAULT 120,
  testimonial_message TEXT,
  objection_enabled INTEGER DEFAULT 1,
  objection_delay_hours INTEGER DEFAULT 24,
  objection_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(product_id)
);

-- ================================================
-- Respostas CRM (vinculadas a produto)
-- ================================================
CREATE TABLE IF NOT EXISTS crm_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  automation_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  lead_name TEXT,
  product_name TEXT,
  flow_type TEXT NOT NULL,
  question_sent TEXT,
  response_text TEXT,
  response_media_url TEXT,
  response_media_type TEXT,
  ai_summary TEXT,
  ai_tags TEXT,
  status TEXT DEFAULT 'pending',
  sent_at TEXT,
  answered_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_crm_responses_product ON crm_responses(product_id);
CREATE INDEX IF NOT EXISTS idx_crm_responses_automation ON crm_responses(automation_id);
CREATE INDEX IF NOT EXISTS idx_crm_responses_phone ON crm_responses(phone);
CREATE INDEX IF NOT EXISTS idx_crm_responses_flow ON crm_responses(flow_type);
CREATE INDEX IF NOT EXISTS idx_crm_responses_status ON crm_responses(status);
CREATE INDEX IF NOT EXISTS idx_crm_responses_date ON crm_responses(created_at);

-- ================================================
-- Agendamentos CRM (processados pelo cron)
-- ================================================
CREATE TABLE IF NOT EXISTS crm_scheduled (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  automation_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  flow_type TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  crm_response_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_crm_scheduled_status ON crm_scheduled(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_crm_scheduled_product ON crm_scheduled(product_id);

-- ================================================
-- Tags CRM nos leads
-- ================================================
ALTER TABLE conversation_state ADD COLUMN crm_tags TEXT DEFAULT '[]';
