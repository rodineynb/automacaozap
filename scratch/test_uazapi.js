async function testUazapi() {
  const baseUrl = 'https://api-tbz.uazapi.com';
  const token = '2c8c464c-7d5f-438c-9d4e-473d1583e74d';
  const phone = '5522998513392'; // user's test phone

  console.log('Testando envio de texto simples via UAZAPI...');

  try {
    const url = `${baseUrl}/send/text`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': token
      },
      body: JSON.stringify({
        number: phone,
        text: 'Teste de UAZAPI a partir do script de diagnóstico.'
      })
    });

    console.log('Status da resposta (Texto):', resp.status);
    const resText = await resp.text();
    console.log('Conteúdo retornado (Texto):', resText);

  } catch (error) {
    console.error('Erro no envio de texto:', error);
  }

  console.log('\nTestando envio de imagem via UAZAPI (send/media)...');
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
        type: 'image',
        file: 'https://dados.promentor21.top/Funil%20Recheios/img-bonus.jpeg',
        path: 'https://dados.promentor21.top/Funil%20Recheios/img-bonus.jpeg',
        text: 'Legenda do teste de imagem UAZAPI'
      })
    });

    console.log('Status da resposta (Imagem):', resp.status);
    const resImg = await resp.text();
    console.log('Conteúdo retornado (Imagem):', resImg);
  } catch (error) {
    console.error('Erro no envio de imagem:', error);
  }
}

testUazapi();
