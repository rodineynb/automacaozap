-- Migration 0003: Adicionar número WhatsApp de origem
-- Cada automação tem um número de WhatsApp associado.
-- Contatos são identificados pelo par (phone, whatsapp_number) para diferenciar
-- leads que entraram por diferentes números de origem.

-- Adicionar coluna whatsapp_number na tabela automations
ALTER TABLE automations ADD COLUMN whatsapp_number TEXT;

-- Adicionar coluna whatsapp_number na tabela contacts
ALTER TABLE contacts ADD COLUMN whatsapp_number TEXT;

-- Atualizar índice de contatos para incluir whatsapp_number
DROP INDEX IF EXISTS idx_contacts_phone_automation;
CREATE INDEX IF NOT EXISTS idx_contacts_phone_automation ON contacts(phone, automation_id, whatsapp_number);
