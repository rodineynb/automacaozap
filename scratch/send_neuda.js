// scratch/send_neuda.js

async function run() {
  const phone = '5511965118457';
  const token = '2c8c464c-7d5f-438c-9d4e-473d1583e74d';
  const url = 'https://api-tbz.uazapi.com/send/text';
  
  const text = `Tudo bem, Neuda! O meu principal objetivo é te ajudar a crescer na confeitaria e faturar muito mais, a questão aqui não é só dinheiro. Por isso, de coração, eu vou te liberar todo o nosso **Kit Completo vitalício** de presente de qualquer forma! 💖🎁\n\nPara eu gerar o seu acesso, me manda por favor:\n1️⃣ Seu **Nome Completo**\n2️⃣ Seu melhor **E-mail**\n\nEu realizo a sua matrícula na mesma hora! 🎯`;

  console.log(`Enviando mensagem para UAZAPI (${phone})...`);

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': token
      },
      body: JSON.stringify({
        number: phone,
        text: text
      })
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error(`Erro da API UAZAPI (${resp.status}):`, err);
      process.exit(1);
    }

    const data = await resp.json();
    console.log('Mensagem enviada com sucesso! Resposta da API:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Exceção ao enviar mensagem:', error);
    process.exit(1);
  }
}

run();
