-- Migration 0002: Tabelas do motor de automação
-- Estado de conversas, follow-ups agendados e leads

-- Estado de cada conversa na automação (máquina de estados)
CREATE TABLE IF NOT EXISTS conversation_state (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL UNIQUE,
  automation_slug TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'initial',  -- initial, seq1_sent, seq1_responded, seq2_sent, awaiting_payment, paid, upsell_offered, completed
  seq1_called INTEGER NOT NULL DEFAULT 0,
  seq2_called INTEGER NOT NULL DEFAULT 0,
  payment_confirmed INTEGER NOT NULL DEFAULT 0,
  total_paid REAL NOT NULL DEFAULT 0,
  upsell_offered INTEGER NOT NULL DEFAULT 0,
  upsell_accepted INTEGER NOT NULL DEFAULT 0,
  downsell_offered INTEGER NOT NULL DEFAULT 0,
  kit_completo_offered INTEGER NOT NULL DEFAULT 0,  -- ofereceu kit completo (R$12,90 ou R$14,50)
  kit_completo_price REAL,                          -- preço ofertado do kit completo
  client_name TEXT,
  client_email TEXT,
  access_delivered INTEGER NOT NULL DEFAULT 0,
  last_tool_called TEXT,                            -- última ferramenta chamada pela IA
  metadata TEXT,                                    -- JSON para dados extras
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversation_state_conv ON conversation_state(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_state_slug ON conversation_state(automation_slug);

-- Follow-ups agendados
CREATE TABLE IF NOT EXISTS scheduled_followups (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  automation_slug TEXT NOT NULL,
  type TEXT NOT NULL,                              -- 'followup_msg_inicial_20min', 'followup_msg_inicial_30min', 'followup_fila_10h', 'followup_fila_24h', 'followup_fila_1d', 'upsell_10min'
  scheduled_for TEXT NOT NULL,                     -- datetime when this should execute
  status TEXT NOT NULL DEFAULT 'pending',           -- pending, executed, cancelled
  payload TEXT,                                    -- JSON with extra data
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  executed_at TEXT,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_followups_status ON scheduled_followups(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_followups_conv ON scheduled_followups(conversation_id);

-- Tabela de leads com tracking (migrada do Supabase bd_recheios_followup)
CREATE TABLE IF NOT EXISTS automation_leads (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  nome TEXT,
  email TEXT,
  produto_codigo TEXT,               -- PROD-R1I27D, PROD-H3GQBU, etc.
  recebeu_acesso INTEGER NOT NULL DEFAULT 0,
  valor_pago REAL NOT NULL DEFAULT 0,
  pago INTEGER NOT NULL DEFAULT 0,
  origem TEXT,                       -- facebook, instagram, organico, etc.
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_leads_phone ON automation_leads(phone, automation_id);
CREATE INDEX IF NOT EXISTS idx_leads_automation ON automation_leads(automation_id);
