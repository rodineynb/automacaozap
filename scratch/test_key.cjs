const apiKey = 'sk-3fb4c7ede98d4e3ba32bb3af0ac6b377';

async function testKey() {
  console.log('Testing DeepSeek API Key...');
  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Oi, responda apenas OK se receber.' }]
      })
    });
    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Response:', text);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testKey();
