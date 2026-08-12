const fs = require('fs');
const path = require('path');

const apiKey = "AIzaSyDLFydAvoxMSBwglEl6o8A2w9w1eMwuTNI";
const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const url = `${endpoint}?key=${apiKey}`;

const mediaFiles = [
  {
    name: "Audio 1 (Welcome / Oferta Inicial)",
    url: "https://dados.promentor21.top/Funil%20Recheios/audio1-v4.mp3",
    mimeType: "audio/mp3",
    prompt: "Transcreva o conteúdo deste áudio em texto em português do Brasil. Retorne apenas a transcrição, sem comentários adicionais."
  },
  {
    name: "Audio 2 (Delivery / Entrega dos PDFs)",
    url: "https://dados.promentor21.top/Funil%20Recheios/audio2-v3.mp3",
    mimeType: "audio/mp3",
    prompt: "Transcreva o conteúdo deste áudio em texto em português do Brasil. Retorne apenas a transcrição, sem comentários adicionais."
  },
  {
    name: "Video 2 (Vigia / Watchdog)",
    url: "https://dados.promentor21.top/Funil%20Recheios/video2.mp4",
    mimeType: "video/mp4",
    prompt: "Descreva o que acontece visualmente neste vídeo e transcreva qualquer fala ou áudio falado que exista nele. Retorne apenas a descrição e transcrição, sem comentários adicionais."
  },
  {
    name: "Video 3 (Incentivador / Ranger)",
    url: "https://dados.promentor21.top/Funil%20Recheios/video3.mp4",
    mimeType: "video/mp4",
    prompt: "Descreva o que acontece visualmente neste vídeo e transcreva qualquer fala ou áudio falado que exista nele. Retorne apenas a descrição e transcrição, sem comentários adicionais."
  }
];

async function downloadAndTranscribe() {
  for (const media of mediaFiles) {
    console.log(`\n=== PROCESSANDO: ${media.name} ===`);
    console.log(`Fazendo download de: ${media.url}...`);
    try {
      const response = await fetch(media.url);
      if (!response.ok) {
        throw new Error(`Erro ao baixar: ${response.statusText}`);
      }
      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      console.log(`Download concluído. Tamanho base64: ${base64.length} caracteres.`);

      console.log(`Enviando para transcrição no Gemini API...`);
      const body = {
        contents: [
          {
            parts: [
              { text: media.prompt },
              {
                inlineData: {
                  mimeType: media.mimeType,
                  data: base64
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048
        }
      };

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Erro na API do Gemini: ${errText}`);
      }

      const resJson = await resp.json();
      const text = resJson?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      console.log(`\n--- RESULTADO (${media.name}) ---`);
      console.log(text);
      console.log(`-----------------------------------`);

      // Salvar resultado em arquivo de texto na pasta scratch
      const safeName = media.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      fs.writeFileSync(path.join(__dirname, `${safeName}.txt`), text, 'utf8');
      console.log(`Salvo em: ${safeName}.txt`);
    } catch (err) {
      console.error(`Falha no processamento de ${media.name}:`, err.message);
    }
  }
}

downloadAndTranscribe();
