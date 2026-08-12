-- Migration 0023: Logs de Envio de Mensagens (Dispatch Logs)

CREATE TABLE IF NOT EXISTS dispatch_logs (
  id TEXT PRIMARY KEY,
  automation_id TEXT,
  phone TEXT NOT NULL,
  message_type TEXT NOT NULL,      -- 'text', 'image', 'video', 'document', 'audio', 'pix_button'
  message_content TEXT NOT NULL,   -- snippet da mensagem ou nome do arquivo
  status TEXT NOT NULL,            -- 'success', 'error'
  error_message TEXT,              -- log do erro se falhar
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_dispatch_logs_automation ON dispatch_logs(automation_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_logs_sent_at ON dispatch_logs(sent_at);
