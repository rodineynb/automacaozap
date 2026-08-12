-- Migration 0026: Add class column to automation_crm_stages
ALTER TABLE automation_crm_stages ADD COLUMN class TEXT DEFAULT 'sucesso';
UPDATE automation_crm_stages SET class = 'sem_sucesso' WHERE key = 'objection';
