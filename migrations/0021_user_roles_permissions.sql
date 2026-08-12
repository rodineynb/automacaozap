-- Migration 0021: Adiciona cargo e permissões na tabela de usuários
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE users ADD COLUMN allowed_sections TEXT NOT NULL DEFAULT 'dashboard,products,automations,followup,crm,chat,reports,settings';
ALTER TABLE users ADD COLUMN allowed_automations TEXT NOT NULL DEFAULT 'all';
ALTER TABLE users ADD COLUMN allowed_products TEXT NOT NULL DEFAULT 'all';

-- Configurar o primeiro usuário cadastrado (se existir) como administrador com acesso total
UPDATE users SET role = 'admin', allowed_sections = 'dashboard,products,automations,followup,crm,chat,reports,settings,users' WHERE email = 'admin@automacaozap.com';
