async function run() {
  const webhookPayload = {
    evento: "compra_aprovada",
    cliente: {
      email: "anafernandes0576@gmail.com",
      nome: "Ana Luzia Conde Sant Fernandes",
      telefone: "5521985751756"
    },
    produto: {
      sku: "PROD-H3GQBU",
      nome: ""
    }
  };

  console.log('Sending webhook to register Ana Fernanda in the portal using native fetch...');
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
    console.log(`Webhook response: Status ${res.status}, Body: ${text}`);
  } catch (err) {
    console.error('Error sending webhook:', err);
  }
}

run();
