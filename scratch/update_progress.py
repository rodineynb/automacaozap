import os
import sys

# Set encoding for console output on Windows
if sys.version_info >= (3, 7):
    sys.stdout.reconfigure(encoding='utf-8')

root_dir = "c:/Users/Note/Desktop/Antigravity/AutomacaoZAP"
progress_path = os.path.join(root_dir, "PROGRESS.md")

entry = """

### [2026-06-10] — Visualização de Mídias no Chat (R2) e Retentativas Resilientes de LLM (Concluído)

- [x] **Upload de Mídias Recebidas para o R2**:
  - Atualizadas as funções `processImageWithFallback` e `processAudioWithFallback` em [index.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/index.ts) para realizar o download de mensagens WhatsApp, convertê-las para buffers binários e salvá-las no bucket R2 (`env.STORAGE`) com chaves estruturadas por telefone e UUID.
  - As mensagens no banco de dados D1 são salvas usando o formato de tags estruturadas contendo o link da mídia e o texto extraído (OCR/Transcrição).
- [x] **Renderização Nativa no Chat Central**:
  - Modificado [chat.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/chat.tsx) para processar as tags estruturadas.
  - Implementado suporte em `renderMessageMedia` para identificar as URLs do R2 e exibir um player de áudio nativo para áudios recebidos ou o elemento `<img>` com visualização ampliada ao clicar para imagens.
  - Atualizado `cleanMediaMessageText` para limpar as tags de mídia cruas, deixando apenas a transcrição do áudio ou OCR de imagem formatada e organizada.
- [x] **Retentativa Resiliente de LLM com Early Timeout**:
  - Modificada a função `callLLM` em [llm-service.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/services/llm-service.ts) para tentar chamar o modelo ativo com um limite padrão de 8 segundos por tentativa.
  - Adicionado um loop de até 2 tentativas para cada modelo de LLM configurado. Se o modelo falhar (como timeout ou erro de servidor) na primeira tentativa, o sistema aborta e executa imediatamente uma segunda chamada antes de recorrer ao fallback para a próxima LLM da lista de prioridades.
- [x] **Ciclo de Vida de 30 Dias (Configuração de Governança)**:
  - Documentada a instrução de expiração automática de 30 dias no painel do R2 para expirar a chave `media/incoming/` para evitar o acúmulo de arquivos temporários e manter o custo do bucket em $0.00.
- [x] **Homologação e Deploy**:
  - Verificação de tipos com `npm run typecheck` concluída com sucesso.
  - Compilação SSR com Vite e deploy do Worker no Cloudflare bem-sucedidos (`npm run deploy`).
"""

with open(progress_path, "a", encoding="utf-8") as f:
    f.write(entry)

print("PROGRESS.md updated successfully.")
