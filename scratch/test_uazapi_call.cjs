// Native fetch is available in Node.js 18+

async function run() {
  const url = 'https://api-tbz.uazapi.com/send/media';
  const token = '2c8c464c-7d5f-438c-9d4e-473d1583e74d';
  
  // Use a dummy or real phone number to test the API response structure
  const body = {
    number: '5522998513392', // standard format
    type: 'audio',
    file: 'https://dados.promentor21.top/Funil%20Recheios/audio1-v4.mp3'
  };

  console.log('Sending request to UAZAPI send/media for audio...');
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': token
      },
      body: JSON.stringify(body)
    });

    console.log('Response Status:', resp.status);
    const text = await resp.text();
    console.log('Response Text:', text);
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

run();
