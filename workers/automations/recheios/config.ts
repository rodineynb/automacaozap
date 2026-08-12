/**
 * Configurações da automação "Recheios à Prova de Fogo"
 * Dados do produto, URLs de mídias e constantes
 */

// ============================================================
// DADOS DO PRODUTO
// ============================================================

export const PRODUCT = {
  name: 'Recheios à Prova de Fogo',
  slug: 'recheios',

  // Preços
  price: 10.00,
  priceKitMassas: 15.00,
  priceKitCompleto: 25.00,
  priceUpsell: 5.00,       // oferta após pagamento: +R$5 para kit completo
  priceDownsell: 7.50,     // se recusar upsell
  priceKitOffer1290: 12.90, // oferta de kit completo feita por outro agente
  priceKitOffer1450: 14.50, // oferta de kit completo feita pela Julia

  // PIX
  pixKey: '61982277206',
  pixRecipient: 'R G FEITOSA 153DF',
  pixBank: 'Banco Cora',

  // Códigos de produto internos (nunca revelar ao cliente)
  productCodes: {
    principal: 'PROD-R1I27D',
    upsell: 'PROD-H3GQBU',
  },

  // Links
  supportVideoUrl: 'https://www.youtube.com/shorts/5xd3IRlA-GM',
  emergencyAccessUrl: 'http://recheios.promentor21.top/bonus',
} as const;

// ============================================================
// PACOTES DISPONÍVEIS
// ============================================================

export const PACKAGES = [
  {
    id: 'basico',
    name: '200 Receitas de Recheios',
    price: 10.00,
    code: 'PROD-R1I27D',
    deliverBeforePayment: true,
  },
  {
    id: 'massas',
    name: '200 Receitas de Recheios + Massas Especiais',
    price: 15.00,
    code: 'PROD-R1I27D',
    deliverBeforePayment: true,
  },
  {
    id: 'completo',
    name: 'Kit Completo de Confeitaria',
    price: 25.00,
    code: 'PROD-R1I27D',
    deliverBeforePayment: false,
  },
] as const;

// ============================================================
// URLs DE MÍDIAS ESTÁTICAS
// (Hospedadas no Cloudflare R2 / CDN)
// O usuário deve atualizar essas URLs com os links reais
// ============================================================

