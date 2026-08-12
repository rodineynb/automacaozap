import { execSync } from 'child_process';

const leadPhone = '5521980650019';
const leadName = 'Lineida P. Santos';
const leadEmail = 'lineida.santos@gmail.com'; // Placeholder/default email
const leadCode = '8141';
const conversationId = '1b35372b-35ad-46a1-a987-918f38467d65';
const uazapiBaseUrl = 'https://api-tbz.uazapi.com';
const uazapiToken = '2c8c464c-7d5f-438c-9d4e-473d1583e74d';

console.log('🏁 Iniciando liberação manual de acesso para Lineida...');

// 1. Atualizar tabelas no banco de dados D1 via Wrangler CLI
try {
  console.log('🔄 Atualizando D1 Database...');
  
  // automation_leads
  const sqlLeads = `UPDATE automation_leads SET email = '${leadEmail}', recebeu_acesso = 1, produto_codigo = 'PROD-H3GQBU', updated_at = datetime('now') WHERE phone = '${leadPhone}';`;
  // conversation_state
  const sqlState = `UPDATE conversation_state SET client_name = '${leadName}', client_email = '${leadEmail}', access_delivered = 1, phase = 'completed', last_tool_called = 'sistema', updated_at = datetime('now') WHERE conversation_id = '${conversationId}';`;
  // conversations
  const sqlConv = `UPDATE conversations SET status = 'finalizado_com_sucesso', updated_at = datetime('now') WHERE id = '${conversationId}';`;

  execSync(`npx wrangler d1 execute whatsapp-platform --remote --command "${sqlLeads} ${sqlState} ${sqlConv}"`, { stdio: 'inherit' });
  console.log('✅ Banco de dados D1 atualizado com sucesso!');
} catch (dbErr) {
  console.error('❌ Erro ao atualizar banco de dados D1:', dbErr);
  process.exit(1);
}

// 2. Chamar o Webhook de Matrícula do N8N
const webhookPayload = {
  evento: "compra_aprovada",
  cliente: {
    email: leadEmail,
    nome: leadName,
    telefone: leadPhone
  },
  produto: {
    sku: "PROD-H3GQBU",
    nome: "Recheios a Prova de Fogo - Kit Completo"
  }
};

console.log('🔄 Enviando webhook para N8N...');
fetch('https://app.promentor21.top/api/webhooks/entrada', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Webhook-Token': 'dvKVhM5uAVqJQB0662avGK87jUhy9V3T'
  },
  body: JSON.stringify(webhookPayload)
})
.then(res => res.text().then(text => {
  console.log(`✅ Webhook N8N Enviado! Status: ${res.status}, Resposta: ${text}`);
}))
.catch(err => {
  console.error('❌ Erro ao chamar Webhook N8N:', err);
});

// 3. Enviar mensagem WhatsApp com o link via UAZAPI
const deliveryText = `*Lineida*, acabei de liberar o seu acesso no sistema! 🎉🗝️

⚠️ *CLIQUE AQUI PARA ACESSAR:* 👉 https://app.promentor21.top/login?id=${leadCode}

Na hora do login, basta digitar o e-mail cadastrado: *${leadEmail}*

🎥 *Assista a esse vídeo explicativo*: ele ensina direitinho passo a passo como entrar no sistema e encontrar todas as suas apostilas e bônus:
👉 https://www.youtube.com/shorts/5xd3IRlA-GM`;

console.log('🔄 Enviando mensagem de acesso no WhatsApp via UAZAPI...');
fetch(`${uazapiBaseUrl}/send/text`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'token': uazapiToken
  },
  body: JSON.stringify({
    number: leadPhone,
    text: deliveryText
  })
})
.then(res => res.json().then(data => {
  console.log('✅ Mensagem enviada via UAZAPI!', JSON.stringify(data));
  
  // Salvar a mensagem no banco de dados D1 messages
  const msgId = data.messageId || data.data?.messageId || data.id || 'manual_' + Date.now();
  const sqlMsg = `INSERT INTO messages (id, conversation_id, content, role) VALUES ('${msgId}', '${conversationId}', '${deliveryText.replace(/'/g, "''")}', 'assistant');`;
  
  execSync(`npx wrangler d1 execute whatsapp-platform --remote --command "${sqlMsg}"`, { stdio: 'inherit' });
  console.log('✅ Mensagem registrada no D1.');
  console.log('🎉 PROCESSO CONCLUÍDO COM SUCESSO!');
}))
.catch(err => {
  console.error('❌ Erro ao enviar mensagem UAZAPI:', err);
});
