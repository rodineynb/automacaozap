-- Ajuste manual dos dados da cliente Rosimere C. Schiavon (final 2461)
-- Transação para garantir integridade absoluta

-- 1. Atualizar o estado da conversa (conversa ID: 92e07835-1651-4d54-be43-a0f5ac75eca3)
-- Define total pago como R$ 15,00 (10 + 5 upsell) e upsell_accepted = 1
UPDATE conversation_state
SET total_paid = 15,
    upsell_accepted = 1,
    updated_at = datetime('now')
WHERE conversation_id = '92e07835-1651-4d54-be43-a0f5ac75eca3';

-- 2. Atualizar o faturamento na tabela de leads de automação (telefone: 554784682461)
UPDATE automation_leads
SET valor_pago = 15,
    updated_at = datetime('now')
WHERE phone = '554784682461' AND automation_id = '3805b688-0967-4e96-86da-6936c10c5d58';

-- 3. Atualizar o status da conversa para finalizado com sucesso no chat
UPDATE conversations
SET status = 'finalizado_com_sucesso',
    updated_at = datetime('now')
WHERE id = '92e07835-1651-4d54-be43-a0f5ac75eca3';
