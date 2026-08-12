// Script para testar download de mídia da UAZAPI e transcrição via Gemini 1.5 Flash
const uazapiBaseUrl = "https://api-tbz.uazapi.com";
const uazapiToken = "2c8c464c-7d5f-438c-9d4e-473d1583e74d";
const audioMediaId = "AC37803A447C7B0EA212F2215309A8FE"; // ID do áudio da Cátia Moore
const geminiApiKey = "AIzaSyDLFydAvoxMSBwglEl6o8A2w9w1eMwuTNI";

async function testDownload() {
  console.log("Iniciando download da mídia da UAZAPI...");
  const downloadUrl = `${uazapiBaseUrl}/message/download`;
  
  try {
    const resp = await fetch(downloadUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": uazapiToken
      },
      body: JSON.stringify({
        id: audioMediaId,
        return_base64: true,
        return_link: false
      })
    });

    console.log("Status de download da UAZAPI:", resp.status);
    const data = await resp.json();
    
    if (!resp.ok) {
      console.error("Erro na UAZAPI:", data);
      return;
    }

    console.log("Mimetype retornado:", data.mimetype || data.mimeType);
    const base64Data = data.base64Data || data.base64 || data.data || "";
    console.log("Tamanho do base64 retornado:", base64Data.length);

    // Tentar transcrever com Gemini 1.5 Flash
    console.log("Tentando transcrever o áudio com o Gemini 1.5 Flash...");
    const cleanMime = (data.mimetype || data.mimeType || 'audio/ogg').split(';')[0].trim();
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;

    const geminiBody = {
      contents: [
        {
          parts: [
            { text: "Transcreva o conteúdo deste áudio em texto. Retorne apenas a transcrição, sem comentários adicionais." },
            {
              inlineData: {
                mimeType: cleanMime,
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096
      }
    };

    const geminiResp = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody)
    });

    console.log("Status do Gemini 1.5 Flash:", geminiResp.status);
    const geminiData = await geminiResp.json();
    console.log("Resposta do Gemini 1.5 Flash:", JSON.stringify(geminiData, null, 2));

  } catch (error) {
    console.error("Erro geral no teste:", error);
  }
}

testDownload();
