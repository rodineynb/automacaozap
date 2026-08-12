const { execSync } = require('child_process');

const webhookUrl = 'https://automacao-zap.projetobrlatam.workers.dev/api/webhook/recheios';
const phone = '5522998513392';

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendWebhookMessage(text) {
  const payload = {
    BaseUrl: "https://api-tbz.uazapi.com",
    EventType: "messages",
    chat: {
      phone: `+55 22 99851-3392`,
      name: "Rodiney",
      wa_chatid: `${phone}@s.whatsapp.net`
    },
    message: {
      fromMe: false,
      text: text,
      content: text,
      type: "chat",
      messageType: "conversation",
      senderName: "Rodiney",
      wasSentByApi: false
    }
  };

  console.log(`\n--- Simulating incoming message: "${text}" ---`);
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    console.log('Webhook Response Status:', res.status);
    const bodyText = await res.text();
    console.log('Webhook Response Body:', bodyText);
  } catch (err) {
    console.error('Error sending message:', err.message);
  }
}

function verifyDatabase() {
  console.log('\n--- Querying message history from database... ---');
  try {
    const res = execSync(`npx wrangler d1 execute whatsapp-platform --remote --command "SELECT role, content, created_at FROM messages WHERE conversation_id IN (SELECT cv.id FROM conversations cv JOIN contacts ct ON cv.contact_id = ct.id WHERE ct.phone = '${phone}') ORDER BY created_at ASC;"`, { encoding: 'utf8' });
    console.log(res);
  } catch (err) {
    console.error('Error querying database:', err.message);
  }
}

async function main() {
  // Step 1: Send "Oi" (First Contact)
  await sendWebhookMessage("Oi");
  
  // Wait for Sequence 1 to complete (S1 sends audio, sleeps 15s, then sends text)
  console.log('Waiting 28 seconds for Sequence 1 to finish...');
  await wait(28000);

  // Step 2: Send "Ok" (Acceptance)
  await sendWebhookMessage("Ok");

  // Wait for Sequence 2 to complete (S2 sends 5 PDFs, sleeps 4s, sends text 1, sleeps 1.5s, sends audio, sleeps 1.5s, sends Pix text, sleeps 1.5s, sends images, sleeps 1.5s, sends final text)
  console.log('Waiting 28 seconds for Sequence 2 to finish...');
  await wait(28000);

  // Step 3: Verify the database
  verifyDatabase();
}

main();
