// scratch/update_progress.js
import fs from 'fs';
import path from 'path';

const filePath = 'PROGRESS.md';

try {
  let content = fs.readFileSync(filePath, 'utf8');

  // Localizar a seção "Em andamento"
  const searchPattern = /## .*Em andamento[\s\S]*?(?=##|$)/i;
  
  const newSection = `## 🚀 Em andamento

Nenhum - Código da automação Recheios completo, otimizado e rodando em produção.

### [2026-05-28] - Timeout de LLM (20s) e Resolução do Lead Neuda

**Otimizações e Correções:**
- [x] **Timeout de LLM de 20s**: Desenvolvido o utilitário \`fetchWithTimeout\` usando \`AbortController\` com limite de 20 segundos em \`workers/services/llm-service.ts\` para todas as requisições externas de LLM (\`callGemini\`, \`callOpenAICompatible\`, \`callAnthropic\`, \`callLLMVision\`, \`callLLMTranscription\`), blindando a aplicação de fallbacks contra o hard timeout de 30s do Cloudflare Workers.
- [x] **Deduplicação de Conversões**: Validada a camada lógica que previne cliques e disparos duplicados de Purchase 1 (básico) e Purchase 2 (enriquecido com nome/e-mail) via logs D1.
- [x] **Remoção de Alucinações de Pagamento**: Garantido o filtro dinâmico de tools na automação Recheios (\`index.ts\`) onde a ferramenta \`pagamento\` é removida se \`payment_confirmed === 1\`.
- [x] **Resolução de Concorrência da Neuda (\`5511965118457\`)**:
  - Mensagem de texto de Julia enviada via UAZAPI liberando o Kit Completo vitalício gratuito e solicitando Nome e E-mail.
  - Atualizado o estado no D1 remote para \`downsell_offered = 1\` e \`phase = 'paid'\`.
  - Inserido registro manual na tabela \`messages\`.
- [x] **Deploy de Produção**: Deploy da nova versão efetuado com absoluto sucesso (Current Version ID: \`8674e0f6-4acc-4a1c-9c4b-3370d1283c89\`).

`;

  if (searchPattern.test(content)) {
    content = content.replace(searchPattern, newSection);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('PROGRESS.md atualizado com sucesso!');
  } else {
    console.warn('Seção "Em andamento" não encontrada. Adicionando ao final do arquivo...');
    fs.appendFileSync(filePath, '\n' + newSection, 'utf8');
  }
} catch (err) {
  console.error('Erro ao ler/escrever PROGRESS.md:', err);
}
