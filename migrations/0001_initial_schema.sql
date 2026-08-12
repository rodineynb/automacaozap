-- Migration 0001: Schema inicial do sistema AutomacaoZAP
-- Todas as tabelas necessárias para a Fase 1

-- Usuários do sistema
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Domínios cadastrados para geração de webhooks
CREATE TABLE IF NOT EXISTS domains (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- APIs WhatsApp cadastradas
CREATE TABLE IF NOT EXISTS whatsapp_apis (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  docs_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- LLMs cadastradas
CREATE TABLE IF NOT EXISTS llms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  api_key TEXT NOT NULL,
  docs_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Serviços OCR cadastrados
CREATE TABLE IF NOT EXISTS ocr_services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  api_key TEXT NOT NULL,
  docs_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Automações criadas
CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  domain_id TEXT,
  whatsapp_api_id TEXT,
  ocr_service_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE SET NULL,
  FOREIGN KEY (whatsapp_api_id) REFERENCES whatsapp_apis(id) ON DELETE SET NULL,
  FOREIGN KEY (ocr_service_id) REFERENCES ocr_services(id) ON DELETE SET NULL
);

-- LLMs por automação (com ordem de prioridade/fallback)
CREATE TABLE IF NOT EXISTS automation_llms (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL,
  llm_id TEXT NOT NULL,
  priority_order INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE,
  FOREIGN KEY (llm_id) REFERENCES llms(id) ON DELETE CASCADE
);

-- Contatos (clientes)
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  name TEXT,
  automation_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE
);

-- Índice para busca rápida por telefone + automação
CREATE INDEX IF NOT EXISTS idx_contacts_phone_automation ON contacts(phone, automation_id);

-- Conversas
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  automation_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  ai_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE
);

-- Índice para filtros de conversas
CREATE INDEX IF NOT EXISTS idx_conversations_automation ON conversations(automation_id, status);
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_id);

-- Mensagens
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  content TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'manual')),
  llm_used TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Índice para buscar mensagens de uma conversa
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

-- Log de erros
CREATE TABLE IF NOT EXISTS error_logs (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL,
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE
);

-- Índice para buscar erros por automação
CREATE INDEX IF NOT EXISTS idx_error_logs_automation ON error_logs(automation_id, created_at DESC);
