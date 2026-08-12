// Script para testar a validade da chave de transcrição
const apiKey = "AIzaSyDLFydAvoxMSBwglEl6o8A2w9w1eMwuTNI";
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

const body = {
  contents: [
    {
      parts: [
        { text: "Diga 'Olá Mundo' para testar se esta chave de API está ativa e funcionando perfeitamente." }
      ]
    }
  ]
};

async function test() {
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    console.log("Status:", resp.status);
    const data = await resp.json();
    console.log("Resposta:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Erro:", error);
  }
}

test();
