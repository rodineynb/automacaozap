async function testUazapiMedia() {
  const baseUrl = 'https://api-tbz.uazapi.com';
  const token = '2c8c464c-7d5f-438c-9d4e-473d1583e74d';
  const phone = '5522998513392'; // user's test phone

  console.log('Testando envio de Áudio via UAZAPI (send/media)...');
  try {
    const url = `${baseUrl}/send/media`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': token
      },
      body: JSON.stringify({
        number: phone,
        type: 'audio',
        file: 'https://dados.promentor21.top/Funil%20Recheios/audio2-v3.mp3',
        path: 'https://dados.promentor21.top/Funil%20Recheios/audio2-v3.mp3'
      })
    });

    console.log('Status da resposta (Áudio):', resp.status);
    const resText = await resp.text();
    console.log('Conteúdo retornado (Áudio):', resText);

  } catch (error) {
    console.error('Erro no envio de áudio:', error);
  }

  console.log('\nTestando envio de Documento (PDF) via UAZAPI (send/media)...');
  try {
    const url = `${baseUrl}/send/media`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': token
      },
      body: JSON.stringify({
        number: phone,
        type: 'document',
        file: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%201.%20Recheios%20Sem%20Fog%C3%A3o%20(50%20Receitas).pdf',
        path: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%201.%20Recheios%20Sem%20Fog%C3%A3o%20(50%20Receitas).pdf',
        docName: 'Apostila 1. Recheios Sem Fogão (50 Receitas).pdf'
      })
    });

    console.log('Status da resposta (PDF):', resp.status);
    const resImg = await resp.text();
    console.log('Conteúdo retornado (PDF):', resImg);
  } catch (error) {
    console.error('Erro no envio de PDF:', error);
  }
}

testUazapiMedia();
