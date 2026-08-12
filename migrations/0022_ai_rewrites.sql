-- Migration 0022: Reescrita Inteligente por IA no CRM e Follow-up
-- Adiciona colunas para controle do modo de reescrita, contagem e variações estáticas

-- 1. Colunas adicionais na tabela de estágios de Follow-up
ALTER TABLE automation_followup_stages ADD COLUMN rewrite_mode TEXT DEFAULT 'none';
ALTER TABLE automation_followup_stages ADD COLUMN rewrite_count INTEGER DEFAULT 5;
ALTER TABLE automation_followup_stages ADD COLUMN variations TEXT DEFAULT '[]';

-- 2. Colunas adicionais na tabela de estágios de CRM
ALTER TABLE automation_crm_stages ADD COLUMN rewrite_mode TEXT DEFAULT 'none';
ALTER TABLE automation_crm_stages ADD COLUMN rewrite_count INTEGER DEFAULT 5;
ALTER TABLE automation_crm_stages ADD COLUMN variations TEXT DEFAULT '[]';