export const MEDIA_URLS = {
  // Sequência 1 - Oferta inicial
  seq1: {
    textos: [] as string[],
    audio: 'https://dados.promentor21.top/Funil%20Recheios/audio1-v4.mp3',
    imagem: 'https://dados.promentor21.top/Funil%20Recheios/img_seq1.png',
  },

  // Sequência 2 - Entrega dos PDFs
  seq2: {
    pdfs: [
      { name: 'Apostila 5. Recheios Sem Fogão (101 Receitas).pdf', url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%205.%20Recheios%20Sem%20Fog%C3%A3o%20(101%20Receitas).pdf' },
      { name: 'Apostila 1. Recheios Sem Fogão (50 Receitas).pdf', url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%201.%20Recheios%20Sem%20Fog%C3%A3o%20(50%20Receitas).pdf' },
      { name: 'Apostila 3. Recheios Sem Fogão (20 Receitas).pdf', url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%203.%20Recheios%20Sem%20Fog%C3%A3o%20(20%20Receitas).pdf' },
      { name: 'Apostila 4. Recheios Sem Fogão (23 Receitas).pdf', url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%204.%20Recheios%20Sem%20Fog%C3%A3o%20(23%20Receitas).pdf' },
      { name: 'Apostila 2. Recheios Sem Fogão (34 Receitas).pdf', url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%202.%20Recheios%20Sem%20Fog%C3%A3o%20(34%20Receitas).pdf' },
    ],
    audio: 'https://dados.promentor21.top/Funil%20Recheios/audio2-v3.mp3',
    imagens: [
      'https://dados.promentor21.top/Funil%20Recheios/img2.jpeg',
      'https://dados.promentor21.top/Funil%20Recheios/img-bonus.jpeg',
    ],
  },

  // Sequência 3 - Vídeos de suporte
  seq3: {
    video: 'https://dados.promentor21.top/Funil%20Recheios/video2.mp4',
    video2: 'https://dados.promentor21.top/Funil%20Recheios/video3.mp4',
  },

  // Upsell
  upsell: {
    imagem: 'https://dados.promentor21.top/Funil%20Recheios/img_upssel.png',
  },
} as const;

// ============================================================
// DELAYS ENTRE MENSAGENS (em ms)
// ============================================================

export const DELAYS = {
  /** Delay entre partes de uma mensagem longa */
  betweenParts: { min: 2000, max: 4000 },

  /** Delay entre envios na sequência 1 */
  seq1Between: { min: 1000, max: 2000 },

  /** Delay entre PDFs na sequência 2 */
  seq2BetweenPdfs: { min: 600, max: 1000 },

  /** Delay entre textos na sequência 2 */
  seq2BetweenTexts: { min: 800, max: 1500 },

  /** Delay antes do follow-up inicial (20 min) */
  followupInicial20min: 20 * 60 * 1000,

  /** Delay antes do 2o follow-up (30 min após o 1o) */
  followupInicial30min: 30 * 60 * 1000,

  /** Delay para upsell (10 min após pagamento) */
  upsellDelay: 10 * 60 * 1000,

  /** Delay fila follow-up: 10h */
  followupFila10h: 10 * 60 * 60 * 1000,

  /** Delay fila follow-up: 24h */
  followupFila24h: 24 * 60 * 60 * 1000,

  /** Delay fila follow-up: 1 dia extra */
  followupFila1d: 24 * 60 * 60 * 1000,

  /** Delay para seq3 (1h após seq2) */
  seq3Delay: 60 * 60 * 1000,

  /** Debounce window (15 segundos) */
  debounceWindow: 15 * 1000,
} as const;

// ============================================================
// TEXTOS FIXOS DAS SEQUÊNCIAS
// (Mensagens que não precisam de LLM)
// ============================================================

export const TEXTS = {
  seq1: {
    // Mensagem de apresentação (1ª mensagem do fluxo SEQ1)
    apresentacao: (nome: string) =>
      `Oi, ${nome}! Tudo bem? 😊\nAqui é a Julia! Vi que você se interessou pelas nossas receitas de recheios que não precisam de fogão! 🔥`,

    // Mensagem com a oferta
    oferta: (nome: string) =>
      `*${nome}*, deixa eu te contar rapidinho:\n\nSão *200 receitas de recheios* que:\n✅ Não precisam de fogão (economia de gás!)\n✅ Não derretem nem em dia de 40°C\n✅ Ficam prontos em 10 a 12 minutinhos\n✅ Servem pra bolo, bolo de pote, trufa e ovo de Páscoa\n\nE o melhor: *eu te envio PRIMEIRO e você paga DEPOIS*. Sem risco nenhum pra você! 🎁\n\nTudo isso por apenas *R$ 10,00*! 💰\n\nPosso te enviar agora?`,

    // Mensagem com os pacotes
    pacotes: `🔥 *Opção 1 — R$ 10,00*\n+ 200 Receitas de Recheios\n\n🔥 *Opção 2 — R$ 15,00*\n+ 200 Receitas de Recheios\n+ Massas Especiais para todos os doces\n\n👑 *Opção 3 — R$ 25,00 (KIT COMPLETO)*\n+ 200 Receitas de Recheios\n+ Vídeo Aulas Passo a Passo\n+ Apostila Receitas de Massas\n+ Método Como Ganhar Dinheiro com Fatias de Bolo\n+ Bolos Caseiros Lucrativos\n+ Receitas Gourmet de Bolo no Pote\n+ Recheios Magníficos\n+ Livro Digital 200+ Receitas Zero Açúcar e Zero Glúten\n+ Geladinhos Gourmet\n+ Pipocas Gourmet Lucrativas\n+ Copos da Felicidade Lucrativos\n+ Tortinhas Doces no Potinho\n+ Guia Premium de Brigadeiros sem Fogo`,
  },

  seq2: {
    // Mensagem antes dos PDFs
    antes: (nome: string) =>
      `*${nome}*, tá aqui suas receitas! 📚✨\nVou te enviar tudinho agora, são 5 apostilas cheias de receitas maravilhosas! 🎁`,

    // Mensagem após os PDFs
    depois: `Pronto! Tá tudo aí! 😍\nSão mais de 200 receitas de recheios que não precisam de fogão!\n\nQuando puder, me manda o pix:\n💰 *PIX: 61982277206*\n\nE qualquer dúvida pode me chamar aqui! 🤗`,

    // Mensagem com PIX após envio
    pix: `Ah, e os pacotes disponíveis são:\n\n🔥 R$ 10,00 — Receitas de Recheios\n🔥 R$ 15,00 — Recheios + Massas\n👑 R$ 25,00 — Kit Completo\n\n💰 *Chave PIX:* 61982277206\n*Destinatário:* R G FEITOSA 153DF\n*Banco:* Banco Cora`,
  },

  // Oferta de upsell R$5
  upsellOffer: (nome: string) =>
    `*${nome}*, tenho uma surpresa especial pra você! 🎁\n\nPor apenas mais *R$ 5,00* você leva o *Kit Completo* que normalmente custa R$ 25,00!\n\nNo kit você recebe:\n📹 Vídeo aulas passo a passo\n📚 Muito mais receitas\n🍫 Brigadeiros sem fogo\n🍰 Bolos no pote\n🧊 Geladinhos gourmet\nE muito mais!\n\nÉ só fazer um pix de R$ 5,00 para o mesmo número:\n💰 *PIX: 61982277206*\n\nO que você acha? 😊`,

  // Entrega do link de acesso
  acessoLink: (leadId: string) =>
    `Aqui está o seu acesso, é só clicar no link abaixo! 🗝️\n⚠️ *CLIQUE AQUI* 👉 https://app.promentor21.top/login?id=${leadId}\n\nAntes de acessar, assista esse vídeo curtinho — ele explica direitinho onde estão todos os seus produtos! 🎥\n👉 https://www.youtube.com/shorts/5xd3IRlA-GM`,
} as const;
