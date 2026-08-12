-- Migration 0015: Tabelas de fallback de OCR e Transcrição por automação
-- Permite configurar até 3 serviços de OCR e 3 de transcrição em ordem de prioridade

CREATE TABLE IF NOT EXISTS automation_ocrs (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL,
  ocr_service_id TEXT NOT NULL,
  priority_order INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE,
  FOREIGN KEY (ocr_service_id) REFERENCES ocr_services(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_ocrs_priority ON automation_ocrs(automation_id, priority_order);

CREATE TABLE IF NOT EXISTS automation_transcriptions (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL,
  transcription_service_id TEXT NOT NULL,
  priority_order INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE,
  FOREIGN KEY (transcription_service_id) REFERENCES transcription_services(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_transcriptions_priority ON automation_transcriptions(automation_id, priority_order);

-- Migrar dados existentes para manter retrocompatibilidade
INSERT INTO automation_ocrs (id, automation_id, ocr_service_id, priority_order)
SELECT lower(hex(randomblob(16))), id, ocr_service_id, 1
FROM automations
WHERE ocr_service_id IS NOT NULL AND ocr_service_id != '';

INSERT INTO automation_transcriptions (id, automation_id, transcription_service_id, priority_order)
SELECT lower(hex(randomblob(16))), id, transcription_service_id, 1
FROM automations
WHERE transcription_service_id IS NOT NULL AND transcription_service_id != '';
