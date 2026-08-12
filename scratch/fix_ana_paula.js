const { exec } = require('child_process');

async function runSql(query) {
  return new Promise((resolve, reject) => {
    const cmd = `npx wrangler d1 execute whatsapp-platform --remote --command="${query.replace(/"/g, '\\"')}"`;
    console.log(`Running SQL command: ${cmd}`);
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        console.error(`SQL Error: ${err.message}`);
        console.error(stderr);
        reject(err);
      } else {
        console.log(stdout);
        resolve(stdout);
      }
    });
  });
}

async function run() {
  console.log("Step 1: Updating Ana Paula's lead record in D1 remote database...");
  const updateQuery = "UPDATE automation_leads SET produto_codigo = 'PROD-R1I27D' WHERE phone = '5521996066147' AND automation_id = '3805b688-0967-4e96-86da-6936c10c5d58'";
  await runSql(updateQuery);

  console.log("\nStep 2: Triggering n8n webhook with the correct SKU...");
  const webhookPayload = {
    evento: "compra_aprovada",
    cliente: {
      email: "taraamarela@hotmail.com",
      nome: "Ana Paula Thompson",
      telefone: "5521996066147"
    },
    produto: {
      sku: "PROD-R1I27D",
      nome: "Portal Oficial de Confeiteiras"
    }
  };

  try {
    const res = await fetch('https://app.promentor21.top/api/webhooks/entrada', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Token': 'dvKVhM5uAVqJQB0662avGK87jUhy9V3T'
      },
      body: JSON.stringify(webhookPayload)
    });
    const text = await res.text();
    console.log(`Webhook Response Status: ${res.status}`);
    console.log(`Webhook Response Body: ${text}`);
  } catch (err) {
    console.error('Error sending webhook:', err);
  }
}

run();
