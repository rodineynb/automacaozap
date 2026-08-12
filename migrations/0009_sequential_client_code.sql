-- Migration 0009: Código Sequencial do Cliente
-- Adiciona a coluna cliente_codigo e faz backfill linear ultra-rápido baseado no rowid nativo do SQLite

ALTER TABLE automation_leads ADD COLUMN cliente_codigo INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_cliente_codigo ON automation_leads(cliente_codigo);

UPDATE automation_leads
SET cliente_codigo = rowid
WHERE cliente_codigo IS NULL;
