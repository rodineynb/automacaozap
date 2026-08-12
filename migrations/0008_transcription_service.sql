-- Migration 0008: Serviço de Transcrição de Áudio
-- Cria tabela de serviços de transcrição e adiciona coluna na tabela de automações

CREATE TABLE IF NOT EXISTS transcription_services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  api_key TEXT NOT NULL,
  docs_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE automations ADD COLUMN transcription_service_id TEXT REFERENCES transcription_services(id) ON DELETE SET NULL;
