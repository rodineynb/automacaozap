async function testWebhookSeq2() {
  const baseUrl = 'https://zapgo.promentor21.top';
  // const baseUrl = 'https://automacao-zap.projetobrlatam.workers.dev';
  
  const payload = {
    phone: '5522998513392',
    automationId: '3805b688-0967-4e96-86da-6936c10c5d58',
    conversationId: 'd3569fad-109f-4eef-814a-511973220f00',
    whatsappApiId: 'ee953336-7113-405b-95cf-825474587786',
    firstName: 'Rodiney',
    step: 0
  };

  console.log(`Sending POST to ${baseUrl}/api/webhook/seq2-step...`);
  try {
    const resp = await fetch(`${baseUrl}/api/webhook/seq2-step`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    console.log('Status:', resp.status, resp.statusText);
    const text = await resp.text();
    console.log('Response body:', text);
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

testWebhookSeq2();
