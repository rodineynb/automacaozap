
INSERT INTO messages (id, conversation_id, content, role, llm_used) 
VALUES ('3e068eee-1872-4473-9a77-0a38e0adf56b', '8d5f27a7-85fb-4ca6-9dee-efcd8f29ac28', '*Rita*, seu pagamento de *R$ 10,00* foi confirmado com sucesso! 🎉

E olha só, preparei um presente incrível para você: por apenas mais *R$ 5,00*, eu consigo liberar o seu upgrade para o *Kit Completo de Confeitaria*!

No kit completo você recebe:
📹 Vídeo aulas passo a passo com o ponto certo dos recheios
📚 Apostilas extras de brigadeiros premium, bolos no pote e geladinhos gourmet
🍰 Método Como Ganhar Dinheiro com Fatias de Bolo
E muito mais!

Para aproveitar, faça o Pix de *R$ 5,00* na mesma chave celular:
💰 *Chave Pix (Celular):* 61982277206

Se preferir ficar apenas com as receitas que escolheu, basta digitar *"não quero"* ou *"só as receitas"* que já te peço os dados de acesso. O que você acha? 😊', 'assistant', 'auto');

INSERT INTO dispatch_logs (id, automation_id, phone, message_type, message_content, status, error_message, sent_at) 
VALUES ('8354a8aa-c458-4932-a15b-a0febeeec56a', '3805b688-0967-4e96-86da-6936c10c5d58', '5516991872580', 'text', '*Rita*, seu pagamento de *R$ 10,00* foi confirmado com sucesso! 🎉

E olha só, preparei um presente incrível para você: por apenas mais *R$ 5,00*, eu consigo liberar o seu upgrade para o *Kit Completo de Confeitaria*!

No kit completo você recebe:
📹 Vídeo aulas passo a passo com o ponto certo dos recheios
📚 Apostilas extras de brigadeiros premium, bolos no pote e geladinhos gourmet
🍰 Método Como Ganhar Dinheiro com Fatias de Bolo
E muito mais!

Para aproveitar, faça o Pix de *R$ 5,00* na mesma chave celular:
💰 *Chave Pix (Celular):* 61982277206

Se preferir ficar apenas com as receitas que escolheu, basta digitar *"não quero"* ou *"só as receitas"* que já te peço os dados de acesso. O que você acha? 😊', 'success', NULL, datetime('now'));

INSERT INTO dispatch_logs (id, automation_id, phone, message_type, message_content, status, error_message, sent_at) 
VALUES ('5460e0ff-3b74-4736-9ad2-044c32c0f257', '3805b688-0967-4e96-86da-6936c10c5d58', '5516991872580', 'pix_button', '[Botão PIX] Chave Celular: 61982277206 (R G FEITOSA 153DF)', 'success', NULL, datetime('now'));
