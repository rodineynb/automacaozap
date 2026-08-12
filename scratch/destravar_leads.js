import { execSync } from 'child_process';

const uazapiBaseUrl = 'https://api-tbz.uazapi.com';
const uazapiToken = '2c8c464c-7d5f-438c-9d4e-473d1583e74d';

// Função para dar sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Função genérica de envio de texto
async function sendText(phone, text) {
  console.log(`[UAZAPI] Enviando texto para ${phone}...`);
  const res = await fetch(`${uazapiBaseUrl}/send/text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'token': uazapiToken
    },
    body: JSON.stringify({ number: phone, text })
  });
  if (!res.ok) {
    throw new Error(`Erro ao enviar texto UAZAPI: ${res.statusText}`);
  }
  const data = await res.json();
  console.log(`[UAZAPI] Texto enviado com sucesso! Msg ID: ${data.messageId || data.id}`);
  return data.messageId || data.id || 'manual_' + Date.now();
}

// Função genérica de envio de documento
async function sendDocument(phone, docUrl, fileName) {
  console.log(`[UAZAPI] Enviando documento '${fileName}' para ${phone}...`);
  const res = await fetch(`${uazapiBaseUrl}/send/media`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'token': uazapiToken
    },
    body: JSON.stringify({
      number: phone,
      type: 'document',
      file: docUrl,
      path: docUrl,
      docName: fileName
    })
  });
  if (!res.ok) {
    throw new Error(`Erro ao enviar documento UAZAPI: ${res.statusText}`);
  }
  const data = await res.json();
  console.log(`[UAZAPI] Documento '${fileName}' enviado com sucesso!`);
  return data.messageId || data.id || 'manual_doc_' + Date.now();
}

// Função para registrar mensagem no D1
function registerMessageInD1(msgId, conversationId, content, role) {
  const sanitizedContent = content.replace(/'/g, "''");
  const sql = `INSERT INTO messages (id, conversation_id, content, role) VALUES ('${msgId}', '${conversationId}', '${sanitizedContent}', '${role}');`;
  console.log(`[D1] Registrando mensagem no banco para conv ${conversationId}...`);
  execSync(`npx wrangler d1 execute whatsapp-platform --remote --command "${sql}"`, { stdio: 'inherit' });
}

// Execução principal
async function run() {
  console.log('🏁 Iniciando processo de destravamento manual dos leads...');

  // -------------------------------------------------------------
  // 1. LEAD 2024 (Suelen Cristina - Confirmar Pix R$ 12,90 e pedir Nome/Email)
  // -------------------------------------------------------------
  const phone2024 = '554198302024';
  const conv2024 = '31c68761-06ef-4fae-aa5e-d1aa11aff10d';
  
  const text2024 = `Oi! O seu Pix de R$ 12,90 foi confirmado com sucesso! 🎉🍰

Como você garantiu o *Kit Completo vitalício*, preciso apenas do seu *Nome Completo* e *E-mail* para gerar os seus dados de acesso no sistema! 😊

Me escreve aqui embaixo por favor para eu fazer o seu cadastro de aluna na mesma hora! 👇`;

  try {
    console.log(`\n--- Processando Lead 2024 (${phone2024}) ---`);
    // Reabrir a conversa caso esteja finalizada
    console.log('[D1] Reabrindo conversa do Lead 2024...');
    execSync(`npx wrangler d1 execute whatsapp-platform --remote --command "UPDATE conversations SET status = 'open', updated_at = datetime('now') WHERE id = '${conv2024}';"`, { stdio: 'inherit' });

    // Enviar mensagem
    const msgId = await sendText(phone2024, text2024);
    
    // Registrar no D1
    registerMessageInD1(msgId, conv2024, text2024, 'assistant');
    console.log('✅ Lead 2024 destravado com sucesso!');
  } catch (err) {
    console.error(`❌ Erro no processamento do Lead 2024:`, err);
  }

  // -------------------------------------------------------------
  // 2. LEAD 2584 (Ronivalda - Reenviar PDFs e mensagem)
  // -------------------------------------------------------------
  const phone2584 = '554399542584';
  const conv2584 = 'd6202510-dd7f-408b-aa56-6c7bcbc0e2f7';
  
  const introText2584 = `Oi Ronivalda! Me desculpa, às vezes o sinal do WhatsApp falha e as apostilas não carregam direito. Estou reenviando elas aqui embaixo pra você! 🥰👇`;
  
  const pdfs = [
    { url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%205.%20Recheios%20Sem%20Fog%C3%A3o%20(101%20Receitas).pdf', name: 'Apostila 5. Recheios Sem Fogão (101 Receitas).pdf' },
    { url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%201.%20Recheios%20Sem%20Fog%C3%A3o%20(50%20Receitas).pdf', name: 'Apostila 1. Recheios Sem Fogão (50 Receitas).pdf' },
    { url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%203.%20Recheios%20Sem%20Fog%C3%A3o%20(20%20Receitas).pdf', name: 'Apostila 3. Recheios Sem Fogão (20 Receitas).pdf' },
    { url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%204.%20Recheios%20Sem%20Fog%C3%A3o%20(23%20Receitas).pdf', name: 'Apostila 4. Recheios Sem Fogão (23 Receitas).pdf' },
    { url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%202.%20Recheios%20Sem%20Fog%C3%A3o%20(34%20Receitas).pdf', name: 'Apostila 2. Recheios Sem Fogão (34 Receitas).pdf' }
  ];

  const finalText2584 = `Depois que você conseguir baixar e dar uma olhadinha nas receitas, se gostar e fizer sentido, você pode fazer o Pix de R$ 10,00 ou garantir o nosso Kit Completo gourmet por apenas R$ 25,00! 😉

Me avisa se conseguiu abrir agora! Qualquer dúvida estou aqui para te ajudar! 💕`;

  try {
    console.log(`\n--- Processando Lead 2584 (${phone2584}) ---`);
    // Reabrir a conversa caso esteja finalizada
    console.log('[D1] Reabrindo conversa do Lead 2584...');
    execSync(`npx wrangler d1 execute whatsapp-platform --remote --command "UPDATE conversations SET status = 'open', updated_at = datetime('now') WHERE id = '${conv2584}';"`, { stdio: 'inherit' });

    // Enviar mensagem de introdução
    const introMsgId = await sendText(phone2584, introText2584);
    registerMessageInD1(introMsgId, conv2584, introText2584, 'assistant');
    await sleep(2000);

    // Enviar PDFs
    for (const pdf of pdfs) {
      const docMsgId = await sendDocument(phone2584, pdf.url, pdf.name);
      registerMessageInD1(docMsgId, conv2584, `[PDF de receita enviado: ${pdf.name}]`, 'assistant');
      await sleep(1500); // Respiro de 1.5s entre os PDFs
    }

    // Enviar mensagem final
    const finalMsgId = await sendText(phone2584, finalText2584);
    registerMessageInD1(finalMsgId, conv2584, finalText2584, 'assistant');

    console.log('✅ Lead 2584 destravado e respondido com sucesso!');
  } catch (err) {
    console.error(`❌ Erro no processamento do Lead 2584:`, err);
  }

  console.log('\n🎉 FIM DO PROCESSO DE DESTRAVAMENTO MANUAL!');
}

run();
