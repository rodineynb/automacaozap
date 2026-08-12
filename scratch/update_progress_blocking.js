// scratch/update_progress_blocking.js
import fs from 'fs';

const filePath = 'PROGRESS.md';

try {
  let content = fs.readFileSync(filePath, 'utf8');

  const insertIndex = content.indexOf('### [2026-05-28]');
  if (insertIndex !== -1) {
    const textToInsert = `### [2026-05-28] - Estratégia Híbrida de Verificação de Bloqueios (Fase 2)

**Detecção de Bloqueios e Proteção de Chips:**
- [x] **Migration 0012**: Adicionada a coluna \`had_profile_pic\` na tabela \`contacts\` para rastrear leads com imagem inicial.
- [x] **Detecção de Foto no Cadastro**: Integrado em \`automation-engine.ts\` a busca de foto inicial na chegada do lead. Se presente, marca como \`had_profile_pic = 1\`.
- [x] **Validador de Status (getLatestMessageStatus)**: Adicionado em \`whatsapp-service.ts\` a busca do status real (ACK) da última mensagem enviada no chat via UAZAPI.
- [x] **Validador de Foto (getProfilePicture)**: Criado serviço que consulta de forma isolada a imagem de perfil na UAZAPI.
- [x] **Motor Híbrido nos Follow-ups**: Acoplado filtro em \`followups.ts\` antes de todo envio:
  - *Se tinha foto*: Se a imagem sumir ➔ bloqueio confirmado.
  - *Se não tinha foto*: Se a última mensagem enviada pelo assistente há mais de 2h continuar com 1 tracinho (ACK = 1) ➔ bloqueio presumido.
  - *Ação de Bloqueio*: IA desativada (\`ai_active = 0\`), conversa arquivada, log impresso na conversa e todos os follow-ups agendados cancelados.

`;
    content = content.slice(0, insertIndex) + textToInsert + content.slice(insertIndex);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('PROGRESS.md atualizado com sucesso para detecção de bloqueios!');
  } else {
    console.warn('Alvo não encontrado.');
  }
} catch (err) {
  console.error('Erro:', err);
}
