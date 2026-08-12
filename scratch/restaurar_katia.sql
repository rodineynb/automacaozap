-- SQL para restaurar a conversa e o faturamento de Katia Moore
-- conversation_id: '0a3f1d32-e865-4547-b2c5-7374990b7420'

-- 1. Restaurar o histórico completo de mensagens de Katia
INSERT OR REPLACE INTO messages (id, conversation_id, content, role, llm_used, created_at) VALUES 
('ACF5AF3DA1327FAFBFD670EBB8EFA3FB', '0a3f1d32-e865-4547-b2c5-7374990b7420', '[Áudio recebido - falha na transcrição]', 'user', NULL, '2026-05-29 18:42:32'),
('c6711388-f2bb-4910-942f-898d8ae7ac53', '0a3f1d32-e865-4547-b2c5-7374990b7420', 'Ah, recebi seu áudio aqui, mas não consegui ouvir direito! Acho que o áudio não carregou bem por aqui 😅\n\nPode me escrever o que você falou, por favor, *katiamoore*? Assim não perco nenhum detalhe!\n\n🍰💕', 'assistant', 'auto', '2026-05-29 18:42:43'),
('AC37803A447C7B0EA212F2215309A8FE', '0a3f1d32-e865-4547-b2c5-7374990b7420', '[Áudio recebido - falha na transcrição]', 'user', NULL, '2026-05-29 18:44:00'),
('58180272-e817-4477-b968-0c6467a167f5', '0a3f1d32-e865-4547-b2c5-7374990b7420', 'Poxa, parece que os áudios estão com problema de carregamento aqui do meu lado... 😅\n\nNão quero perder nada do que você disse! Pode escrever para mim, *katiamoore*?\n\n🙏\n\nAssim consigo te ajudar direitinho e já resolver tudo rapidinho! 💕🍰', 'assistant', 'auto', '2026-05-29 18:44:08'),
('AC590E9BEF2E3EB0659E6599CED928CC', '0a3f1d32-e865-4547-b2c5-7374990b7420', 'Manda o Pix se parado', 'user', NULL, '2026-05-29 18:44:35'),
('ed90317b-9b54-430c-996b-b770823391cf', '0a3f1d32-e865-4547-b2c5-7374990b7420', 'Claro, *katiamoore*! Aqui estão os dados direitinho para você fazer o Pix:\n\n💰 *Chave PIX (Celular):* 61982277206\n👤 *Destinatário:* R G FEITOSA 153DF\n🏛️ *Banco:* Banco Cora\n\nMe conta qual pacote você vai querer:\n1️⃣ *Só as receitas* — R$ 10,00\n2️⃣ *Receitas + Massas* — R$ 15,00\n3️⃣ *Kit Completo* (o mais escolhido) — R$ 25,00\n\nAssim que fizer o Pix, é só me enviar o *comprovante* aqui que eu já libero seu acesso na hora! 🍰😊', 'assistant', 'auto', '2026-05-29 18:44:45'),
('AC92DDA961AB5AA0496D5B4A53973C8D', '0a3f1d32-e865-4547-b2c5-7374990b7420', '[Texto extraído da imagem: \n{\n  "valor": "R$ 10,00",\n  "data_hora": "29 MAI 2026 - 15:46:10",\n  "nome_pagador": "Kátia Maria Moore Arêas",\n  "nome_recebedor": "R G FEITOSA 153DF",\n  "banco": "NU PAGAMENTOS - IP",\n  "chave_pix": "+5561982277206",\n  "id_transacao": "E18236120202605291845s15d3784dee"\n}]', 'user', NULL, '2026-05-29 18:46:33'),
('ACF84A53CC1D70D040D14F7195FAD1B0', '0a3f1d32-e865-4547-b2c5-7374990b7420', 'Já mandei', 'user', NULL, '2026-05-29 18:46:50'),
('06735905-aabf-4d6b-8160-d008987e4edc', '0a3f1d32-e865-4547-b2c5-7374990b7420', 'Confirmado, *katiamoore*! Seu pagamento de *R$ 10.00* foi recebido com sucesso! 🎉💖\n\nE olha só, preparei um presente incrível para você: por apenas mais *R$ 5,00*, eu consigo liberar o seu upgrade para o *Kit Completo de Confeitaria*!\n\nVocê vai levar além das receitas: videoaulas gravadas passo a passo, apostila de massas fofinhas, brigadeiros especiais e bônus exclusivos. O Kit custa R$ 25, mas sai por apenas +R$ 5 para você hoje! 🎁\n\nPara aproveitar, faça o Pix de *R$ 5,00* na mesma chave celular:\n💰 *Chave Pix (Celular):* 61982277206\n\nSe não quiser o Kit Completo, tudo bem! Digite *\"não quero\"* ou *\"só as receitas\"* que eu já faço a sua liberação padrão. O que prefere? 😊', 'assistant', NULL, '2026-05-29 18:46:53'),
('AC121A1C9F9EABBE43007B802E8C2A01', '0a3f1d32-e865-4547-b2c5-7374990b7420', 'Eu já mandei', 'user', NULL, '2026-05-29 18:47:12'),
('AC6686092EB530C5C84020E2333A30B0', '0a3f1d32-e865-4547-b2c5-7374990b7420', '[Áudio recebido - falha na transcrição]', 'user', NULL, '2026-05-29 18:50:03');

-- 2. Restaurar o faturamento e o status de pagamento na tabela automation_leads
UPDATE automation_leads 
SET pago = 1, 
    valor_pago = 10.00, 
    recebeu_acesso = 0, 
    nome = 'Kátia Maria Moore Arêas' 
WHERE phone = '5521965576155';

-- 3. Restaurar o estado da conversa (fase pós-pagamento com upsell oferecido)
UPDATE conversation_state 
SET phase = 'post_payment', 
    seq1_called = 1, 
    seq2_called = 1, 
    payment_confirmed = 1, 
    total_paid = 10.00, 
    upsell_offered = 1, 
    upsell_accepted = 0, 
    downsell_offered = 0, 
    kit_completo_offered = 0, 
    kit_completo_price = NULL, 
    client_name = 'Kátia Maria Moore Arêas', 
    client_email = NULL, 
    access_delivered = 0, 
    last_tool_called = 'pagamento', 
    updated_at = datetime('now') 
WHERE conversation_id = '0a3f1d32-e865-4547-b2c5-7374990b7420';

-- 4. Reabrir a conversa no chat de forma ativa
UPDATE conversations 
SET status = 'open', 
    ai_active = 1, 
    updated_at = datetime('now') 
WHERE id = '0a3f1d32-e865-4547-b2c5-7374990b7420';
