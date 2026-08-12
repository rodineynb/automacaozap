-- Migration 0020: CRM e Follow-up Dinâmicos por Automação
-- Permite infinitos cards customizados e vinculados por automação

-- 1. Tabela de Estágios de Follow-up dinâmicos vinculados à Automação
CREATE TABLE IF NOT EXISTS automation_followup_stages (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL,
  key TEXT NOT NULL,          -- Identificador lógico (ex: 'vigia', 'finalizador')
  name TEXT NOT NULL,         -- Nome amigável (ex: "Vigia", "Cobrador Amigo")
  class TEXT NOT NULL,        -- 'reengajamento' ou 'cobranca'
  enabled INTEGER NOT NULL DEFAULT 1,
  delay_minutes INTEGER NOT NULL DEFAULT 15,
  message TEXT NOT NULL,
  tag_to_add TEXT,            -- Tag opcional para adicionar ao lead ao disparar
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE,
  UNIQUE(automation_id, key)
);

CREATE INDEX IF NOT EXISTS idx_followup_stages_automation ON automation_followup_stages(automation_id);

-- 2. Tabela de Estágios de CRM dinâmicos vinculados à Automação
CREATE TABLE IF NOT EXISTS automation_crm_stages (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL,
  key TEXT NOT NULL,          -- Identificador lógico (ex: 'satisfaction')
  name TEXT NOT NULL,         -- Nome amigável (ex: "Satisfação")
  enabled INTEGER NOT NULL DEFAULT 1,
  delay_hours INTEGER NOT NULL DEFAULT 24,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE,
  UNIQUE(automation_id, key)
);

CREATE INDEX IF NOT EXISTS idx_crm_stages_automation ON automation_crm_stages(automation_id);

-- Adiciona coluna de controle use_llm_variations na tabela automations
ALTER TABLE automations ADD COLUMN use_llm_variations INTEGER DEFAULT 0;
