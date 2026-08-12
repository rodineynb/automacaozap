async function testTranscription() {
  const apiKey = 'AIzaSyDLFydAvoxMSBwglEl6o8A2w9w1eMwuTNI';
  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
  const url = `${endpoint}?key=${apiKey}`;

  console.log('Testando a API do Gemini com o endpoint de transcrição (gemini-2.5-flash)...');

  const body = {
    contents: [
      {
        parts: [
          { text: 'Transcreva o conteúdo deste áudio em texto. Retorne apenas a transcrição, sem comentários adicionais.' },
          {
            inlineData: {
              mimeType: 'audio/mp3',
              data: 'ZmFrZQ==', // "fake" base64 content
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
    },
  };

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    console.log('Status da resposta:', resp.status);
    const text = await resp.text();
    console.log('Conteúdo retornado:', text);
  } catch (error) {
    console.error('Erro na requisição:', error);
  }
}

testTranscription();
