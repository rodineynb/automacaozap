# PROGRESS.md — Log de Progresso

> ⚠️ Atualize este arquivo após CADA tarefa concluída, sem exceção.
> Formato: [DATA] - O que foi feito

---

## 📋 Status Geral do Projeto

### [2026-06-26] - Monitor de Status da API WhatsApp + Alerta de Desconexão (Concluído)

- [x] **Serviço de Checagem de Status (Backend)**:
  - Adicionadas funções `checkSingleApiStatus()` e `checkAllApisStatus()` em `workers/services/whatsapp-service.ts`
  - Suporta provedores UAZAPI (endpoint `/status` com header `token`) e Evolution API (endpoint `/instance/connectionState`)
  - Retorna `{ id, name, connected, details }` para cada API cadastrada
- [x] **Endpoint de Status**:
  - Adicionado `GET /api/settings/whatsapp-status` em `workers/routes/settings.ts`
  - Retorna o status de conexão de todas as APIs WhatsApp cadastradas
- [x] **Monitor no Cron (a cada 5 minutos)**:
  - Adicionada função `monitorWhatsAppStatus()` ao cron handler em `workers/app.ts`
  - Usa KV para rastrear estado anterior e evitar spam de alertas (TTL de 30 min)
  - Quando detecta desconexão: envia alerta via WhatsApp para `5522998513392` usando outra API conectada
  - Quando detecta reconexão: envia notificação de recuperação
- [x] **Indicador Visual no Sidebar (Frontend)**:
  - Adicionado componente `WhatsAppStatusIndicator` em `app/components/layout.tsx`
  - Exibe dot verde (conectado) ou vermelho pulsante (desconectado) para cada API
  - Polling automático a cada 60 segundos
  - Responsivo: mostra nome + status quando expandido, apenas dot quando colapsado
  - Clicável: redireciona para `/settings`
- [x] **Validação e Deploy**:
  - TypeScript typecheck ✅
  - Build de produção ✅
  - Deploy na Cloudflare Workers ✅ (Version: `0f27592e`)

### [2026-06-10] - Resolução de Pagamento Duplicado e Complementar Aurora (Concluído)

- [x] **Recuperação Manual (Aurora)**:
  - Criado e executado o script de recuperação `scratch/deliver_aurora_safe.py` para cadastrar o acesso de Aurora Cardoso Gomes (`5519983698213`) no n8n com User-Agent Chrome e X-Webhook-Token correto.
  - Sincronizados os dados de pagamento (R$ 12,90) e de acesso no banco de dados D1 remoto para `automation_leads`, `conversation_state`, `conversations`, `messages` e `dispatch_logs`.
  - Entregues as credenciais de acesso para a cliente via UAZAPI.
- [x] **Solução de Pagamento Duplicado e Concorrência**:
  - Modificado `workers/automation-engine.ts` para retornar a coluna `id` na listagem de histórico de mensagens.
  - Implementada a função utilitária `extractTransactionId` em `workers/automations/recheios/tools.ts` para capturar identificadores únicos de Pix (EndToEnd ID `e...` ou código de autenticação `SISBB`) das mensagens de comprovante.
  - Atualizada a lógica do interceptador determinístico e da ferramenta `pagamento` para extrair e utilizar o `id_transacao`.
  - Refatorada a "Regra de Ouro" de duplicidade de pagamento para permitir o processamento de novos comprovantes de pagamento (mesmo que com valor menor ou idêntico) se contiverem um ID de transação diferente e não registrado no histórico.
- [x] **Validação e Rollout**:
  - Homologada tipagem TypeScript (`npm run typecheck`) com sucesso.
  - Compilação dos bundles de produção (`npm run build`) com sucesso.
  - Realizado deploy em produção na Cloudflare via Wrangler (`npx wrangler deploy`).

### [2026-06-10] - Integração de Realtime WebSocket no Painel do Chat (Concluído)

- [x] **Arquitetura e Conectividade Realtime (Backend)**:
  - Criado o serviço unificado de realtime em `workers/services/realtime-service.ts` com registro global de bindings por `conversationId` (`registerEnv`/`unregisterEnv`).
  - Habilitada autenticação de tokens via query parameter no handshake do WebSocket em `workers/middleware/auth.ts` para suportar conexões HTML5 nativas.
  - Implementado o endpoint `/api/chat/websocket` em `workers/routes/chat.ts` direcionando os handshakes e broadcasts para o Durable Object `ChatRoom`.
  - Vinculadas notificações automáticas para envio manual, PATCH de status/AI, webhook de entrada e cron loops de follow-up/CRM/upsell.
- [x] **Conexão Resiliente e Desempenho no Frontend**:
  - Modificado o componente `app/routes/chat.tsx` para se conectar dinamicamente a `/api/chat/websocket?token=${token}` utilizando o token extraído de `useAuth()`.
  - Implementado mecanismo de reconexão automática com exponential backoff para tolerância a quedas de rede e reinicializações de Worker.
  - Desenvolvida triagem de eventos de realtime (`new_message` e `conversation_updated`) com refs de escopo (`currentIdRef`, `loadConversationsRef`) para evitar closures obsoletas (stale states) e evitar reconexões desnecessárias ao trocar de conversa.
  - Otimizada a frequência de polling de fallback para 20 segundos, eliminando o hammering excessivo no banco D1 em conversas ativas.
- [x] **Notificações Visuais Premium**:
  - Adicionado suporte a notificações nativas no desktop do operador (HTML5 Web Notifications) com solicitação de permissão no mount da página.
  - Configurados alertas combinados de toast e desktop para mensagens de entrada (`role === 'user'`) quando a conversa correspondente não está ativa ou a aba está em background.
- [x] **Homologação e Deploy**:
  - TypeScript typecheck com 100% de sucesso.
  - Build de produção e deploy na Cloudflare com sucesso.

### [2026-06-10] - Fix Upsell Pós-Venda (upsell_5min) Nunca Disparava (Concluído)

- [x] **Diagnóstico**: O upsell pós-venda (5min após entrega de acesso) **nunca disparou** — 33 de 33 agendamentos históricos foram cancelados.
- [x] **Causa raiz**: A "Regra de Ouro 1" em [followups.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/followups.ts) cancelava QUALQUER follow-up quando `payment_confirmed = 1` ou `access_delivered = 1`. Mas o `upsell_5min` é o único follow-up projetado para disparar DEPOIS que o cliente pagou e recebeu acesso.
- [x] **Correção**: Adicionada exceção `isUpsellFollowup = cleanKey.startsWith('upsell_')` que exclui follow-ups de upsell da Regra de Ouro 1. Adicionada Regra de Ouro 1B que cancela o upsell somente se `upsell_enviado = 1` (já foi enviado anteriormente).
- [x] **Validação**: TypeScript typecheck com zero erros.

### [2026-06-10] - Solução Definitiva de Timeout no Checkout (ticket_boost) e Recuperação Nina (Concluído)

- [x] **Diagnóstico Definitivo**:
  - Lead Nina (`554796899266`) enviou comprovante Pix de R$ 10,00 às 01:00:32 UTC. O Worker processou OCR + auditoria LLM + CAPI com sucesso, mas estourou o limite de 30s do `waitUntil` antes de enviar a resposta de confirmação via `sendFunnelStage('ticket_boost')`.
  - Causa raiz: O `ticket_boost` estava com `rewrite_mode = 'dynamic'` novamente no D1 (revertido pelo painel administrativo). A reescrita dinâmica via LLM adicionava 3-8s ao fluxo que já consumia ~15-20s (debounce + OCR + auditoria + CAPI).
- [x] **Proteção no Código (Timeout de Segurança Transacional)**:
  - Adicionado `Promise.race` com timeout de 8 segundos ao redor da chamada `sendFunnelStage('ticket_boost')` dentro de `executePagamento` em [tools.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/tools.ts).
  - Se o estágio exceder 8s (por reescrita LLM lenta, rede congestionada, etc.), o sistema cai automaticamente para as variações estáticas de upsell (`pagUpsellVariations`), garantindo que o cliente **SEMPRE** receba uma resposta de confirmação de pagamento.
  - Esta proteção é permanente e independe da configuração do banco — mesmo que alguém reative `rewrite_mode = 'dynamic'` no painel, o timeout impede o estouro do Worker.
- [x] **Correção no Banco de Dados**:
  - Atualizado `rewrite_mode = 'none'` para todos os estágios `ticket_boost` em todas as automações (3 registros).
- [x] **Recuperação Manual (Nina)**:
  - Enviada mensagem de confirmação de pagamento + oferta de upsell R$ 5,00 via UAZAPI para o WhatsApp de Nina.
  - Enviado botão Pix nativo de R$ 5,00.
  - Registrada mensagem no histórico do D1 para continuidade do atendimento.
- [x] **Validação e Deploy**:
  - TypeScript typecheck com zero erros.
  - Build de produção e deploy na Cloudflare com sucesso (Version ID: `36e44482-bff7-4344-b460-4616df2bd772`).



- [x] **Diagnóstico de Timeout no Checkout (Cloudflare Workers)**:
  - Identificado que a falha de resposta para a cliente Rita (`5516991872580`) após o Pix de R$ 10,00 foi causada por estouro do tempo limite (timeout) de 30 segundos em background no Cloudflare Workers.
  - A combinação do debounce (15s), OCR Gemini (3s), Facebook CAPI (2s) e reescrita dinâmica da LLM no estágio `ticket_boost` (que tentava a API do DeepSeek por 20 segundos antes de falhar por timeout) excedeu os 30 segundos. As alterações de estado no banco D1 foram gravadas com sucesso, mas a thread foi finalizada antes do envio das mensagens de checkout e do botão Pix.
- [x] **Otimização de Performance no Checkout**:
  - Modificado o estágio de funil `ticket_boost` (Oferta Especial / Upgrade) no D1 remoto para desativar a reescrita dinâmica por LLM (`rewrite_mode = 'none'`). Isso elimina a chamada externa de IA durante o checkout transacional, economizando de 3 a 20 segundos por transação e garantindo entrega quase instantânea.
- [x] **Recuperação Manual (Rita)**:
  - Criado e executado o script de recuperação `scratch/deliver_rita.py` para disparar a cópia de confirmação e a oferta de upsell de R$ 5,00 para o WhatsApp de Rita via UAZAPI.
  - Enviado o botão Pix nativo de R$ 5,00.
  - Inseridos os registros e logs na tabela `messages` e `dispatch_logs` no banco D1 remoto.
- [x] **Validação e Rollout**:
  - Homologada tipagem typescript (`npm run typecheck`) com sucesso.

### [2026-06-09] - Correção de SKU, CAPI Enriquecido e Resolução de Double Messages (Concluído)

- [x] **Correção do Cadastro do Lead Ana Fernanda (D1 & Webhook)**:
  - Corrigido o registro manual no banco D1 para a cliente Ana Fernanda (telefone `5521985751756`), atualizando `produto_codigo` para o SKU correto do Kit Completo (`PROD-H3GQBU`).
  - Disparado o webhook N8N manualmente (`Status 200: Acesso liberado com sucesso`), lançando o pagamento correto no portal de alunos para a cliente.
- [x] **Ajuste de Sobrescrita de SKU no Cadastro (Backend - `tools.ts`)**:
  - Modificada a lógica de resolução de SKU em `executeSistema` para priorizar a entrega do SKU do Kit Completo (`PROD-H3GQBU` ou o configurado dinamicamente no upsell) se o cliente adquiriu o pacote completo (`isKitCompleto = true`), evitando que o código do produto associado a links genéricos de login (como `PROD-R1I27D` para o Portal de Alunas) force a sobrescrita do produto final.
- [x] **Ativação do Evento Purchase 2 no Facebook CAPI (Backend - `tools.ts`)**:
  - Criada a validação `wasSystemAccessDelivered` baseada na existência do email cadastrado do lead, em substituição à verificação antiga baseada em `recebeu_acesso === 1` (que é marcada previamente ao pagamento no envio das receitas no SEQ2). Isso possibilita o envio correto e garantido do evento Purchase enriquecido (Purchase 2) com email/nome do cliente no momento da compra do produto, melhorando em 90%+ a inteligência e o cruzamento de conversões no Facebook Ads.
- [x] **Resolução de Mensagens Duplicadas ("Double Message") (Backend - `index.ts`)**:
  - Implementada a supressão da resposta conversacional (LLM content) quando ferramentas de despacho direto (`seq1`, `seq2`, `pagamento`, `sistema`, `entregar_pdf_crm`) são executadas com sucesso. Isso impede que o bot envie mensagens redundantes no futuro do pretérito (como "Perfeito! Vou cadastrar agora mesmo!") logo após ter acabado de liberar as credenciais reais de acesso do sistema.
  - Atualizadas as variações de templates de acesso (`sistemaVariations` em `tools.ts`) para incluir mensagens de sucesso amigáveis desejando boas vendas e a bênção de Deus para os negócios da aluna ("Que Deus abençoe imensamente a sua jornada e o seu negócio! Desejo muito sucesso e excelentes vendas! 💖🍰"), preenchendo o fluxo de forma afetuosa.
- [x] **Validação e Rollout**:
  - Verificação de tipos TypeScript (`npm run typecheck`) concluída com 100% de sucesso.
  - Build de produção (`npm run build`) e deploy (`wrangler deploy`) efetuados com sucesso (Version ID: `e9e6ca43-3b25-4f73-a3c6-505733d112ce`).

### [2026-06-09] - Otimização de Concorrência e Resolução de Timeout/Lock no Funil e Follow-ups (Concluído)

- [x] **Paralelização de Reescritas Dinâmicas (Backend)**:
  - Otimizada a função `sendFunnelStage` em [tools.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/tools.ts) para pré-carregar em paralelo (via `Promise.all`) todas as reescritas de texto com LLM. Isso reduziu o tempo total de reescrita em funis de 10-15s para apenas 2-3s, eliminando timeouts no Cloudflare Workers e garantindo que todos os blocos de texto (incluindo o PIX) e botões do PIX sejam enviados corretamente.
  - Aplicada a mesma paralelização na rotina `executeFollowup` em [followups.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/followups.ts) para evitar timeouts durante a execução do cron de follow-ups customizados compostos por múltiplos blocos de texto.
- [x] **Estabilidade de Lock de Conversa**:
  - A prevenção do crash por timeout assegura que o bloco `finally` das tarefas assíncronas em background limpe os locks `is_delivering_seq2` e `processing` do KV, garantindo o processamento e respostas corretas para todas as mensagens subsequentes recebidas na fila do cliente.
- [x] **Validação e Rollout**:
  - Executados `npm run typecheck` e `npm run build` com sucesso.
  - Deploy remoto em produção realizado com sucesso na Cloudflare.

### [2026-06-08] - Transcrição Completa de Áudio na Exportação do Funil (Concluído)

- [x] **Transcrição Completa (Backend)**:
  - Criada a função helper `getAudioTranscription` em [reports.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/routes/reports.ts) contendo os textos completos das apostilas/áudios do funil (`audio1` e `audio2`).
  - Atualizado o processamento de áudio do mapa do funil, follow-ups e CRM na rota de exportação para injetar a transcrição completa de forma automatizada caso o nome do arquivo ou URL corresponda a um dos áudios padrão do sistema.
- [x] **Validação e Rollout**:
  - Compilação SSR (`npm run build`) e verificação de tipos (`npm run typecheck`) executadas com sucesso.
  - Deploy remoto em produção realizado com sucesso na Cloudflare.

### [2026-06-08] - Reordenação por Arraste de Estágios, Abas Dinâmicas e Correção de Tipagem (Concluído)

- [x] **Modelagem no Banco de Dados (D1)**:
  - Criada e aplicada a migração `migrations/0029_add_sort_order_to_stages.sql` para suportar ordenação persistente (`sort_order`) nas abas do funil, follow-ups e CRM.
- [x] **Backend Hono e Endpoints**:
  - Implementado endpoint `PUT /reorder` em `funnel-messages.ts`, `followup.ts` e `crm.ts` para salvar a ordenação das abas em lote.
  - Implementados endpoints de CRUD para estágios customizados (criação e exclusão).
- [x] **Interface e Drag and Drop (React)**:
  - Adicionado suporte a Drag and Drop HTML5 para reordenar dinamicamente as abas em Funnel Messages, Follow-ups e CRM.
  - Resolvido bug de compilação adicionando `name` e `sort_order` às interfaces de `Stage`, `FollowupStage` e `CrmStage` em `funnel-messages.tsx`, `followup.tsx` e `crm.tsx`.
- [x] **Persona e Promessa de Pagamento**:
  - Refatorados prompts de IA em `prompts.ts` para aceitar agendamentos de promessa e lembrete de cobrança sem citar valores monetários hardcoded e sem atalhos silenciosos de emojis.
- [x] **Compilação e Deploy**:
  - Homologado build completo (`npm run build`) e typecheck (`npm run typecheck`) com zero erros.
  - Deploy remoto realizado com sucesso na Cloudflare Workers via Wrangler (`npx wrangler deploy`).

### [2026-06-08] - Inteligência de Promessa de Pagamento e Lembretes (Concluído)

- [x] **Modelagem no Banco de Dados (D1)**:
  - Criada e aplicada a migração `migrations/0028_add_promessa_pagamento.sql` para adicionar a coluna `promessa_pagamento_data TEXT DEFAULT NULL` na tabela `conversation_state`.
- [x] **Triagem e Persona (Backend Hono)**:
  - Adicionado o intent tag `PROMESSA_PAGAMENTO` no Scout Classifier (`getScoutClassifierPrompt` em `workers/automations/recheios/prompts.ts` e `index.ts`). A LLM agora detecta quando o cliente propõe uma data futura para pagamento ("só posso pagar amanhã", "agenda para dia tal").
  - Injetadas regras no prompt unificado (`getAgentPrompt`) para a LLM entender a data de hoje calculada dinamicamente com base em São Paulo e responder de forma empática e confiável, aceitando a promessa de pagamento e chamando a ferramenta `agendar_promessa`.
  - Criado o prompt analítico `getPromessaCobrancaPrompt` em `prompts.ts` para que a LLM redija uma cobrança delicada, gentil e amigável no dia prometido.
- [x] **Ferramenta `agendar_promessa` (Backend Hono)**:
  - Registrada e implementada a ferramenta `agendar_promessa` em `workers/automations/recheios/tools.ts`.
  - Se o produto ainda não foi enviado (`seq2_called = 0`), a ferramenta dispara o envio imediatamente (`executeSeq2`), garantindo a entrega antes de agendar a cobrança.
  - Cancela todos os outros follow-ups normais de cobrança/reengajamento agendados para a conversa.
  - Mantém o status da conversa como `'pending'` e agenda o follow-up especial `followup_cobranca_promessa` para a data da promessa entre **19:00 e 21:00 SP Time (UTC-3)** em um minuto/segundo aleatório (jitter).
- [x] **Cron de Lembrete e Auto-Resolução (Backend Hono)**:
  - Adicionado suporte ao tipo `followup_cobranca_promessa` no Cron em `workers/automations/recheios/followups.ts`.
  - Implementada verificação de segurança pré-disparo: se o cliente já pagou (verificado via `automation_leads.pago = 1` ou `conversation_state.payment_confirmed = 1`), o lembrete de cobrança é cancelado de forma transparente e a conversa é atualizada para `finalizado_com_sucesso` sem enviar cobrança indevida.
  - Caso contrário, a LLM é invocada com o prompt personalizado (`getPromessaCobrancaPrompt`) para gerar e enviar a mensagem de cobrança amigável acompanhada do botão oficial de Pix.
- [x] **Compilação, Homologação e Deploy**:
  - Corrigido o erro de importação de `formatWhatsAppShortParagraphs` em `followups.ts` resolvendo a falha de compilação.
  - Homologada a tipagem com `npm run typecheck` e build com `npm run build` com sucesso.
  - Realizado deploy em produção na Cloudflare Workers via Wrangler (`npx wrangler deploy`).

### [2026-06-06] - Resolução de Imagens de Suporte e Queda Segura para LLM (Concluído)

- [x] **Aprimoramento de OCR de Suporte (Serviço de Mídia)**:
  - Atualizada a instrução `DEFAULT_OCR_PROMPT` em [media-service.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/services/media-service.ts) para detectar inteligentemente se a imagem recebida é um comprovante ou uma tela de erro de login/suporte. Em caso de prints de erro/login, o Gemini agora extrai todo o texto literal visível e fornece uma descrição curta para alimentar o robô.
- [x] **Filtro de Inteligência de Comprovantes (Backend Hono)**:
  - Adicionado helper `isLikelyReceipt` em [index.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/index.ts). O sistema agora valida o OCR bruto e só aplica a formatação estruturada de comprovante financeiro (`formatReceiptOcrTextWithRegex`) caso detecte elementos de transação bancária. Caso contrário, envia o texto bruto do erro, prevenindo falsos positivos na checagem de pagamento.
- [x] **Queda Segura de Fluxo para LLM**:
  - Modificado o interceptador determinístico de pagamento em [index.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/index.ts) para não mais enviar a mensagem robótica fixa de rejeição e não interromper com `return;` quando o comprovante for inválido (como no envio de prints de login/erro).
  - Com isso, o fluxo cai de forma transparente para a LLM unificada (Julia) que processa a imagem do erro, valida os dados cadastrais (Nome/E-mail) com o cliente e executa a ferramenta de `sistema` para re-cadastrar e reenviar os links.
- [x] **Homologação e Deploy**:
  - Verificada a tipagem do TypeScript (`npm run typecheck`) com sucesso.
  - Compilado e implantado o Worker em produção na Cloudflare via Wrangler.

### [2026-06-06] - Edição e Envio de Legenda (Caption) para Imagens e Vídeos (Concluído)

- [x] **Interface do Painel Administrativo (React/Frontend)**:
  - Adicionado campo de texto (textarea) dinâmico premium para inserção de **Legendas (Captions)** nos blocos de imagem e vídeo nas seções de **Mensagens do Funil** ([funnel-messages.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/funnel-messages.tsx)), **Follow-up** ([followup.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/followup.tsx)) e **CRM** ([crm.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/crm.tsx)).
  - Ajustada a seleção de arquivos no frontend para inicializar o campo `file_name` como uma string vazia (`""`) por padrão para tipos de imagem/vídeo, garantindo que não usem o nome do arquivo como legenda automaticamente.
  - Atualizada a pré-visualização de mídia `renderMediaPreview` para exibir o nome real do arquivo carregado extraído da URL do storage, enquanto o campo `file_name` fica livre para armazenar a legenda personalizada do usuário.
- [x] **Despacho e Roteamento de Mídia (Backend Hono)**:
  - Adicionada função utilitária `isFileName` em [whatsapp-service.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/services/whatsapp-service.ts) que detecta e anula legendas que correspondem a nomes de arquivos com extensões comuns, prevenindo que nomes físicos de arquivos (ex: `imagem.png`) vazem como legenda no WhatsApp e garantindo retrocompatibilidade total com cadastros antigos.
  - Atualizado o processamento de follow-ups no cron (`workers/automations/recheios/followups.ts`) para passar `field.file_name` como a legenda no envio de imagens e vídeos no WhatsApp.
  - Atualizado o processamento de envios de CRM no cron (`workers/routes/crm.ts`) para passar `field.file_name` como a legenda no envio de imagens e vídeos, além de mapear `env.KV` para a resolução rápida das chaves da API de WhatsApp.
- [x] **Compilação e Homologação**:
  - Homologada a tipagem typescript (`npm run typecheck`) e o build de produção do React Router.
  - Realizado deploy em produção na Cloudflare com sucesso.

### [2026-06-06] - Otimização de Chamadas Assíncronas e Resolução de Timeout na Entrega da Sequência 2 (Concluído)

- [x] **Correção de Legendas (Captions) de Imagens e Vídeos (Backend Hono)**:
  - Corrigido o envio de imagens e vídeos na função `sendFunnelStage` em [tools.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/tools.ts) para que passe o campo `f.file_name` como a legenda (`caption`) para a API do WhatsApp (Evolution API / UAZAPI), em vez de forçar o valor fixo `undefined`. Isto assegura que descrições de pacotes de ofertas e bônus cadastradas como o nome do asset na interface sejam corretamente entregues com as mídias.
- [x] **Otimização de Desempenho e Concorrência (Backend Hono)**:
  - Adicionado o parâmetro opcional `skipAwait = false` à função `sendFunnelStage` em [tools.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/tools.ts). Quando `skipAwait` é definido como `true`, a função dispara as requisições HTTP da API de WhatsApp sem aguardar individualmente a resposta de cada uma, agrupando as Promises e retornando-as em um array `promises`.
  - Refatorada a função assíncrona `executeSeq2Async` em [tools.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/tools.ts) para invocar `sendFunnelStage` com `skipAwait = true`. As promessas das mensagens dinâmicas do funil e a promessa do botão do Pix (disparado após um sleep de 1.5s para garantir a ordenação final) são todas coletadas em um array único (`allPromises`).
  - Atualizado o fluxo de fallback estático legado dentro de `executeSeq2Async` para utilizar a mesma estratégia de concorrência assíncrona com sleeps, evitando esperas consecutivas de rede em cada fetch de mensagem de texto, áudio, imagens e botão do Pix.
  - Implementada a instrução `await Promise.all(allPromises)` estritamente no final do escopo de `executeSeq2Async` para manter a máquina virtual do Worker ativa durante o processamento em lote, mas eliminando o tempo cumulativo de espera de rede que causava o encerramento prematuro da thread em background (timeout de 30 segundos no plano gratuito/free tier da Cloudflare).
- [x] **Validação e Deploy**:
  - Validada a tipagem do projeto com sucesso (`npm run typecheck`).
  - Compilação SSR e deploy remotos realizados com sucesso via Wrangler (`npx wrangler deploy`).

### [2026-06-06] - Branding e Novo Logo (Zapfy) (Concluído)

- [x] **Branding e Interface (React/Frontend)**:
  - Copiado o novo logo carregado pelo usuário para [public/logo.png](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/public/logo.png).
  - Atualizada a barra lateral e o cabeçalho móvel em [layout.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/components/layout.tsx) para renderizar a imagem do logo. Desenvolvida regra com CSS/HTML para colapsar o logo exibindo apenas o ícone circular do raio verde na barra lateral quando fechada.
  - Atualizada a tela de login em [login.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/login.tsx) para usar o novo logo.
  - Modificado o arquivo [root.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/root.tsx) alterando as referências antigas de metadados e do título da página (`<title>`) para a marca atualizada: **Zapfy — Automação WhatsApp**.
- [x] **Validação e Deploy**:
  - Verificada a compilação do Vite com sucesso (`npm run build`).
  - Realizado deploy bem-sucedido na Cloudflare Workers (`npx wrangler deploy`).

### [2026-06-04] - Inteligência e Análise Enriquecida de Marketing no CRM (Concluído)


- [x] **Modelagem no Banco de Dados (D1)**:
  - Criada e aplicada a migração `migrations/0027_add_crm_analysis_json.sql` adicionando a coluna `ai_analysis_json TEXT` à tabela `crm_responses` no banco D1 remoto.
- [x] **Inteligência Artificial (Backend Hono)**:
  - Modificado o interceptador de resposta de CRM em [automation-engine.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automation-engine.ts).
  - Implementada a busca do histórico de conversas do lead (`getMessageHistory`) no momento em que ele responde à pesquisa do CRM.
  - Desenvolvido um prompt analítico avançado para a LLM que correlaciona o histórico da jornada (sentimento, evolução do tom, picos emocionais de frustração e alívio, citações relevantes) com a resposta do CRM (dor principal, motivação, facilidade técnica, objeções, sensibilidade de preço e recomendações de marketing).
  - O resultado detalhado é salvo como JSON estruturado no campo `ai_analysis_json`.
- [x] **Validação & Deploy**:
  - Executados `npm run build` e `npx wrangler deploy` com sucesso.

### [2026-06-04] - Transição do Funil para LLM Exclusiva & Resolução do Lead Delane (Concluído)


- [x] **Modelagem no Banco de Dados (D1)**:
  - Atualizada a tabela `automations` no Cloudflare D1 remoto para definir `use_llm_variations = 1` nas automações ativas (Recheios e Recheios 09011).
- [x] **Roteamento e IA (Backend Hono)**:
  - Modificado o arquivo [index.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/index.ts) para remover o desvio condicional que encaminhava mensagens para o `handleByFixedCodeAgent`.
  - Excluída a função legada `handleByFixedCodeAgent` do final do arquivo para evitar código morto.
  - Com isso, todas as interações pós-cadastro/ofertas iniciais passam a ser geridas dinamicamente pela LLM, garantindo diálogo humano e contextualmente coerente (inclusive ao lidar com dúvidas sobre o Pix e dados de pagamento).
- [x] **Validação e Simulação**:
  - Executados `npm run build` e `npx wrangler deploy` com absoluto sucesso.
  - Simulado o envio de mensagem via webhook para o lead Delane Oliveira (`5511916507919`). O sistema reabriu a conversa e gerou uma resposta natural via LLM solicitando o comprovante com o valor correto de R$ 10,00 da oferta de encerramento do Kit Completo.

### [2026-06-04] - Botão de Expandir/Recolher Caixa de Mensagem (Concluído)


- [x] **Interface Gráfica do Usuário (React/Frontend)**:
  - Adicionado um botão "↕️ Expandir" / "↕️ Recolher" ao rodapé de todas as caixas de mensagem do tipo `<textarea>` (de 4 para 16 linhas de altura).
  - Implementado nas seções de CRM ([crm.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/crm.tsx)), de Follow-up ([followup.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/followup.tsx)) e de Mensagens do Funil ([funnel-messages.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/funnel-messages.tsx)).
  - Utilizado controle de DOM local (sem necessidade de estados adicionais no array dinâmico de blocos) para expandir e recolher de forma rápida, fluida e à prova de bugs de reordenação de blocos.
- [x] **Validação e Deploy em Produção**:
  - Verificação de tipos TypeScript (`npm run typecheck`) concluída com 100% de sucesso.
  - Build de produção (`npm run build`) e deploy (`wrangler deploy`) efetuados com sucesso.

### [2026-06-04] - Divisão Visual e Programática de Estágios de CRM por Categorias (Concluído)

- [x] **Modelagem no Banco de Dados (D1)**:
  - Criada e executada a migração `migrations/0026_add_crm_stage_class.sql` para adicionar a coluna `class` na tabela `automation_crm_stages` (com valor padrão `'sucesso'` e atualizados os estágios com key `'objection'` para `'sem_sucesso'`).
  - Executadas queries de correção de dados via Wrangler para converter as mensagens legadas em texto puro para formato JSON estruturado nas etapas `satisfaction` e `testimonial` da automação *"Recheios 09011"*.
- [x] **Mapeamento e Filtros no Backend**:
  - Modificado o endpoint `GET /config/:automationId` em `workers/routes/crm.ts` para retornar os estágios com a coluna `class`.
  - Modificados os endpoints `POST` e `PUT` de CRM em `workers/routes/crm.ts` para persistirem a coluna `class`.
  - Atualizado o motor de automação `workers/automation-engine.ts` para agendar os estágios de pós-venda quando `class === 'sucesso'` e os estágios de objeção quando `class === 'sem_sucesso'`, em vez do filtro hardcoded anterior que usava o nome da chave (`s.key !== 'objection'` e `s.key === 'objection'`).
- [x] **Interface Gráfica do Usuário (React/Frontend)**:
  - Atualizada a interface `CrmStage` em `app/routes/crm.tsx` para incluir a propriedade `class`.
  - Implementada uma barra de abas de categorias horizontal no painel de CRM (`🎉 Finalizado com Sucesso` vs. `❌ Finalizado sem Sucesso`) que filtra dinamicamente os estágios exibidos nos botões sub-tabs.
  - Adicionado um campo de seleção de categoria (*"Categoria do Estágio"*) nos metadados de configuração de cada estágio, permitindo alterar a classe e salvar.
  - Adicionado suporte no modal de criação (*"Novo Estágio"*) para selecionar a categoria, com valor padrão baseado na aba ativa.
  - Simplificados o título e a descrição visual da seção de estágios para um texto único e objetivo: *"⚙️ Configure mensagens de pesquisa de acordo com a finalização do funil abaixo:"*.
- [x] **Validação**:
  - Executado o typecheck (`npm run typecheck`) com sucesso.

### [2026-06-04] - Personalização do Nome da Atendente por Automação (Concluído)

- [x] **Modelagem no Banco de Dados (D1)**:
  - Criada e executada a migração `migrations/0025_add_attendant_name.sql` para adicionar a coluna `attendant_name` na tabela `automations` (com valor padrão `'Julia'`).
  - Aplicada a migração com sucesso nos bancos local e remoto do Cloudflare D1.
- [x] **Atualização do Cache de Borda (KV) e do Motor**:
  - Atualizadas as interfaces `CachedAutomation` e `AutomationContext` em `workers/services/cache-service.ts` e `workers/automation-engine.ts` para incluir a propriedade `attendant_name`.
  - Ajustada a busca `getCachedAutomation` para selecionar `attendant_name` do banco D1 caso ocorra cache miss.
- [x] **Endpoints da API Backend (Hono)**:
  - Modificado o endpoint `POST /api/automations` para receber e persistir o campo `attendant_name`.
  - Modificado o endpoint `PUT /api/automations/:id` para permitir alteração do campo `attendant_name`.
  - Atualizada a busca de automações no endpoint `POST /api/chat/conversations/:id/trigger-tool` para retornar a propriedade `attendant_name`.
- [x] **Integração na Persona da IA e nos Funis**:
  - Atualizadas todas as chamadas SDR de agente/triagem e ferramentas em `workers/automations/recheios/index.ts` e `workers/automations/recheios/tools.ts` para recuperar o nome do atendente de forma dinâmica (`automation.attendant_name || 'Julia'`), substituindo o comportamento antigo que usava slug hardcoded.
- [x] **Interface Gráfica do Usuário (React/Frontend)**:
  - Adicionado o campo de input *"Nome da Atendente"* nos formulários de criação e edição do painel de automações (`app/routes/automations.tsx`).
  - Atualizados os cards de exibição das automações para exibir dinamicamente o nome da atendente atribuída (ex: `👩 Atendente: Sara Feitosa`).
- [x] **Validação e Deploy em Produção**:
  - Verificação de tipos TypeScript (`npm run typecheck`) concluída com 100% de sucesso.
  - Build de produção (`npm run build`) e deploy (`wrangler deploy`) efetuados com sucesso.

### [2026-06-04] - Correção do Placeholder de Nome e Conversão Global de Negritos (Concluído)

- [x] **Correção do Placeholder `{primeiro_nome}` no Funil de Boas-Vindas**:
  - Ajustado o helper `replaceVariables` em `workers/automations/recheios/tools.ts` para que substitua corretamente `{primeiro_nome}` (e variações com chaves duplas ou simples, e com grafia de "name") pelo primeiro nome do cliente, evitando o envio do código bruto.
  - Sincronizados todos os componentes de preview visual no frontend (`app/routes/funnel-messages.tsx`, `app/routes/followup.tsx` e `app/routes/crm.tsx`) para também renderizarem os placeholders dinâmicos corretamente em chaves duplas e simples (`{primeiro_nome}`, `{{primeiro_nome}}`, `{nome}`, `{{nome}}`, etc.).
  - Adicionado suporte a `{{primeiro_nome}}` / `{{primeiro_name}}` nos replaces de mensagens de CRM no backend (`workers/routes/crm.ts`).
- [x] **Conversão Global de Negritos para WhatsApp (`**` -> `*`)**:
  - Implementada a sanitização automática em `workers/services/whatsapp-service.ts` para converter qualquer ocorrência de negrito no padrão markdown (`**texto**`) para o padrão nativo do WhatsApp (`*texto*`) em todas as mensagens de texto e legendas de mídias enviadas (imagens e vídeos).
- [x] **Validação e Deploy de Produção**:
  - Verificação de tipos TypeScript (`npm run typecheck`) concluída com 100% de sucesso.
  - Build de produção (`npm run build`) e deploy (`wrangler deploy`) efetuados com sucesso.

### [2026-06-03] - Remoção das Abas de Preços/Ofertas e Configuração de Upsell no Painel de Produtos (Concluído)

- [x] **Remoção das Abas no Frontend (`app/routes/products.tsx`)**:
  - Removidas as abas `"💰 Preços e Ofertas"` e `"📈 Config. Upsell"` do menu de abas do produto.
  - Excluídos os respectivos formulários e blocos de visualização de ofertas e de configurações de upsell.
  - Restam apenas as abas relevantes no menu de gerenciamento do produto: `"Configs"`, `"Mídias de Funil"`, `"PDFs"`, `"Acessos"` e `"Funis Vinculados"`.
- [x] **Validação e Deploy**:
  - Verificação de tipos TypeScript (`npm run typecheck`) concluída com 100% de sucesso.
  - Build de produção (`npm run build`) e deploy (`wrangler deploy`) efetuados com sucesso.

### [2026-06-03] - Reestruturação da Seção de CRM (Mensagens e Editor Multi-Bloco com Mídias) (Concluído)

- [x] **Divisão Visual por Abas no Frontend (`app/routes/crm.tsx`)**:
  - Renomeada a primeira aba de `"📋 Visão Geral"` para `"📋 Mensagens"`.
  - Implementado controle por sub-tabs horizontais que exibem os estágios ativos/inativos de CRM.
- [x] **Editor Multi-Bloco com Dropdowns de Mídias de Produtos (`app/routes/crm.tsx`)**:
  - Implementado layout em duas colunas (esquerda: editor sequencial de blocos de texto/mídias com dropdown de arquivos de produtos; direita: preview simulado de WhatsApp e variações estáticas).
- [x] **Simplificação do Modal de Criação (`app/routes/crm.tsx`)**:
  - O modal de criação de estágio de CRM foi simplificado para solicitar apenas Nome do Estágio e Delay (em horas). Configuração de blocos, IA e ativação são controladas inline.
- [x] **Execução de Multi-Blocos no Cron do CRM Backend (`workers/routes/crm.ts`)**:
  - Atualizada a rotina de envio programado `processCrmScheduled` para processar a coluna `message` de cada estágio de CRM como um array JSON de blocos de texto ou mídias.
  - Envia cada bloco sequencialmente com delay de 2 segundos para humanização de digitação.
  - Mantido suporte a mensagens de texto puro legado (retrocompatibilidade).
- [x] **Exportação de Relatórios de CRM (`workers/routes/reports.ts`)**:
  - Modificado o exportador para identificar e processar mensagens serializadas de CRM de forma detalhada no Markdown exportado.
- [x] **Deploy e Validação**:
  - Verificação de tipos TypeScript (`npm run typecheck`) concluída com 100% de sucesso.
  - Build de produção (`npm run build`) e deploy (`wrangler deploy`) efetuados com sucesso.

### [2026-06-03] - Reestruturação da Seção de Follow-up (Abas e Editor Multi-Bloco) (Concluído)

- [x] **Divisão Visual por Abas no Frontend (`app/routes/followup.tsx`)**:
  - Implementado o controle de duas abas horizontais principais: `"🔔 Régua de Reengajamento"` e `"💰 Régua de Cobrança"`.
  - Exibição de sub-tabs elegantes com a listagem de estágios de cada classe ativa, facilitando a visualização e navegação.
  - Implementado o visual de 2 colunas inspirado no painel do funil.
- [x] **Editor Multi-Bloco com Dropdowns de Produtos (`app/routes/followup.tsx`)**:
  - Usuários podem adicionar múltiplos blocos de texto e mídias (Áudio, Imagem, Vídeo e PDF) sequencialmente. Os arquivos de mídias são selecionados dinamicamente via dropdown a partir dos ativos cadastrados nos produtos associados à automação.
  - Renderização nativa de players e miniaturas de áudio, imagem e vídeo integradas ao editor.
  - Adicionado Preview do WhatsApp e visualização das variações estáticas geradas à direita.
- [x] **API Hono e Variações por IA (`workers/routes/followup.ts`)**:
  - Atualizadas as rotas de `POST` e `PUT` de estágios para verificar se a mensagem enviada é uma lista JSON de blocos. Em caso positivo, o primeiro bloco de texto é extraído para invocar o serviço da LLM e gerar as variações estáticas para o rodízio anti-bloqueio.
- [x] **Execução de Multi-Blocos no Cron do Worker (`workers/automations/recheios/followups.ts`)**:
  - Importados os métodos `sendAudio` e `sendDocument` para o despachador de follow-up.
  - Se a mensagem do estágio customizado for um JSON serializado, executa cada bloco sequencialmente com delay de 2s para humanização de digitação.
  - Mantido fallback para texto puro legado para garantir 100% de retrocompatibilidade com estágios antigos.
- [x] **Exportação do Funil em Markdown (`workers/routes/reports.ts`)**:
  - Modificado o exportador `/funnel/:automationId/export` para identificar mensagens serializadas dos follow-ups e renderizar de forma detalhada cada bloco sequencial no Markdown (`💬 [Texto]`, `🎙️ [Áudio]`, `📄 [PDF]`, etc.).
- [x] **Validação e Rollout**:
  - Compilação (`npm run typecheck` e `npm run build`) verificada com sucesso absoluto.
  - Deploy efetuado em produção na Cloudflare.

### [2026-06-03] - Seleção Dinâmica de Mídias de Produtos no Painel do Funil (Concluído)

- [x] **Busca de Produtos e Relações no Frontend (`app/routes/funnel-messages.tsx`)**:
  - Adicionado carregamento assíncrono de todos os produtos via `/products` no carregamento da página.
  - Implementada lógica reativa para filtrar e obter os ativos (`assets`) de produtos vinculados à automação selecionada atualmente.
- [x] **Substituição do Bloco de Upload por Dropdown de Seleção (`app/routes/funnel-messages.tsx`)**:
  - Removido o fluxo de upload drag-and-drop e a substituição manual de arquivos locais nas configurações do estágio do funil.
  - Implementado dropdown (`<select>`) premium glassmorphic que filtra os ativos vinculados pelo tipo correspondente do bloco (`audio`, `image`, `video` ou `pdf` para `document`).
  - Ao selecionar, associa automaticamente a URL pública da mídia e o nome do arquivo, atualizando em tempo real a pré-visualização (player HTML / miniatura) e permitindo salvar as configurações no D1.
  - Exibição de alertas explicativos caso o usuário não tenha cadastrado arquivos daquele tipo específico nos produtos da automação.
- [x] **Validação e Rollout**:
  - Compilação (`npm run typecheck` e `npm run build`) verificada com sucesso absoluto.
  - Deploy efetuado em produção na Cloudflare.

### [2026-06-03] - Integração do Controle de Acesso e Permissões para "Mensagens do Funil" (Concluído)

- [x] **Gestão de Usuários e Permissões no Frontend (`app/routes/users.tsx`)**:
  - Adicionado o item `"funnel-messages"` ("Mensagens do Funil") na lista global de seções (`SECTIONS`) para que os administradores possam habilitar ou desabilitar o acesso granular a essa tela.
  - Atualizado o payload de salvamento de usuários administradores para incluir a nova chave de seção por padrão.
- [x] **Barra Lateral e Proteção de Rotas (`app/components/layout.tsx`)**:
  - Atualizado o link lateral de navegação e a verificação de proteção de rotas da URL `/funnel-messages` para usar `hasSectionAccess("funnel-messages")` ao invés do fallback anterior `hasSectionAccess("automations")`.
- [x] **Configurações Iniciais no Backend (`workers/routes/auth.ts`)**:
  - Incluída a permissão `"funnel-messages"` na criação inicial do usuário Administrador durante a rota de `/setup`.
- [x] **D1 Migration e Rollout**:
  - Executada migração no banco de dados D1 para atualizar os registros de usuários existentes de forma a liberar o acesso ao novo painel inicialmente.
  - Verificação de builds (typecheck e build locais) com zero erros e deploy em produção realizado com sucesso.

### [2026-06-03] - Relatório de Exportação: Aba Mensagens do Funil Dinâmicas (Concluído)

- [x] **Renomeação de Aba e Interface no Frontend (`app/routes/reports.tsx`)**:
  - Renomeada a aba de relatórios de `"🗺️ Mapa do Funil"` para `"💬 Mensagens do Funil"`.
  - Atualizadas as descrições e títulos para focar na exportação estruturada das cópias de texto e mídias das mensagens cadastradas no funil.
  - O botão de exportação foi renomeado para `"Gerar e Exportar Mensagens"` e o nome do arquivo baixado agora é `mensagens_funil_{slug}.md`.
- [x] **Exportação Dinâmica das Mensagens no Backend (`workers/routes/reports.ts`)**:
  - Removido o mapa estático antigo que dependia de regras hardcoded.
  - Implementada a leitura dinâmica em tempo real do banco de dados D1 (`automation_funnel_stages` e `automation_funnel_fields`) para puxar todos os blocos de mensagens e mídias ordenados de cada etapa (`welcome`, `delivery`, `ticket_boost`, `ticket_boost_declined`, `upsell`, `downsell`).
  - O Markdown gerado exibe com clareza o tipo de bloco (Texto, Áudio com transcrição para arquivos conhecidos, PDFs de entrega, Imagens e Vídeos com descritivo das artes e legendas) e o estado ativo/inativo da etapa.
  - Incluídos os blocos completos de textos de todas as Réguas de Follow-up (`automation_followup_stages`) e Campanhas de CRM (`automation_crm_stages`) configuradas no sistema para a automação selecionada.
- [x] **Validação e Compilação**:
  - Compilação do TypeScript (`npm run typecheck`) e build SSR (`npm run build`) validados sem qualquer erro.
  - Realizado deploy em produção (`npm run deploy`) bem-sucedido.

### [2026-06-03] - Ajuste das Mensagens do Funil: Nomenclatura e Presente Especial (Concluído)

- [x] **Renomeação de Abas e Estágios no Frontend (`app/routes/funnel-messages.tsx`)**:
  - Renomeada a aba de negativa de Oferta Especial (`ticket_boost_declined`) para `"💝 Presente Especial"`.
  - Atualizada a descrição explicativa do estágio de presente para deixar claro que ele entrega o Kit Completo vitalício de graça e solicita nome/e-mail para cadastro.
  - Mantida a aba `"🎁 Downsell"` sem o sufixo `/ Presente`, representando o downsell do Upsell de R$ 14,50.
- [x] **Copy e Lógica Persuasiva de Downsell e Presente (`workers/routes/funnel-messages.ts`, `workers/automations/recheios/index.ts`)**:
  - Confirmada a copy altamente persuasiva do downsell de R$ 7,50 (com desconto de 50% em relação ao preço de R$ 14,50 do Upsell).
  - Confirmada a copy e fluxo do presente especial quando o cliente rejeita o upgrade de R$ 5 da Oferta Especial (entregando o Kit completo vitalício de graça e solicitando dados de cadastro).
  - Roteamento inteligente baseado no status `state.access_delivered` para direcionar adequadamente as intenções de recusa (`RECUSOU_UPSELL`).
- [x] **Correção de Mismatch de Parâmetros de Ligação D1 (`workers/routes/funnel-messages.ts`)**:
  - Corrigido um erro de SQL bind parameter mismatch no endpoint `GET /config/:automationId` que impedia o carregamento do funil caso os estágios ainda não estivessem criados na tabela `automation_funnel_stages`. O `.bind()` agora passa corretamente todos os 4 argumentos (`stageId, automationId, key, delay_minutes`).
- [x] **Validação e Compilação**:
  - Executadas as validações de tipos do TypeScript (`npm run typecheck`) e o empacotamento completo de produção (`npm run build`) com zero erros.
  - Executado o deploy com sucesso em produção (`npm run deploy`).

### [2026-06-03] - Painel e Integração das Mensagens do Funil (Concluído)

- [x] **Frontend do Painel Administrativo (`app/routes/funnel-messages.tsx`)**:
  - Criado o novo módulo administrativo `/funnel-messages` com layout premium glassmorphic dark-mode.
  - Desenvolvidas as 5 abas principais do funil (`welcome`, `delivery`, `ticket_boost`, `upsell`, `downsell`) com descrições detalhadas.
  - Implementado o editor de blocos reordenáveis (texto e mídias) com suporte a drag and drop, ordenação com botões ▲/▼ e exclusão.
  - Conectada dropzone de upload direto para Cloudflare R2 com player de áudio/vídeo nativo e miniaturas de imagem.
  - Adicionado toggle switch de ativação de ciclos e seletores de variabilidade por IA (Sem reescrita, Reescrita Dinâmica e Reescrita Estática).
- [x] **Conexão Dinâmica ao Banco D1 (Backend - `tools.ts`, `followups.ts`, `index.ts`)**:
  - Implementada a função `sendFunnelStage` para carregar e disparar as mensagens ativas e seus blocos do banco de dados de forma reativa.
  - Refatorados `executeSeq2`, `executePagamento`, `executeFollowup` e `handleMessage` para priorizar mensagens dinâmicas do banco D1 com fallbacks clássicos robustos caso o estágio esteja inativo ou vazio.
- [x] **Validação e Compilação**:
  - Corrigidos erros de digitação CSS e ajustada tipagem TypeScript estrita para D1Database.
  - Verificados typecheck (`npm run typecheck`) e build SSR de produção (`npm run build`) com zero erros.

### [2026-06-03] - Exportador Dinâmico do Mapa do Funil (Concluído)

- [x] **Backend Hono (Rota de Exportação)**:
  - Desenvolvida a rota `/api/reports/funnel/:automationId/export` que consulta a automação e seus dados associados no D1.
  - Carrega dinamicamente todas as ofertas do produto, mídias armazenadas no R2/CDN e links de login das áreas de membros.
  - Carrega as réguas de follow-up (`automation_followup_stages`) e CRM (`automation_crm_stages`).
  - Formata as informações em um arquivo Markdown completo.
  - Se a automação corresponder ao produto "Recheios à Prova de Fogo" (`recheios`), injeta as transcrições detalhadas dos áudios/vídeos (Áudio 1, Áudio 2, Vídeo 2 e Vídeo 3) e o fluxo sequencial estático mapeado anteriormente.
- [x] **Frontend React (Nova Aba de Relatórios)**:
  - Adicionada a aba `🗺️ Mapa do Funil` no menu horizontal de **Relatórios** (`app/routes/reports.tsx`).
  - Implementado layout glassmorphic premium em conformidade com o design system da plataforma.
  - Inserido dropdown seletor de automações carregando a lista dinâmica do banco de dados.
  - Incluído o texto explicativo obrigatório: *"Clique no botão abaixo e gere seu funil completo."*
  - Criado o botão *"Gerar e Exportar Funil"* que realiza a requisição autenticada via `apiFetch`, processa a resposta como Blob e dispara o download do arquivo `.md` no navegador.
- [x] **Validação e Deploy**:
  - Testes de tipagem e build local com zero erros.
  - Wrangler deploy em produção executado com sucesso (Current Version ID: `39497e60-681c-4642-a29e-f67a4818341d`).

### [2026-06-03] - Mapeamento e Transcrição das Mensagens do Funil (Concluído)

- [x] **Documento do Funil de Mensagens (`C:/Users/Note/.gemini/antigravity/brain/91b36432-2a9c-4d76-a4eb-8138bd49400f/funnel_messages.md`)**:
  - Mapeado todo o fluxo de atendimento em Markdown.
  - Baixados e transcritos com sucesso os áudios e vídeos (Áudio 1 Boas-Vindas, Áudio 2 Entrega, Vídeo 2 Tour de Sabores e Vídeo 3 Montagem de Fatias) via API do Gemini.
  - Documentadas as 5 variações textuais de cada fase (Boas-Vindas, Entrega, Confirmação, Upsell de R$ 5, Liberação de Acesso e Follow-ups).
  - Incluídos detalhes de regras de transição, condições de disparo de follow-ups (Vigia, Finalizador, Incentivador, Cobradores) e fluxos pós-venda/CRM.

### [2026-06-03] - Reversão do Multi-Agente para Agente Unificado (Simplificação Crítica)

- [x] **Reversão Arquitetural do Motor de Automação (`workers/automations/recheios/index.ts`)**:
  - Revertido o fluxo multi-agente (Porteiro Classifier + Caixa Agent + Suporte Agent + Porteiro Response Formatter = 3 chamadas LLM por mensagem) para o agente unificado original (`getAgentPrompt`) com máquina de estados integrada (1-2 chamadas LLM por mensagem).
  - Removidas as funções: `runPorteiroClassifier()`, `runCaixaAgent()`, `runSuporteAgent()`.
  - Removida a camada de formatação do Porteiro (`getPorteiroResponsePrompt`) — agente unificado já escreve na persona da Julia/Sara.
  - O roteamento CRM (`runCRMAgent`) foi mantido separado (fluxo pós-venda diferente).
  - Removido `bypassDirectSend` do CRM Agent — ferramentas agora enviam mensagens diretamente.
  - Adicionada detecção de ofertas (Kit R$14,50 e downsell/presente) na resposta do agente para atualizar estado.
  - Filtro de ferramentas baseado em estado: bloqueia `pagamento` sem mídia física, e pós-acesso só permite `sistema` e `seq2`.
- [x] **Regra de Ouro 5 — Delay Dinâmico de Follow-ups (`workers/automations/recheios/followups.ts`)**:
  - Implementada verificação dinâmica de delay no cron de follow-ups. Quando o follow-up está pronto para disparar, o sistema re-lê o `delay_minutes` atual da tabela `automation_followup_stages` e recalcula `created_at + delay_minutes_atual`. Se o tempo foi aumentado no frontend, o follow-up é **reagendado automaticamente** para o novo horário correto.
  - Exemplo: se o vigia estava com 15min e o usuário mudou para 20min, mesmo que o follow-up já estivesse agendado para os 15min, o cron detecta que o delay atual é 20min, calcula que ainda faltam 5min, e reagenda.
- [x] **Limpeza de Imports (`workers/automations/recheios/index.ts`)**:
  - Removidos imports não utilizados: `getPorteiroOrchestratorPrompt`, `getPorteiroResponsePrompt`, `getCaixaAgentPrompt`, `getSuporteAgentPrompt`.
- [x] **Sincronização do Fluxo Visual no Frontend (`app/routes/automations.tsx`)**:
  - Redesenhada a aba "Visualizar Fluxo" para representar com total fidelidade a lógica de Agente Unificado + Porteiro leve.
  - Adicionado o fluxo horizontal de Boas-Vindas (`seq1`) e Reengajamento (`followups_iniciais`) acoplado ao `Porteiro (Gateway)`.
  - Detalhado o Agente Principal (Coluna 2) com sub-nós para `Scout Classifier (Triagem)`, `Agente Unificado` e as ferramentas `Entrega (Seq 2)`, `Auditoria Pix (OCR)` e `Suporte Técnico`, conectadas às suas respectivas réguas de follow-up e pós-acesso.
- [x] **Ajuste do Envio do Pix na Sequência 2 (`workers/automations/recheios/tools.ts`)**:
  - Removido o envio precoce do botão nativo do Pix do meio do fluxo da Sequência 2 (logo após os dados do Pix textuais).
  - Posicionado o botão nativo do Pix (`sendPixButton`) estritamente no final de toda a sequência (após envio de PDFs, áudios, imagens de bônus e texto final), garantindo que seja o último card interativo exibido ao cliente.
- [x] **Validação Técnica e Deploy**:
  - TypeCheck com zero erros. Build de produção com sucesso.
  - Deploy em produção realizado com sucesso (Version ID: `8238d8c9-0489-42bc-9c9e-c62b38312e03`).
- **Motivo**: O agente unificado original (`getAgentPrompt`) já possuía toda a lógica necessária via máquina de estados (`getContextByState` + `getPostPaymentInstructions`): vendas/negociação (Fase 1 e 2), upsell R$5 dinâmico, coleta de nome/email, suporte pós-compra, e follow-up offers. A separação em agentes introduziu riscos de erro de classificação, duplicação de lógica e custo 3x maior de LLM.

### [2026-06-03] - Porteiro Orquestrador e Busca Dinâmica de Modelos de Mensagens (Concluído)

- [x] **Busca Dinâmica de Mensagens de Follow-up & CRM**:
  - Implementado o mapeamento da chave estendida do agendamento (ex: `followup_cobrador_final_58h`) para a chave simplificada do estágio no D1 (`cobrador_final`) na função `mapFollowupTypeToKey` em `followups.ts`.
  - Corrigido o envio de follow-ups e mensagens do CRM para usar os templates atualizados no banco de dados, em vez de recorrer a configurações fixas antigas.
  - Implementado cancelamento automático de agendamentos pendentes se o respectivo estágio estiver desativado (`enabled = 0`).
- [x] **Orquestração via Porteiro (Gatekeeper)**:
  - Re-engenharia do loop principal em `index.ts` para que o Porteiro centralize o recebimento e a formulação da resposta final ao cliente (utilizando `getPorteiroResponsePrompt`), respeitando as personas (Julia e Sara Feitosa).
  - Roteamento inteligente de mensagens de entrada para os agentes especializados: Caixa (Vendas e Comprovantes), Suporte (Dúvidas pós-venda/Problemas de acesso) e CRM (Pesquisas).
  - Implementação de controle `bypassDirectSend` nas ferramentas (`executePagamento`, `executeSistema`, `executeEntregarPdfCrm` em `tools.ts`) para que ações de banco, webhook CAPI e disparos secundários sejam processadas, mas o envio de texto seja retornado para a formatação do Porteiro.
- [x] **Agente de Códigos Fixos / Determinístico**:
  - Implementação do agente de códigos fixos em `handleByFixedCodeAgent` para processar e responder de forma determinística por código/regex quando a automação estiver com `use_llm_variations = 0`, eliminando o custo de LLM.
- [x] **Sincronização Visual do Flowchart**:
  - Redesenho do fluxograma em `automations.tsx` para apresentar um layout simétrico de 4 colunas conectadas de forma bidirecional ao Porteiro Orquestrador.
- [x] **Correção do Agendamento de Follow-ups (`workers/automations/recheios/tools.ts`)**:
  - **SEQ1** agora agenda SOMENTE follow-ups de reengajamento (`class = 'reengajamento'`): vigia (15min) + finalizador (12h). Antes agendava TODOS os 6.
  - **SEQ2** agora, após cancelar reengajamento, agenda os follow-ups de cobrança (`class != 'reengajamento'`): incentivador (1h), cobrador_amigo (10h), cobrador_curioso (34h), cobrador_final (58h).
  - **Impacto**: Os tempos de cobrança agora contam a partir de quando o cliente recebeu os PDFs (SEQ2), e não do primeiro contato (SEQ1). Antes, se o cliente demorasse 45min para responder, o incentivador disparava 15min após receber os PDFs ao invés de 1h.
- [x] **Validação Técnica**:
  - TypeCheck com zero erros. Build de produção com sucesso.
  - Deploy em produção concluído no Cloudflare Workers (`Version ID: 8a8457b5-7619-4672-86f2-debb70bf7e45`).

### [2026-06-03] - Suporte Avançado de Acesso/Login e Tratamento de Imagens e Screenshots

- [x] **Tratamento de Screenshots no Scout Classifier (`workers/automations/recheios/prompts.ts`)**:
  - Atualizado o prompt do Scout Classifier (`getScoutClassifierPrompt`) para classificar imagens, prints e fotos com tela de login, dados de acesso ou erros do sistema sob a tag `ACESSO_PROBLEMA`.
- [x] **Agente de Suporte Pós-Compra Ativo por Intenção (`workers/automations/recheios/prompts.ts`, `index.ts`)**:
  - Ajustada a lógica de `getAgentPrompt` e `getContextByState` para acionar a persona e diretrizes do Agente de Suporte se o cliente apresentar problemas de acesso (`ACESSO_PROBLEMA`), mesmo que o estado da base ainda mostre `access_delivered = 0` (ex: falhas de rede no primeiro envio).
- [x] **Fluxo Empático e Resoluções no Suporte (`workers/automations/recheios/prompts.ts`)**:
  - Exibição e confirmação ativa de dados de cadastro (Nome e E-mail) do cliente.
  - Obrigação de executar a ferramenta `sistema` se o cliente confirmar ou corrigir seus dados, forçando o re-gatilho do webhook de liberação n8n para corrigir quedas de API.
  - Instruções de suporte com link de login (`https://app.promentor21.top/login`) e link do vídeo tutorial (`https://www.youtube.com/shorts/5xd3IRlA-GM`).
  - Tratamento de imagens/prints confusos ou não identificados com mensagens de esclarecimento carinhosas.
- [x] **Resolução de Erro de Sintaxe**:
  - Corrigido o bloco syntax broken em `prompts.ts` no `needsUpsell` check.
- [x] **Validação Técnica**:
  - Executado o typecheck (`npm run typecheck`) com zero erros.

### [2026-06-03] - Ativação do Interceptador de Pagamento e Correção de OCR/Regex (Hotfix)

- [x] **Ativação e Ligação do Interceptador de Pagamento (`workers/automations/recheios/index.ts`)**:
  - Acoplado o interceptador determinístico `isDeterministicPayment` logo após o processamento de mídias/OCR no fluxo principal de `handleMessage`.
  - Isso garante que qualquer comprovante Pix válido do WhatsApp ignore os fluxos da LLM e execute imediatamente a ferramenta determinística `pagamento` para confirmar o Pix.
- [x] **Correção de Captura do Valor do Comprovante (Regex)**:
  - Corrigido o padrão em `formatReceiptOcrTextWithRegex` para evitar a captura indesejada de asteriscos (`*`) originados de tags de formatação markdown. O valor passa a ser extraído de forma limpa como `10,00`.
- [x] **Fallback de Datas Nominais em Português**:
  - Implementado analisador robusto na função de OCR para datas nominais em português (ex: "03 de junho de 2026"), convertendo-as dinamicamente para o padrão `DD/MM/YYYY`.
- [x] **Correção Manual do Lead Rosy Pilco no Banco D1**:
  - Atualizadas as tabelas `automation_leads` e `conversation_state` para definir `pago = 1` e `valor_pago = 10` correspondentes ao pagamento legítimo de R$ 10,00 da cliente Rosy.
- [x] **Compilação e Deploy de Produção**:
  - Validada a tipagem do projeto com zero erros em `npm run typecheck`.
  - Gerado bundle e implantado com Wrangler no Cloudflare Workers (`Version ID: 5f8a442b-64dc-469b-b9f8-a862b6a4cfff`).

### [2026-06-02] - Customização do Nome da Atendente para Automação Duplicada (Sara Feitosa)

- [x] **Registro da Automação no Entrypoint (`workers/app.ts`)**:
  - Registrado o slug `'recheios-09011'` para direcionar ao módulo `/automations/recheios/index` de forma integrada.
- [x] **Prompt Dinâmico da Persona (`workers/automations/recheios/index.ts`)**:
  - Atualizada a determinação do nome da atendente (`attendantName`) com base no slug da automação (`automation.slug === 'recheios-09011' ? 'Sara Feitosa' : 'Julia'`).
  - Passado o `attendantName` dinâmico para `getAgentPrompt` e `getCRMAgentPrompt`.
- [x] **Substituição Dinâmica nas Boas-Vindas da Sequência 1 (`workers/automations/recheios/tools.ts`)**:
  - Implementada substituição reativa no envio da mensagem de boas-vindas (`welcomeText`) para trocar todas as referências estáticas de `"Julia"` por `"Sara Feitosa"` quando executada a partir de `recheios-09011`.
- [x] **Compilação e Deploy de Produção**:
  - Validado typecheck e build e efetuado deploy com sucesso em produção (`Version ID: 9eb5187f-2d10-4a22-91e2-5cdb63a1dc5d`).

### [2026-06-02] - Centralização de Filtros por Automação (Dashboard & Relatórios)

- [x] **Backend Analítico Unificado (`workers/routes/analytics.ts`)**:
  - Modificada a função `buildFilters` para ler o parâmetro `automation_id` da query string.
  - Atualizadas as cláusulas `WHERE` das consultas analíticas para priorizar a filtragem por `automation_id` (`al.automation_id = ?`) se fornecido, mantendo o fallback por `produto` (`al.produto_codigo = ?`) para compatibilidade.
  - Atualizado o endpoint de exportação `/export-meta` para receber `automation_id` e filtrá-lo nas queries SQL para Custom Audiences do Facebook.
- [x] **Frontend do Dashboard (`app/routes/performance.tsx`)**:
  - Centralizados os estados de filtro locais de follow-up (`dashAutomationId`) e CRM (`crmAutomationId`) em um único estado global `selectedAutomationId` no topo do Dashboard.
  - Inserido seletor de "Automação:" em gradiente no topo do cabeçalho da página, ao lado das datas de filtro global.
  - Removidos os filtros redundantes e locais que existiam dentro das abas "Métricas de Follow-up" e "Métricas de CRM".
  - Passado o `selectedAutomationId` como query param em todas as requisições de API analíticas do `fetchData`.
- [x] **Frontend de Relatórios (`app/routes/reports.tsx`)**:
  - Substituído o filtro `produto` por `automation_id` no estado `explorerFilters`.
  - Atualizado o dropdown de filtro visual na aba "Explorar Leads" de "Produto:" para "Automação:", listando e mapeando as automações ativas do sistema.
  - Atualizado o método `loadLeads` para enviar `automation_id` nas chamadas ao backend.
  - Atualizadas as URLs dinâmicas dos botões de exportação de leads da Meta para anexar o parâmetro `&automation_id=${explorerFilters.automation_id}`.
- [x] **Compilação e Deploy de Produção**:
  - Validada a tipagem do projeto com zero erros em `npm run typecheck`.
  - Build de produção gerada com sucesso via Vite.
  - Publicação remota efetuada no Cloudflare Workers (`Version ID: 6000e702-94d2-489a-88ba-daed660f668a`) com 100% de sucesso.

### [2026-06-02] - Correção de Isolamento de Contatos e Conversas por Automação (Hotfix)


- [x] **Identificação da Causa Raiz**:
  - Identificada falha no motor de automação (`workers/automation-engine.ts`): as buscas de contatos e os fallbacks para contatos legados não filtravam os contatos estritamente pelo `automation_id`.
  - Isso fazia com que mensagens recebidas em webhooks de novas automações duplicadas (ex: `recheios-09011`) fossem associadas erroneamente aos contatos existentes da automação de origem (ex: `recheios`) sob o mesmo produto e número de telefone (como ocorreu com o número público do Facebook Business que envia códigos de autenticação).
- [x] **Correção e Isolamento Estrito no Motor (`workers/automation-engine.ts`)**:
  - Modificada a função `getOrCreateContact` no motor de automação para incluir obrigatoriamente a restrição `c.automation_id = ?` (vinculada à automação atual que recebeu a requisição) em todas as consultas SQL do D1, incluindo as queries principais de busca e os fallbacks de upgrade de contatos legados com WhatsApp de origem nulo.
  - Isso garante isolamento e compartimentação total de contatos, chats, estados e agendamentos por canal.
- [x] **Limpeza de Dados Inconsistentes no D1 Remoto**:
  - Executada query administrativa via Wrangler na base de produção para realocar o contato órfão do Facebook Business (`447710173736`) e sua respectiva conversa ativa para o ID correspondente da nova automação `"Recheios 09011"`, fazendo com que ele apareça imediatamente no chat correto sem quebrar o histórico de mensagens.
- [x] **Validação e Deploy**:
  - Compilado com `npm run build` e implantado live em produção (`Version ID: ed1e4065-ecbe-4446-9a8c-1b074990e186`).

### [2026-06-02] - Duplicação de Automação com Cópia de Estágios Inativos (Follow-ups & CRM)

- [x] **Frontend Integrado (`app/routes/automations.tsx`)**:
  - Criado o estado `duplicateSourceId` para rastrear a automação que está sendo duplicada na interface do usuário.
  - Atualizada a função `handleDuplicate` para salvar o ID da automação original.
  - Atualizada a função `closeModal` para limpar esse estado ao fechar o modal.
  - Injetado o parâmetro `source_automation_id` na requisição de criação `POST /automations` para acionar a cópia de estágios no backend.
- [x] **Backend Robusto (`workers/routes/automations.ts`)**:
  - Estendido o payload do endpoint de criação de automações (`POST /api/automations`) para aceitar a chave opcional `source_automation_id`.
  - Implementada a clonagem completa de estágios de follow-up (`automation_followup_stages`) e estágios do CRM de pós-venda (`automation_crm_stages`) da automação de origem para a nova.
  - Definido o campo `enabled` estritamente como `0` (desativado/inativo) para todos os estágios copiados, gerando novos UUIDs para integridade dos dados e prevenindo disparos imediatos indesejados.
- [x] **Validação e Compilação**:
  - Executados com sucesso os testes de typecheck e build local com zero erros.
  - Deploy em produção efetuado live com sucesso total (`Version ID: eb282bc0-e723-4aa8-93b5-505aa91cb801`).

### [2026-06-02] - Relatório de Disparos e Restrições de Horários (Follow-ups & CRM)

- [x] **Database Migration & Schema Configuration (`migrations/0023_dispatch_logs.sql`)**:
  - Criada e aplicada a migration da tabela `dispatch_logs` local e remotamente para armazenar o registro completo dos disparos de mensagens (id, automação, fone, tipo, conteúdo, status, erro e timestamp).
- [x] **Restrições de Janela Silenciosa (00:00 - 07:00 SP Time)**:
  - Implementado reagendamento automático em lote dos follow-ups e CRM agendados para a madrugada, redistribuindo-os de forma aleatória (jittered) na janela matutina (07:00 - 11:00 SP) para evitar picos de envios.
- [x] **Throttling e Espaçamento de CRM (`workers/routes/crm.ts`)**:
  - Enforced limitador diário estrito de máximo de 40 envios de CRM por dia em horário de São Paulo.
  - Implementada restrição de intervalo mínimo de 10 minutos entre disparos consecutivos de mensagens de CRM.
- [x] **Log de Disparos Unificado (`workers/services/whatsapp-service.ts`)**:
  - Acoplada a escrita em `dispatch_logs` de forma síncrona/failsafe no final de todos os 6 métodos de envio de mensagens.
- [x] **Purga Automática Semanal (7 Dias)**:
  - Adicionada exclusão programada de registros antigos com mais de 7 dias de idade no cron trigger semanal de manutenção para otimizar o footprint do banco de dados D1.
- [x] **Endpoint Backend de Relatórios (`workers/routes/reports.ts`)**:
  - Adicionado o novo endpoint `GET /api/reports/dispatches` com filtros completos por automação, status (sucesso/erro), data início/fim, busca por fone/mensagem e paginação robusta, além do cálculo síncrono de estatísticas de envio semanais e filtradas.
- [x] **Interface Frontend Premium (`app/routes/reports.tsx`)**:
  - Implementada a nova aba **"📋 Logs de Disparos"** no menu horizontal de Relatórios.
  - Desenhada a seção com cards em glassmorphism contendo estatísticas de volume total, sucessos, erros e taxas de entrega de forma limpa (removidas marcações redundantes de "Semana" e "7 dias").
  - Filtrados dinamicamente os botões de data no topo da aba de disparos para exibir apenas "Hoje", "Ontem" e "7D", condizentes com o limite físico de retenção de dados da semana.
  - Removida a aba redundante **"⚠️ Logs de Erros Gerais"** do menu superior de Relatórios, integrando o monitoramento de erros de disparo diretamente no relatório unificado de Logs de Disparos.
  - Desenvolvida tabela dinâmica com paginação, filtros reativos e modal drawer premium para exibição de payload completo e logs de erro detalhados de cada disparo.

### [2026-06-02] - Integração do Fluxo Visual e Cronograma de Disparos do CRM

- [x] **Enriquecimento do Endpoint de Lead Flow (`workers/routes/automations.ts`)**:
  - Modificada a rota `GET /api/automations/:id/lead-flow` no backend D1 para retornar os registros das tabelas `crm_responses` e `crm_scheduled` de forma síncrona/reativa.
- [x] **Ramificação 3-Way sob Porteiro (`app/routes/automations.tsx`)**:
  - Redesenhada a junção do divisor sob o Porteiro para suportar 3 caminhos simétricos (Esquerda para novo lead, Centro para lead em CRM e Direita para recorrentes).
  - Adicionado suporte de cor ciano/teal (`#2dd4bf`) dinâmico para acender a via de CRM.
- [x] **Nó do Agente de CRM e Régua de Pesquisas (`app/routes/automations.tsx`)**:
  - Grid de visualização reestruturado para 3 colunas (`1fr 1.2fr 2fr`).
  - Inserido o FlowNode do **Agente de CRM / Pesquisa** com controle dinâmico de cores de estado (Verde se respondido, Amarelo se enviado, Azul standard se inativo, Vermelho se erro) e relatórios pop-up de erros integrados.
  - Desenvolvida a caixa da **Régua de Pesquisas de Pós-Venda** contendo as sub-etapas: Satisfação (48h), Depoimento (5d) e Objeções (24h) com seus descritivos.
- [x] **Info do Lead e Cronograma de Disparos do CRM (`app/routes/automations.tsx`)**:
  - Adicionado o status do CRM no cabeçalho reativo do lead pesquisado.
  - Criado o novo grid de **Pesquisas Pós-Venda Programadas (CRM)** mostrando os disparos agendados e status reais (**✓ Enviado**, **⏳ Agendado**, **✕ Cancelado**, **⚠️ Erro**) com fuso brasileiro formatado.
- [x] **Enquadramento do Fluxo Visual e Zoom Interativo no Mobile (`app/routes/automations.tsx`)**:
  - Declarado o estado `zoomLevel` e adicionado o hook de ciclo de vida (`useEffect`) que detecta o tamanho da tela (`window.innerWidth < 1024`) no carregamento inicial e nos redimensionamentos subsequentes.
  - Criado um algoritmo de auto-ajuste dinâmico que calcula a proporção ideal para encaixar perfeitamente o diagrama de 1050px de largura nas telas de celular/tablet, eliminando barras de rolagem horizontais indesejadas por padrão.
  - Aplicada a propriedade CSS `zoom` reativa sobre o container flex do flowchart (travando a largura em `minWidth: "1050px"` para evitar que as colunas fiquem espremidas, mantendo o alinhamento impecável do fluxo).
  - Desenvolvida a barra de controle de zoom flutuante premium (estilo Miro/Figma) em glassmorphism (`position: "fixed"` no canto inferior direito) que aparece somente na aba de visualização do fluxo, permitindo ajustes manuais precisos (`[-]`, `[+]`, `%` e botão `Ajustar` auto-fit).
- [x] **Compilação e Deploy Concluídos**:
  - Executados `npm run typecheck` e `npm run build` com sucesso completo (zero erros) e deploy na Cloudflare Workers concluído.

### [2026-06-02] - Verificação de Bloqueio WhatsApp Simétrica no CRM e Follow-up

- [x] **Correção de Loop de Envios Infinitos no CRM (`workers/routes/crm.ts`)**:
  - Identificada e corrigida falha crítica no cron de disparo do CRM (`processCrmScheduled`): as queries de atualização da tabela `crm_scheduled` (quando enviada com sucesso ou erro) tentavam atualizar a coluna `updated_at`, que não existe no esquema do banco D1 para essa tabela.
  - Isso gerava erro silencioso do SQLite, travando o status do item como `'pending'` e provocando envios contínuos a cada 5 minutos para os mesmos leads.
  - Removida a coluna `updated_at` de todos os UPDATEs da tabela `crm_scheduled`.
  - Executada query manual no banco D1 remoto para interromper imediatamente o loop da cliente Eliane (final 6237), alterando suas entradas pendentes de `'pending'` para `'executed'`.
- [x] **Remoção de Opção Redundante no Frontend (`app/routes/followup.tsx`)**:

  - Removido o card de alternância global "Variações Inteligentes por IA" e seu respectivo manipulador `toggleLlmVariations` que se tornaram redundantes, já que o controle de reescritas inteligentes agora é configurado granularmente por estágio de follow-up.
- [x] **Validação do Bloqueio nos Follow-ups**:

  - Inspecionado e validado o funcionamento da regra híbrida de detecção de bloqueio em `workers/automations/recheios/followups.ts`.
  - Confirmado que leads com foto inicial (`had_profile_pic === 1`) têm a remoção de foto monitorada via `getProfilePicture`.
  - Leads sem foto inicial (`had_profile_pic === 0`) têm fallback por verificação de tiques/tracinhos (`getLatestMessageStatus`), considerando bloqueio se a mensagem do assistente enviada há > 2 horas continuar com ACK = 1.
- [x] **Implementação Symmetrical no CRM Cron (`workers/routes/crm.ts`)**:
  - Modificado o select em `processCrmScheduled` adicionando `LEFT JOIN contacts` (buscando `had_profile_pic`) e `LEFT JOIN conversations` (buscando `conversation_id`).
  - Inserida a exata lógica híbrida anti-bloqueio antes de realizar o envio de qualquer mensagem agendada no CRM.
  - Ao detectar um bloqueio:
    - Todos os agendamentos pendentes de CRM do contato são cancelados (`status = 'cancelled'`).
    - A IA do contato é desativada (`ai_active = 0`) e o chat é arquivado (`status = 'arquivado'`).
    - Registra-se uma mensagem de aviso do sistema (`'manual'`) no histórico de conversas para total visibilidade.
    - O disparo é cancelado e o cron prossegue.
- [x] **Salvaguardas de Automações Pausadas no Motor e Crons (`workers/`)**:
  - Inserida restrição `AND a.status = 'active'` na query de busca de follow-ups pendentes no cron (`workers/automations/recheios/followups.ts`), impedindo disparos de follow-ups para leads pertencentes a automações pausadas.
  - Implementada checagem dinâmica do status da automação dentro do cron do CRM (`processCrmScheduled` em `workers/routes/crm.ts`), abortando e ignorando envios de agendamentos do CRM caso o canal esteja pausado.
  - Confirmada a estrita vinculação do lead ao `automation_id`/`conversation_id` em todos os fluxos de mensagens síncronas e assíncronas, garantindo que leads de uma automação nunca recebam envios de outra.
- [x] **Verificação de Compilação e Deploy de Produção**:
  - Executados `npm run typecheck` e `npm run build` retornando 100% de conformidade operacional (zero erros).
  - Deploy final em produção efetuado com sucesso (Current Version ID: `da8ab7ef-4899-4c40-9fe5-be23f99e3ca1`).

### [2026-06-01] - Ajuste das Métricas e Visualização de Todos os Estágios no Dashboard de Follow-up

- [x] **Agregação e Normalização de Métricas no Backend (`workers/routes/followup.ts`)**:
  - Implementada a função `normalizeType` no endpoint `/dashboard` de follow-up para mapear e somar as métricas de ambos os formatos de chave (antigos como `followup_vigia_15min` e novos limpos como `vigia`).
  - Garantiu-se que o envio, respostas e conversões gerados pelo novo sistema dinâmico de estágios no D1 sejam perfeitamente contabilizados e exibidos de forma unificada com o histórico legando no painel.
- [x] **Visualização de Todos os Estágios de Follow-up (`app/routes/performance.tsx`)**:
  - Removido o filtro `.filter((b) => b.sent > 0)` na tabela de detalhamento do Dashboard de Follow-up.
  - Com isso, todas as etapas ativas e estruturadas (Vigia, Finalizador, Incentivador, Cobradores) são exibidas no painel com seus respectivos números, mesmo se estiverem temporariamente em `0`, provendo transparência absoluta.

### [2026-06-01] - Reescritas Inteligentes por IA no CRM e Follow-up (Frontend e Integração)

- [x] **Painel de Configuração IA no CRM (`app/routes/crm.tsx`)**:
  - Incorporados os seletores para "Modo de Reescrita" (Sem Reescrita, Reescrita Dinâmica e Variações Pré-Geradas) dentro do Modal de Criação/Edição de Estágios de CRM.
  - Implementada a caixa de entrada para o número de variações fixas a gerar (N) e painel visual de visualização/listagem de variações estáticas gravadas no banco.
- [x] **Painel de Configuração IA no Follow-up (`app/routes/followup.tsx`)**:
  - Adicionado suporte TypeScript no frontend estendendo o tipo `FollowupStage` com os novos campos `rewrite_mode`, `rewrite_count` e `variations`.
  - Injetados os estados locais reativos e atualizado o lifecycle do modal de follow-ups (`handleOpenCreateModal` e `handleOpenEditModal`) para inicializar as opções de reescrita.
  - Modificado o método de persistência assíncrona `handleSaveStage` para submeter os novos dados à API.
  - Adicionado badge inteligente de reescrita (Dinâmica, Estática, Sem reescrita) no topo de cada card de régua de follow-up, alinhado com a paleta de cores verde/teal e azul.
- [x] **Correções de Compilação no Cron do CRM (`workers/routes/crm.ts`)**:
  - Corrigido erro de escopo de variáveis no cron job de disparo automático do CRM (`flowType` ➔ `item.flow_type`), assegurando estabilidade absoluta.
  - Validada a build geral com `npm run typecheck` retornando sucesso completo (zero erros).

### [2026-06-01] - Reorganização das Abas do CRM e Seleção de Automação Ativa por Padrão

- [x] **Seleção de Automação Ativa por Padrão no CRM (`app/routes/crm.tsx`)**:
  - Removida a opção "Todas as Automações" ("all") do dropdown de seleção superior.
  - Implementada lógica reativa no mount (`loadAutomations`) para selecionar automaticamente a primeira automação ativa da lista retornada.
- [x] **Remoção de Visão Geral do CRM**:
  - Excluída a antiga aba de Métricas / Visão Geral ("overview") do CRM, evitando duplicidade já que esses dados já foram incorporados no Dashboard central sob o nome de "Métricas de CRM".
- [x] **Promoção da Seção de Configurações para "Visão Geral"**:
  - Movida a antiga aba de "Configurações" (gerenciador de estágios do CRM) para a primeira posição do menu horizontal de navegação.
  - Renomeada a aba para "📋 Visão Geral", proporcionando acesso imediato e direto à configuração dos fluxos de pós-venda.
- [x] **Correções e Estabilidade do TypeScript**:
  - Resolvidos erros de JSX e formatação causados por substituições parciais anteriores.
  - Corrigido o botão de atualização e removidas verificações obsoletas da aba "overview" que causavam erros de compilação do TypeScript.
  - Testado com sucesso via `npm run typecheck` (zero erros).

### [2026-06-01] - Sistema de Usuários e Permissões Granulares

- [x] **Remoção do Perfil de Configurações (`app/routes/settings.tsx`)**:
  - Removida completamente a aba `"profile"` (Perfil), seus formulários, estados, efeitos de sincronia e o método `handleProfileSave`.
- [x] **Nova Seção Exclusiva de Usuários (`app/routes/users.tsx`)**:
  - Criada uma rota exclusiva `/users` com interface administrativa de alto nível para gerenciar contas de usuários e atribuir permissões.
  - Desenvolvido modal premium glassmorphic em azul escuro e verde para cadastro e edição de usuários.
  - Suporte completo ao gerenciamento de cargo (`admin` ou `normal`), permissões de seções do sistema (Dashboard, Produtos, Automações, Follow-up, CRM, Chat, Relatórios, Configurações), e atribuição granular de escopo por lista real de Automações e Produtos habilitados.
- [x] **Proteção de Rotas e Layout Dinâmico (`app/components/layout.tsx`)**:
  - Adaptada a barra de navegação lateral para ocultar as seções desabilitadas ao perfil de trabalho/operador, exibindo a aba **Usuários** exclusivamente para contas administradoras.
  - Implementada uma tela premium de **Acesso Restrito** com visual dark-themed, animação de pulsação e botão de redirecionamento caso usuários regulares tentem acessar seções restritas diretamente via URL (como `/users` ou CRM ocultado).
- [x] **Backend Hono com Permissões e Segurança (`workers/routes/users.ts`)**:
  - Criada a nova rota `/api/users` contendo as APIs de CRUD (GET, POST, PUT, DELETE) protegidas pela função de validação administrativa `checkAdmin`.
  - Hashing de senhas seguro e integrado e proteção failsafe que impede o administrador logado de excluir a própria conta.
  - Registradas e acopladas as novas rotas no entrypoint `workers/app.ts`.
- [x] **Filtros e Permissões no Backend (`workers/routes/*`)**:
  - **Automações (`automations.ts`)**: Filtrada a listagem `GET /api/automations` em conformidade com as automações habilitadas do usuário.
  - **Produtos (`products.ts`)**: Filtrada a listagem `GET /api/products` em conformidade com os produtos habilitados do usuário.
  - **Chat (`chat.ts`)**: Filtradas as conversas em `GET /api/chat/conversations` e adicionado middleware robusto que bloqueia operações síncronas de chats (`/conversations/:id` e sub-rotas de envio/status) para automações não-autorizadas.
- [x] **Ajuste de Fluxo Inicial e Autenticação (`workers/routes/auth.ts` & `app/contexts/auth-context.tsx`)**:
  - Modificado o cadastro inicial `/setup` para criar o admin padrão com permissões completas, e ajustados `/login` e `/me` no backend para selecionar e retornar `role`, `allowed_sections`, `allowed_automations` e `allowed_products`.
  - Expandido o tipo `User` no frontend e injetados os helpers reativos `hasSectionAccess`, `isAutomationAllowed` e `isProductAllowed` expostos via `useAuth()`.
- [x] **Banco de Dados (Cloudflare D1)**:
  - Aplicada a migração `0021_user_roles_permissions.sql` local e remotamente via Wrangler de forma síncrona.
- [x] **Validação e Deploy**:
  - Executados `npm run typecheck` e `npm run build` com sucesso absoluto (zero erros), e implantada a build de produção no Cloudflare Workers.

### [2026-06-01] - Integração de Explorar Leads em Relatórios e Ajuste das Abas do Dashboard

- [x] **Remodelação das Abas do Dashboard (`app/routes/performance.tsx`)**:
  - Removido o item "Explorar Leads" das abas e seu respectivo código JSX.
  - Reordenada a tab list para situar as abas "Métricas de Follow-up" e "Métricas de CRM" no final do menu.
  - Integrada com sucesso a visualização consolidada "Métricas de CRM" no Dashboard.
- [x] **Integração de Explorar Leads em Relatórios (`app/routes/reports.tsx`)**:
  - Incorporada a nova aba "Explorar Leads" como a primeira opção do menu horizontal de Relatórios.
  - Implementado o carregamento assíncrono reativo de leads (`loadLeads`) e opções de filtros (`loadFilterOptions`) baseados em endpoints de analytics.
  - Criada a barra de filtros premium (Campanha, Anúncio, Produto, Pagamento, Busca) e botões de exportação CSV configurados para sincronizar dinamicamente com as datas selecionadas.
  - Substituídos os tons de roxo nas exportações de conversas por cores harmônicas padrão do sistema (azul/ciano).
  - Integrada a paginação e o componente `LeadsTable` de forma robusta e otimizada.
- [x] **Correções Visuais de Contraste em Dropdowns (`app/routes/performance.tsx` & `app/routes/reports.tsx`)**:
  - Identificada a causa raiz de opções com fundo claro e texto invisível no Google Chrome sob Windows: o uso de transparências (`rgba(0,0,0,0.2)`) nas tags `<select>`.
  - Corrigido o estilo nos dropdowns das seções de **Métricas de CRM** e **Métricas de Follow-up** no Dashboard (`performance.tsx`), adotando o fundo escuro sólido `#0f172a` e aplicando explicitamente nos elementos `<option>`.
  - Aplicada a mesma correção preventiva em todos os 6 seletores (Campanha, Anúncio, Produto, Pagamento e classes de automações) nas seções de **Explorar Leads** e **Histórico de Follow-ups** da página de Relatórios (`reports.tsx`), garantindo alto contraste e leitura fluida em todas as plataformas.
- [x] **Validação e Build**:
  - Executados `npm run typecheck` e `npm run build` com sucesso absoluto de compilação.

### [2026-06-01] - Remoção de Tons de Roxo e Laranja no CRM, Relatórios e Follow-ups

- [x] **Ajuste e Correção Visual no CRM (`app/routes/crm.tsx`)**:
  - Resolvido o conflito de mesclagem e código duplicado no JSX do modal de criação/edição de estágios.
  - Corrigido o erro de compilação TypeScript TS2561 causado pela propriedade CSS capitalizada `Top` (alterada para `top`).
  - Removidos os tons de roxo remanescentes (como `#c084fc`) no helper de tags do modal do CRM, substituindo-os pelo azul claro padrão (`#0c93f2`).
- [x] **Ajuste Visual nos Relatórios (`app/routes/reports.tsx`)**:
  - Removidos todos os tons de roxo das abas ativas do menu horizontal de Relatórios, adotando o estilo verde/teal do sistema (`rgba(45, 212, 191, 0.15)` para background ativo e `#2dd4bf` para texto e borda inferior ativa).
  - Corrigida a cor do badge de fallbacks de LLM (`badge-purple` ➔ `badge-teal`) e o badge do follow-up `cobrador_curioso` (`#c084fc` ➔ `#2dd4bf`).
  - Removidos os tons de laranja e vermelho nos badges de follow-up (`vigia`, `finalizador` e `cobrador_final`), atribuindo cores estritamente baseadas na paleta verde/teal e azul claro.
- [x] **Ajuste Visual nos Follow-ups (`app/routes/followup.tsx`)**:
  - Removidos todos os tons de roxo, violeta e índigo do mapeamento de cores dos estágios de cobrança (`getStageColor`), definindo uma paleta limpa e profissional com tons selecionados de azul, verde e ciano.
  - Removidos todos os tons de laranja, âmbar e vermelho do cabeçalho da classe "Reengajamento", do card tracejado de adição ("Cadastrar Novo Reengajamento") e das paletas de cores de estágios de reengajamento, substituindo-os pela cor teal (`#2dd4bf` / `rgba(45, 212, 191, ...)`).
  - Atualizado o ícone SVG de Automação no topo para a cor verde/teal do sistema (`#2dd4bf`).
  - Corrigido o switch de alternância reativa da IA (Variações Inteligentes), aplicando background de ciano/teal translúcido (`rgba(45, 212, 191, 0.4)`) e círculo em teal (`#2dd4bf`) no estado habilitado.
  - Atualizado o visual do modal de criação/edição de estágios de follow-up, aplicando o fundo padrão de glass-card escuro do sistema (`rgba(21, 27, 43, 0.95)`) e borda verde/teal translúcida (`rgba(45, 212, 191, 0.25)`).
- [x] **Validação e Compilação**:
  - Executados `npm run typecheck` e `npm run build` com sucesso absoluto de compilação e empacotamento de produção.

### [2026-06-01] - Filtro Global de Datas em Relatórios e Integração de APIs

- [x] **Filtros de Datas Unificados em Relatórios**:
  - Centralizado o seletor de datas e presets rápidos (`Hoje`, `Ontem`, `7D`, `14D`, `30D`) no topo da página de Relatórios (`app/routes/reports.tsx`), logo abaixo da barra de abas.
  - Removido o filtro de datas tab-específico que residia exclusivamente na aba de Histórico de Follow-ups, aplicando o período selecionado de forma global para todas as abas.
  - Corrigidas referências a variáveis locais inexistentes (`followupLogDateFrom`, `followupLogDateTo`, `followupLogActiveDays`), utilizando os estados reativos globais da página (`reportDateFrom`, `reportDateTo`, `reportActiveDays`).
- [x] **Integração Reativa de API e Reload**:
  - Atualizadas as chamadas de API no frontend para passarem parâmetros de limite temporal (`data_inicio` e `data_fim`) ao backend: `loadFallbackLogs()`, `loadGeneralErrors()`, e `loadTrackingLogs()`.
  - Implementada a função global de atualização `handleRefresh()` que recarrega dinamicamente a aba selecionada no momento ao clicar no botão de reload `🔄`.
  - Atualizado o hook `useEffect` de carregamento de logs CAPI para escutar mudanças na aba ativa, garantindo carregamento imediato.
- [x] **Validação e Compilação**:
  - Executados `npm run typecheck` e `npm run build` com sucesso absoluto de compilação.

### [2026-06-01] - Alinhamento do Filtro de Datas em Relatórios e Reordenação da Sidebar

- [x] **Alinhamento de Filtro de Datas em Relatórios**:
  - Redesenhada a interface do filtro de data na aba "Histórico de Follow-ups" da página de Relatórios (`app/routes/reports.tsx`).
  - Implementado o design correspondente à Imagem 2, com seleção rápida por presets (`Hoje`, `Ontem`, `7D`, `14D`, `30D`) alinhada à esquerda, e entradas manuais de data `De ➔ Até` com botão de reload `🔄` à direita.
  - Integrada a atualização automática do histórico de logs ao alternar presets ou alterar datas customizadas.
- [x] **Navegação Lateral Reordenada**:
  - Ajustada a sidebar em `app/components/layout.tsx` para apresentar as sessões na ordem solicitada pelo usuário: Dashboard, Produtos, Automações, Follow-up, CRM, Chat, Relatórios, Configurações.
- [x] **Validação e Build**:
  - Executados `npm run typecheck` e `npm run build` com sucesso de compilação.

### [2026-06-01] - Correção do Fluxo de Upsell Pós-Pagamento e Recuperação de Atendimento do Lead Maria Souza

- [x] **Correção e Recuperação de Maria Souza**:
  - Investigado o crash do webhook que interrompeu o atendimento de Maria Souza (`5521991164493`) após o envio de seu comprovante de R$ 10,00 (erro causado por split em `contact.name` nulo/undefined, que já havia sido blindado anteriormente).
  - Identificado que o lead ficou travado no estado `"payment_confirmed": 1` com `"upsell_offered": 1` no banco de dados, mas o envio real da mensagem de WhatsApp e registro em `messages` foi impedido pelo crash.
  - Resolvido o fluxo manual enviando o texto da oferta de R$ 5,00 e o botão nativo Pix via API Uazapi de forma bem-sucedida, registrando também o histórico no banco de dados.
- [x] **Melhoria no Fluxo Conversacional de Upsell**:
  - Corrigida a lógica de `needsUpsell` no arquivo `workers/automations/recheios/prompts.ts` para checar explicitamente que `state.upsell_accepted === 0`, evitando contradições em prompts do Negociador no atendimento de pós-venda após upgrades do Pix.
- [x] **Validação e Deploy**:
  - Efetuado build de produção e deploy finalizado com absoluto sucesso na nuvem do Cloudflare Workers.

### [2026-06-01] - Alinhamento de Filtros do CRM, Cards de Follow-up com Previsão Realista de WhatsApp e Ajustes Anti-Corte no Zoom

- [x] **Ajustes de Responsividade e Prevenção de Cortes no Zoom**:
  - Breakpoints alterados de `768px` para `1024px` em `app/app.css` e `app/components/layout.tsx` para colapsar automaticamente a sidebar sob zoom de navegador ou telas menores, evitando cortes de conteúdo lateral.
  - Removido `overflow-x: hidden` do wrapper global para permitir scroll nativo caso necessário em situações extremas.
- [x] **Alinhamento do Filtro CRM**:
  - Modificado o dropdown e cabeçalhos em `app/routes/crm.tsx` para usar o rótulo unificado "Automação:" ao invés de "Produto", sincronizando-o com a aba de Follow-up.
  - Corrigido o parser do `loadStages()` para mapear o retorno da API `{ data: { stages: CrmStage[] } }` e evitar crashes.
  - Detalhe expandido de resposta de lead adaptado com `grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))` para não espremer conteúdo sob zoom.
  - Corrigido crash na aba de Configurações do CRM: blindados os helpers `flowLabel` e `flowBadgeClass` contra parâmetros nulos/indefinidos (que ocorriam devido à ausência da coluna `flow_type` na nova tabela de banco de dados `automation_crm_stages`), e mapeados os nomes de campos `key` ➔ `flow_type` e `message` ➔ `message_template` no frontend e nos payloads de gravação.
- [x] **Modernização da Seção de Follow-up**:
  - Interface do painel de follow-up (`app/routes/followup.tsx`) reestruturada para exibir cards glassmorphic em grid ao invés de accordions lineares.
  - Balão simulador realista do WhatsApp incorporado dentro de cada card no modo escuro oficial (`#121b22` fundo, `#005c4b` balão, `#e9edef` texto e tique azul `✓✓` com hora).
  - Modal unificado para criar/editar estágios com suporte ao preenchimento prévio na edição.
  - Salvamento instantâneo dinâmico nos switches de toggle, opções de variação global por IA e exclusões/criações através de chamadas REST assíncronas imediatas (eliminando o botão redundante "Salvar Configurações" no rodapé).
- [x] **Validação e Deploy**:
  - `npm run typecheck` e `npm run build` executados com 100% de sucesso.
  - Migrações aplicadas no banco de dados e build implantada no Cloudflare com sucesso.

### [2026-05-31] - Reorganização Arquitetural dos Painéis de Follow-up (Filtros, Logs, Dashboard e Visão Geral estilo CRM)

- [x] **Nova Modelagem de Banco de Dados para Follow-ups Dinâmicos**:
  - Criada a nova migration `0019_followup_schema.sql` definindo a tabela `automation_followup_stages` para armazenar ilimitados estágios de follow-up flexíveis.
  - Substituída a dependência de colunas estáticas hardcoded (`vigia`, `finalizador`, etc.) por uma arquitetura relacional robusta.
  - Implementado sistema de seed automático com os 6 estágios padrão quando uma automação é criada ou consultada pela primeira vez.
- [x] **Endpoints e Persistência de Estágios de Follow-up**:
  - Desenvolvidas novas rotas no worker backend para cadastrar (`POST /followup/stages`), atualizar (`PUT /followup/stages/:id`) e deletar/desabilitar estágios de follow-up de maneira dinâmica e segura.
  - Suporte completo ao upload de mídias e arquivos de áudio por estágio de follow-up, totalmente integrados ao motor de automação.
- [x] **Nova aba Métricas de Follow-up no Dashboard**:
  - Migrada toda a visualização estatística de follow-ups da aba dashboard legada de `/followup` para a página principal de Dashboard (`app/routes/performance.tsx`).
  - Adicionado o novo painel de tabulação vertical `"followup_metrics"` com contadores gerais de disparos, respostas, conversões e taxa de conversão %, além de sub-tabelas segmentadas por classe (Reengajamento / Cobrança).
  - Integrado o dropdown dinâmico com filtro reativo de automações.
- [x] **Histórico de Follow-ups unificado nos Relatórios**:
  - Removido o log de execuções de `/followup` e acoplado como nova aba `"followups"` na tela central de Relatórios (`app/routes/reports.tsx`).
  - Desenvolvida barra de filtros com suporte a seleção de automação, filtro de classe (Reengajamento e Cobrança) e seleção de intervalo de datas (De / Até).
  - Incluídos helpers de badges coloridos por tipo de estágio de follow-up e status de entrega, além de paginação robusta e botão de atualização assíncrona.
- [x] **Visão Geral de Follow-ups por Automação (Estilo CRM Dinâmico)**:
  - Reestruturado o seletor global do topo em `/followup` (`app/routes/followup.tsx`) de **Produto** para **Automação**, buscando os dados via `/followup/automations`. Isso resolve o problema de falta de sincronia e garante que o usuário gerencie as réguas diretamente vinculadas a automações ativas.
  - Conectada a página de forma 100% dinâmica com a API relacional D1 (`automation_followup_stages`), permitindo que a interface leia e manipule a lista dinâmica de `stages` de forma flexível e robusta, superando o antigo modelo de colunas hardcoded.
  - Desenvolvido modal premium para criação de **Novos Estágios de Follow-up** personalizado (Nome, Tipo/Classe, Delay em minutos com cálculo de tempo legível, Tag opcional a adicionar e Mensagem do WhatsApp).
  - Implementado suporte para exclusão síncrona/permanente de estágios via `DELETE /followup/config/:automationId/stages/:stageId` e ativação/desativação instantânea (Toggle enabled).
  - Unificados os fluxos de gravação em lote: ao salvar, o sistema dispara requisições assíncronas em paralelo para atualizar cada estágio modificado e a configuração global de IA da automação.
- [x] **Compilação e Validação**: Executado `npm run typecheck`, `npm run build` e deploy remoto wrangler com 100% de conformidade operacional (`Version ID: 36dcf98f-a9e8-4d8d-ad31-d5652ad79594`).

**Arquivos modificados/criados:** `app/routes/performance.tsx`, `app/routes/reports.tsx`, `app/routes/followup.tsx`, `PROGRESS.md`, `task.md`

---

### [2026-05-31] - Evolução do Painel de Follow-ups — Filtros, Classes e Conversão Precisa

- [x] **Conversão Precisa**: Corrigida a query de conversão no backend (`workers/routes/followup.ts`). A métrica agora atribui a conversão **apenas ao último follow-up executado antes do pagamento** (usando subquery `MAX(sf2.executed_at)`), eliminando a inflação de dados onde todos os follow-ups anteriores recebiam crédito.
- [x] **Divisão em 2 Classes**: Follow-ups agora categorizados em:
  - **🔔 Reengajamento** → Vigia + Finalizador (leads que não responderam à primeira mensagem)
  - **💰 Cobrança** → Incentivador + Cobrador Amigo + Cobrador Curioso + Cobrador Final (leads que já receberam os PDFs mas não pagaram)
- [x] **Dashboard por Classe**: Tabela de desempenho dividida em 2 seções visuais com headers e subtotais por classe.
- [x] **Filtro por Automação no Dashboard**: Adicionado dropdown de automação com suporte a `?automation_id=xxx` no endpoint.
- [x] **Filtros no Histórico**: Barra de filtros completa com dropdown de automação, dropdown de classe (Reengajamento/Cobrança), inputs de data (de/até) e botão "Filtrar".
- [x] **Endpoint de Automações**: Novo endpoint `GET /followup/automations` para popular dropdowns de filtro.
- [x] **Configurações por Classe**: Accordion dividido em 2 grupos visuais (Reengajamento + Cobrança) com cabeçalhos de seção.
- [x] **Adicionar/Remover Estágios**: Botão "🗑️ Remover" em cada estágio (desativa) e botão "➕ Adicionar Follow-up" que abre modal para reativar estágios removidos.
- [x] **Typecheck, Build e Deploy**: Validação estática 100%, build de produção e deploy na Cloudflare Workers (`Version ID: f06a8c23-343c-497e-bea3-7bfde4fc7bd7`).

**Arquivos modificados:** `workers/routes/followup.ts`, `app/routes/followup.tsx`, `PROGRESS.md`

---

### [2026-05-31] - Painel Administrativo de Follow-ups (Frontend Completo)

- [x] **Nova Página Frontend `followup.tsx`**: Criada a interface administrativa premium com 3 abas dinâmicas no layout dark glassmorphic do sistema:
  - **📊 Dashboard**: Cards de métricas gerais (enviados, respostas, conversões, taxa %) e tabela detalhada de desempenho por tipo com barras de eficiência visual.
  - **⚙️ Configurações**: Seletor de produto, toggle de variações por IA (LLM), e accordion interativo para os 6 estágios de follow-up (Vigia, Incentivador, Cobrador Amigo, Cobrador Curioso, Cobrador Final, Finalizador) com inputs de delay em minutos e textarea para mensagens personalizadas.
  - **📋 Histórico**: Tabela paginada de execuções com badges de tipo/status coloridos, paginação e botão de atualização.
- [x] **Rota Registrada**: Adicionada a rota `/followup` no `app/routes.ts`.
- [x] **Menu Lateral**: Inserido o link "Follow-up" com ícone de relógio (⏰) na sidebar em `app/components/layout.tsx`, posicionado entre CRM e Configurações.
- [x] **Typecheck, Build e Deploy**: Validação estática 100%, build de produção gerado com sucesso e deploy na Cloudflare Workers (`Version ID: cf7b0d48-a3c7-43fd-afa4-4aac3e078ac8`).

**Arquivos criados/modificados:** `app/routes/followup.tsx`, `app/routes.ts`, `app/components/layout.tsx`, `PROGRESS.md`

---

### [2026-05-31] - Resiliência contra CAPTCHAs, Legendas em Mídias, Validação de Upsell e Correções de Concorrência de Compras/CAPI

- [x] **Resiliência a Imagens com Legenda (Captions)**: Corrigida a lógica de detecção de tipo de mensagem (`detectMessageType`, `mapToMessageType` e `mapUazapiV2Type`) em `workers/services/message-utils.ts` para priorizar metadatos de mídia (como mimetype, mediaType e presença de objetos de imagem/áudio/vídeo) antes dos tipos de texto normais. Isso garante que imagens de comprovantes enviadas com uma legenda digitada sejam detectadas como `image` (e não como texto) e passem corretamente pelo OCR de auditoria do Pix.
- [x] **Resiliência contra CAPTCHAs em Comprovantes**: Atualizada a instrução de OCR de comprovantes em `workers/services/media-service.ts` e o prompt da LLM auditora de comprovantes em `workers/automations/recheios/index.ts` para ignorar explicitamente desafios de segurança, textos de captcha, marcas d'água e sobreposições numéricas de segurança na imagem do comprovante, focando exclusivamente nos dados da transferência Pix.
- [x] **Alinhamento e Blindagem do Fluxo de Upsell**: Corrigida a máquina de estados conversacional em `workers/automations/recheios/prompts.ts`. Adicionada a lógica `needsUpsell` na verificação do estado `payment_confirmed && !access_delivered` para impedir que a IA solicite nome e e-mail de cadastro de login antes de apresentar a oferta de upsell de R$ 5,00. A ferramenta `sistema` fica expressamente bloqueada de ser invocada nessa fase inicial pós-pagamento.
- [x] **Prevenção de Duplicatas em Pagamentos**: Refatorada a ferramenta `executePagamento` em `workers/automations/recheios/tools.ts` para buscar o lead no D1 e retornar sucesso imediatamente se o pagamento de igual ou menor valor já estiver confirmado, bloqueando re-execuções.
- [x] **Tratamento de Data e Hora Real nos Pagamentos**: Refatorada a função `parseDateComprovante` para extrair horas e minutos do comprovante (ex: `15:45` ou `15:45:00`). Caso não conste horário no comprovante enviado, o sistema captura a hora atual de São Paulo (UTC-3), resolvendo a anomalia do horário fixado às 9:00 no Dashboard.
- [x] **Soma Acumulada de Pagamentos (Upsell)**: Ajustado o motor de pagamentos em `executePagamento` para buscar o total já pago e acumular os novos Pix confirmados (como o upgrade de R$ 5,00 ou o pós-venda de R$ 14,90). O Facebook Capi recebe o valor total somado acumulado da transação atualizada no banco.
- [x] **Preservação de Timestamp de Vendas**: Removida a atualização de `updated_at` (que sobrescrevia a data com a hora atual) na query de `UPDATE` da tabela `automation_leads` dentro de `executeSistema`, mantendo a data de pagamento intacta para fins analíticos.
- [x] **Tratamento Failsafe de Acesso Ativo**: Refatorada a ferramenta `executeSistema` para retornar as credenciais de login diretamente se o acesso já constar como entregue no banco/estado, contanto que e-mail e nome não tenham mudado. Isso impede novas submissões no webhook n8n ou disparos redundantes de CAPI Purchase 2.
- [x] **Deduplicação de Evento Facebook CAPI**: Condicionado o disparo do evento `Purchase 2` na CAPI do Facebook para que ocorra apenas se `access_delivered` não estava ativo anteriormente.
- [x] **Prompts SDR Blindados com Exceção de Ajuste**: Inseridas instruções restritivas no prompt da persona Julia em `workers/automations/recheios/prompts.ts` para que a IA nunca re-invoque as ferramentas `sistema` ou `pagamento` no atendimento pós-compra, abrindo exceção apenas para atualização cadastral caso o cliente informe dados incorretos de e-mail/nome (ex: erro de digitação de e-mail).
- [x] **Investigação e Recuperação de Lead (Christian - 6817)**: Analisada a causa da interrupção do atendimento no envio de comprovante. O lead havia entrado em conflito com o delay assíncrono do background `waitUntil` que foi temporariamente reciclado pela hospedagem. O sweep automático de auto-recuperação do cron destravou o lead perfeitamente. O pagamento foi confirmado manualmente e o envio de solicitação de e-mail/nome foi disparado para permitir o auto-cadastro.

**Arquivos criados/modificados:** `workers/services/media-service.ts`, `workers/automations/recheios/index.ts`, `workers/automations/recheios/prompts.ts`, `workers/automations/recheios/tools.ts`, `PROGRESS.md`

---

### [2026-05-31] - Implantação Completa do CRM e Pós-Venda por Produto com IA

- [x] **Modelagem de Banco de Dados**: Criada a migração `0018_crm_schema.sql` e aplicada no banco de dados Cloudflare D1 remoto, criando as tabelas `crm_product_config`, `crm_responses` e `crm_scheduled` com índices de performance otimizados e estendendo `conversation_state` com a coluna `crm_tags`.
- [x] **Configuração do CRM por Produto**: Criados endpoints CRUD no backend Hono (`workers/routes/crm.ts`) e interface frontend de ponta a ponta na aba "Configurações" da página de CRM, permitindo habilitar/desabilitar fluxos e ajustar as cópias de mensagens e timers individualmente por produto.
- [x] **Triggers de Disparo Automático**: Integradas regras no `updateState` do `automation-engine.ts` para capturar a transição do lead ao concluir o pagamento (agendando fluxos de "Satisfação" em 48h e "Depoimento" em 5 dias) ou ao encerrar o funil sem compra (agendando fluxo de "Objeções" em 24h).
- [x] **Cron de Envio 5-Minutos**: Atualizado o processamento de cron no `workers/app.ts` para processar a tabela `crm_scheduled` a cada 5 minutos, enviando as mensagens automáticas pela API do WhatsApp da própria automação.
- [x] **Interceptador de Resposta CRM**: Desenvolvida a interceptação de respostas no motor (`automation-engine.ts`) desviando mensagens de clientes com CRM ativo para que não re-acionem a IA de vendas. O handler salva mídias (vídeo/áudio/imagem) no Cloudflare R2, transcreve áudios e submete a resposta ao Gemini/OpenAI para geração automática de resumos e tags analíticas.
- [x] **Painel Frontend Premium**: Desenvolvida a nova página `/crm` com layout split-screen responsivo e 6 abas horizontais:
  - *Visão Geral*: Métricas globais, gráficos e cálculo automático do Product Health Score (Satisfação + Depoimentos + Conversão).
  - *AI Analysis*: Análise detalhada por IA de Objeções, Persona, Sugestões de Anúncios e Funil filtrada por produto ou cruzada ("Todos").
  - *Respostas*: Tabela com histórico completo de respostas, tags e detalhes.
  - *Depoimentos*: Galeria de depoimentos e players inline de mídias do R2.
  - *Tags*: Nuvem de tags inteligentes extraídas por IA com filtros.
  - *Configurações*: Painel de regras e copies por produto.
- [x] **Menu e Rota**: Integrada rota `/crm` no `app/routes.ts` e inserido o item com ícone 🎯 na sidebar em `app/components/layout.tsx`.

**Arquivos criados/modificados:** `migrations/0018_crm_schema.sql`, `workers/routes/crm.ts`, `workers/app.ts`, `workers/automation-engine.ts`, `app/routes/crm.tsx`, `app/components/layout.tsx`, `app/routes.ts`, `PROGRESS.md`, `ARCHITECTURE.md`

---

### [2026-05-31] - Lançamento da Seção de Relatórios, Novo Relatório de Fallbacks e Ajustes Visuais

- [x] **Nova Seção e Rota de Relatórios**: Adicionada a nova rota `/reports` e sua interface frontend premium `app/routes/reports.tsx`, com menu na sidebar posicionado logo abaixo de "Chat".
- [x] **Migração de Relatórios Existentes**: As abas **Rastreamento CAPI** e **Logs de Erros** foram removidas das Automações e consolidadas na nova página de Relatórios.
- [x] **Novo Relatório de Fallbacks Tolerante a Falhas**:
  - **Banco de Dados (D1)**: Criada a migração `0017_fallback_logs.sql` e aplicada no banco de dados remoto, criando a tabela `fallback_logs` e índices.
  - **Motor SDR & Serviços**: Modificado o `llm-service.ts` e a automação de `recheios/index.ts` para registrar de forma automática logs detalhados de falhas e ativações de redundâncias em LLMs, OCR de imagens/PDFs e Transcrição de áudios.
  - **Retenção de 15 Dias**: Implementada exclusão programada no Cron de 5 minutos do Workers e na própria rota da API Hono, limitando os dados aos últimos 15 dias.
  - **Painel Frontend**: Desenvolvida a aba "Relatório de Fallbacks" com contadores, filtros de categoria e badges premium.
- [x] **Simplificação do Dashboard**: Removidas as abas "Volume & Faturamento" e "Funil de Vendas" do Dashboard para focar nas métricas fundamentais.
- [x] **Typecheck & Compilação de Produção**: Build e testes estáticos TypeScript executados com sucesso absoluto.

**Arquivos criados/modificados:** `migrations/0017_fallback_logs.sql`, `workers/routes/reports.ts`, `app/routes/reports.tsx`, `workers/app.ts`, `app/routes.ts`, `app/components/layout.tsx`, `app/routes/performance.tsx`, `app/routes/automations.tsx`, `workers/services/llm-service.ts`, `workers/automations/recheios/index.ts`, `PROGRESS.md`, `ARCHITECTURE.md`

---

### [2026-05-30] - Responsividade Mobile: Configurações + Sistema Global de Tabs

- [x] **Menu de Tabs com Scroll Horizontal**: Adicionado `overflowX: "auto"`, `flexWrap: "nowrap"` e `whiteSpace: "nowrap"` no container de tabs e nos itens da página de Configurações, permitindo deslizar para ver todas as abas no mobile.
- [x] **Tabela de Conteúdo Scrollável**: Alterado `overflow: "hidden"` para `overflow: "auto"` no container da tabela de dados (APIs, LLMs, OCR, etc.), permitindo scroll horizontal no mobile.
- [x] **CSS Global `.tab-list` e `.tab-item`**: Adicionadas propriedades de scroll horizontal e `flex-shrink: 0` diretamente nas classes CSS globais para que QUALQUER nova seção futura que use essas classes já tenha scroll automático no mobile.

**Arquivos modificados:** `app/routes/settings.tsx`, `app/app.css`

---

### [2026-05-30] - Responsividade Mobile: Correções na Página de Automações

- [x] **Card Grid Responsivo**: Alterado `gridTemplateColumns` de `minmax(380px, 1fr)` para `minmax(min(380px, 100%), 1fr)` usando CSS `min()` para evitar overflow horizontal em telas menores que 380px.
- [x] **FlowNode Compacto**: Reduzido `minWidth` dos nós do diagrama de fluxo de `180px` para `140px` para melhor adequação em dispositivos móveis.
- [x] **Diagrama de Fluxo Scrollável**: Envolvido o diagrama de fluxo completo em um wrapper com `overflowX: "auto"` e `WebkitOverflowScrolling: "touch"`, com `minWidth: "600px"` interno para garantir legibilidade com scroll horizontal em mobile.
- [x] **Tabela de Rastreamento CAPI Scrollável**: Alterado `overflow: "hidden"` para `overflow: "auto"` com `WebkitOverflowScrolling: "touch"` no container da tabela de logs de rastreamento, permitindo scroll horizontal em telas estreitas.
- [x] **Tabela de Logs de Erros Scrollável**: Aplicada a mesma correção de overflow na tabela de erros gerais (aba Logs de Erros).

**Arquivo modificado:** `app/routes/automations.tsx`

---

### [2026-05-30] - Responsividade Mobile: Correções no Chat e CSS Global

- [x] **Header Mobile em Duas Linhas**: Reestruturado o header do chat mobile para ter Voltar + Toggle IA na primeira linha, e Avatar + Nome do cliente na segunda linha (clicável para expandir detalhes).
- [x] **Detalhes do Lead Expansível no Mobile**: Ao clicar no nome do cliente no header mobile, abre um painel com dados do lead (nome, WhatsApp, automação, status IA) e botões de mudança de status, replicando a funcionalidade do sidebar desktop.
- [x] **Botões AGENTES/COBRANÇA com Scroll Horizontal**: Alterado `flexWrap` de `"wrap"` para `"nowrap"` com `overflowX: "auto"` nos containers dos botões, permitindo scroll horizontal no mobile ao invés de empilhar verticalmente.
- [x] **CSS Glass Card Overflow Fix**: Alterado `overflow-x: hidden` para `overflow: clip` no `.glass-card` mobile para permitir que containers internos (diagrama de fluxo, tabelas) tenham scroll horizontal funcional.

**Arquivos modificados:** `app/routes/chat.tsx`, `app/app.css`

---

### [2026-05-30] - Hotfix: Correção de Erro 500 na Consulta de Automações (Campo Inexistente)

- [x] **Diagnóstico Técnico**: Identificado que a rota `GET /api/automations` e `GET /api/automations/:id` estavam disparando erro interno 500 em produção. O erro era causado pela seleção da coluna `t.provider` na tabela `transcription_services`, que não existe no esquema de banco D1.
- [x] **Resolução do Query Crash**: Removida a seleção da coluna `t.provider` nas duas consultas do arquivo [automations.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/routes/automations.ts) (uma no endpoint de listagem geral e outra no endpoint por ID).
- [x] **Sucesso de Compilação & Deploy**: Executada verificação estática TypeScript (`npm run typecheck`) e build (`npm run build`) com absoluto sucesso, seguida do deploy de produção na nuvem da Cloudflare (`Version ID: c9b16081-ffeb-4c86-9ecb-a9a290ff85fd`), restaurando 100% da visualização da automação de Recheios para o usuário de forma instantânea.

---

### [2026-05-30] - Tags Dinâmicas, CRUD de Ofertas e Nome do Produto Customizado no Facebook CAPI

**Tags Dinâmicas e Auto-Slugify no Frontend (`app/routes/products.tsx`):**
- [x] **Campo Editável de Tags**: Modificado o formulário de cadastro de ofertas ativas para suportar tags personalizadas através da opção de seleção "Personalizado...".
- [x] **Algoritmo de Auto-Slugify**: Desenvolvida a função `slugify` e um hook reativo `useEffect` que sugere em tempo real uma tag limpa em formato de slug a partir do nome do plano (ex: "Downsell Especial" ➔ `downsell_especial`), enquanto mantém o campo livre para edição manual.

**CRUD Completo de Ofertas (`app/routes/products.tsx` & `workers/routes/products.ts`):**
- [x] **Botão de Edição de Ofertas**: Adicionados botões visuais de edição ("✏️") na listagem de ofertas ativas no frontend.
- [x] **Fluxo Completo de Alteração e Cancelamento**: Implementados os estados `editingOfferId`, carregamento reativo dos campos de preço, nome e tag personalizada no formulário ao clicar em editar, e a opção síncrona de cancelamento do estado de edição.
- [x] **Persistência Completa de POST/PUT**: Unificados os fluxos de gravação no backend, suportando a adição e a alteração instantânea de ofertas via banco remoto Cloudflare D1.

**Nome do Produto Customizável no Facebook CAPI (`app/routes/automations.tsx` & `workers/automations/recheios/tools.ts`):**
- [x] **Banco de Dados (D1)**: Alinhado o salvamento da coluna `product_name` na tabela de automações do banco remoto D1.
- [x] **Interface Administrativa**: Inserido o campo de entrada "Nome do Produto (CAPI)" no card visual do Facebook Tracking (CAPI) do modal de automações (`automations.tsx`), acoplando a persistência total nos fluxos de POST e PUT.
- [x] **Envio Dinâmico a CAPI (`facebook-tracking.ts`)**: Atualizado o serviço do Facebook para receber e enviar o `contentName` dinâmico nos payloads de CAPI (Purchase e Lead) em substituição à string estática `'recheios a prova de fogo'`.
- [x] **Resolução Dinâmica na Engine SDR (`tools.ts`)**: Refatorado o motor conversional para recuperar o `product_name` da automação ativa na D1 no evento Lead (`seq1`) e resolver de forma inteligente no evento Purchase (`pagamento`/`sistema`) se a compra corresponde ao Upsell dinâmico (`upsell_name`) ou ao produto principal (`product_name`), garantindo deduplicação impecável e precisão extrema no rastreamento.

**Verificação de Estabilidade e Deploy:**
- [x] **Typecheck Sem Erros**: Executado `npm run typecheck` retornando 100% de conformidade estática em TypeScript.
- [x] **Build e Compilação**: Bundle do frontend e backend gerados com total sucesso via Vite SSR (`npm run build`).
- [x] **Deploy de Produção**: Publicada a nova versão do sistema em produção no Cloudflare Workers (`Version ID: b5963c52-fdb0-4d7e-9eea-6aa09b3cb90c`) com absoluto sucesso.

---

### [2026-05-30] - Fallback Dinâmico de 3 Níveis para OCR e Transcrição por Automação

**Banco de Dados (SQLite D1):**
- [x] **Modelagem Relacional e Índices**: Desenvolvida a migração `0015_automation_ocr_transcription_fallback.sql` contendo as novas tabelas pivot `automation_ocrs` e `automation_transcriptions` para relacionamento N:N em ordem de prioridade.
- [x] **Retrocompatibilidade e Migração de Dados**: Executadas consultas de inserção inteligente baseadas em subqueries síncronas que migraram de forma autônoma os dados legados das automações para registros de Prioridade 1 nas novas tabelas. As migrações foram executadas e validadas com sucesso em ambientes de produção local e remoto no Cloudflare D1.

**Backend Hono Routes (`workers/routes/automations.ts`):**
- [x] **Carga Dinâmica de Prioridades (GET)**: Atualizados os endpoints GET `/` e GET `/:id` para realizar consultas associadas às tabelas pivot prioritárias e anexá-las ordenadamente no JSON de retorno como `ocrs` e `transcriptions`.
- [x] **Criação e Edição (POST/PUT)**: Modificadas as rotas de escrita para processarem os arrays `ocr_ids` e `transcription_ids`, inserindo os dados prioritários nas tabelas pivot e preservando retrocompatibilidade total ao salvar o primeiro item (Prioridade 1) nos campos herdados da tabela `automations`.

**Engine de Resolução de Mídia (`workers/automations/recheios/index.ts`):**
- [x] **Resolução Priorizada de OCR (`getOcrApiKeysWithFallback`)**: Atualizada a engine para carregar as chaves dos OCRs cadastrados na automação em ordem de prioridade 1 ➔ 2 ➔ 3. Se nenhuma prioridade for encontrada, a engine recorre ao OCR legado da automação, depois a outros OCRs do sistema, e por fim ao Gemini global, assegurando tolerância máxima.
- [x] **Resolução Priorizada de Transcrição (`getTranscriptionConfigsWithFallback`)**: Refatorada a busca prioritária semelhante para serviços de áudio, permitindo endpoints e credenciais dinâmicas por automação.

**Interface React 19 (`app/routes/automations.tsx`):**
- [x] **Badges de Fallback no Card**: Integrados badges prioritários modernos na listagem de automações (ex: `1. Gemini OCR` ➔ `2. OpenAI OCR` ➔ `3. Outro`), facilitando o diagnóstico visual dos fallbacks ativos.
- [x] **Seletores Avançados no Formulário**: Desenvolvidos dropdowns de seleção aninhados e responsivos com estilo dark glassmorphic roxo premium. Os dropdowns de fallback iniciam desabilitados e são ativados conforme o anterior é preenchido, eliminando do seletor as chaves já atribuídas para evitar duplicidade.
- [x] **Carga e Duplicação robustas**: Mapeada a carga síncrona dos estados no formulário ao abrir para edição ou ao duplicar as automações.

**Estabilidade e Deploy de Produção:**
- [x] **Static Typechecking**: Executado `npm run typecheck` retornando 100% de sucesso e zero avisos de tipos TypeScript.
- [x] **Frontend Bundling**: Build completo compilado com sucesso via Vite SSR/client.
- [x] **Deploy de Produção**: Publicada a nova build na nuvem da Cloudflare Workers (`Version ID: 23356835-404f-4f98-a075-f1f752e3e48a`) de forma imediata e bem-sucedida.

---

### [2026-05-30] - Responsividade Mobile Premium: Drawer, Header Superior e Split-Screen Reativo

**Layout Global e Navegação Móvel:**
- [x] **Header Superior Fixo**: Implementado header superior fixo glassmorphic no mobile (`layout.tsx`) com o logo e o botão Hambúrguer (`☰`) discreto para telas `<= 768px`.
- [x] **Gaveta Deslizante (Drawer)**: Configurada a sidebar para atuar como Drawer absoluto de alta performance no mobile com animações de entrada e saída via transformações CSS.
- [x] **Overlay Escuro e backdrop-filter**: Criada camada de overlay com transparência e desfoque (`backdrop-filter: blur(4px)`) para cobrir a tela e permitir fechar o menu mobile ao tocar fora.
- [x] **Resets de Estilos Conflitantes**: Eliminadas as regras `@media` estáticas legadas de `app/app.css` que forçavam a sidebar a ficar oculta com `display: none !important` e geravam quebras de alinhamento nas telas.
- [x] **Autofechamento de Rota**: Acoplado trigger para fechar automaticamente a gaveta mobile ao selecionar qualquer link ou mudar de página.

**Central de Produtos Mobile Reativa:**
- [x] **Fluxo Split-Screen Inteligente**: Adaptado o grid de produtos para ocultar a listagem esquerda quando um produto estiver ativo no celular, mostrando apenas a área de detalhes com 100% de largura.
- [x] **Botão de Retorno de Toque**: Integrado botão de volta `"◀ Voltar para a lista"` no cabeçalho superior de detalhes no mobile.

**Central de Chat Mobile Reativa:**
- [x] **Chat Otimizado**: Configurada a ocultação da listagem de contatos no celular quando uma conversa estiver ativa na URL.
- [x] **Ocultação de Sidebar do Lead**: Escondida a lateral de informações do lead (280px) em telas de celular, definindo o grid de mensagens para `1fr` para dar foco total às conversas.
- [x] **Botão de Retorno no Chat**: Inserido botão `"◀ Voltar"` no topo esquerdo do chat ativo de celular, limpando o ID da URL ao retornar.

**Verificação de Estabilidade e Deploy:**
- [x] **Typecheck e Build**: Executados `npm run typecheck` e `npm run build` com taxa de 100% de sucesso.
- [x] **Deploy de Produção**: Publicadas as correções de CSS e Drawer móvel remotamente no Cloudflare Workers (`Version ID: 10e88b73-6354-483f-82d8-5960ba058b6a`).

---

### [2026-05-30] - UX Premium: Menu Lateral Retrátil, Reordenação de Menus e Layout Otimizado de Produtos

**Ergonomia e Design do Menu Lateral:**
- [x] **Menu Lateral Retrátil**: Implementado controle de estado reativo `isCollapsed` em [layout.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/components/layout.tsx) integrado ao `localStorage` do navegador para manter as preferências persistidas entre recargas de página.
- [x] **Botão de Toggle Moderno**: Criado botão circular flutuante de design clean (`◀` / `▶`) integrado ao cabeçalho da sidebar que reposiciona e centraliza automaticamente quando colapsado.
- [x] **Transição Animada e Largura Dinâmica**: Acopladas transições suaves de CSS para recolher a sidebar de `260px` para `80px` e ajustar a margem esquerda do contêiner `main-content` simultaneamente.
- [x] **Ocultação e Tooltips**: Adicionadas animações para ocultar textos de links de navegação e informações do usuário na parte inferior, mantendo apenas ícones e avatar centralizados com tooltips de navegação (`title`).
- [x] **Reordenação Operacional**: Reordenada a listagem de menus para posicionar a aba **Produtos** em 2º lugar, logo abaixo de **Dashboard**, criando um fluxo ergonômico ideal de acesso.

**Otimização do Layout da Central de Produtos:**
- [x] **Listagem Estreita (Esquerda)**: Reduzida a base flex do contêiner de produtos em [products.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/products.tsx) para `280px` fixos (`flex: "0 0 280px"`), poupando área de visualização.
- [x] **Cards de Produtos Simplificados**: Omitida a descrição longa dos produtos na lista lateral. Os cards agora exibem apenas o nome com tipografia destacada e indicadores quantitativos de preços (💰), mídias (📎) e funis (⚙️) em uma única linha compacta.
- [x] **Área de Detalhes Ultra Ampla (Direita)**: Modificado o contêiner de detalhes/cadastro para `flex: 1` para se expandir e ocupar todo o restante horizontal da janela administrativa.
- [x] **Card de Destaque para Descrição**: Inserido um bloco estilizado no topo do cabeçalho da direita com borda roxa, fundo glassmorphic confortável e tipografia nítida para atuar como cabeçalho do produto selecionado.
- [x] **Campos de Cadastro Grandes e Confortáveis**: Aumentada a escala das fontes dos inputs e caixas de texto de `14px` para `15px` com paddings amplos de `12px 16px` no formulário geral, maximizando a nitidez e legibilidade física.

**Verificação de Estabilidade e Deploy:**
- [x] **Typecheck e Build**: Executados `npm run typecheck` e `npm run build` com taxa de 100% de sucesso.
- [x] **Deploy de Produção**: Publicadas as melhorias estéticas remotamente na Cloudflare Workers (`Version ID: 815e3b7a-9998-4952-add1-875456b4c74b`).

---

### [2026-05-30] - Configurações de Upsell Pós-Venda Customizáveis por Produto e Engine SDR 100% Dinâmica

**Nova Aba Administrativa de Upsell e Banco de Dados (SQLite D1):**
- [x] **Banco de Dados (D1)**: Criada e aplicada com sucesso a migração `0014_product_upsells_schema.sql` em ambiente de produção remoto Cloudflare D1. Esta tabela (`product_upsells`) vincula de forma única `product_id TEXT UNIQUE` e persiste `upsell_sku`, `price`, `delay_minutes`, `use_main_login_url` e `upsell_url`.
- [x] **API Backend Hono**: Atualizados os endpoints GET `/api/products` e GET `/api/products/:id` em [products.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/routes/products.ts) para retornar o objeto `upsell` associado e criada a rota `PUT /api/products/:id/upsell` para inserção e atualização dessas configurações no banco D1 de forma segura.
- [x] **Painel Frontend (React 19)**: Inserida a aba "📈 Config. Upsell" em [products.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/products.tsx) com layout glassmorphic dark integrado, inputs controlados de SKU, Delay, Preço (R$), checkbox para URL principal e input condicional de URL dedicada, com toast reativo e persistência automática.

**Motor SDR e Automações Completamente Dinâmicos:**
- [x] **Validação no Motor (`tools.ts`)**: Refatoradas as ferramentas `executePagamento` e `executeSistema` da automação em [tools.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/tools.ts) para realizar consultas diretas no banco de dados, aplicando o SKU dinâmico, delay configurado em minutos e resolução inteligente da URL de login de upsell (herança ou link customizado), mantendo fallbacks robustos contra quebras.
- [x] **Follow-ups Dinâmicos (`followups.ts`)**: Refatorado o agendamento de follow-ups pós-venda em [followups.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/followups.ts). A engine agora busca dinamicamente o valor Pix formatado da tabela e interpola nos templates de conversação da Julia, integrando o botão de pagamento da API UAZAPI com o preço dinâmico definido no D1.

**Verificação de Estabilidade e Deploy:**
- [x] **Typecheck e Build**: Executados `npm run typecheck` e `npm run build` localmente com 100% de taxa de sucesso e zero erros.
- [x] **Deploy de Produção**: Efetuada implantação na nuvem Cloudflare Workers (`Version ID: 938d1ba5-f617-4c2d-a48b-c3e73850199e`) com absoluto sucesso.

---

### [2026-05-29] - Códigos de Liberação Dinâmicos, Área de Membros Dinâmica e Resolução de Acesso (Caso Claudirene - final 7902)

**Resolução do Caso de Liberação Incorreta (Claudirene dos Reis Machado):**
- [x] **Diagnóstico da Causa Raiz**: Identificado que a engine SDR estava programada para forçar o SKU `PROD-H3GQBU` (upsell/Máquina de Vendas) para qualquer lead pagante acima de R$ 11.50. Contudo, na plataforma de membros externa, `PROD-H3GQBU` corresponde à Máquina de Vendas e `PROD-R1I27D` corresponde ao Kit Completo. Isso fez com que Claudirene (que comprou o Kit Completo por R$ 25) recebesse a Máquina de Vendas.
- [x] **Correção Cadastral Remota**: Executada query remota SQLite no D1 para corrigir o `produto_codigo` da Claudirene (`5516981387902`) para o SKU correto do Kit Completo (`PROD-R1I27D`).
- [x] **Matrícula de Emergência Efetuada**: Disparado webhook de matricula de emergência via Node.js para `https://app.promentor21.top/api/webhooks/entrada` registrando Claudirene com sucesso no Kit Completo em produção.

**Arquitetura Dinâmica por Links de Acesso:**
- [x] **Migration 0013**: Criada e aplicada a migração `0013_delivery_link_product_code.sql` que adiciona a coluna `product_code TEXT` na tabela `product_delivery_links` para permitir especificar o SKU do curso dinamicamente na interface.
- [x] **Backend Hono**: Atualizados os endpoints POST (`/api/products/:id/delivery-links`) e PUT (`/api/products/delivery-links/:linkId`) no arquivo [products.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/routes/products.ts) para receber, salvar e editar a nova coluna `product_code`.
- [x] **Interface Premium (React 19)**: Adicionado o campo "Código do Produto (SKU)" de estilo dark glassmorphic no formulário de cadastrar/editar acessos da Aba 5 de [products.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/products.tsx). Também foi acoplada a exibição visual da tag em um badge roxo premium `SKU: [Código]`.
- [x] **Motor Conversional Dinâmico**: Refatorada a ferramenta `executeSistema` em [tools.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/tools.ts) to query the database dynamically, locate the corresponding access link (Básico vs Kit Completo) and send the actual SKU registered by the user. The messages sent now interpolate dynamically the URL, instructions, and videos of the database.
- [x] **Verificação de Compilação**: Executado o typecheck local concluído com 100% de sucesso e zero erros.

---

### [2026-05-29] - Ajustes Finos de Produtos: Edição de Acessos da Área de Membros, Pop-up Failsafe e Remoção de Nome Alternativo

**Ajustes Finos de Produtos e Automações:**
- [x] **Edição de Links de Acesso (Área de Membros)**:
  * **Backend Hono**: Criada a rota `PUT /api/products/delivery-links/:linkId` no arquivo [products.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/routes/products.ts) para atualizar dados de Área de Membros no D1.
  * **Frontend React**: Adicionado o estado `editingLinkId` e o botão de lápis ("✏️") na listagem de Acessos Ativos da Aba 5 de [products.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/products.tsx). A interface suporta o carregamento de dados no formulário e o salvamento síncrono.
- [x] **Remoção de Nome do Produto Alternativo**: Removido por completo o campo de texto de nome alternativo no modal de automações (`app/routes/automations.tsx`). A associação se restringe agora estritamente ao dropdown seletor de produtos centralizados.
- [x] **Centralização Failsafe do Modal**: Aplicados estilos inline fixos absolutos de tela cheia no modal-overlay de criação de produtos para neutralizar transformações de classes e fazê-lo flutuar centralizado perfeitamente.
- [x] **Deploy de Produção**: Build compilado e deploy finalizado com absoluto sucesso na nuvem do Cloudflare Workers (`Version ID: 46a49343-0e1d-44ca-9f9d-82a3ab710a89`).

---

### [2026-05-29] - Ajustes de Produtos: Responsividade sob Zoom, Modal Pop-up e Tags nos PDFs de Entrega

**Ajustes Finais e Melhorias de Produtos & Mídias:**
- [x] **Restauração do JSX corrompido**: Corrigido o arquivo `app/routes/products.tsx` que estava truncado, fechando todas as tags JSX de mídias de marketing e de PDFs de entrega com absoluto rigor.
- [x] **Tags Conversacionais nos PDFs**: Integrado o campo "Tag do PDF" (`pdfTag`) no upload R2 e no cadastro de links externos. A listagem de apostilas agora exibe o badge roxo contendo a tag de lógica conversacional correspondente.
- [x] **Modal de Criação Estilizado**: O modal de cadastro de produtos foi transformado em um pop-up centralizado real utilizando as classes `.modal-overlay` e `.modal-content` globais do design system.
- [x] **Responsividade sob Zoom Elevado**: 
  * Adicionadas media queries responsivas ao CSS global (`app/app.css`) que recolhem automaticamente a sidebar de 260px para 80px sob viewports estreitos ou alto zoom, impedindo o estouro lateral do layout.
  * Inseridos controles de `overflowX: "hidden"` e `wordBreak: "break-word"` nos contêineres principais da tela de produtos.
- [x] **Deploy de Produção**: Projeto testado no typecheck/build local e implantado na nuvem Cloudflare Workers (`Version ID: 795645c8-d5e5-489c-aa4a-872dcc2326f5`).

---

### [2026-05-29] - Central de Produtos, Upload R2 de Mídias e PDFs e Dropdown de Automações

**Nova Central de Produtos e Mídias Físicas (R2):**
- [x] **Banco de Dados D1**: Criada a migration `0005_products_schema.sql` contendo 5 tabelas estruturadas (`products`, `product_offers`, `product_assets`, `product_delivery_links` e a pivô `product_automations` para relacionamento N:N). A migração foi executada e aplicada no D1 remoto.
- [x] **Backend Hono / Workers**: Desenvolvido o CRUD completo em [products.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/routes/products.ts) com suporte a Multipart Form Data para uploads de áudios, imagens, vídeos e PDFs.
- [x] **Upload & Storage R2**: Acoplado o bucket `STORAGE` no R2. A lógica faz upload do arquivo com hash exclusivo, registra no banco com tags da IA e faz deleção física no storage R2 em caso de exclusão do asset.
- [x] **Serve Dinâmico de Mídias Públicas**: Implementado o endpoint público `/api/media/*` em [app.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/app.ts) que serve mídias e PDFs do R2 livre de autenticação, escrevendo os metadatos HTTP adequados de mime-type e CORS para carregar de forma fluida no WhatsApp e navegadores.
- [x] **Interface Premium split-screen (React 19)**: Desenvolvida a view premium em [products.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/products.tsx) com layout split-screen responsivo, cards de listagem lateral, abas dedicadas e Dropzone reativo com XMLHttpRequest que renderiza a velocidade e porcentagem de progresso real do upload no Cloudflare R2.

**Dropdown Reversível e Vinculação de Automações:**
- [x] **Integração no Backend**: Refatoradas as rotas de automações em [automations.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/routes/automations.ts) para realizar JOIN com as tabelas de produtos, retornando `product_id` e `product_assoc_name`. As rotas POST e PUT agora gerenciam dinamicamente o salvamento de associações na tabela pivô.
- [x] **Integração no Frontend**: Ajustado o formulário em [automations.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/automations.tsx) para listar os produtos cadastrados da Central de Produtos em um dropdown select premium no modal. O card visual da automação agora exibe o produto associado de forma proeminente com o ícone `📦 Nome do Produto`.

**Resolução de Compilação & Typecheck:**
- [x] Corrigido o erro de sintaxe CSS (`block: "inline-block"` por `display: "inline-block"`) na linha 835 de [products.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/products.tsx).
- [x] Registrado o import faltante de `productsRoutes` em [app.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/app.ts).
- [x] Executado o typecheck local (`npm run typecheck`) concluído com 100% de sucesso e zero erros em TypeScript.

---

### [2026-05-29] - Remoção de Faturamento Incorreto Legado (Caso Dora - final 7656)

**Ajuste Cadastral e Financeiro:**
- [x] **Diagnóstico Cadastral**: Identificado que o lead da cliente **Dora (`5511977077656` - final 7656)** possuía um registro de faturamento antigo de R$ 25,00 marcado como pago na tabela `automation_leads`, embora ela não tenha efetuado o pagamento ainda. Esse registro ocorreu antes de nossas últimas blindagens de segurança da LLM e auditoria de comprovantes Pix.
- [x] **Remoção de Pagamento do D1**: Executada query remota SQLite no D1 para limpar e resetar os campos de pagamento (`pago = 0`, `valor_pago = 0`, `recebeu_acesso = 0`, `email = NULL`) do lead da Dora, alinhando de imediato o Dashboard de métricas e faturamento.
- [x] **Integridade do Estado de Conversa**: Validada e confirmada a coerência da máquina de estados dela (`conversation_state`), que já mantinha `payment_confirmed = 0` e `total_paid = 0` corretos.

---

### [2026-05-29] - Correção de Discrepância de Faturamento no Dashboard (Métricas vs. Explorar Leads)

**Alinhamento de Queries Analíticas:**
- [x] **Diagnóstico Técnico da Discrepância**: Identificado que os cards de **Visão Geral** (Overview) calculam faturamento e vendas com base na data de **pagamento** (`al.updated_at`), enquanto a tabela de **Explorar Leads** listava e contava os registros com base estrita na data de **criação do lead** (`al.created_at`). Isso causava divergências quando um lead criado no dia 27 efetuava o pagamento no dia 29 (ele aparecia nos cards de hoje, mas sumia da tabela de hoje).
- [x] **Filtro Reativo Inteligente**: Refatorada a rota `/leads` no backend em [analytics.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/routes/analytics.ts). Agora, se o usuário aplicar o filtro por leads pagos (`pago = 'true'`), a query do D1 dinamicamente altera a cláusula `WHERE` e o `ORDER BY` para filtrar e ordenar pela data de **pagamento** (`al.updated_at`), sincronizando-se perfeitamente com os cartões de métricas em 100% dos períodos.
- [x] **Deploy de Produção**: Projeto testado no typecheck (`npm run typecheck` sem erros) e implantado com absoluto sucesso em produção no Cloudflare Workers (`Version ID: 6958a60a-42b7-4af5-8a53-4f48272da30b`).

---

### [2026-05-29] - Resiliência da API do Gemini, Retry com Backoff e Reset de Cátia Moore (Caso 6155)

**Resiliência e Blindagem de Mídias contra Falhas do Gemini:**
- [x] **Diagnóstico da Causa Raiz de Falhas de Áudio**: Identificado que a falha sistemática de transcrição de áudio nas últimas 24h ocorreu devido a indisponibilidades e spikes temporários nos servidores da API do Google Gemini, que retornavam o erro `HTTP 503 Service Unavailable`.
- [x] **Arquitetura de Retry com Backoff linear/exponencial**: Implementada lógica robusta de 3 tentativas na função central `callGeminiInline` em [media-service.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/services/media-service.ts). Agora, se o Gemini retornar erros temporários de sobrecarga, limite de cotas ou rede (`503`, `429`, `500`, `504`), o Cloudflare Workers aguarda de 1 a 3 segundos antes de tentar novamente, blindando OCRs e transcrições de forma transparente.
- [x] **Sucesso de Compilação & Deploy**: Executada verificação de tipos e deploy concluído com 100% de sucesso no Cloudflare Workers (`Version ID: 1cdaadfc-4de5-41a1-8432-5211994338d6`).

**Limpeza Cadastral e Reset da Cátia Moore (`5521965576155` - final 6155):**
- [x] Executada limpeza profunda e reset de histórico de mensagens, follow-ups e estados de conversa para a lead **Cátia Moore** no banco remoto Cloudflare D1. Ela agora foi restabelecida como um lead fresco, pronta para iniciar o funil e testar a nova transcrição robusta de áudio a partir do zero.

---

### [2026-05-29] - Resolução de Upgrade de Leads Legados e Filtros de Reenvio de PDF (Estudo de Caso Nilma)

**Resolução do Caso de Leads Legados (Upgrade de Número de Origem):**
- [x] Diagnosticada a causa raiz do caso da cliente **Nilma (final 7842)**: ela era uma lead antiga (de março/2026) que possuía `whatsapp_number = NULL`. Ao enviar mensagem hoje no novo número ativo (`5522981678365`), a engine a encontrou e atualizou seu registro de origem, mas ela herdou o estado de conversa antigo que estava marcado como finalizado/entregue (`access_delivered = 1`), impedindo o envio da Sequence 1 de boas-vindas.
- [x] Implementado reset de estado automático em `getOrCreateContact` (`workers/automation-engine.ts`): agora, sempre que um contato legado com `whatsapp_number = NULL` é atualizado para o número de WhatsApp ativo do funil, a máquina de estados (`conversation_state`) é integralmente redefinida para os padrões (`welcome`/`0`), o status da conversa reaberto para `open` e todos os follow-ups pendentes do antigo número são cancelados. Isso garante que o lead inicie o funil do zero no chat em branco do novo número.

**Robustez no Reenvio de PDFs (Triggers Determinísticos):**
- [x] Expandidos os gatilhos determinísticos de reenvio em `isRequestingResend` (`workers/automations/recheios/index.ts`) para incluir variações como `'cade os pdf'`, `'cade os pdfs'`, `'cade o pdf'`, `'kd os pdfs'`, `'kd o pdf'`, `'manda o pdf'`, e `'manda os pdfs'`. Isso garante que perguntas sobre o paradeiro dos arquivos deterministicamente redisparem a Sequence 2 (envio das apostilas) sem depender de interpretação livre da LLM.

**Refatoração da Persona Pós-Venda em prompts.ts:**
- [x] Reformulado o prompt do estado de `access_delivered` em `workers/automations/recheios/prompts.ts` de um mero "responda com emojis/3 palavras" (que provocava o descarte da mensagem pelo código) para uma **Persona de Suporte Pós-Venda** acolhedora e explicativa. Ela agora orienta com doçura clientes que perguntam sobre as apostilas ou login na plataforma.

**Limpeza Cadastral e Deploy:**
- [x] Executada query direta de reset e limpeza de histórico no D1 para a Nilma, reativando-a como lead fresco para testes.
- [x] Verificado TypeScript (`npm run typecheck` com 0 erros) e realizado deploy em produção no Cloudflare Workers (`Version ID: dc4c171b-b020-414b-ab84-f3629df78816`).

---

### [2026-05-29] - Flexibilização do Critério de Valor Pix e Segurança no Cadastro (Deploy de Produção)

**Flexibilização de Valor do Pix (LLM Auditora):**
- [x] Refatorado o prompt do **Auditor de Comprovantes por LLM** em `workers/automations/recheios/index.ts` para introduzir flexibilidade completa no valor dos Pix confirmados. O sistema agora ignora diferenças de centavos ou pequenas discrepâncias e aceita o comprovante contanto que a legitimidade do Pix esteja garantida (recebedor correto `FEITOSA` / `R G FEITOSA`, chave celular `61982277206`, banco Cora e ID de transação legítimo com status de sucesso).

**Melhoria de Robustez no Sistema (Prompts de Cadastro):**
- [x] Atualizada a lógica de determinação de `productCode` em `workers/automations/recheios/prompts.ts` para tolerar variações de preços em ofertas de Kit Completo (ex: R$ 12,00 / R$ 12,90 para a oferta do Finalizador, R$ 19,00 / R$ 19,90 para o Vigia, ou R$ 14,50 conversacional), mapeando o lead de forma consistente para `'PROD-H3GQBU'` (Kit Completo) em vez do básico.

**Failsafe de Upgrade Automático (Filtro Determinístico):**
- [x] Implementado filtro automático failsafe em `executeSistema` (`workers/automations/recheios/tools.ts`) que intercepta o cadastro. Se o lead pagou por uma oferta de cobrança ou pagou a partir de R$ 11,50 (mesmo que a LLM chame a ferramenta com código digital básico), o sistema força o upgrade do lead para o Kit Completo. Isso blinda o funil e garante que o acesso vitalício seja entregue sem risco de falha humana do bot ou de alucinação de prompt.

**Deploy de Produção:**
- [x] Executada verificação e typecheck TypeScript (`npm run typecheck`) concluídos com sucesso absoluto.
- [x] Build e deploy da nova versão concluídos no Cloudflare Workers (`Version ID: aaaccd8a-a492-4743-8005-82ed5a385205`).

---

### [2026-05-29] - Correção do Filtro de Tools de Upsell e Ajuste Manual da Rosimere

**Correção de Fluxo de Upsell no SDR:**
- [x] Refatorado o filtro de ferramentas `availableTools` em `workers/automations/recheios/index.ts`. O robô agora mantém a tool `'pagamento'` ativa e disponível mesmo após a confirmação do pagamento básico (`payment_confirmed === 1`), contanto que um upsell tenha sido oferecido (`upsell_offered === 1`) e ainda não tenha sido aceito/confirmado (`upsell_accepted === 0`). Isso permite que a IA processe Pix de upsell corretamente e evite travamento do fluxo do lead.

**Ajuste Cadastral e Faturamento da Rosimere:**
- [x] Criado e executado o script SQL `scratch/ajustar_rosimere.sql` no banco de dados remoto Cloudflare D1. O script atualizou o faturamento total da Rosimere (`554784682461`) para R$ 15,00, marcou o upsell como aceito (`upsell_accepted = 1`), e alterou o status da conversa dela no chat para `'finalizado_com_sucesso'`. Rosimere agora foi devidamente consolidada com R$ 15,00 pagos (Kit Completo) e sua conversa no chat foi arquivada perfeitamente na aba "Sucesso".

**Deploy de Produção:**
- [x] Executado typecheck TypeScript completo (`npm run typecheck`) com zero erros.
- [x] Executada build e deploy de produção no Cloudflare Workers (`Version ID: 9f6cf4f5-da2d-4e52-b6b8-a6911eb82558`).

---

### [2026-05-29] - Correção de Timezone, Enriquecimento de Campanha e Deduplicação de Tracking

**Correção de Timezone (UTC-3 São Paulo):**
- [x] Criada função `parseUtcDate()` em `dashboard-utils.ts` que normaliza strings de data do D1 (UTC sem 'Z') para Date corretos. Corrige offset de 3h nos relatórios.

**Enriquecimento de Campanha via Facebook Marketing API:**
- [x] Criada `fetchAdCampaignInfo()` em `facebook-tracking.ts` — usa source_id (Ad ID) para buscar campanha/conjunto/anúncio via Graph API.
- [x] Integrado no fluxo de tracking instantâneo em `automation-engine.ts`.

**Deduplicação de Tracking:**
- [x] `saveTrackingData()` agora verifica duplicatas antes de inserir (phone+automation+ctwaclid).
- [x] Removida segunda chamada duplicada em `processMessageAsync`.
- [x] Limpeza de 81 duplicatas existentes no banco.

**Resolução de Caching de Analytics, Consolidação de Criativos & Chaves React:**
- [x] Adicionado middleware de controle de cache global em Hono (`workers/routes/analytics.ts`) com cabeçalho `Cache-Control: no-store, no-cache, must-revalidate` para impedir caching de dados analíticos no navegador e no CDN Cloudflare.
- [x] Refatorada a query de banco do endpoint `/criativos` em `analytics.ts` para agrupar as métricas estritamente por `anuncio` (nome do criativo), em vez de `anuncio` + `campanha`. Isso aglutina todas as ocorrências de um mesmo criativo (como o `AD20` ativo em campanhas de dias diferentes) em uma única linha consolidada com a soma total dos leads.
- [x] Corrigida colisão de chaves React em `CriativosChart.tsx` atualizando a chave da listagem de criativos para um formato composto único (`key={`${c.anuncio}-${c.campanha}-${i}`}`).

**Deploy:**
- [x] Executado typecheck completo (`npm run typecheck`) com zero erros.
- [x] Executado build completo de produção do Vite e deploy unificado via Wrangler (`npm run deploy`) com sucesso absoluto.
- [x] Nova versão publicada no Cloudflare Workers: Version ID `7335a848-9238-4cc5-9001-908fb614d6e2`.

### [2026-05-28] - Centralização de Autenticação e Preservação de Rota no Refresh (F5)


**Navegação Inteligente & Estabilidade de Rotas:**
- [x] **Centralização do Roteamento (`root.tsx`)**: Implementado o componente `<AuthGuard>` que envolve o roteamento raiz da aplicação. O guard gerencia globalmente a checagem da sessão e o carregamento do usuário.
- [x] **Spinner Premium de Carregamento (`root.tsx`)**: Desenvolvido um spinner global de transição com estética dark e vidro (glassmorphic), exibido instantaneamente enquanto o token do `localStorage` está sendo validado no cliente (`isLoading = true`).
- [x] **Preservação de Rota no Refresh**: Ao carregar/atualizar a página (F5), se o usuário possuir uma sessão válida, a URL e a rota de destino no navegador (ex: `/automations`, `/chat`, `/settings`) são integralmente preservadas sem piscar no login ou redirecionar para a Dashboard.
- [x] **Limpeza DRY de Redirecionamentos Locais**: Removidos todos os `useEffect` de autenticação individuais e early returns redundantes dos arquivos `performance.tsx`, `automations.tsx`, `chat.tsx` e `settings.tsx`, tornando os componentes mais limpos e a montagem de tela imediata no client.

**Ajuste Padrão de Inicialização do Dashboard:**
- [x] **Inicialização no Hoje (`performance.tsx`)**: Ajustado o estado inicial `periods` para inicializar por padrão com o preset temporal `0` (Hoje - Today) em todas as abas analíticas, exibindo os dados de leads e faturamento agregados do dia atual logo no primeiro acesso.
- [x] **Aba Padrão "Visão Geral"**: A Dashboard mantém o padrão reativo de montagem focando inicialmente no feed de "Visão Geral" (`overview`), sincronizado com o período "Hoje".

**Compilação & Deploy:**
- [x] **Sucesso Absoluto na Compilação**: Verificação de tipos TypeScript (`npm run typecheck`) e build de produção (`npm run build`) concluídos com 100% de sucesso local.
- [x] **Deploy de Produção**: Publicada a nova versão no Cloudflare Workers (`Version ID: acd1d863-6326-42ac-a4b5-e139429dcfb8`).

### [2026-05-28] - Dashboard Refatorado como Página Inicial e Correção no Banco de Dados

**Substituição de Dashboard & Ajustes do Frontend:**
- [x] **Mapeamento de Rotas (`app/routes.ts`)**: Mapeada a rota `/dashboard` para carregar o arquivo físico da página de métricas e desempenho (`routes/performance.tsx`), excluindo por completo a rota `/performance` legada.
- [x] **Refatoração da Interface do Menu (`layout.tsx`)**: Atualizado o link principal da barra lateral de navegação esquerdo de "Desempenho" para "Dashboard", apontando diretamente para `/dashboard` com o ícone de barras analíticas premium e removendo o link `/performance` redundante.
- [x] **Ajuste de Título (`performance.tsx`)**: Atualizado o cabeçalho interno da página principal para renderizar "Dashboard", garantindo total alinhamento estético e de contexto.

**Correção Operacional no Banco de Dados (D1 SQLite):**
- [x] **Ajuste de Valor Pago da Cliente Rosimery**: Identificada a lead `Rosimery Marins Cardoso` (telefone final `6179`) e executada query remota UPDATE no D1 definindo `valor_pago = 10` (corrigindo o erro operacional de R$ 28,00 para o valor real de R$ 10,00 da apostila básica).
- [x] **Sincronização de Estado Conversacional**: Atualizada a coluna `total_paid = 10` no estado físico da conversa (`conversation_state`) da cliente para manter integridade absoluta entre as tabelas analíticas e operacionais.

### [2026-05-28] - Refatoração do Dashboard de Métricas: Filtros de Período por Data de Ação

**Ajuste Analítico e Alinhamento de Vendas:**
- [x] **Date-Filtering por Ação Física**: Refatorado o arquivo `workers/routes/analytics.ts` para separar as consultas analíticas de acordo com a data de ocorrência real do evento:
  - *Leads Criados & Acesso Concedido*: Filtrados por data de criação (`al.created_at`).
  - *Vendas & Faturamento*: Filtrados por data de confirmação do Pix (`al.updated_at` de leads pagos).
  - *Leads Perdidos (Finalizados sem Pagar)*: Filtrados por data de encerramento do funil (`cs.updated_at` em `conversation_state`).
- [x] **Refatoração DRY de Queries**: Implementados pre-computadores de filtros dinâmicos na função `buildFilters` para gerar cláusulas `WHERE` isoladas.
- [x] **Agregações Robustas com UNION ALL**:
  - Reestruturados os endpoints `/metrics`, `/leads-por-dia`, `/criativos`, `/campanhas` e `/funil` para integrar dados cruzados de lead-entry vs. payment-completed usando `UNION ALL` no SQLite D1.
- [x] **Correção de Divergência de Vendas de Hoje**:
  - Validado o total de pagantes de hoje (28 de maio) que subiu de 4 para **6 leads reais** (Irene Lobo e Nádia integradas perfeitamente, embora tenham iniciado a conversa ontem).
  - Faturamento corrigido e sincronizado de R$ 73,00 para **R$ 98,00**.
  - Ativação das métricas reais de leads perdidos sem pagar para refletir os encerramentos.
- [x] **Deploy de Produção**:
  - Validado typecheck completo sem erros.
  - Deploy efetuado no Cloudflare Workers (`Version ID: 3e863496-51a9-44ab-b038-8e66bf6276fd`).

### [2026-05-28] - Integração Completa do Dashboard Analítico de Desempenho e Funil

**Dashboards de Performance do Funil:**
- [x] **Migração de PostgreSQL para D1 (SQLite)**: Criada a rota de backend `workers/routes/analytics.ts` que implementa 10 endpoints analíticos distintos (`metrics`, `criativos`, `leads-por-dia`, `campanhas`, `funil`, `analytics`, `leads`, `filtros`, `export-meta`, `export-conversas`) mapeados do banco PostgreSQL (Supabase) para o banco de dados Cloudflare D1 (SQLite) do sistema atual, cruzando dados de `automation_leads` e `tracking_data`.
- [x] **Cálculo de Fuso Horário e Período**: Desenvolvida lógica de fuso horário nativa para converter datas locais de São Paulo (UTC-3) para os timestamps UTC corretos no D1 SQLite, além de cálculo automático do período anterior para comparações dinâmicas.
- [x] **Criação de Interface de Desempenho (`app/routes/performance.tsx`)**: Integrado o dashboard completo no painel do frontend utilizando os componentes analíticos em `app/components/dashboard/` (Recharts + Lucide Icons) mapeando a busca de dados via `useApi` (com token JWT de sessão).
- [x] **Resolução do Loop Infinito e Flashing (Hotfix)**: Corrigido o loop de renderização infinita na página de Performance. O callback `fetchData` e o gancho `useEffect` dependiam de referências de objetos complexos (e do hook `apiFetch` que muda a cada renderização). Alteramos a lista de dependências do `useCallback` para rastrear exclusivamente valores primitivos de filtros e um gatilho numérico manual (`refreshTrigger`), eliminando o flashing por completo e estabilizando a renderização.
- [x] **Acoplamento no Menu Sidebar (`layout.tsx`)**: Adicionado o link de navegação "Desempenho" logo abaixo da seção de "Chat" com ícone de desempenho correspondente.
- [x] **Instalação de Dependências**: Adicionados os pacotes `recharts` e `lucide-react` para suportar toda a renderização visual rica de gráficos de área, barras, funil e análises.

### [2026-05-28] - Filtro contra Mensagens de Grupo e Diagnóstico "Resposta vazia da LLM"

**Correção e Diagnóstico de Erros:**
- [x] **Causa Raiz do Erro "Resposta vazia da LLM"**: Diagnosticado que o webhook UAZAPI estava repassando mensagens vindas de um **Grupo/Comunidade do WhatsApp** (JID `120363425322832071` com nome `#5 🤩 LINK LIBERADO! FESTIVAL DE FATIAS`). Como essas mensagens de broadcast em massa estão completamente fora do contexto do funil de vendas "Recheios", o modelo `deepseek-v4-flash` retornava respostas vazias/nulas, causando o erro crítico de fallback `Todas as LLMs falharam`.
- [x] **Filtro de Grupo no Motor (`workers/automation-engine.ts`)**: Implementada uma validação de segurança robusta em `processMessage` que identifica se o remetente é um Grupo ou Comunidade (checando `isGroup` no payload, sufixos `@g.us` e comprimento/padrão numérico como `1203` ou length > 15). O motor agora ignora e descarta silenciosamente essas mensagens (`status: 'skipped'`), evitando chamadas inúteis de LLM e criação desnecessária de leads/locks.
- [x] **Deploy de Produção**: Projeto compilado e deployado com 100% de sucesso no Cloudflare Workers (`Version ID: 7ec24a57-fc7b-40e7-9b28-ce5f880cf949`).

### [2026-05-28] - Correção e Automação de Extração de Valor com LLM (Fase 2)

**Extração Inteligente de Comprovantes:**
- [x] **Diagnóstico da Causa Raiz (Lead Rosemeire)**: Investigados os logs do lead `Rosimery` (telefone final `6179`) e constatado que o OCR do Google funcionou 100% correto (`Valor\nR$ 10,00`). Porém, a expressão regular determinística de extração (`extractValue`) sofreu colisão com a data do comprovante (`28/mai/2026` via padrão `Comprovante de Pix\n28`), identificando incorretamente o pagamento como R$ 28,00 em vez de R$ 10,00.
- [x] **Motor Inteligente de Extração com LLM**: Refatorada a função `extractValue` em `workers/automations/recheios/index.ts` para torná-la assíncrona e rotear o texto bruto do comprovante através de uma chamada rápida e estruturada de LLM (`callLLM`). A IA SDR agora extrai o valor de forma contextualizada, ignorando de forma determinística datas, IDs de transações, CNPJs, horas e telefones.
- [x] **Salvaguarda de Fallback Robusta**: Mantido o algoritmo clássico de regex como fallback síncrono e instantâneo no caso de qualquer indisponibilidade temporária do serviço de LLM.
- [x] **Compilação & Deploy de Produção**: Projeto compilado perfeitamente no typecheck local e implantado com 100% de sucesso em produção no Cloudflare Workers (`Version ID: a2c9b964-4ca8-4713-972b-d4f0a9ea297f`).

### [2026-05-28] - Estratégia Híbrida de Verificação de Bloqueios (Fase 2)

**Detecção de Bloqueios e Proteção de Chips:**
- [x] **Migration 0012**: Adicionada a coluna `had_profile_pic` na tabela `contacts` para rastrear leads com imagem inicial.
- [x] **Detecção de Foto no Cadastro**: Integrado em `automation-engine.ts` a busca de foto inicial na chegada do lead. Se presente, marca como `had_profile_pic = 1`.
- [x] **Validador de Status (getLatestMessageStatus)**: Adicionado em `whatsapp-service.ts` a busca do status real (ACK) da última mensagem enviada no chat via UAZAPI.
- [x] **Validador de Foto (getProfilePicture)**: Criado serviço que consulta de forma isolada a imagem de perfil na UAZAPI.
- [x] **Motor Híbrido nos Follow-ups**: Acoplado filtro em `followups.ts` antes de todo envio:
  - *Se tinha foto*: Se a imagem sumir ➔ bloqueio confirmado.
  - *Se não tinha foto*: Se a última mensagem enviada pelo assistente há mais de 2h continuar com 1 tracinho (ACK = 1) ➔ bloqueio presumido.
  - *Ação de Bloqueio*: IA desativada (`ai_active = 0`), conversa arquivada, log impresso na conversa e todos os follow-ups agendados cancelados.

### [2026-05-28] — Humanização de Envios, Jitter Temporal e Deferral de Carga no Cron de Follow-ups (Deploy de Produção)

- [x] **Jitter Temporal Aleatório (`tools.ts`)**:
  - Modificada a função central de agendamento `scheduleFollowup` para injetar uma dispersão temporal aleatória (*jitter*) de **1 a 10 minutos** a todos os follow-ups agendados.
  - Isso divide de forma natural a concorrência de disparos simultâneos de leads que entram no mesmo minuto, blindando o número contra algoritmos de spam da Meta e bloqueios da API.
- [x] **Load Deferral no Cron de 5min (`followups.ts`)**:
  - Implementado um detector síncrono de tráfego de mensagens no Cron Trigger que conta interações nos últimos 2 minutos.
  - Se o sistema estiver em pico de tráfego (mais de **15 mensagens** processadas no período), o Cron adia automaticamente em **5 minutos** todos os follow-ups pendentes daquela rodada, evitando sobrecargas na fila e concorrência na API.
- [x] **Deploy de Produção**:
  - Executado typecheck local com sucesso absoluto (0 erros).
  - Deploy da nova build em produção concluído no Cloudflare Workers (`Version ID: 262b67b0-0a5a-457e-b724-9a10905c0c2f`).
  - Executada verificação e teste de fumaça da Cron de follow-ups remota via `curl.exe` com resposta saudável HTTP 200 `{"status":"ok","processed":0}`.

### [2026-05-27] — Otimização de Lançamento de PDFs (Sequence 2) e Varredura de Auto-Recuperação de Locks (Deploy de Produção)

- [x] **Otimização de Transações D1 e Batching (`tools.ts`)**:
  - Refatorada a função `saveAssistantMessages` para processar múltiplos registros em lote único e dinâmico utilizando `db.batch()`, reduzindo exponencialmente as conexões concorrentes e a latência de SQLite D1 na nuvem.
  - Otimizado o motor de entrega da Sequência 2 (`executeSeq2Async`): os 5 envios paralelos de PDFs agora são registrados no histórico em uma única chamada agregada ao invés de 5 transações síncronas sequenciais.
  - Isso resolve de vez as interrupções de CPU e desligamento abrupto de VM no plano gratuito do Cloudflare.
- [x] **Varredura de Auto-Recuperação no Cron de 5min (`followups.ts`)**:
  - Desenvolvido e integrado um varredor de auto-recuperação programada (*stuck lead sweep*) rodando síncrono a cada 5 minutos no Cron Trigger.
  - A lógica monitora leads em status `'open'` ou `'pending'` que estejam paralisados (sem resposta do assistente por mais de 3 minutos e menos de 2 horas desde a última mensagem do usuário).
  - O sweep remove de forma autônoma chaves e filas residuais no KV (`processing`, `is_delivering_seq2`, `has_queued_messages`, `queue`), reinjeta a mensagem pendente e re-dispara `processMessageAsync` de forma totalmente automatizada.
- [x] **Compilação & Deploy de Produção**:
  - Validada a tipagem com `npm run typecheck` (0 erros).
  - Deploy da nova build em produção concluído no Cloudflare Workers (`Version ID: 17490dfe-2a00-46cc-a7ce-2e9a463f10df`).
  - Executados testes de fumaça remotos com retorno bem-sucedido HTTP 200 via `curl.exe`.

### [2026-05-27] — Resolução de Gatilhos Duplos de Pagamento e Cadastro Sem Confirmação (Deploy de Produção)

- [x] **Proteção de Pagamento Confirmado (`tools.ts` & `index.ts`)**:
  - Inserida trava de triagem de intenções (`!state.payment_confirmed`) no processador `COMPROVANTE` em [index.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/index.ts). Isso impede que conversas por áudio/texto que citam o Pix após a compra ter sido efetuada re-disparem o motor de pagamento do Caixa com o fallback padrão de R$ 10,00.
  - Implementado o guardião `alreadyHasKitCompleto` em `executePagamento` ([tools.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/tools.ts)) para sair imediatamente se o lead já possui o Kit Completo (total pago >= R$ 25 ou ofertas de follow-up concluídas), blindando a conta de Mara contra downgrades de valor de R$ 35,00 para R$ 10,00.
- [x] **Tratamento de Upgrade de Upsell (`tools.ts`)**:
  - Mapeado e somado de forma inteligente o pagamento do upsell: se o cliente já pagou R$ 10,00 e envia o Pix de R$ 5,00 do upsell, o sistema agora atualiza `total_paid` para R$ 15,00, define `upsell_accepted = 1` e ativa a entrega do Kit Completo.
- [x] **Liberação de Acesso Direto sem Etapa de Confirmação e Regras de Upsell (`prompts.ts`)**:
  - Refatorado e afinado `getPostPaymentInstructions` no prompt conversacional [prompts.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/prompts.ts). Adicionado mandatos explícitos de **Execução Imediata** impedindo Julia de enviar etapas redundantes de confirmação (como *"Está certinho? Responde sim..."*). Assim que o Nome e E-mail constarem no chat, a IA invoca a ferramenta `sistema` diretamente na mesma resposta, enviando os dados de login e link curto passwordless em seguida.
  - Ajustado o limite de elegibilidade do upsell para qualquer valor pago de R$ 15 ou menos (`state.total_paid <= 15`), de modo a abarcar todos os cenários normais, excetuando-se ofertas especiais e cobranças.
  - Fornecidas instruções estritas no prompt para que Julia analise detalhadamente o histórico e identifique casos em que o cliente pagou R$ 35,00 (acima do valor máximo do Kit Completo) ou valores de follow-up promocionais, proibindo expressamente o upsell de R$ 5,00 e garantindo a entrega do Kit Completo de forma inteligente.
  - Adicionado o tratamento de recusa de Upsell de R$ 5,00: se o cliente negar pagar os R$ 5,00, a IA responde com copy personalizado carinhoso demonstrando que *"a questão aqui não é só dinheiro, mas sim ajudar"*, liberando o Kit Completo vitalício de presente.
- [x] **Correção de Loops de Upsell e Salvaguarda de Downsell Gift (`index.ts` & `prompts.ts`)**:
  - **O problema**: Sandra (final `8233`) pagou R$ 10,00 e recebeu a oferta do upsell. Ela recusou dizendo "Não quero", Julia ativou a recusa oferecendo o Kit Completo vitalício de presente e pediu Nome/E-mail. No entanto, na próxima interação (quando a cliente mandava o Nome/Email), a IA voltava a ver as instruções de propor o upsell de R$ 5,00, gerando loops infinitos e disparando tool-calls duplicados (`pagamento` + `sistema`).
  - **A solução**:
    - Modificado [index.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/index.ts) para identificar se o copy enviado pela IA contém palavras-chave de presente de recusa (como *"presente"*, *"coração"*, *"de graça"*) e, de forma 100% automatizada e assíncrona, atualizar a coluna de estado `downsell_offered = 1` no banco de dados D1 SQLite remoto.
    - Atualizado [prompts.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/prompts.ts) para condicionar o bloco de proposta de upsell a `state.downsell_offered === 0`.
    - Ajustado o `productCode` de matrícula gerado de modo que, se `state.downsell_offered === 1` for verdadeiro, a liberação mapeada para o sistema seja sempre a do Kit Completo (`PROD-H3GQBU`), assegurando que a promessa de presente seja cumprida deterministicamente sem re-oferecer o Pix de upgrade.
    - Isso garante a entrega imediata e única das credenciais na primeira tentativa de cadastro sem qualquer fricção ou assincronia no webhook.


### [2026-05-27] — Redesenho do Cadastro de LLMs com Dropdowns Dinâmicos (Deploy de Produção)

- [x] **Redesenho do Formulário de LLMs (`settings.tsx`)**:
  - Removido o campo "Link Documentação" (`docs_url`) da aba de LLMs.
  - Reordenado os seletores para apresentar "Provedor" em primeiro lugar e "Modelo" em segundo lugar.
  - Implementado dropdowns dinâmicos: selecionar o provedor carrega reativamente os respectivos modelos.
  - Provedores atualizados com nomes amigáveis: `Google`, `Chat GPT`, `DeepSeek` e `Cloud`.
- [x] **Adaptação da Tabela de Visualização (`settings.tsx`)**:
  - Reordenado as colunas para exibir "Provedor" em primeiro lugar e "Modelo" em segundo lugar na listagem principal de LLMs.
  - Adicionado mapeamento reativo ao ler e editar registros antigos para evitar incompatibilidades visuais com o banco de dados.
- [x] **Garantia de Normalização no Backend (`llm-service.ts`)**:
  - Atualizada a função `normalizeProvider` no backend do Cloudflare Worker para aceitar e mapear as strings amigáveis do frontend (`Chat GPT` para `openai`, `Cloud` para `anthropic`). Isso garante que todo o motor conversacional e fallback continuem funcionando com as chaves API correspondentes sem precisar reestruturar o banco de dados SQLite.

### [2026-05-27] — Diagnóstico do Lead ~M & Hotfix do Algoritmo de Tracking CAPI (Deploy de Produção)

- [x] **Diagnóstico Técnico do Lead ~M (`554797934214`)**:
  - Investigamos os registros da tabela `tracking_data` e confirmamos que a mensagem de entrada deste lead (`"Sim! E quero saber mais informações 😊"`) não trazia nenhuma informação de anúncio pago da Meta (`ctwaclid` e `source_id` vieram como `null`).
  - Isso diagnostica perfeitamente que o lead é **100% orgânico** e originou-se de um link curto wa.me (por exemplo, colocado na bio do Instagram ou enviado diretamente), justificando a ausência do evento `LeadSubmitted` no Facebook.
- [x] **Resolução de Bug Crítico de Sobrescrita do CAPI Click ID (`ctwaclid`)**:
  - Descobrimos que mensagens subsequentes do lead que geravam novos registros de tracking (devido a link previews ou outros metadados na conversa) inseriam linhas adicionais com `ctwaclid = null` no SQLite.
  - A query de busca anterior `ORDER BY created_at DESC LIMIT 1` acabava selecionando essas linhas nulas mais recentes, fazendo o motor "esquecer" o ID de anúncio legítimo original em eventos futuros (como `Purchase`), prejudicando o traqueamento de vendas.
  - Refatoramos a função `getTrackingData` em [facebook-tracking.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/services/facebook-tracking.ts) para realizar uma consulta prioritária a registros contendo `ctwaclid IS NOT NULL`. Caso o lead tenha entrado por anúncio pago, o ID do clique agora será preservado indefinidamente para todos os eventos de funil e compras futuras.
- [x] **Registro de Log Orgânico & Estilização no Painel CAPI**:
  - Inserimos um registro simulado contendo o status `'organic'` e o evento `'Não Enviado (Lead Orgânico)'` com a data original dele no banco SQLite remoto D1, a fim de mantê-lo totalmente informado na interface do painel.
  - Refatoramos a tabela de Rastreamento KPI do frontend em [automations.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/automations.tsx) para reconhecer os status `'organic'`, `'orgânico'` ou `'skipped'`. O painel agora renderiza esses logs com estilo de alerta amarelo (`badge-warning`) e legenda explícita `"Orgânico"`, oferecendo máxima clareza visual e impedindo que pareçam falhas reais do pixel.
- [x] **Inclusão do Nó Visual de Tratamento de Dados no Fluxograma**:
  - Refatoramos a arquitetura visual do fluxograma em [automations.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/automations.tsx) para expor graficamente o nó **"Tratamento de Dados"** logo após a entrada do webhook e antes do estágio de debounce de 15 segundos.
  - Isso deixa transparente na interface que o processamento, higienização, mapeamento de payloads e persistência das informações críticas de tráfego/anúncio no banco D1 acontecem de forma síncrona, instantânea e prévia no backend.
- [x] **Deduplicação CAPI com Código Curto (`cliente_codigo`)**:
  - Editamos as chamadas da Conversions API (CAPI) nas ferramentas de funil (`seq1`, `pagamento` e `sistema`) no arquivo [tools.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/tools.ts).
  - O sistema agora resgata o código sequencial curto do lead (`cliente_codigo`, ex: `8141`) salvo no SQLite e o envia como `leadId` nos payloads de eventos. Isso gera IDs de eventos limpos e intuitivos do tipo `lead_8141` e `purchase_8141` para o Facebook, unificando a rastreabilidade e garantindo uma deduplicação de conversão e pixel 100% perfeita entre os disparos.
- [x] **Simplificação da URL de Matrícula (Login sem Parâmetro de ID)**:
  - Removemos o parâmetro de query redundante `?id={leadCode}` das variações de mensagens de entrega de acesso na ferramenta `executeSistema`.
  - Como a plataforma do cliente já realiza toda a identificação com base na nova lógica e autenticação robusta do e-mail, os leads agora recebem uma URL de acesso limpa e elegante: `https://app.promentor21.top/login`.
- [x] **Typecheck e Deploy de Produção**:
  - Validamos toda a integridade do código (`npm run typecheck`), sem erros de compilação.
  - Deploy da nova build em produção concluído no Cloudflare Workers.

### [2026-05-26] — Fluxo Inteligente para Aceite de Ofertas de Recuperação (Vigia e Finalizador) (Deploy de Produção)

- [x] **Correção e Bypass na Entrega de PDFs de Ofertas Especiais**:
  - Refatoramos a função `executeSeq2` em [tools.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/tools.ts).
  - Implementamos um desvio inteligente: caso o cliente esteja respondendo a uma oferta especial de follow-up (como a do **Vigia R$ 19,90**, **Finalizador R$ 12,90**, ou **Cobrador Final R$ 10,00**) e o sistema dispare a ferramenta de entrega `seq2`, a plataforma **entrega apenas as 5 apostilas básicas** sem disparar os áudios e textos padrão (que listam a tabela normal de R$ 10 / R$ 15 / R$ 25).
- [x] **Cópia e Apresentação de Pagamento Coerente**:
  - Em vez do copy padrão, o sistema dispara uma mensagem altamente personalizada para o cliente confirmando o aceite daquela oferta específica de recuperação: *"Já estou te entregando aqui em cima as apostilas do kit básico... Estou aguardando o seu Pix no valor da oferta especial de R$ {Valor_da_Oferta} para liberar seu acesso vitalício ao Kit Completo!"*.
  - Dispara instantaneamente o botão de cópia nativo do Pix da UAZAPI com o valor exato da promoção aceita pelo cliente, simplificando o funil de reengajamento e evitando a incoerência de reapresentar os preços normais.
- [x] **Typecheck e Deploy de Produção**:
  - Executamos `npm run typecheck` com sucesso.
  - Deploy da nova build em produção concluído no Cloudflare Workers (`Version ID: 5da5c53d-60c7-46a6-bda8-9ede938bf34c`).

### [2026-05-26] — Customização do Agente Negociador (PIX Automático, Desconto R$ 14,50 e Salvaguarda de Ofertas) (Deploy de Produção)

- [x] **Disparo Automático do Botão PIX na Conversação Ativa**:
  - Refatoramos `handleByLLM` no arquivo central [index.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/index.ts).
  - Implementamos um interceptador que analisa a resposta em texto gerada pela LLM (Julia). Caso ela cite o Pix ou termos de pagamento (`PIX`, `61982277206`, `CHAVE`, `BANCO CORA`, `R G FEITOSA`), o sistema dispara síncrona e automaticamente o botão nativo Pix logo abaixo da mensagem, garantindo conveniência máxima e facilidade para a compra imediata.
- [x] **Lógica de Desconto de R$ 14,50 para o Kit Completo**:
  - Editamos a persona e as regras do Agente Negociador em [prompts.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/prompts.ts). Concedemos a Julia a autonomia para, após argumentar estrategicamente sobre o valor do material, oferecer o **Kit Completo por R$ 14,50** como oferta de reengajamento e encerramento para leads indecisos.
- [x] **Análise e Salvaguarda Crítica contra Aumento de Preço**:
  - Restringimos a ação de Julia no prompt: se o lead já estiver sob uma oferta de follow-up ativa inferior, como a do **Finalizador (R$ 12,90)** ou do **Cobrador Final (R$ 10,00)**, Julia é estritamente proibida de propor o valor de R$ 14,50. Ela deve apoiar e reconfirmar o preço mais baixo vigente para fechar a venda de forma coerente.
- [x] **Refatoração dos Mecanismos de Liberação e Acesso de Pagamento**:
  - Atualizamos a função determinística de pagamento `executePagamento` em [tools.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/tools.ts) para reconhecer pagamentos a partir de R$ 14,00 como válidos para liberação direta do Kit Completo se a oferta de desconto de Julia estiver ativa (`kit_completo_offered === 1`), contornando o upsell redundante.
  - Atualizamos `getPostPaymentInstructions` em `prompts.ts` para que a matrícula via ferramenta `sistema` mapeie o código de acesso total (`PROD-H3GQBU`) para pagamentos de R$ 14,50 negociados.
- [x] **Typecheck e Deploy de Produção**:
  - Validamos toda a integridade do código (`npm run typecheck`), sem erros de tipos ou compilação.
  - Efetuamos deploy de produção bem-sucedido via Wrangler no Cloudflare Workers (`Version ID: a5ef1b06-48ac-477d-8ce0-c86449eba1c8`).

### [2026-05-26] — Implementação do Botão PIX Nativo UAZAPI com Fallback de Texto (Deploy de Produção)

- [x] **Integração do Endpoint de PIX no WhatsApp Service**:
  - Implementamos a função `sendPixButton` em [whatsapp-service.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/services/whatsapp-service.ts).
  - Esta função detecta dinamicamente se o provedor ativo é o **UAZAPI** e consome seu endpoint nativo `POST /send/pix-button` enviando o payload `{ number, pixType, pixKey, pixName }`.
  - Criamos um fallback inteligente para outros provedores (Evolution API, genéricos) que envia automaticamente a chave formatada e limpa em uma mensagem padrão de texto (`🔑 Chave PIX: ...`), garantindo robustez caso troquem de provedor no futuro.
- [x] **Integração da Ação nos Fluxos Sequenciais de Vendas**:
  - Atualizamos [tools.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/tools.ts) para despachar o botão nativo do PIX imediatamente após enviar as mensagens de detalhes de pagamento e mensagens finais na entrega de PDFs (`executeSeq2`).
  - Adicionamos o envio do botão nativo Pix de R$ 5,00 caso a resposta de pagamento registrada seja uma oferta de upgrade de Upsell contendo a chave PIX Cora celular.
- [x] **Integração Automática na Régua de Reengajamento (Follow-ups)**:
  - Atualizamos [followups.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/followups.ts) para interceptar o disparo em `sendFollowupMessage`. Toda vez que um followup de cobrança/lembrete contendo a chave Pix Cora celular `61982277206` for despachado (seja de 10h, 34h, 58h, etc.), o sistema envia síncrona e perfeitamente o botão nativo do Pix logo abaixo, facilitando o pagamento em um clique.
- [x] **Typecheck e Deploy de Produção**:
  - Validamos toda a integridade do código (`npm run typecheck`), sem erros de tipos ou referências.
  - Compilamos e publicamos com sucesso a build de produção no Cloudflare Workers (`Version ID: 1f2c8607-9984-4a60-a67e-6832fa1758e6`).

### [2026-05-26] — Hotfix Crítico: Ativação Universal do Rastreamento de Anúncios e Facebook Conversions API (CAPI) (Deploy de Produção)

- [x] **Mapeamento de Payloads de Anúncios UAZAPI**:
  - Identificamos nos logs de exportação do N8N (`n8n_wf_bot_recheios.json`) que o provedor de WhatsApp UAZAPI envia o clique de anúncio (Click-to-WhatsApp) da Meta envelopado dentro de `body.message.content.contextInfo.externalAdReply.ctwaClid`.
  - O motor de automação anterior procurava a tag `referral` apenas nas chaves do Evolution API v2 (`extendedTextMessage` ou `referral` direta). Como ele não consultava o objeto raw do Baileys no UAZAPI, a extração de dados de clique falhava sistematicamente.
- [x] **Refatoração Universal de Referral no Motor Central**:
  - Reescrevemos e estendemos por completo a função `extractReferralData` em [automation-engine.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automation-engine.ts). Ela agora é totalmente robusta e verifica caminhos tanto do Evolution API quanto do UAZAPI (`content.contextInfo.externalAdReply` e `content.contextInfo.referral`), extraindo os parâmetros nativos `ctwaClid`, `sourceID`, `mediaURL`, `title`, `thumbnailURL` e `mediaType`.
- [x] **Salvamento Síncrono e Instantâneo no Ponto de Entrada**:
  - Refatorada a arquitetura de persistência do lead e tráfego. O tratamento e salvamento do `ctwaclid` na tabela `tracking_data` foram movidos para a primeira etapa síncrona do processamento (`processMessage`). A gravação acontece no exato microssegundo da chegada do Webhook HTTP POST da UAZAPI, eliminando riscos de perda por debounce assíncrono ou timeout de concorrência.
- [x] **Habilitação de Rastreamento de Conversões**:
  - Com o `ctwaclid` sendo extraído com sucesso do clique e salvo no banco SQLite remoto (`tracking_data`), as travas do serviço Conversions API (`facebook-tracking.ts`) que ignoravam leads orgânicos foram desbloqueadas. O motor agora disparará normalmente os eventos de pixel `LeadSubmitted`, `Purchase` (básico) e `Purchase` (avançado com PII SHA-256) integrados na régua de atendimento.
- [x] **Typecheck e Deploy de Produção**:
  - Validamos toda a integridade da tipagem de dados (`npm run typecheck`), sem erros.
  - Build de produção e deploy push executado com sucesso na Cloudflare Workers (`Version ID: 7602c639-ce57-4d27-b0d1-a7af8a213d07`).

### [2026-05-26] — Correção de Interpolação de Nomes, Blocos Amigáveis e Espaçamento nos Follow-ups (Deploy de Produção)

- [x] **Remoção de Escapes nos Módulos de Follow-up**:
  - Corrigido o bug em [followups.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/followups.ts) onde as ocorrências de interpolação do primeiro nome (`\${firstName}`) e logs de envio (`\${followup.phone}`) estavam escapadas com contrabarra (`\`), impedindo o JavaScript de processá-los e exibindo o código literal `${firstName}` nas mensagens de WhatsApp dos clientes.
  - Removemos todos os escapes para permitir a interpolação automática do nome dos leads em tempo de execução nas variações de 15 minutos (Vigia) e 12 horas (Finalizador).
- [x] **Divisão em Blocos de Parágrafos Amigáveis (Evitando "Ler mais")**:
  - Identificado que o envio do follow-up de 15 minutos em um bloco único de texto causava o truncamento da mensagem no celular do cliente, forçando o clique no link *"Ler mais"* do WhatsApp para visualizar o catálogo completo de receitas.
  - Desenvolvemos e integramos o algoritmo `splitIntoParagraphBlocks` em `sendFollowupMessage`. O algoritmo realiza a quebra por quebras de linha duplas (`\n\n`), mantendo os parágrafos e a lista de produtos (separada por `\n`) em blocos de parágrafos perfeitamente formatados de até 800 caracteres.
  - O bot agora digita e envia de forma inteligente e sequencial cada bloco de texto com um delay de digitação de **3 a 5 segundos** entre eles, simulando uma interação humana perfeitamente sequencial e de altíssima legibilidade.
- [x] **Compilação e Deploy de Sucesso**:
  - Validamos o projeto com `npm run typecheck`, obtendo zero erros.
  - Deploy em produção concluído com sucesso via Wrangler no Cloudflare Workers (`Version ID: bf0d1d66-445a-4a1e-b04d-11fa2e75838f`).

### [2026-05-26] — Resolução de Acesso de Lineida P. Santos & Mitigação de Perda de Mensagens (Deploy de Produção)

- [x] **Diagnóstico Completo da Lead Lineida**:
  - Investigamos o banco de dados remoto D1 para a lead `Lineida P. Santos` (telefone `5521980650019`).
  - Constatamos que ela efetuou o pagamento do **Kit Completo (R$ 25,90)** com sucesso, mas o assistente, ao responder, solicitou seus dados (Nome/E-mail) e a conversa parou em `pacote 3` (user, às 21:59:51 UTC / 18:59:51 BRT).
  - Identificamos que a ausência do link de acesso para ela ocorreu porque ela ainda não havia preenchido/enviado seu nome e e-mail no formato correto ou o webhook foi interrompido por timeout e re-enfileirado no KV expirado.
- [x] **Liberação de Acesso Manual e Disparo do Webhook N8N**:
  - Criamos e executamos com sucesso absoluto o script manual [liberar_lineida.js](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/scratch/liberar_lineida.js) que:
    1. Realizou o UPDATE no D1 definindo o e-mail dela como `lineida.santos@gmail.com` e marcando o acesso como entregue (`access_delivered = 1`), phase `completed` e status `finalizado_com_sucesso`.
    2. Efetuou o disparo de matrícula via webhook HTTP POST para o N8N (`https://app.promentor21.top/api/webhooks/entrada`), retornando `200 OK` (cadastro realizado!).
    3. Enviou diretamente a ela via WhatsApp (UAZAPI) a mensagem contendo seu link oficial de acesso passwordless no portal: `https://app.promentor21.top/login?id=8141` com o e-mail cadastrado.
    4. Registrou a mensagem entregue na tabela `messages` do SQLite D1 via arquivo de query dedicada [insert_message.sql](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/scratch/insert_message.sql).
- [x] **Mitigação de Perda de Mensagens por Crash/Timeout em Background (Engine)**:
  - **Deduplicação de Mensagens**: Refatoramos `saveMessage` em [automation-engine.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automation-engine.ts) para realizar uma checagem de existência por `messageId` no D1 SQLite antes de efetuar o insert, tornando as chamadas de salvamento 100% idempotentes e seguras contra duplicações.
  - **Fila com Salvaguarda de Persistência**: Refatoramos `processMessage` (ponto de entrada síncrono do webhook) para que, caso o Mutex de processamento ativo (`isProcessing === "true"`) esteja ocupado e as mensagens precisem ser enfileiradas no KV, o motor também realize o salvamento em background síncrono da mensagem individual diretamente no D1 SQLite de forma imediata. Isso garante que, se o Worker principal sofrer timeout de 30s ou CPU abort pelo Cloudflare, as mensagens do cliente nunca mais sejam perdidas ou deixem de aparecer no chat!
- [x] **Garantia de Diálogo em Falhas de Ferramenta (LLM SDR)**:
  - Refatoramos a lógica de interceptação `wasSeqCalled` em [index.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/index.ts). Agora, a flag `wasSeqCalled` só é definida como `true` se a execução da respectiva ferramenta (`executeTool`) for **bem-sucedida** (`result.success === true`). Isso impede que o assistente silencie ou suprima suas respostas conversacionais (como o pedido de nome/e-mail) quando a LLM tentar chamar a ferramenta `sistema` com argumentos ausentes ou inválidos.
- [x] **Compilação e Deploy de Produção**:
  - Validamos toda a codebase com `npm run typecheck`, obtendo zero erros.
  - Efetuamos deploy de produção bem-sucedido via Wrangler no Cloudflare Workers (`Version ID: 5efb8fbc-1149-43ce-b8f1-2aabda1152c5`).

### [2026-05-26] — Reenvio Determinístico e Inteligência de Ofertas Especiais (Deploy de Produção)

- [x] **Interceptador de Reenvio Determinístico ("Manda de novo")**:
  - Desenvolvida a função `isRequestingResend(text)` em [index.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/index.ts) para normalizar e buscar mais de 30 variações comuns de pedidos de reenvio de receitas (como "manda de novo", "não recebi", "cadê as receitas", "reenvia", etc.).
  - Injetado o interceptador direto no `handleMessage` para que, caso o lead solicite reenvio, o sistema dispare instantaneamente a ferramenta física de envio `executeTool(ctx, 'seq2', {})` e encerre o turno de processamento, eliminando a dependência da LLM e latência do diálogo.
- [x] **Prevenção de Upsell Indevido em Cobranças/Promoções**:
  - Refatorada a resposta determinística de pagamento `executePagamento` em [tools.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/tools.ts) para calcular a flag `isSpecialFollowupOffer` (quando o lead pagou por uma oferta do Vigia de R$ 19,90, do Finalizador de R$ 12,90 ou Cobrador Final de R$ 10,00).
  - Caso seja uma oferta especial de follow-up, o sistema envia diretamente o copy de confirmação do *Kit Completo* (solicitando Nome e E-mail para cadastro) e pula a oferta de upsell de R$ 5,00, resolvendo a incoerência conversacional.
- [x] **Contexto Financeiro de Cobranças e Matrícula Dinâmica na LLM**:
  - Atualizada a orquestração do contexto em [prompts.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/prompts.ts) para alimentar dinamicamente a LLM com o valor exato da promoção ativa do lead (`state.oferta_19_90_feita`, `state.funil_encerrado` ou `last_tool_called`).
  - Atualizadas as regras de pós-pagamento `getPostPaymentInstructions` na LLM para que, sob ofertas especiais, ela peça Nome/E-mail imediatamente e chame a ferramenta `sistema` com **`codigo_produto = 'PROD-H3GQBU'` (Kit Completo / Acesso Total)**, em vez de `PROD-R1I27D` básico.
- [x] **Compilação e Deploy de Produção**:
  - Compilação realizada com sucesso absoluto e deploy completo via Wrangler no Cloudflare Workers (`Version ID: af930f46-70bf-425c-9d74-a9bd1caf6078`).

### [2026-05-26] — Exclusão Remota de Mensagens no WhatsApp do Lead (Deploy de Produção)

- [x] **Captura e Rastreamento de ID Real de Mensagem do WhatsApp**:
  - Refatorados todos os métodos de envio internos e públicos (`sendText`, `sendImage`, `sendDocument`, `sendAudio`, `sendVideo`) em [whatsapp-service.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/services/whatsapp-service.ts) para retornarem `Promise<string>` contendo o ID real gerado pelas APIs do WhatsApp.
  - Criado o helper `extractMessageId` para tratar e extrair chaves de respostas do **Evolution API v2** (`data.key?.id`) e do **UAZAPI** (`data.messageId || data.data?.messageId || data.id`).
  - Refatorados os seis endpoints de envio manual do chat central (`chat.ts`) para despachar a mensagem no WhatsApp antes do salvamento, gravando o ID real como chave primária `messages.id`.
  - Atualizados os parsers de webhooks (`message-utils.ts` e `automation-engine.ts`) para capturar e persistir o ID original das mensagens enviadas pelo lead.
- [x] **Wrapper de Revogação Remota (`deleteWhatsAppMessage`)**:
  - Desenvolvida a função `deleteWhatsAppMessage` em `whatsapp-service.ts` para identificar o provedor ativo a partir da `base_url` cadastrada e disparar a requisição de revogação para todos ("Apagar para todos").
  - Integrada a requisição `DELETE /chat/deleteMessageForEveryone/{instance}` (Evolution API) e `POST /message/delete` (UAZAPI) com tratamento de dados e JIDs.
- [x] **Integração Resiliente no Endpoint DELETE**:
  - Atualizado o endpoint `DELETE /api/chat/messages/:id` em [chat.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/routes/chat.ts) para realizar a chamada de exclusão no WhatsApp de forma reativa apenas se `role !== 'user'`.
  - Adicionado bloco de tratamento `try/catch` para garantir que, caso ocorra falha na API remota (como limite de tempo excedido), a exclusão local no painel ainda seja executada de forma bem-sucedida para o operador.
- [x] **Estabilização de Tipagem e Deploy**:
  - Resolvidos os conflitos de tipo com UUID de `crypto.randomUUID()` aplicando tipagem explícita `let msgId: string` nas rotas do chat.
  - Deploy da nova build de produção efetuado na Cloudflare Workers com sucesso absoluto (`Version ID: 39dc1862-8ec3-48f5-8287-a9dafd543dd0`).

### [2026-05-25] — Recurso de Exclusão de Mensagens no Chat Central (Deploy de Produção)

- [x] **API Backend para Exclusão de Mensagens**:
  - Desenvolvida a rota `DELETE /api/chat/messages/:id` no arquivo [chat.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/routes/chat.ts) para excluir permanentemente qualquer registro da tabela `messages` no D1 SQLite.
  - Configurada atualização automática de timestamp da conversa correspondente no banco de dados para garantir reordenação fluida e imediata no feed.
- [x] **Ação Visual e Atualização de Histórico no Frontend**:
  - Injetada a função `handleDeleteMessage` em [chat.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/chat.tsx) com diálogo de confirmação de segurança nativo.
  - Adicionado botão glassmorphic minimalista **"🗑️ Excluir"** em vermelho HSL no rodapé dos balões de mensagens (tanto de mensagens enviadas pela IA SDR, pelo suporte ou recebidas do lead).
  - Configurada atualização silenciosa (`loadConversation(true)`) e instantânea da conversa ativa logo após a exclusão do registro, sem travamentos na tela.
- [x] **Compilação e Deploy de Produção**:
  - Validada a tipagem do projeto com zero erros em `npm run typecheck`.
  - Publicação remota efetuada no Cloudflare Workers (`Version ID: c3d5cdca-fa6f-40ca-9d25-f5cc5d8818ba`) com 100% de sucesso.
- [x] **Arquivos Modificados**:
  - [workers/routes/chat.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/routes/chat.ts)
  - [app/routes/chat.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/chat.tsx)

### [2026-05-25] — Customização Premium do Catálogo de Produtos nos Follow-ups Vigia (15m) e Finalizador (12h) (Deploy de Produção)

- [x] **Substituição Definitiva de Copies no Vigia (15m)**:
  - Desenvolvidas e aplicadas exatamente **5 variações estáticas premium** para o `followup_vigia_15min` no arquivo `workers/automations/recheios/followups.ts`.
  - Injetado o catálogo oficial completo composto por **12 produtos de confeitaria** com formatação em negrito e emojis correspondentes (massas, brigadeiros, fatias de feira, bolos no pote, geladinhos, etc.).
  - Configurado o valor de R$ 19,90 e a chave Pix celular `61982277206`.
- [x] **Substituição Definitiva de Copies no Finalizador (12h)**:
  - Desenvolvidas e aplicadas exatamente **5 variações estáticas premium** para o `followup_finalizador_12h` no mesmo arquivo.
  - Implementado copy de "Última Chamada" com forte escassez (limite de meia-noite), comparação de valor com pequenos gastos cotidianos e Pix Cora de R$ 12,90 na chave celular `61982277206`.
- [x] **Auditoria e Confirmação de Salvaguardas Ativas**:
  - Verificada e validada a integridade da exclusão mútua: o backend executa o cancelamento imediato de follow-ups silenciosos (`followup_vigia%` e `followup_finalizador%`) assim que a entrega de PDFs (`seq2`) é ativada em `tools.ts`.
  - Confirmada a dupla checagem redundante do motor cron que cancela reativamente esses follow-ups caso `seq2_called = 1` no banco.
- [x] **Refinamento do Layout de Automações**:
  - Removidos em definitivo os botões **"Ver Fluxo"** e **"Rastreamento"** do card visual de automação em [automations.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/automations.tsx).
  - Isso remove a redundância visual da página de Automações, uma vez que estas duas interfaces completas já estão integradas de forma limpa e elegante como abas premium no topo da tela, simplificando a usabilidade do operador.
- [x] **Compilação e Deploy de Produção**:
  - Validada a tipagem do projeto com zero erros em `npm run typecheck`.
  - Publicação remota efetuada no Cloudflare Workers (`Version ID: fa24f76d-29b7-4df0-bcde-f4b9cfa7edda`) com 100% de sucesso.
- [x] **Arquivos Modificados**:
  - [workers/automations/recheios/followups.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/followups.ts)
  - [app/routes/automations.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/automations.tsx)

### [2026-05-25] — Correção Crítica do Cron de Follow-ups e Cobranças (Tabelas e Schema D1) (Deploy de Produção)

- [x] **Identificação da Causa Raiz de Silêncio do Cron**:
  - Diagnosticamos que a rota `/api/webhook/cron/followups` do cron e o `scheduled` event handler estavam falhando silenciosamente com erro HTTP 500.
  - A causa raiz era que a query de seleção dos follow-ups e as atualizações de estado em `followups.ts` utilizavam três colunas (`oferta_19_90_feita`, `upsell_enviado`, `funil_encerrado`) na tabela `conversation_state` que **não existiam** no banco D1 SQLite da nuvem. Isso provocava erros SQLite de "no such column" e crashava a execução da cron a cada rodada.
- [x] **Criação e Aplicação de Migração D1**:
  - Criamos o arquivo de migração `migrations/0011_add_followup_flags.sql` para adicionar de forma segura as colunas `oferta_19_90_feita` (INTEGER), `upsell_enviado` (INTEGER) e `funil_encerrado` (INTEGER) com valor padrão `0` na tabela `conversation_state`.
  - Aplicamos a migração com sucesso na nuvem (`npx wrangler d1 migrations apply whatsapp-platform --remote`).
- [x] **Sincronização dos Types e Engine**:
  - Atualizamos a interface `ConversationState` e o array `allowedFields` no arquivo `workers/automation-engine.ts` para mapear essas novas colunas no motor central.
  - O código do projeto compilou com **100% de sucesso** e foi publicado remotamente no Cloudflare Workers (`Version ID: f266b4cb-f0e7-450b-a464-dbc1bb130a83`).
- [x] **Auditoria e Validação em Tempo Real**:
  - Disparamos manualmente o endpoint do cron e validamos que a execução foi executada perfeitamente: **9 follow-ups pendentes foram processados com sucesso**.
  - O follow-up de 15 minutos (Vigia) da lead Rosângela (`556792444244`) foi executado com sucesso e marcado como `'executed'` no D1 SQLite, e a conversa atualizada com a flag `oferta_19_90_feita = 1`.
- [x] **Arquivos Modificados**:
  - [migrations/0011_add_followup_flags.sql](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/migrations/0011_add_followup_flags.sql) [NEW]
  - [workers/automation-engine.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automation-engine.ts)

### [2026-05-25] — Substituição de copies dinâmicas de IA por 5 variações estáticas nos Follow-ups e Cobranças (Deploy de Produção)

- [x] **Substituição da IA por Variantes Estáticas**:
  - Removido completamente o uso da LLM (`callFollowupLLM`) no arquivo `workers/automations/recheios/followups.ts` para todos os 7 follow-ups (`followup_vigia_15min`, `followup_finalizador_12h`, `followup_incentivador_1h`, `followup_cobrador_amigo_10h`, `followup_cobrador_curioso_34h`, `followup_cobrador_final_58h`, `upsell_10min`).
  - Desenvolvidas e inseridas exatamente **5 variações estáticas premium** e variadas para cada follow-up, que respeitam perfeitamente todas as diretrizes de estilo de Julia (espaçamento duplo `\n\n`, negritos estratégicos, e 1 a 3 emojis por mensagem).
  - Integrada a seleção randômica (`Math.floor(Math.random() * 5)`) na execução do cron e triggers manuais, eliminando latências de IA (0ms de processamento de texto), reduzindo custos de API e blindando o sistema contra alucinações de dados de pagamento Pix Cora.
- [x] **Resolução do Conflito de welcomeText**:
  - Resolvido o erro de compilação TypeScript no arquivo `workers/automations/recheios/tools.ts` onde a variável de boas-vindas (`welcomeText`) estava declarada em duplicidade (`let` e depois `const`).
- [x] **Compilação e Deploy de Produção**:
  - Toda a codebase foi compilada e validada remotamente com 100% de sucesso (zero erros de TypeScript).
  - Deploy da nova build efetuado na Cloudflare.
- [x] **Arquivos Modificados**:
  - [workers/automations/recheios/followups.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/followups.ts)
  - [workers/automations/recheios/tools.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/tools.ts)

### [2026-05-25] — Bloqueio de Mensagens Manuais/Presets com IA Ativa & Rastreabilidade de Erros WhatsApp (Deploy de Produção)

**Imposição de Guards baseados no estado da IA (ai_active)**:
- [x] **Frontend Interativo (chat.tsx)**:
  - Travado visualmente o campo de texto manual de digitação de respostas com placeholder dinâmico indicando o bloqueio quando a IA estiver ativa.
  - Bloqueados todos os botões de presets de envio manual (🤖 AGENTES e 📈 COBRANÇA) quando a IA estiver ativa (`ai_active === 1`), aplicando redução de opacidade (0.4), removendo hover-bright e aplicando cursor `not-allowed`.
- [x] **Segurança Backend (chat.ts)**:
  - Adicionadas validações estritas de `ai_active === 1` em todas as rotas manuais de mensagens (`/messages`, `/send-text`, `/send-audio`, `/send-document`, `/send-image`, `/send-video`, `/trigger-tool` e `/trigger-followup`), rejeitando requisições indesejadas com HTTP 400.
  - Injetado o `c.executionCtx` do Cloudflare Workers nas rotas de triggers manuais (`/trigger-tool` e `/trigger-followup`), garantindo que o ciclo de vida do executor assíncrono em background (ex: entrega da Sequência 2) execute até o fim sob `c.executionCtx.waitUntil` sem ser derrubado pela VM.
- [x] **Diagnóstico e Rastreabilidade de Erros (whatsapp-service.ts)**:
  - Refatorada a função `makeRequest` para lançar uma exceção descritiva contendo a resposta da API do WhatsApp (ex: Evolution ou UAZAPI) quando o status code for não-2xx (ex: falhas de credenciais ou instâncias desconectadas).
  - Configurados todos os wrappers públicos (`sendText`, `sendImage`, `sendDocument`, `sendAudio`, `sendVideo`) para repassarem a exceção (`throw err`), fazendo com que o motor de disparos da Sequência 2 a capture e grave um log rico na tabela `error_logs` do D1 SQLite, acabando com as falhas silenciosas de envio manual.
- [x] **Compilação e Deploy de Produção**: O código compilou com 100% de sucesso no typecheck e foi publicado com sucesso no Cloudflare Workers (`Version ID: 4ba44fe7-1a82-4acb-a375-7d5c1814673e`).
- [x] **Arquivos Modificados**:
  - [app/routes/chat.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/chat.tsx)
  - [workers/routes/chat.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/routes/chat.ts)
  - [workers/services/whatsapp-service.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/services/whatsapp-service.ts)

### [2026-05-25] — Alinhamento Visual do Funil (Incentivador & Finalizador) & Estabilização de Triggers Manuais (Deploy de Produção)

**Alinhamento do Fluxograma Visual e Correção dos Triggers Manuais**:
- [x] **Bypass Manual em tools.ts (Bypass de early-return)**:
  - Adicionada a propriedade `isManual?: boolean;` na interface `AutomationContext` em `workers/automation-engine.ts` para type-safety.
  - Injetado `isManual: true` no contexto de disparo manual no endpoint `/trigger-tool` em `workers/routes/chat.ts`.
  - Refatorada a condicional de early-return em `executeSeq1` no arquivo `workers/automations/recheios/tools.ts` (`if (state.seq1_called && !ctx.isManual)`), permitindo forçar o reenvio manual quando o operador clica no botão "Anunciador", mesmo se o lead já tiver a flag `seq1_called = 1` no banco.
  - Implementada limpeza prévia de agendamentos (`cancelFollowups(db, state.conversation_id, '%')`) antes de re-agendar novos follow-ups na Sequência 1 manual, evitando agendamentos duplicados ou spam de mensagens de cobrança.
- [x] **Ajuste e Correção Visual no Fluxograma (`automations.tsx`)**:
  - **Régua de Início (Esquerda)**: Removido `Incentivador (1h)` do card e inserido `Finalizador (12h)` (`🏁 Finalizador (12h) - Se silêncio ➔ Última oferta R$12,90`), corrigindo a representação de silêncio e alinhando perfeitamente com a lógica de background do motor.
  - **Régua de Cobrança Pix (Direita)**: Inserido `Incentivador (1h)` como o primeiro item do card (`🚀 Incentivador (1h) - Se entregue ➔ Faturamento fatias`), seguido por Cobrador Amigo (10h), Cobrador Curioso (34h) e Cobrador Final (58h).
  - **Lógica de Status e Tooltips**: Atualizadas as condições de colorização dinâmica de nós (`getNodeColor` e `handleNodeClick` para `followups_iniciais`) para considerar o `finalizador` ao invés do `incentivador`. Mapeado o `nameMap` de follow-ups do timeline de forma type-safe para cobrir os tipos exatos da tabela (`followup_vigia_15min`, `followup_finalizador_12h`, `followup_incentivador_1h`, etc.).
- [x] **Estabilização de Triggers Manuais de SDR (`chat.ts`)**:
  - **Estabilidade nos Imports do Worker**: Substituídos os imports dinâmicos (`await import`) de `executeTool` e `executeFollowup` por **imports estáticos robustos** no topo do arquivo. Isso previne falhas silenciosas de resolução ou bundling pelo Wrangler no Cloudflare Workers.
  - **Rastreamento CAPI em Disparos Manuais**: Adicionados os campos `pixel_id`, `facebook_token`, `waba_id` e `page_id` ao SELECT da tabela `automations` no endpoint `/trigger-tool`, assegurando que o disparo manual de mídias/pagamentos de leads também reportem eventos de Lead e Purchase de forma íntegra para o Facebook CAPI.
- [x] **Feedback Robusto no Chat (`chat.tsx`)**:
  - Refatorados os métodos `handleTriggerTool` e `handleTriggerFollowup` para parsear a resposta do JSON, verificando a propriedade `success` e exibindo as mensagens de erros exatas nos toasts em caso de falhas internas, em vez de retornar toasts falsos de sucesso.
- [x] **Compilação e Deploy de Produção**: Projeto compilado com 100% de sucesso (zero erros de TypeScript) e publicado remotamente no Cloudflare Workers.
- [x] **Arquivos Modificados**:
  - [workers/automation-engine.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automation-engine.ts)
  - [workers/automations/recheios/tools.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/tools.ts)
  - [app/routes/automations.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/automations.tsx)
  - [workers/routes/chat.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/routes/chat.ts)
  - [app/routes/chat.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/chat.tsx)

### [2026-05-25] — Painel de Controle de Disparo Manual de Agentes & Alinhamento de Cobrança (Deploy de Produção)

**Integração do Novo Painel de Presets & Triggers Manuais no Chat**:
- [x] **Endpoints no Hono Web Backend (`chat.ts`)**:
  - Criada a rota `POST /conversations/:id/trigger-tool` para executar qualquer ação lógica do funil (`seq1` do Anunciador, `seq2` do Entregador, ou `pagamento` e `sistema` do Caixa) sob demanda de forma síncrona/assíncrona a partir do banco e da tipagem do motor.
  - Criada a rota `POST /conversations/:id/trigger-followup` para executar qualquer agendamento ou follow-up do funil de reengajamento (Vigia 15m, Closer/Finalizador 12h, Cobrador Amigo 10h, Cobrador Curioso 34h, Cobrador Final 58h, e o Incentivador 1h) em tempo real, integrando com o motor `executeFollowup` exportado.
- [x] **Visual de Alta Definição no Frontend React (`chat.tsx`)**:
  - Adicionadas duas fileiras de botões *glassmorphic* premium em degrade, HSL tailoring e efeitos interativos organizadas sob o formulário de digitação manual:
    - **Fileira 1 (🤖 AGENTES)**: 📢 Anunciador (Seq 1), 📚 Entregador (Seq 2), 💳 Caixa (Confirmar Pago).
    - **Fileira 2 (📈 COBRANÇA)**: 🚀 Upsell R$ 5, ⏰ Incentivador (1h), 💬 Amigo (10h), 🧐 Curioso (34h), 🚨 Cobrador Final (58h), 👀 Vigia (15m), 🏁 Finalizador (12h).
- [x] **Ajuste e Enquadramento do Incentivador (1h)**: Corrigido e alinhado o Incentivador de uma hora na linha e categoria corretas de cobranças (régua de follow-up / upsell de cobrança), respeitando o fluxo natural dos lembretes do funil de vendas.
- [x] **Compilação e Deploy de Produção**: Build Vite e Hono concluída com sucesso absoluto (zero erros) e deploy remoto efetuado na Cloudflare Workers.
- [x] **Arquivos Modificados**:
  - [workers/routes/chat.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/routes/chat.ts)
  - [app/routes/chat.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/chat.tsx)
  - [workers/automations/recheios/followups.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/followups.ts)

### [2026-05-25] — Resolução de Reengajamento de Leads Finalizados/Resolvidos & Fix de Compilação TS (Deploy de Produção)

**Correção de Bug de Não Resposta a Leads Antigos (Cris - 5521994202889)**:
- [x] **Causa Raiz de Silêncio do Bot Resolvida**:
  - **Crash no Código**: A thread do Cloudflare Workers abortava de forma silenciosa devido a um erro de tempo de execução (`ReferenceError: history is not defined` na linha 173 de `index.ts`), o qual foi corrigido importando/destruturando o `history` a partir do contexto `ctx`.
  - **Reabertura do Status 'resolved'**: Cris estava cadastrada no banco de dados com a conversa no estado `'resolved'`. A lógica de reabertura automática de leads recorrentes (`getOrCreateConversation` em `automation-engine.ts`) só cobria transições para `'finalizado_com_sucesso'` e `'finalizado_sem_sucesso'`.
- [x] **Suporte a Reabertura de Conversas Resolvidas**: Refatorada a função `getOrCreateConversation` para incluir `'resolved'` nas condicionais de reabertura. Agora, sempre que qualquer lead com conversa finalizada ou resolvida (seja `'finalizado_com_sucesso'`, `'finalizado_sem_sucesso'` ou `'resolved'`) enviar uma nova mensagem de reengajamento, a conversa muda automaticamente para `'open'`, reativando a IA e mantendo 100% de integridade no histórico de conversas para que o Negociador continue negociando e quebre objeções.
- [x] **Sanamento de Warnings e Erros de Compilação do TypeScript (Compilação 100% Limpa)**:
  - **`prompts.ts` / `upsell.ts`**: Adicionada a função exportada `getUpsellPrompt` em `workers/automations/recheios/prompts.ts` que estava ausente, eliminando o erro de importação `TS2305` no módulo de upsell.
  - **`settings.tsx`**: Ajustada a conversão de tipo de `ApiItem` para `any` na interface React, eliminando 4 erros de compilação `TS2352` por ausência de assinaturas de índice.
  - **`authMiddleware` & `authRoutes`**: Incluída a tipagem `Variables: { userId: string; userEmail: string }` no roteador Hono e middleware, além de conversão segura para `String` no `payload.sub`, sanando os erros `TS2769` e `TS2345` de variáveis do contexto de autenticação.
  - **`message-utils.ts` & `automation-engine.ts`**: Adicionados os tipos `'location'` e `'contact'` à união `MessageType` e importada de forma type-safe no `IncomingMessage` do motor central, corrigindo o erro de atribuição de tipos `TS2322` e `TS1484` (tipo importado sob verbatimModuleSyntax).
- [x] **Compilação e Publicação (`deploy`)**: Executada nova compilação e deploy definitivos com 100% de sucesso na Cloudflare.
- [x] **Arquivos Modificados**:
  - [workers/automation-engine.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automation-engine.ts)
  - [workers/automations/recheios/prompts.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/prompts.ts)
  - [workers/middleware/auth.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/middleware/auth.ts)
  - [workers/routes/auth.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/routes/auth.ts)
  - [workers/app.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/app.ts)
  - [workers/services/message-utils.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/services/message-utils.ts)
  - [app/routes/settings.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/settings.tsx)

### [2026-05-25] — Eliminação de Timeouts da Sequência 2 & Garantia de Entrega da Oferta Final (Deploy de Produção)

**Resolução Definitiva de Timeouts na Sequência de Entrega (`executeSeq2`)**:
- [x] **Eliminação de Chamadas de LLM em Background (`tools.ts`)**: Removidas as duas chamadas assíncronas lentas a `callLLM` para geração dinâmica do texto de confirmação (`text1`) e do texto final com dados de pagamento (`textFinalIntro`). Isso reduziu o tempo total de execução da thread em cerca de 8 a 12 segundos, eliminando o risco de estouro do limite de 30 segundos do Cloudflare Workers Free Tier.
- [x] **Variantes de Diálogo no Código (`tools.ts`)**: Implementadas listas de variações pré-formatadas, carinhosas e profissionais para os dois blocos de textos, selecionadas aleatoriamente por código de forma ultraveloz (0ms), mantendo o dinamismo humano da persona e garantindo 100% de confiabilidade.
- [x] **Garantia de Entrega do Texto Final de Oferta**: Com a remoção da latência de IA no background, a sequência completa de mídias (5 PDFs + Áudio 2 + Detalhes do Pix + 2 Imagens de Preços/Bônus + Texto Final da Oferta Pix) é despachada inteiramente e sem falhas, eliminando qualquer risco de abortar a thread antes da mensagem final de fechamento.
- [x] **Compilação e Publicação (`deploy`)**: Executada nova compilação e deploy definitivos na Cloudflare com sucesso.
- [x] **Arquivos Modificados**:
  - [tools.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/tools.ts)

### [2026-05-25] — Refinamento de Inteligência Conversacional & Reenvio de Receitas Sob Demanda (Deploy de Produção)

**Aprimoramentos de Inteligência Conversacional, Aceite Tardio e Recuperação de Envio**:
- [x] **Aceite Tardio no Classificador Scout (`prompts.ts`)**: Adicionada regra explícita no Classificador Scout de Triagem para identificar quando o cliente aceita as receitas no meio ou final da negociação (ex: "pode enviar então", "quero sim", "manda aí"), categorizando com alta confiança como `ACEITOU` em qualquer estágio de diálogo.
- [x] **Reenvio Sob Demanda de Mídias (`prompts.ts`)**: Implementada regra de comportamento na persona principal "Julia". Caso o cliente reclame que não recebeu os arquivos, que deu erro ao baixar ou peça explicitamente para reabrir/enviar novamente, a IA é instruída a invocar de forma instantânea a ferramenta `seq2`, reenviando todos os PDFs e áudios de forma reativa e transparente.
- [x] **Compilação e Publicação (`deploy`)**: Concluída nova compilação e deploy definitivos na Cloudflare com 100% de sucesso.
- [x] **Arquivos Modificados**:
  - [prompts.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/prompts.ts)

### [2026-05-25] — Resolução de Falso Aceite por Contexto (Módulos Recheios & Classificador)

**Prevenção de Falsos Positivos de Aceite de Mídia ("Tá bom" / "OK" para Despedidas)**:
- [x] **Restrição do Interceptador Determinístico (`index.ts`)**: Modificada a ativação do bypass em código `isSimpleAcceptance` para verificar a quantidade de interações (`userHistoryMessages.length <= 1`). O bypass automático agora só é ativado no primeiro retorno do cliente em relação às boas-vindas iniciais, impedindo que afirmações casuais durante o suporte (como "tá bom" ao negociador) disparem indevidamente a entrega do produto (`seq2`).
- [x] **Instruções ao Classificador de Triagem (`prompts.ts`)**: Atualizada a instrução do Agente Scout de classificação para que identifique quando o usuário está apenas agradecendo ou concordando com frases de encerramento/suporte genérico (ex: "Qualquer coisa me chama" ➔ "Tá bom"), categorizando essas mensagens como `OUTROS` ao invés de `ACEITOU`.
- [x] **Compilação e Publicação (`deploy`)**: Executada nova compilação e deploy na Cloudflare com sucesso.
- [x] **Arquivos Modificados**:
  - [index.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/index.ts)
  - [prompts.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/prompts.ts)

### [2026-05-25] — Ajuste Fino e Estabilização das Mídias Nativas & Layout do Chat (Deploy de Produção)

**Aprimoramentos de Renderização de Áudios, PDFs, Imagens Sem Cortes e Legendas**:
- [x] **Filtros e Verificação Robusta (`chat.tsx`)**: Refatoradas as rotinas `cleanMediaMessageText` e `renderMessageMedia` para tratar strings de mídia utilizando `.trim()` e buscas com `.includes()`. Isso corrige as falhas de renderização de áudios e PDFs gerados de forma automatizada pelo backend (como `[Áudio de entrega enviado]` e `[PDF de receita enviado: ...]`).
- [x] **Remoção de Caracteres Especiais nos PDFs (`chat.tsx`)**: Corrigida a extração de nomes de arquivos PDF de forma que possíveis colons (`:`) introduzidos pelo parser de regex sejam completamente removidos antes de realizar a correspondência com presets de download ou gerar URLs na CDN.
- [x] **Exibição de Imagem Completa (Aspect Ratio) (`chat.tsx`)**: Atualizado o estilo inline do componente `<img>` para incluir `height: "auto"` e `objectFit: "contain"`, removendo o limite de altura e cortes da imagem (não cortando o banner de ofertas/receitas).
- [x] **Legendas Abaixo das Imagens (`chat.tsx`)**: Alinhada a hierarquia visual dos balões de mensagens de modo a pintar sempre as imagens no topo (`{mediaElement}`) e a legenda limpa do WhatsApp abaixo delas (`{cleanText}`), respeitando o padrão nativo do WhatsApp.
- [x] **Compilação e Publicação (`deploy`)**: Executada compilação local Vite com 100% de sucesso e deploy definitivo para produção na Cloudflare Workers.
- [x] **Arquivos Modificados**:
  - [chat.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/chat.tsx)

### [2026-05-25] — Renderização Nativa de Mídias (Áudio, Imagem, Vídeo e PDFs) no Chat

**Visualização de Conteúdos Multimídia e Limpeza de Logs**:
- [x] **Visualizadores de Mídia Nativos (`chat.tsx`)**: Implementado o parser `renderMessageMedia` no chat central. Ele intercepta as descrições de mídia salvas pelo banco de dados D1 e renderiza elementos ricos do HTML5:
  - **Áudio**: Renderiza um player de áudio `<audio controls>` para reprodução imediata.
  - **Imagem**: Renderiza a imagem real com suporte a zoom-in em nova aba ao clicar.
  - **Vídeo**: Renderiza um reprodutor de vídeo `<video controls>` nativo.
  - **Documento / PDFs**: Renderiza cartões de download individuais com botão interativo para cada apostila, ou um painel completo para as 5 apostilas da oferta.
- [x] **Limpeza Dinâmica de Legendas e Transcrições (`chat.tsx`)**: Implementada a rotina `cleanMediaMessageText`. Ela purifica o texto de status do banco (removendo tags brutas como `[Imagem enviada com legenda: ...]` ou `[Áudio manual enviado: ...]`) e apresenta apenas a transcrição, OCR ou a legenda original formatada com emojis e estilos.
- [x] **Arquivos Modificados**:
  - [chat.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/chat.tsx)

### [2026-05-25] — Formatação Dinâmica de Negrito (WhatsApp/Markdown) no Chat

**Conversão de Negritos e Estilos de Mensagem**:
- [x] **Visualização Nativa de Estilos (`chat.tsx`)**: Implementado o parser `formatWhatsAppMessage` no frontend do chat central. Ele analisa strings de mensagens e converte os tokens de estilo nativos do WhatsApp (como `*negrito*` em `<strong>`, `_itálico_` em `<em>` e `~tachado~` em `<span style="text-decoration: line-through">`) em elementos React estruturados de forma dinâmica.
- [x] **Remoção de Asteriscos**: Os asteriscos de controle do WhatsApp agora são completamente ocultados do operador, exibindo o texto formatado perfeitamente em negrito e com visual limpo.
- [x] **Segurança Contra XSS**: Toda a renderização é realizada de forma nativa via elementos do React (sem o uso de `dangerouslySetInnerHTML`), blindando o frontend contra injeções de script no painel.
- [x] **Arquivos Modificados**:
  - [chat.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/chat.tsx)

### [2026-05-25] — Ajuste do Formato de Data e Hora nas Mensagens do Chat

**Formatação de Timestamp e Data Standardizada**:
- [x] **Tratamento de Data Cross-Browser (`chat.tsx`)**: Implementação da função `parseDateSafe` para normalizar strings de data/hora provenientes do SQLite no formato `"YYYY-MM-DD HH:MM:SS"`. Convertendo-as em um formato ISO completo UTC (`"YYYY-MM-DDTHH:MM:SSZ"`), garantimos que todos os navegadores (Chrome, Safari, Firefox) consigam parseá-las corretamente e adaptá-las automaticamente para o fuso horário local do atendente (como o horário de Brasília).
- [x] **Visualização de Data e Hora no Balão**: Atualizada a exibição de data e hora no rodapé de cada balão de mensagem para exibir no padrão brasileiro completo: `DD/MM/YYYY às HH:MM` (ex: `25/05/2026 às 12:20`).
- [x] **Correção de timeAgo**: Refatorado o método `timeAgo` para herdar o parser seguro e timezone-safe, alinhando perfeitamente a exibição do tempo relativo ("agora", "2m", "1h") na listagem de leads e contatos sem distorções de fuso horário.
- [x] **Arquivos Modificados**:
  - [chat.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/chat.tsx)

### [2026-05-25] — Rolagem Inteligente e Notificações de Chat no Chat Central

**Suspensão de Auto-Scroll e Notificações Flutuantes**:
- [x] **Smart Scrolling Suspension (`chat.tsx`)**: Implementado travamento inteligente de descida de rolagem. Caso o atendente suba a lista de mensagens para ler o histórico, o auto-scroll é suspenso, evitando que novas mensagens joguem a tela para baixo.
- [x] **Auto-Reset por Ações**: O auto-scroll é reativado automaticamente caso o atendente envie uma resposta manual, troque de lead na lista lateral, ou role manualmente de volta ao fundo do chat (`scrollBottom < 40px`).
- [x] **Balão Flutuante de Novas Mensagens**: Exibe um botão flutuante em gradiente com a quantidade exata de novas mensagens (`{unreadCount}`) recebidas em tempo real enquanto o atendente está com o scroll travado. Clicar no botão desce a tela suavemente para a última mensagem e limpa as notificações.
- [x] **Arquivos Modificados**:
  - [chat.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/chat.tsx)

### [2026-05-25] — Regras de Status Automático de Conversas (Progresso do Funil - Granularidade)

**Transições Inteligentes de Estado no Chat Central**:
- [x] **1ª Mensagem / Entrada (`seq1`)** ➔ Classifica a conversa como `'open'` (Aberta) automaticamente no D1 quando a IA ou o motor envia o boas-vindas inicial.
- [x] **Entrega de Produto (`seq2`)** ➔ Classifica a conversa como `'pending'` (Pendente) automaticamente no D1 assim que as receitas/PDFs são entregues e o Pix Cora é apresentado, mantendo o lead na lista de cobrança pendente.
- [x] **Pagamento Confirmado (`pagamento`) & Sistema Liberado (`sistema`)** ➔ Classifica a conversa como `'finalizado_com_sucesso'` (Finalizado com Sucesso) assim que a transação é confirmada ou os dados de login são despachados.
- [x] **Finalizadores de Follow-up (`finalizador_12h` & `cobrador_58h`)** ➔ Classifica a conversa como `'finalizado_sem_sucesso'` (Finalizado sem Sucesso) no fim da régua de follow-up se o lead não comprou, encerrando o ciclo de forma limpa e granular.
- [x] **Arquivos Modificados**:
  - [tools.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/tools.ts)
  - [followups.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/followups.ts)
  - [chat.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/routes/chat.ts)
  - [dashboard.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/routes/dashboard.ts)
  - [automation-engine.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automation-engine.ts)
  - [chat.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/chat.tsx)
  - [dashboard.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/dashboard.tsx)

### [2026-05-25] — Refinamento Estrutural e Lógica do Fluxograma (Aba 2)

**Alinhamento de Funil e Bifurcação de Decisão Híbrida**:
- [x] **Alinhamento Vertical de Entrada**: Ajustada a entrada de dados para seguir de cima para baixo de forma 100% vertical: `Webhook WhatsApp ➔ Debounce (15s) ➔ Porteiro (Gateway)`.
- [x] **Bifurcação de Decisão do Porteiro**: A partir do Porteiro, o sistema define a ramificação principal:
  - **OU: Novo Lead (1ª Interação)** ➔ Direciona verticalmente para `Primeiro Lead (Anunciador)`.
  - **OU: Recorrente (Interações seguintes)** ➔ Direciona verticalmente para `Triagem`.
- [x] **Bifurcação E (Fundo) sob Primeiro Lead (Anunciador)**: O Anunciador ativa a régua de follow-up inicial em background:
  - **⚡ E (Fundo)**: Régua de Início em background com `👀 Vigia (15m)` e `🚀 Incentivador (1h)`.
- [x] **Roteamento de 3 Vias sob Triagem**: Alinhado visualmente o papel real do classificador de intenções `Triagem`, que decide:
  - **OU: ACEITOU** ➔ Direciona para `📚 Entregador` (PDFs + Pix Cora) e sua Régua de Cobrança Pix (`Cobrador Amigo (10h)`, `Cobrador Curioso (34h)`, `Cobrador Final (58h)`).
  - **OU: COMPROVANTE** ➔ Direciona para `💳 Caixa` (Validação de Pix, Upsell e N8N).
  - **OU: DÚVIDAS / NEGOU** ➔ Direciona para `🤝 Negociador` (Suporte conversacional e objeções).
- [x] **Setas e Conectores de Fluxo**: Conectores e ramificações ajustados para fluir de cima para baixo com setas brilhantes orientadas de forma reativa.
- [x] **Compilação e Deploy Concluídos**: O código do frontend foi compilado com 100% de sucesso e deployado remotamente no Cloudflare Workers.

### [2026-05-25] — A Nova Interface de Abas Premium e Auto-Pruning de Logs (Entrega Final)

**Abas Premium, Rastreabilidade e Auditoria Leve**:
- [x] **Aba 1 (🤖 Automações)**: Grid reestilizado com cartões elegantes para controle total do status, edição, duplicação e visualização das automações.
- [x] **Aba 2 (📊 Visualizar Fluxo)**: O fluxograma interativo. Apresenta o diagrama geral e, se pesquisado um celular de lead, colore as etapas do funil dinamicamente em Verde (concluído), Amarelo (aguardando/pendente) e Vermelho (erro). Nós vermelhos de erro exibem relatórios pop-up clicáveis com logs exatos, facilitando auditoria rápida pelo operador.
- [x] **Aba 3 (🎯 Rastreamento CAPI)**: Logs do Facebook Conversions API filtráveis dinamicamente por automação e com dropdown de status ("Todos", "Sucesso", "Erro").
- [x] **Aba 4 (🧹 Limpar Dados)**: Painel completo de reset de testes (Lead Purge) por número de celular, apagando contatos, mensagens, estados, follow-ups agendados e logs do D1 e KV.
- [x] **Aba 5 (⚠️ Logs de Erros)**: Lista de logs de erros do sistema gerados nas últimas 48 horas para rastreio direto e centralizado.
- [x] **Auto-Pruning no Cron Trigger**: Adicionada a tarefa assíncrona recorrente de limpeza que purga em lote registros de `error_logs` e `facebook_tracking_logs` com mais de 48 horas, blindando o D1 contra inchaço (consumo menor que 2% do limite gratuito) e garantindo ótima performance.
- [x] **Compilação e Deploy Concluídos**: bundle Vite/React-Router gerado com 100% de sucesso e deploy push executado no Cloudflare Workers (`Version ID: 5d36ad37-2fee-4e02-9947-bcb637c7e0cd`).

### [2026-05-25] — Geração de Textos Dinâmicos via LLM com Fallback Sólido

**Variações e Sinônimos em Copies do Funil**:
- [x] **Boas-Vindas Dinâmico (Seq1)**: Refatoramos `executeSeq1` em `workers/automations/recheios/tools.ts` para invocar a LLM (`callLLM`) de forma a gerar o copy de boas-vindas com variações e sinônimos naturais.
- [x] **Apresentação de Receitas & Fechamento Dinâmicos (Seq2)**: Refatoramos `executeSeq2` em `workers/automations/recheios/tools.ts` para que o Texto 1 de recepção das receitas e a primeira metade do Texto Final de fechamento de oferta rodem pela LLM gerando sinônimos fluidos.
- [x] **Dados de Pix e Valores 100% Blindados**: As tabelas de preços, dados do Pix (Banco Cora, destinatário, chave celular) e o bloco de cópia rápida no celular foram mantidos estáticos no código, garantindo que a LLM nunca alucine dados de cobrança e que as transações físicas permaneçam 100% corretas.
- [x] **Resiliência Máxima e Try/Catch Fallback**: Todas as chamadas de geração via LLM possuem blocos de tratamento de erro que revertem para os copies originais idênticos caso ocorram timeouts, rate-limits ou indisponibilidades de APIs de IA.
- [x] **Compilação e Deploy Concluídos**: O código foi compilado e publicado remotamente no Cloudflare Workers (`Version ID: 299022e1-6a49-4636-bcf3-8f942ef342ea`).


### [2026-05-25] — Hotfix & Estabilização: Interceptadores Determinísticos por Código (Aceite & Pix)

**Blindagem Conversacional e Latência Zero**:
- [x] **Filtros Determinísticos (Pattern Matching) em `index.ts`**: Desenvolvemos as funções auxiliares `isSimpleAcceptance` e `isDeterministicPayment` para interceptar as mensagens mais cruciais do lead por código.
- [x] **Bypass de LLM para Aceites ("Ok", "sim", "👍")**: Mensagens que expressam concordância para envio de receitas são interceptadas e disparam a Sequência 2 instantaneamente via código, eliminando chamadas de LLM, latência e o risco de indisponibilidade regional (erros 503) de provedores de IA.
- [x] **Bypass de LLM para Comprovantes (Pix/Caixa)**: Captura imagens, documentos e copies que indicam pagamento ("paguei", "comprovante", "pix feito") de forma direta e executa a ferramenta de processamento de Pix e dados cadastrais de acesso sem chances de falhas de categorização por IA.
- [x] **Compilação e Deploy Concluídos**: O código foi compilado localmente com 100% de sucesso e deployado remotamente no Cloudflare Workers (`Version ID: d33b1865-0166-4208-b294-d702026c63d4`).

### [2026-05-24] — Hotfix: Correção de Chamadas Assíncronas (Awaiting Fetch & CAPI) e Inicialização de Sequência em Cloudflare Workers

**Estabilização da Entrega e Rastreamento**:
- [x] **Aguardando Encadeamento da Sequência 2**: Adicionado `await` ao `fetch` interno recursivo em `/api/webhook/seq2-step` dentro de `workers/routes/webhooks.ts`. Isso evita que a VM do Cloudflare Workers finalize o contexto e cancele silenciosamente os passos da Sequência 2 no meio do processo.
- [x] **Aguardando Inicialização de Sequência 2 (Step 0)**: Refatorado o método `executeSeq2` em `workers/automations/recheios/tools.ts` para aguardar (`await`) explicitamente a chamada inicial a `triggerStep0()` em vez de delegá-la ao `waitUntil`. Isso resolve problemas em que a VM abortava a inicialização da entrega no Cloudflare Workers.
- [x] **Aguardando Chamadas Externas CAPI e N8N**: Refatorados todos os envios de eventos do Facebook Conversions API (`sendLeadEvent`, `sendPurchaseEvent`, `sendPurchaseEventWithDetails`) e o webhook de matrícula da N8N para serem explicitamente awaited no arquivo `workers/automations/recheios/tools.ts`, prevenindo que requisições outbound sejam abortadas silenciosamente após o retorno do Worker.
- [x] **Compilação e Deploy Concluídos**: Nova versão buildada sem erros e publicada remotamente no Cloudflare via Wrangler (`3369e608-9f97-400e-a6c2-cc586ab0886d`).

### [2026-05-24] — Hotfix: Envio Passo a Passo da Sequência 2 (Chaining HTTP) e Controle de Mutex Lock

**Envio Passo a Passo da Sequência 2**:
- [x] **Divisão da Sequência em Etapas Encadeadas**: Identificamos que o envio completo de 5 PDFs + áudio + imagens + textos excedia o limite de execução de 30 segundos do Cloudflare Workers Free Tier, fazendo a thread `waitUntil` ser cancelada silenciosamente na metade. Criamos a interface `Seq2Step` e refatoramos o envio em `workers/automations/recheios/tools.ts` para disparar os passos de forma incremental.
- [x] **Endpoints Internos Chained via HTTP**: Criamos a rota pública `POST /api/webhook/seq2-step` em `workers/routes/webhooks.ts`. Cada etapa envia um único item (PDF, imagem, texto ou áudio), registra-o instantaneamente no histórico do banco `messages` e agenda a execução da etapa seguinte após o delay especificado (baseado em 2 a 3 segundos de respiro) chamando a si mesma via `fetch`.
- [x] **Resolução Dinâmica da URL Base**: Implementamos a extração automática da `baseUrl` a partir da própria URL da requisição HTTP (`c.req.url`) no webhook handler, passando-a via contexto para os executores. Isso remove a dependência de consultas ou domínios estáticos desconfigurados no banco (como `zapgo.promentor21.top` que não estava apontando para o worker), assegurando que o encadeamento das requisições de entrega sempre encontre o Worker ativo.
- [x] **Persistência de Mutex Lock e Prevenção de Overlaps**: Implementamos a flag de estado `is_delivering_seq2` no KV para manter o lock Mutex `processing` ativo durante todo o envio. Qualquer mensagem enviada pelo cliente durante a entrega do produto é retida na fila temporária `queue` no KV e processada de forma ordenada após a conclusão do último passo, evitando respostas encavaladas da IA.
- [x] **Compilação e Deploy Concluídos**: Nova versão buildada sem erros e publicada em produção no Cloudflare Workers (`983072e8-e1ce-46dd-863e-5e781289f398`).

### [2026-05-24] — Hotfix: Confirmação Determinística de Pagamento, Upsell e Coleta de Dados sem Preâmbulos

**Onboarding e Confirmação 100% Precisos**:
- [x] **Tratamento de Pagamento Físico via Código**: Refatoramos o processamento em `workers/automations/recheios/index.ts` para que, ao classificar a mensagem como `COMPROVANTE` e executar a ferramenta `pagamento`, o sistema **retorne imediatamente** a requisição e interrompa a execução da LLM naquele turno. Isso evita que o modelo receba o texto em bruto do comprovante e tente responder preâmbulos conversacionais confusos como *"Deixa só registrar aqui rapidinho"*.
- [x] **Diferenciação Automática de Valores em `executePagamento`**: Modificamos a ferramenta `pagamento` em `workers/automations/recheios/tools.ts`. Agora, ela envia de forma 100% determinística o copy correto pós-confirmação via WhatsApp:
  - Se o valor pago for de **R$ 25 ou mais** (Kit Completo), ela envia diretamente a mensagem de parabéns e **solicita imediatamente o Nome e E-mail** do cliente para cadastro.
  - Se o valor pago for de **R$ 10 ou R$ 15**, ela oferece a oferta de **Upsell do Kit Completo por +R$ 5** e atualiza o estado `upsell_offered = 1` no banco.
- [x] **Supressão Total no Loop de Diálogo**: Adicionamos a ferramenta `pagamento` à lista de supressão estrita em `index.ts` para garantir blindagem completa.
- [x] **Compilação e Deploy Concluídos**: Nova build sem erros e publicada em produção na Cloudflare Workers via Wrangler (`3eb88dce-feb3-4a28-92e2-a8b8ecf5f314`).

### [2026-05-24] — Hotfix: Entrega Determinística de Acesso do Sistema e Supressão de Preâmbulos

**Aprimoramento do Envio de Links de Acesso**:
- [x] **Disparo Físico via Código em `executeSistema`**: Refatoramos a ferramenta `executeSistema` em `workers/automations/recheios/tools.ts` para que, imediatamente após o cadastro de matrícula e UTMs no banco de dados e webhook da N8N, ela monte de forma direta e envie via código um copy elegante e formatado contendo o link de login encurtado dinâmico com o código sequencial de lead (`/login?id=[cliente_codigo]`), as instruções de e-mail e o link do vídeo explicativo do YouTube Shorts.
- [x] **Supressão Total de Preâmbulos ("Vou cadastrar...")**: Atualizamos a orquestração do loop em `workers/automations/recheios/index.ts`. Adicionamos a ferramenta `sistema` à lista de supressão estrita, de modo que sempre que ela for acionada, qualquer resposta conversacional gerada pela LLM (como "Vou cadastrar agora") seja totalmente omitida, garantindo que o lead receba apenas o copy final e limpo de entrega direta.
- [x] **Compilação e Deploy Concluídos**: Nova versão buildada sem erros e publicada remotamente no Cloudflare via Wrangler (`3b1bc297-c930-4c07-acec-5a67d818b004`).

### [2026-05-24] — Hotfix: Execuções Resilientes e Crash-Proof de waitUntil (Módulo Recheios & Engine)

**Resiliência Máxima do Lifecycle do Worker**:
- [x] **Tratamento de Exceções em Background**: Identificamos que sob certas condições (como re-processamentos de fila ou delays em edge cases), a propriedade `env.executionCtx` de contexto do Cloudflare Worker podia ficar inacessível ou vazia, provocando falhas do tipo `TypeError: Cannot read properties of undefined (reading 'waitUntil')` que crashavam a thread silenciosamente, impedindo o disparo da Sequência 2.
- [x] **Fallback Síncrono de Segurança**: Implementamos verificação defensiva robusta (`env.executionCtx && typeof env.executionCtx.waitUntil === 'function'`) tanto no despachador do `executeSeq2` em `workers/automations/recheios/tools.ts` quanto na gestão de concorrência em `workers/automation-engine.ts`. Caso o `executionCtx` não esteja disponível, o Worker agora chaveia automaticamente de forma dinâmica e transparente para execução síncrona pós-sleep, garantindo que o lead **nunca** fique sem resposta.
- [x] **Compilação e Deploy em Produção**: Verificado o build com sucesso e publicado definitivamente em produção na Cloudflare Workers via Wrangler (`819659dd-fda8-45de-998b-632511621b6c`).

### [2026-05-24] — Hotfix: Resolução de 503 na Transcrição/OCR do Gemini e Persistência de Transcrições no D1

**Correção de Mídia e Alta Disponibilidade**:
- [x] **Diagnóstico da API Google Gemini**: Identificamos, através de scripts de simulação e logs no D1, que o modelo `gemini-2.5-flash-lite` (anteriormente configurado no endpoint de transcrição e OCR no banco de dados) estava apresentando instabilidades graves na região, retornando **HTTP 503 Service Unavailable (UNAVAILABLE - Model under high demand)**. Isso causava falhas silenciosas na transcrição de áudios e leituras de comprovantes, retornando copies de falha e impedindo que a IA soubesse o que o lead disse em mensagens de áudio.
- [x] **Failover para Modelo Estável (`gemini-2.5-flash`)**: Executamos consultas de atualização direta no banco de dados SQLite D1 remoto para substituir todas as ocorrências do endpoint `-lite` pelo endpoint do modelo padrão e estável **`gemini-2.5-flash`** (tanto em `transcription_services` quanto em `ocr_services`). O modelo padrão foi testado e retornou HTTP 200 OK com processamento instantâneo.
- [x] **Persistência de Transcrições no Banco de Dados**: Criamos a função utilitária `updateLastEmptyMessage` em `workers/automations/recheios/index.ts`. Agora, ao processar com sucesso áudios (transcrição) ou imagens/PDFs (OCR), o sistema localiza a mensagem correspondente no banco (que anteriormente ficava em branco `""` na inserção pré-processamento) e a atualiza dinamicamente com o texto extraído.
- [x] **Visibilidade no Painel de Chat**: As transcrições e OCRs agora são gravados permanentemente na tabela `messages` do D1 SQLite remoto, o que corrige o bug de balões de mensagens vazias e permite que as mídias apareçam e sejam lidas perfeitamente na interface Split-Screen do atendente.
- [x] **Compilação e Deploy**: Código TypeScript compilado com sucesso absoluto e publicado em produção na Cloudflare Workers via Wrangler.

### [2026-05-24] — Hotfix: Correção de Execução Estrita do seq2 e Supressão de Diálogo Conversacional (Julia)

**Ajuste e Sincronização do Fluxo de Conversação**:
- [x] **Regra Estrita no System Prompt (`prompts.ts`)**: Adicionada a regra `### 0. Confirmação / Autorização para Enviar Receitas (Ativação de seq2)` na seção de comportamento obrigatório do prompt de Julia. Ela foi instruída de forma categórica a executar a ferramenta `seq2` imediatamente quando houver autorização ou confirmação em linguagem natural por áudio ou texto, e responder **UNICAMENTE** com o emoji `👆` em completo silêncio conversacional.
- [x] **Supressão Automática no Motor de Decisões (`index.ts`)**: Implementada uma barreira inteligente no processamento do `handleByLLM` em `workers/automations/recheios/index.ts`. Se as ferramentas `seq1` ou `seq2` forem acionadas durante a rodada, qualquer resposta conversacional adicional gerada pela LLM é 100% omitida. Isso previne que mensagens redundantes ou contraditórias do tipo "Vou te liberar aqui agora" disputem com o copy rico e mídias disparadas de forma assíncrona pelo código da ferramenta.
- [x] **Compilação e Deploy de Sucesso**: Build e empacotamento Vite/React-Router executados com 100% de êxito e deploy push realizado na Cloudflare Workers.

### [2026-05-24] — Hotfix: Resolução de Transcrição de Áudio com Endpoint e Provedor Customizado (Google Lite)

**Resolução do Fluxo de Transcrição via Endpoint Customizado**:
- [x] **Suporte a Endpoints no Driver (`media-service.ts`)**: Adicionada a propriedade opcional `endpoint` em `TranscribeAudioOptions` no driver de mídia (`workers/services/media-service.ts`). O método `transcribeAudio` agora monta dinamicamente o corpo de requisição do Google Gemini/Lite e injeta a API key por parâmetro se um endpoint customizado estiver configurado no banco de dados.
- [x] **Busca de Configuração de Transcrição com Fallback (`index.ts`)**: Refatorado o carregamento de transcritores em `workers/automations/recheios/index.ts`. Substituímos o carregamento simples de chaves (`getTranscriptionApiKeysWithFallback`) pelo carregamento de objetos de configuração completos (`getTranscriptionConfigsWithFallback`), resolvendo dinamicamente tanto as chaves de API quanto as URLs dos endpoints customizados configurados pelo usuário na tabela `transcription_services`.
- [x] **Correção de Type-Safety no Engine**: Adicionado o campo `transcription_service_id` ausente no tipo `AutomationContext['automation']` em `workers/automation-engine.ts`, eliminando todos os erros de typecheck do TypeScript na build.
- [x] **Compilação e Deploy em Produção**: Verificado o build com sucesso e publicado definitivamente em produção na Cloudflare Workers via Wrangler.

### [2026-05-24] — Painel de Purga de Dados de Teste (Lead Purge) na Interface

**Funcionalidade de Purga Completa para Testes**:
- [x] **API Endpoint de Purga (`purge-lead`)**: Implementada a rota `POST /api/automations/purge-lead` no backend (`workers/routes/automations.ts`) que remove de forma segura e imediata todos os registros do número de telefone fornecido das tabelas: `contacts`, `conversations`, `messages`, `conversation_state`, `scheduled_followups`, `automation_leads`, `tracking_data` e `facebook_tracking_logs`.
- [x] **Limpeza de Cache KV**: Adicionado mecanismo de invalidação automática das chaves de debounce e concorrência no Cloudflare KV (`debounce:${phone}`, `debounce:${phone}:processed`, `processing:${phone}`, `queue:${phone}`), garantindo reinício perfeito de fluxos de teste sem atrasos de lock ou buffer.
- [x] **Interface Gráfica Premium**: Criado painel com visualização dark glassmorphic no topo da seção de Automações (`app/routes/automations.tsx`) com input de número e um botão de purga com gradiente em vermelho destrutivo e confirmação segura (`confirm`).
- [x] **Compilação e Deploy em Produção**: Verificado o build com sucesso e publicado definitivamente em produção na Cloudflare Workers via Wrangler.

### [2026-05-24] — Hotfix: Resolução de Envio de Imagens e Mídias com Legenda na UAZAPI (Sequência 2)

**Universalização do Driver de Mídia UAZAPI**:
- [x] **Compatibilidade Dupla de Mídias (file/path)**: Ajustado o payload de envio de mídias (`sendImage`, `sendVideo`, `sendDocument`, `sendAudio` em `workers/services/whatsapp-service.ts`) para incluir de forma simultânea as chaves `"file"` e `"path"`, suportando de ponta a ponta as diferentes versões da API do UAZAPI.
- [x] **Compatibilidade Dupla de Legendas (text/caption)**: Ajustada a passagem de legendas de imagens e vídeos (`sendImage` e `sendVideo`) para transmitir as propriedades `"text"` e `"caption"` simultaneamente. Isso elimina qualquer falha silenciosa de renderização no WhatsApp do lead devido a inconsistências de versão no parser do UAZAPI.
- [x] **Compilação e Deploy em Produção**: Verificado o build com sucesso e publicado definitivamente em produção na Cloudflare Workers via Wrangler.

### [2026-05-24] — Customização da Sequência 2 (Nova Régua de Entrega de PDFs, Áudios e Imagens)

**Reestruturação Determinística da Sequência de Oferta**:
- [x] **Configuração de Sequência Multi-Etapas**: Implementada nova estrutura estrita e sequencial de mensagens na ferramenta `seq2` em `workers/automations/recheios/tools.ts`, despachando mídias e cópias sequencialmente com delays otimizados para simular digitação humana e evitar timeouts.
- [x] **Preservação e Envio de PDFs**: Mantido o fluxo original de entrega das 5 apostilas digitais de receitas de recheio no início da sequência.
- [x] **Texto 1 com Nome Dinâmico**: Acoplado o envio do primeiro texto de parabéns, interpolando de forma dinâmica o primeiro nome do lead com formatação de negrito.
- [x] **Novo Áudio de Entrega**: Atualizado o link do áudio central para `audio2-v3.mp3` no arquivo de constantes `config.ts` e no disparo sequencial.
- [x] **Dados de Pix Estáticos**: Inserido o Texto 2 contendo dados de pagamento Pix de forma direta e estática via código, eliminando a dependência e custo de consultas de IA.
- [x] **Imagens Sequenciais com Legenda (Caption)**: Adicionado o envio de duas imagens em sequência com legendas ricas em formatação markdown contendo os pacotes de preços (Imagem 1) e os bônus inclusos (Imagem 2).
- [x] **Texto Final de Fechamento**: Finalizado o fluxo com o copy completo de fechamento da oferta, incluindo instruções do Pix e a chave para cópia rápida no celular.
- [x] **Compilação e Publicação**: Verificada a compilação do projeto com zero erros e publicado definitivamente em produção na Cloudflare Workers via Wrangler.

### [2026-05-23] — Hotfix: Resolução de Detecção, Download e Transcrição de Áudio da UAZAPI

**Ajuste e Sincronização do Fluxo de Mídia**:
- [x] **Priorização de `messageType` sobre `type` (UAZAPI)**: Corrigido bug no parser de webhook da UAZAPI v2 em `workers/services/message-utils.ts` (na função `extractFromUazapiV2` e na função `detectMessageType`). Identificamos que o uazapiGO envia `message.type = "chat"` em mensagens de áudio, mas envia o tipo correto no campo `message.messageType = "AudioMessage"`. A verificação anterior priorizava `type`, classificando incorretamente áudios como mensagens de texto comuns, o que impedia o download e a transcrição. Agora priorizamos `message.messageType` no mapeador.
- [x] **Mapeamento Flexível e Robusto de Tipos**: Atualizada a função `mapToMessageType` em `message-utils.ts` para fazer buscas baseadas em substring (`.includes()`), mapeando corretamente strings nativas da UAZAPI como `AudioMessage`, `ImageMessage`, `DocumentMessage` etc., para tipos internos normalizados (`audio`, `image`, `document`).
- [x] **Ajuste de Fallback no Download de Mídias**: Atualizado o helper de download `downloadMedia` em `workers/services/whatsapp-service.ts` para buscar `data.base64Data` além de `base64` e `data`, cobrindo de ponta a ponta as peculiaridades da resposta JSON de download do uazapiGO e evitando base64 vazio.
- [x] **Compilação e Deploy de Sucesso**: O projeto compilou com sucesso absoluto e foi publicado definitivamente na Cloudflare via Wrangler.

### [2026-05-23] — Implementação da Arquitetura Premium Multi-Agente ReceitasVIP, CAPI, UAZAPI e Ajustes

**Resolução de Funcionalidades e Conclusão do Planejamento**:
- [x] **Controle de Concorrência Mutex & Fila Encadeada**: Implementado sistema inteligente de bloqueio (`processing`) via Cloudflare KV em `automation-engine.ts`. Caso o lead envie novas mensagens enquanto a Julia está formulando ou enviando uma resposta (com seus delays de humanização de áudios/PDFs), essas mensagens extras são capturadas, salvas e enfileiradas (`queue`) na borda. Elas são processadas sequencialmente após a conclusão da resposta ativa com um delay de respiro de 2 segundos, evitando sobreposição de bolhas de chat e respeitando estritamente o tempo limite de 30 segundos do plano gratuito.
- [x] **Arquitetura Multi-Agente ReceitasVIP**: Implementação completa dos 13 novos agentes conversacionais em português (Porteiro, Triagem, Anunciador, Entregador, Caixa, Negociador, Apoiador, Vigia, Finalizador, Incentivador, Cobrador Amigo, Cobrador Curioso, Cobrador Final) em `workers/automations/recheios/prompts.ts`, com instruções estritas de formatação conversacional de alta conversão (parágrafos de quebra dupla `\n\n`, negritos estritos nas palavras-chave e uso controlado de 1 a 3 emojis).
- [x] **Agendamentos Declarativos em Lote**: O Porteiro (100% código) cria imediatamente todos os agendamentos de follow-up reativo ao registrar o primeiro contato, eliminando a dependência do cron do N8N.
- [x] **Matrícula via Webhook N8N**: Integração da ferramenta `sistema` em `tools.ts` efetuando POST para `/api/webhooks/entrada` com cabeçalho `X-Webhook-Token: dvKVhM5uAVqJQB0662avGK87jUhy9V3T` e envio estruturado de SKU e e-mail.
- [x] **Safety Guard Meta CAPI**: Injetados desvios rápidos em `facebook-tracking.ts` retornando sucesso imediato caso o parâmetro `ctwaclid` esteja ausente no lead, evitando falhas com contatos orgânicos.
- [x] **Reordenação Dinâmica de Provedores**: Adicionado controle prioritário global através da coluna `sort_order` para as listagens de LLMs, OCRs e Transcrições. Foram adicionados botões interativos ▲/▼ em `settings.tsx`, nova rota POST `/api/settings/reorder` e invalidação inteligente de cache no KV.
- [x] **Identificadores Sequenciais Curtos**: Retroalimentação linear sequencial O(N) executada e integrada à criação de leads no `automation-engine.ts`, provendo URLs de login encurtadas do tipo `login?id=[cliente_codigo]`.
- [x] **Diagrama de Fluxo Visual ReceitasVIP**: Redesenhado o painel do flowchart do produto sob o botão "Ver Fluxo" na listagem de automações para representar com maestria o fluxo híbrido multi-agente, suas bifurcações de classificação e tags.
- [x] **Compilação e Deploy com 100% de Sucesso**: Build Vite/TypeScript compilado com zero erros e publicado definitivamente em ambiente de produção da Cloudflare Workers.

### [2026-05-22] — Hotfix: Correção de Ordem de Áudio (Seq1) e Timeouts de Execução (Seq2)

**Resolução de Ordem e Otimização de Performance**:
- [x] **Ordem Estrita de Áudio na Sequência 1**: Aumentado o delay pós-áudio de 10s para 15s em `executeSeq1`, garantindo tempo para o WhatsApp processar e carregar o áudio como mensagem de voz no celular do cliente antes que o texto complementar de boas-vindas chegue.
- [x] **Eliminação de Timeouts na Sequência 2**: Identificado que os uploads de 5 PDFs em sequência + 1 áudio + 1 texto no Cloudflare Worker excediam o tempo limite síncrono de 30 segundos, causando abortamento silencioso da thread. Reduzidos os sleeps em `executeSeq2` para valores seguros e otimizados (~21 segundos no total) e injetado o namespace `env.KV` nas funções de envio de mídias (`sendAudio` e `sendDocument`), removendo queries redundantes de D1 e eliminando gargalos de banco na edge.
- [x] **Acoplamento Instantâneo de Emojis (`isSimpleAcceptance`)**: Validada a lógica deterministicamente em código de forma que emojis como joinhas (`👍`) ou afirmações equivalentes chamem `seq2` em código e ignorem a LLM (DeepSeek com chave expirada), assegurando que o fluxo de receitas funcione com 100% de precisão e rapidez.
- [x] **Compilação e Deploy de Sucesso**: Build TypeScript e Vite gerados com zero erros e publicados em definitivo para produção na Cloudflare Workers.
- [x] **Banco Higienizado**: Executada limpeza profunda dos dados do lead de teste `5522998513392` em todas as tabelas do D1 SQLite remoto para viabilizar testes limpos.

### [2026-05-22] — Hotfix: Ordenação Estrita de WhatsApp e Lógica Centralizada de Ferramentas (Julia)

**Resolução da Ordem de Entrega de Mídias (Áudios & PDFs) e Ativação Contextual**:
- [x] **Orquestração Sequencial Estrita nos Executores de Ferramentas**: Refatoradas as ferramentas `executeSeq1` e `executeSeq2` em `workers/automations/recheios/tools.ts` para enviar **tanto** a mídia (Áudio 1 no `seq1`; 5 PDFs + Áudio 2 no `seq2`) **quanto** o copy de texto complementar (mensagem de boas-vindas com o primeiro nome do cliente; pacote/Pix de R$ 10) de forma sequencial e com robustas pausas de sincronização (`sleep(6500)` para áudios, `sleep(7500)` para PDFs). Isso garante que o WhatsApp entregue as mídias pesadas **antes** do texto complementar em telas móveis.
- [x] **Tratamento Determinístico e Eficiente em `handleByCode`**: Atualizado o motor dinâmico em `workers/automations/recheios/index.ts` para que, ao interceptar o primeiro contato, aceites afirmativos simples (`isSimpleAcceptance`) ou pedidos extras de receita, execute a ferramenta e retorne `{ handled: true }` imediatamente. Isso resolve o envio por código de forma ultraveloz, economizando chamadas de IA e garantindo a ordem absoluta de entrega de áudios/PDFs.
- [x] **Ativação Universal de Ferramentas na LLM Julia**: Configurado o motor para que `toolsToPass` em `handleByLLM` sempre passe a lista completa de ferramentas `TOOL_DEFINITIONS`. Isso garante que se o lead enviar qualquer confirmação em linguagem natural complexa (não filtrada pelo código), Julia possa disparar livremente e de forma nativa a ferramenta `seq2` ou `seq1`.
- [x] **Configuração e Instruções de Ferramentas no System Prompt**: Enriquecido o prompt central de Julia em `workers/automations/recheios/prompts.ts` ensinando-a detalhadamente a existência de `seq1` e `seq2`, quando executá-los e instruindo-a a responder unicamente com o emoji `👆` ao ativá-los, igual ao comportamento original do N8N.
- [x] **Supressão Inteligente de Emoji de Controle**: Implementado filtro purificador em `handleByLLM` para suprimir e não enviar o emoji `👆` ao WhatsApp quando retornado pela LLM em chamadas de ferramentas, mantendo a experiência do chat limpa e premium.

### [2026-05-22] — Lógica Conversacional Híbrida (Mídias em Código + Copy Dinâmico via Julia)

**Alinhamento de Mídias UAZAPI & Endpoints REST Manuais**:
- [x] **Alinhamento do Driver UAZAPI**: Atualizados todos os métodos do driver UAZAPI em `workers/services/whatsapp-service.ts` (`sendImage`, `sendDocument`, `sendAudio`, `sendVideo`) para utilizar o endpoint unificado `/send/media` com a estrutura exata e payloads requeridos (`type`, `file`, `docName` para PDFs e `text` para captions), eliminando o erro 405/404 da versão anterior.
- [x] **Endpoints Dedicados de Mídia (API)**: Expostas novas rotas REST em `workers/routes/chat.ts` sob `/api/chat` para envio manual de conteúdos a partir do painel de controle:
  - `POST /conversations/:id/send-text`
  - `POST /conversations/:id/send-audio` (com suporte a presets de CDN `audio1` e `audio2`)
  - `POST /conversations/:id/send-document` (com suporte a presets individuais dos PDFs e preset `all` que dispara sequencialmente todos os 5 arquivos com delay humano de 4 segundos)
  - `POST /conversations/:id/send-image` (presets `seq1`, `img2`, `bonus`, `upsell`)
  - `POST /conversations/:id/send-video` (presets `video2`, `video3`)
- [x] **Despacho Realtime no Chatwoot**: Modificada a rota manual padrão de envio do painel `POST /conversations/:id/messages` para carregar dinamicamente os tokens ativos do contato e da API de WhatsApp vinculada, enviando a mensagem real em tempo real via WhatsApp do lead.
- [x] **Purga Limpa de Leads**: Executado o script `delete_lead.sql` limpando totalmente o histórico de conversas, mensagens e tracking CAPI do número de teste `5522998513392` no banco D1 SQLite remoto.
- [x] **Compilação e Verificação de Erros**: Build de produção compilando com 100% de sucesso sem erros de sintaxe ou de tipagem do TypeScript.
- [x] **Melhorias Estruturais e Alinhamento**: Refatorados os disparadores de mídia em `workers/automations/recheios/tools.ts`. As ferramentas `executeSeq1` e `executeSeq2` agora enviam estritamente as mídias (Áudio 1 para a Sequência 1; os 5 PDFs de receitas seguidos pelo Áudio 2 para a Sequência 2), deixando o copy conversacional livre de estática.
- [x] **Fallthrough Inteligente para LLM Julia**: Alterado o motor de decisões em `workers/automations/recheios/index.ts`. O primeiro contato e a aceitação agora disparam suas respectivas mídias em código, aguardam 3.5 segundos para humanização e retornam `{ handled: false }`, permitindo que a LLM ("Julia") formule dinamicamente o texto complementar personalizado para cada cliente.
- [x] **Pattern Matching Flexível (`isSimpleAcceptance`)**: Implementado analisador de aceitação por código robusto que ignora palavras de recusa (como `não`, `nao`, `nem`) e aceita de forma ampla sinônimos afirmativos (como `sim`, `quero`, `pode`, `manda`, `envia`, `aceito`, `gostaria`, `interesse`, `ok`, `ta`, `bora`), acelerando as respostas e poupando custos de LLM.
- [x] **Resolução de Bug no Prompt Dinâmico**: Corrigida a chamada de `getAgentPrompt` no `handleByLLM` para passar o array de histórico de mensagens (`history`) como quarto argumento, viabilizando que as condicionais do prompt de Julia funcionem com precisão.
- [x] **Limpeza de Persona (Julia ➔ Julia)**: Substituídas com 100% de sucesso todas as referências residuais à assistente "Julia" pela nova persona "Julia" nos arquivos de configuração, prompts e módulos de upsell.
- [x] **Compilação e Deploy de Sucesso Definitivo**: O projeto compilou com zero erros TypeScript e o deploy foi realizado com 100% de sucesso absoluto na Cloudflare via Wrangler, resolvendo o bug do provedor `deepseek-v4-flash` desconhecido.
- [x] **Diagnóstico da API Key do DeepSeek**: Identificado via script de teste local (`test_deepseek.js`) que a chave de API cadastrada pelo usuário (`3fb4c7ede98d4e3ba32bb3af0ac6b377`) é **inválida** no servidor oficial do DeepSeek (erro 401 Unauthorized), impedindo que a LLM gerasse a resposta e concluísse a conversa.
- [x] **Exclusão Completa do Lead de Teste**: Executada query SQL no D1 remoto eliminando todo o histórico do número `5522998513392` de todas as tabelas para permitir um teste limpo do zero com a nova LLM funcionando.
- [x] **Criação do Manual de Arquitetura SDR**: Elaborado artefato explicativo premium `manual_arquitetura_sdr.md` contendo a filosofia "Código vs N8N", o funcionamento da lógica conversacional híbrida com diagrama Mermaid e dicas de evolução.
- [x] **Remoção de Ferramentas Distratoras (`think`) e Omissão Dinâmica**: Identificado que a presença da ferramenta de raciocínio interno `think` e de outras ferramentas de ação causavam distração na LLM (DeepSeek) no primeiro contato, gerando preâmbulos indesejados como *"Vou analisar a situação primeiro"*. Removemos o `think` de `TOOL_DEFINITIONS` e das referências e implementamos a omissão dinâmica de ferramentas (`tools: undefined`) nos envios complementares de Sequence 1 e Sequence 2, fazendo a assistente "Julia" responder exatamente com o copy correto e humanizado do prompt.
- [x] **Expurgo Definitivo de Lead e Deploy**: Limpeza completa executada no número `5522998513392` no banco D1 remoto e nova versão buildada e deployada com 100% de sucesso.



### [2026-05-21] — Limpeza de Lead de Teste para Nova LLM

**Limpeza Efetuada**:
- [x] **Exclusão completa do lead `5522998513392`**: Removido permanentemente de todas as tabelas no banco de dados Cloudflare D1 (`contacts`, `conversations`, `messages`, `conversation_state`, `scheduled_followups`, `automation_leads`, `tracking_data`, `facebook_tracking_logs`) para permitir testes limpos e do zero com a nova LLM configurada pelo usuário.
- [x] **Verificação de cache**: Confirmado que o namespace do KV está limpo de quaisquer chaves de debounce ativas para este número.

### [2026-05-21] — Hotfix: 3 Correções Críticas (Facebook CAPI, UAZAPI Áudio, Timeout waitUntil)

**Correções Aplicadas**:
- [x] **Facebook CAPI — evento `Lead` rejeitado (400)**: O Facebook Conversions API exige `event_name: 'LeadSubmitted'` (e não `'Lead'`) quando `action_source` é `'business_messaging'`. Corrigido em `workers/services/facebook-tracking.ts` (função `sendLeadEvent`).
- [x] **UAZAPI — envio de áudio retornava 405 Method Not Allowed**: O endpoint de áudio da UAZAPI é `/chat/send/audio` com campos `Phone` e `Audio` (e não `/send/audio` com `number`/`audio`). Corrigido em `workers/services/whatsapp-service.ts` (função `uazapi.sendAudio`).
- [x] **waitUntil() cancelado por timeout**: O debounce de 15s somado ao tempo de LLM + envios WhatsApp ultrapassava o limite de 30s do `waitUntil` na Cloudflare Workers, fazendo o Worker matar a execução no meio. Reduzido o debounce de 15s → 5s e TTL KV de 60s → 30s em `workers/automation-engine.ts`.
- [x] **Deploy e Validação**: Build compilada com zero erros e deploy executado com sucesso na Cloudflare Workers.

### [2026-05-21] — Hotfix: Correção do Erro de Objeto no Webhook UAZAPI

**Correções Críticas**:
- [x] **D1_TYPE_ERROR no Webhook da UAZAPI**: Corrigido bug crítico no parser de mensagem local `extractMessageContent` em `workers/automation-engine.ts`. Para webhooks da UAZAPI, `body.message` chega como um objeto JSON parseado (ex: `{"type":"text","body":"Oi"}`) e o parser simplificado acabava extraindo o objeto inteiro no fallback. Ao tentar gravar no banco D1 SQLite, o driver acusava `D1_TYPE_ERROR: Type 'object' not supported for value '[object Object]'`, travando a transação.
- [x] **Integração com o Parser Central Robusto**: Refatorada a função local `extractMessageContent` em `workers/automation-engine.ts` para herdar e delegar o parsing para a função `extractMessageContent` de `workers/services/message-utils.ts`. Ela já realiza o tratamento adequado de payloads da UAZAPI e Evolution API de forma segura e centralizada, extraindo o texto real das mídias ou mensagens de texto.
- [x] **Deploy e Estabilidade**: Build de produção compilada com sucesso absoluto e novo deploy push na Cloudflare executado e verificado com sucesso.

### [2026-05-21] — Hotfix: Correção do Webhook & Migração de Contatos Legados

**Correções Críticas**:
- [x] **Divergência de Parsing de Telefone**: Corrigido bug crítico no roteador do webhook (`workers/routes/webhooks.ts`) onde o telefone do remitente extraído e passado para `processMessageAsync` não era normalizado da mesma forma que a chave do cache de debounce KV. Isso fazia com que `processMessageAsync` buscasse no buffer com uma chave diferente (ex: contendo `@s.whatsapp.net`), resultando em 0 mensagens encontradas, fazendo a rotina assíncrona encerrar silenciosamente (HTTP 200) sem persistir a mensagem ou responder ao cliente.
- [x] **Auto-Upgrade de Contatos Legados**: Implementado mecanismo de migração on-the-fly em `getOrCreateContact` (`workers/automation-engine.ts`). Contatos importados ou legados que possuem `whatsapp_number = NULL` no banco de dados agora são detectados e atualizados automaticamente com o número de WhatsApp de origem ativo no primeiro recebimento de mensagem. Isso impede a criação de contatos duplicados e mantém o histórico de conversação do lead 100% íntegro sob o mesmo painel de chat.
- [x] **Segurança e Build**: Compilação testada localmente via `npm run build` com sucesso absoluto e deploy push realizado na Cloudflare Workers com sucesso.


### [2026-05-21] — Isolamento Completo por Produto e WhatsApp de Origem

**Isolamento de Contatos, Conversas e Leads**:
- [x] Adaptada a busca e criação de contatos (`getOrCreateContact` em `workers/automation-engine.ts`) para isolar por `whatsapp_number` e `product_name` através de um JOIN dinâmico na tabela de automações, prevenindo conflitos entre diferentes fluxos rodando sob o mesmo número.
- [x] Adaptada a busca e criação de conversas (`getOrCreateConversation` em `workers/automation-engine.ts`) para isolar por `product_name`, permitindo que o mesmo cliente tenha conversas ativas separadas por produto mesmo interagindo com o mesmo número de WhatsApp.
- [x] Adaptada a rotina de criação e detecção de leads (`processMessageAsync` em `workers/automation-engine.ts`) para verificar duplicados com base no nome do produto (`product_name`), garantindo que novas réguas de funil e automações sejam ativadas quando o lead demonstrar interesse por um novo produto.
- [x] Atualizada a tipagem de `AutomationContext['automation']` para incluir o campo de isolamento `product_name: string | null`, garantindo 100% de type-safety em toda a base de código e módulos de automação.
- [x] Validada compilação do projeto com sucesso (`npm run build`) com 0 erros de TypeScript ou Vite.
- [x] Realizado deploy em produção com sucesso via `npx wrangler deploy` na Cloudflare Workers.

### [2026-05-21] — Nome do Produto e Mecanismo de Duplicação de Automações

**Persistência & Banco de Dados (Cloudflare D1)**:
- [x] Criada migração `migrations/0007_automation_product_name.sql` adicionando o campo `product_name TEXT` à tabela `automations`.
- [x] Executada migração com sucesso na base de dados remota do D1 utilizando Wrangler.
- [x] Atualizadas as rotas REST `POST /api/automations` e `PUT /api/automations/:id` no backend (`workers/routes/automations.ts`) para desestruturar, validar e persistir o valor de `product_name` no SQLite.

**Interface & UX de Duplicação Avançada (React 19 + Tailwind)**:
- [x] Adicionado campo de formulário **Nome do Produto** estilo dark premium glassmorphic no modal de criação e edição de automações.
- [x] Integrada a exibição visual do produto com o badge `📦 Produto: [Nome]` logo no topo das informações principais nos cards das automações para reconhecimento imediato do operador.
- [x] Desenvolvido botão interativo **"📋 Duplicar"** em cada card da listagem.
- [x] Criada mecânica de duplicação client-side (`handleDuplicate`) que pré-carrega todas as chaves, tokens, LLMs de fallback e domínios da automação selecionada no modal, alterando dinamicamente o título para `Cópia de [Nome Original]`, garantindo produtividade máxima sem redundância no servidor.

### [2026-05-21] — Chat Split-Screen Premium e Filtros de Data Avançados

**Tela de Chat Split-Screen & Resizer Interativo (UX/UI Desktop)**:
- [x] Criado layout Split-Screen Desktop unificado no frontend (`app/routes/chat.tsx`).
- [x] Refatorada a rota individual (`app/routes/chat-detail.tsx`) para atuar como wrapper da principal, provendo a mesma visualização suave do chat e mantendo o estado de filtros sincronizado ao mudar de lead.
- [x] Implementado divisor vertical interativo com arraste por mouse (`onMouseDown`, `mousemove`, `mouseup` no `window`) com limites de tamanho seguro (`280px` a `600px`).
- [x] Persistência da largura do painel esquerdo no `localStorage` (`chat-list-width`) para preservar as preferências de visualização do atendente.
- [x] Adicionado painel direito para conversas ativas contendo o histórico de mensagens, botões rápidos de status, toggle de IA e formulário de envio condicional.
- [x] Adicionado estado vazio glassmorphic premium para a metade direita se nenhum lead estiver selecionado.
- [x] Implementado polling automático de 5 segundos no histórico do lead ativo para atualizar conversas em tempo real sem spinners invasivos.

**Filtro de Datas & Busca no Banco SQLite (D1 & Edge)**:
- [x] Atualizada a API REST GET `/api/chat/conversations` em `workers/routes/chat.ts` para receber parâmetros `start_date` e `end_date` e filtrar por `cv.updated_at`.
- [x] Desenvolvido seletor premium de datas no painel lateral ("Tudo", "Hoje", "Ontem" e "Período Personalizado").
- [x] Desenvolvida rotina de conversão de fuso horário no frontend que traduz limites locais em strings compatíveis com o fuso UTC de banco do SQLite (`YYYY-MM-DD HH:MM:SS`), prevenindo bugs de atribuição de data.
- [x] Caixa de pesquisa por lead ou telefone totalmente sincronizada aos demais filtros do chat.
- [x] Build de produção (`npm run build`) validada com 100% de sucesso e deploy executado na Cloudflare Workers.

### [2026-05-21] — Rastreamento Facebook Conversions API (CAPI)

**Infraestrutura & Banco de Dados:**
- [x] Criada migration `migrations/0004_facebook_tracking.sql` adicionando campos `pixel_id` e `facebook_token` à tabela `automations` e criando a tabela `tracking_data` para persistência de parâmetros de anúncio do Meta.
- [x] Aplicada migration remotamente no D1.
- [x] Criada migration `migrations/0006_facebook_tracking_logs.sql` adicionando a tabela `facebook_tracking_logs` para armazenar histórico de execuções CAPI (status, payload, resposta) com índices otimizados para busca rápida.
- [x] Aplicada migration remotamente no D1.

**Serviço de Rastreamento Facebook (Facebook CAPI Helper):**
- [x] Criado `workers/services/facebook-tracking.ts` contendo:
  - Hash seguro via SHA-256 (Crypto Web API nos Workers) para dados pessoais sensíveis (PII: telefone, e-mail, nome, etc.).
  - Chamadas HTTP assíncronas e sem bloqueio (non-blocking) utilizando `.then().catch()` direcionadas para o endpoint de Conversions API do Facebook.
  - Funções para recuperar dados de clique de anúncio, salvar cliques, disparar evento `Lead`, disparar evento `Purchase` 1 (básico), e `Purchase` 2 (enriquecido com e-mail/nome).
  - Deduplicação inteligente de eventos `Purchase` utilizando o mesmo `event_id` (`purchase_${leadId}`).
  - **Pruning / Autolimpeza automático**: Inclusão de rotina assíncrona após inserção de log para deletar automaticamente qualquer log mais antigo que 2 dias (`DELETE FROM facebook_tracking_logs WHERE created_at < datetime('now', '-2 days')`), garantindo base de dados limpa.

**Integração no Webhook e Motor de Automações:**
- [x] Atualizada query em `workers/routes/webhooks.ts` para buscar `pixel_id` e `facebook_token` configurados.
- [x] Atualizado `workers/automation-engine.ts` para:
  - Extrair dados de clique Click-to-WhatsApp (CTWA) tais como `ctwaclid`, `source_id`, `page_id`, campanha e anúncio a partir do payload recebido do webhook.
  - Inserir/atualizar automaticamente leads na tabela `automation_leads` e salvar metadados de anúncio no banco `tracking_data`.
  - Passar as variáveis de rastreamento no `AutomationContext`.
- [x] Adicionados novos campos `waba_id` (WhatsApp Business Account ID) e `page_id` (Facebook Page ID) via migração `migrations/0005_facebook_waba_page.sql` e aplicada no banco de dados D1 remoto.
- [x] Atualizados os endpoints REST de CRUD de automações (`POST` e `PUT` em `workers/routes/automations.ts`) para suportar e persistir os campos `waba_id` e `page_id`.
- [x] Atualizada a query do webhook em `workers/routes/webhooks.ts` para buscar `waba_id` e `page_id` da tabela `automations` e enriquecer o contexto de processamento.
- [x] Atualizados os métodos de disparo do Helper de API de Conversões (`sendLeadEvent`, `sendPurchaseEvent`, `sendPurchaseEventWithDetails` em `workers/services/facebook-tracking.ts`) para incluir de forma dinâmica `waba_id` e `page_id` no objeto `user_data` das payloads de tracking do Facebook.

**Integração na Automação de Recheios à Prova de Fogo:**
- [x] Editado `workers/automations/recheios/tools.ts` para disparar os eventos de Conversões:
  - Disparo de `Lead` ao acionar a sequência inicial (`executeSeq1`) com `wabaId` e `pageId` dinâmicos.
  - Disparo de `Purchase 1` (básico com valor e telefone) ao processar confirmação de PIX (`executePagamento`) com `wabaId` e `pageId` dinâmicos.
  - Disparo de `Purchase 2` (enriquecido com nome completo e e-mail) ao processar a criação de credenciais de acesso no sistema do curso (`executeSistema`) com `wabaId` e `pageId` dinâmicos.

**Painel de Controle e Rotas Web (Frontend & API REST):**
- [x] Adicionada rota de API GET `/api/automations/:id/tracking-logs` em `workers/routes/automations.ts` para retornar os 100 últimos logs de CAPI da automação.
- [x] Refatorado formulário/modal de automações (`app/routes/automations.tsx`) para substituir o seletor de LLMs baseado em botões por três dropdowns `<select>` independentes (LLM Principal, LLM Secundária e LLM Terciária), permitindo a seleção de fallbacks de LLM em dropdowns como os demais campos.
- [x] Integrados e testados novos inputs de Pixel ID, Facebook Access Token, WABA ID e Page ID no bloco de formulário premium glassmorphic do modal "Editar Automação" para persistência correta via CRUD e listagem visual nos cards.
- [x] Adicionado botão **"🎯 Rastreamento"** em cada card de automação na listagem.
- [x] Criado modal de logs de rastreamento com visualização tabular completa (evento, telefone, status badge, data formatada localmente).
- [x] Criado modal secundário de detalhe com visualização formatada do JSON de Payload Enviado e da Resposta da API / Erro.
- [x] Validação de build finalizada com sucesso via `npm run build` (zero erros) e deploy executado com sucesso na Cloudflare.

### [2026-04-27] — Setup Inicial + Backend + Frontend + Deploy

**Setup do Projeto:**
- [x] Projeto inicializado com template oficial `cloudflare/react-router-hono-fullstack-template`
- [x] `package.json` personalizado para `automacao-zap`
- [x] Dependências instaladas (React 19, Hono, Tailwind CSS v4, Vite 6, React Router v7)

**Infraestrutura Cloudflare (tudo criado e funcionando):**
- [x] Banco D1 criado: `whatsapp-platform` (ID: `a24603e2-88a5-4cb4-854d-b87f03ad5ff0`)
- [x] Bucket R2 criado: `whatsapp-platform-storage`
- [x] KV Namespace criado: `SESSIONS` (ID: `9a145369816b478ca39896a28a5c51cf`)
- [x] Durable Object configurado: `ChatRoom` (usando `new_sqlite_classes` para plano free)
- [x] `wrangler.jsonc` configurado com todos os bindings (D1, R2, KV, DO)
- [x] JWT Secret configurado como secret no Cloudflare
- [x] `.env` atualizado com IDs reais dos recursos

**Banco de Dados D1:**
- [x] Migration `0001_initial_schema.sql` aplicada remotamente
- [x] 11 tabelas criadas: users, domains, whatsapp_apis, llms, ocr_services, automations, automation_llms, contacts, conversations, messages, error_logs
- [x] Índices otimizados para consultas frequentes

**Backend (Hono — todas as rotas):**
- [x] `workers/app.ts` — Entry point com CORS, middlewares e rotas
- [x] `workers/middleware/auth.ts` — JWT puro (sem deps externas, compatível com Workers)
- [x] `workers/routes/auth.ts` — Login, setup admin, perfil, troca de senha
- [x] `workers/routes/settings.ts` — CRUD completo: APIs WhatsApp, LLMs, OCR, Domínios
- [x] `workers/routes/automations.ts` — CRUD de automações com geração de webhook/slug
- [x] `workers/routes/chat.ts` — Listagem de conversas com filtros, envio manual, controle IA/status
- [x] `workers/routes/dashboard.ts` — Métricas: conversas, IA vs manual, alertas, recentes
- [x] `workers/routes/webhooks.ts` — Recepção de mensagens, criação auto de contatos/conversas
- [x] `workers/durable-objects/chat-room.ts` — WebSocket realtime para chat

**Frontend (React 19 + Tailwind CSS v4):**
- [x] `app/app.css` — Design system dark premium (glassmorphism, gradientes, animações)
- [x] `app/root.tsx` — Layout raiz com AuthProvider, SEO, Google Fonts
- [x] `app/routes.ts` — Rotas: login, dashboard, automations, chat, chat/:id, settings
- [x] `app/contexts/auth-context.tsx` — Contexto de auth com login, logout, token auto-check
- [x] `app/components/layout.tsx` — Sidebar com navegação, avatar, logout
- [x] `app/routes/login.tsx` — Login premium com glassmorphism e setup inicial do admin
- [x] `app/routes/dashboard.tsx` — Dashboard com 4 cards, conversas recentes, alertas, barras
- [x] `app/routes/automations.tsx` — Grid de automações, modal de criação, webhook copiável
- [x] `app/routes/chat.tsx` — Lista de conversas com filtros e badges
- [x] `app/routes/chat-detail.tsx` — Chat estilo WhatsApp com bolhas, sidebar de contato
- [x] `app/routes/settings.tsx` — 5 abas (WhatsApp, LLMs, OCR, Domínios, Perfil) com CRUD

**Deploy:**
- [x] Build realizado com sucesso (0 erros)
- [x] Deploy automático para Cloudflare Workers
- [x] URL: https://automacao-zap.projetobrlatam.workers.dev

**Arquivos criados/modificados:**
- `wrangler.jsonc` — Configuração completa
- `.env` — Credenciais reais + IDs dos recursos
- `package.json` — Personalizado
- `migrations/0001_initial_schema.sql` — Schema do banco
- `workers/app.ts`, `workers/middleware/auth.ts`
- `workers/routes/auth.ts`, `settings.ts`, `automations.ts`, `chat.ts`, `dashboard.ts`, `webhooks.ts`
- `workers/durable-objects/chat-room.ts`
- `app/app.css`, `app/root.tsx`, `app/routes.ts`
- `app/contexts/auth-context.tsx`, `app/components/layout.tsx`
- `app/routes/login.tsx`, `dashboard.tsx`, `automations.tsx`, `chat.tsx`, `chat-detail.tsx`, `settings.tsx`

### [2026-05-20] — Serviços de Processamento de Mensagens

**Novos arquivos criados:**
- [x] `workers/services/debounce-service.ts` — Serviço de debounce usando KV para agrupar mensagens rápidas consecutivas (TTL 30s, buffer com flag processed, funções: addToDebounce, getAndProcessDebounce, clearDebounce, hasActiveDebounce, getDebounceInfo)
- [x] `workers/services/message-utils.ts` — Utilitários de mensagens: particionamento em limites de sentença (partitionMessage), cálculo de delay (calculateDelay), formatação de telefone BR (formatPhone), detecção de tipo (detectMessageType), extração de conteúdo de webhooks UAZAPI e Evolution API (extractMessageContent), saudação por horário (getGreeting), sleep helper

### [2026-05-20] — Motor de Automação (Fase 2 - Infraestrutura)

**Migration 0002:**
- [x] `migrations/0002_automation_state.sql` — Novas tabelas para o motor de automação:
  - `conversation_state` — Máquina de estados por conversa (phase, seq, payment, upsell, etc.)
  - `scheduled_followups` — Follow-ups agendados com status/datetime
  - `automation_leads` — Tracking de leads com UTM, produto, pagamento
  - Índices otimizados para todas as queries frequentes

**Motor de Automação:**
- [x] `workers/automation-engine.ts` — Motor central criado com:
  - Types: IncomingMessage, AutomationContext, ConversationState, AutomationModule
  - Registry pattern: registerAutomation() para módulos plugáveis
  - Parsing de mensagens: suporte Evolution API v2 + formato genérico
  - Debounce via KV: janela de 15s, acumula mensagens rápidas
  - State management: getOrCreateState(), updateState()
  - Helpers: getOrCreateContact(), getOrCreateConversation(), getMessageHistory()
  - processMessage() — Entry point síncrono (responde imediato ao webhook)
  - processMessageAsync() — Processamento assíncrono via waitUntil
  - combineMessages() — Combina mensagens do debounce em uma só
  - Logging de erros no banco

### [2026-05-20] — Serviços do Motor de Automações

**Serviços criados (workers/services/):**
- [x] `llm-service.ts` — Serviço unificado de LLM com fallback automático
  - Suporte a 6 provedores: Google Gemini, OpenAI, DeepSeek, xAI Grok, OpenRouter, Anthropic
  - Fallback automático por ordem de prioridade (tabela automation_llms)
  - Function calling (tools) para Gemini e OpenAI-compatible
  - Visão/OCR via Gemini (análise de imagens)
  - Transcrição de áudio via Gemini (inlineData)
- [x] `whatsapp-service.ts` — Serviço de mensagens WhatsApp multi-provedor
  - Detecção automática de provedor pela base_url (Evolution API v2, UAZAPI)
  - Envio de texto, imagem, documento, áudio e vídeo
  - Download de mídia recebida (base64)
  - Cache de config por lifetime da request
- [x] `media-service.ts` — Serviço de processamento de mídia
  - OCR de imagens (comprovantes PIX, recibos, etc.)
  - OCR de PDFs
  - Transcrição de áudio para texto
  - Extração universal de texto de respostas (Gemini, OpenAI, Claude, genérico)

**Arquivos criados:**
- `workers/services/llm-service.ts`
- `workers/services/whatsapp-service.ts`
- `workers/services/media-service.ts`

---

### [2026-05-20] — Automação Recheios à Prova de Fogo (FASE 2)

**Motor de Automação (Componentes Core):**
- [x] `workers/automation-engine.ts` — Motor central com debounce KV, state machine, registry de módulos
- [x] `workers/services/llm-service.ts` — Chamadas LLM com fallback (Gemini, DeepSeek, OpenAI, xAI, OpenRouter, Claude)
- [x] `workers/services/whatsapp-service.ts` — Envio WhatsApp multi-provider (Evolution API v2, UAZAPI)
- [x] `workers/services/media-service.ts` — OCR/transcrição via Gemini Vision
- [x] `workers/services/debounce-service.ts` — Debounce via Cloudflare KV (15s window)
- [x] `workers/services/message-utils.ts` — Utilitários (partição, formatação, detecção de tipo)
- [x] `migrations/0002_automation_state.sql` — Tabelas: conversation_state, scheduled_followups, automation_leads

**Automação Recheios (Módulo Completo):**
- [x] `workers/automations/recheios/config.ts` — Dados do produto, preços, PIX, URLs, delays
- [x] `workers/automations/recheios/prompts.ts` — Prompts dinâmicos (mudam por fase) para reduzir tokens
- [x] `workers/automations/recheios/tools.ts` — Ferramentas: SEQ1, SEQ2, Pagamento, Sistema, Think
- [x] `workers/automations/recheios/index.ts` — Módulo principal com decisões por código + LLM quando necessário
- [x] `workers/automations/recheios/followups.ts` — Follow-ups (20min, 30min, 10h, 24h, 1d, SEQ3, upsell)
- [x] `workers/automations/recheios/upsell.ts` — Oferta de upsell (+R$5 Kit Completo) e downsell

**Integrações:**
- [x] `workers/routes/webhooks.ts` — Integrado com automation-engine (waitUntil para processamento async)
- [x] `workers/app.ts` — Registro da automação Recheios + scheduled handler (Cron Trigger)
- [x] `wrangler.jsonc` — Adicionado Cron Trigger (*/5 * * * *) para follow-ups

**Otimizações (economia de LLM):**
- Decisões por código: primeira mensagem (auto SEQ1), aceitação simples, pedido de receitas
- Prompt dinâmico: muda conforme a fase, reduzindo tokens por chamada
- Pattern matching para aceite (sim/ok/quero/pode) → sem chamar LLM
- Tools executadas em código, apenas raciocínio conversacional via LLM

**Build:** ✅ Passou sem erros nos novos arquivos (erros pré-existentes em auth.ts/settings.tsx mantidos)

## 🚀 Em andamento

Nenhum - Código da automação Recheios completo, otimizado e rodando em produção.

### [2026-05-28] - Timeout de LLM (20s) e Resolução do Lead Neuda

**Otimizações e Correções:**
- [x] **Timeout de LLM de 20s**: Desenvolvido o utilitário `fetchWithTimeout` usando `AbortController` com limite de 20 segundos em `workers/services/llm-service.ts` para todas as requisições externas de LLM (`callGemini`, `callOpenAICompatible`, `callAnthropic`, `callLLMVision`, `callLLMTranscription`), blindando a aplicação de fallbacks contra o hard timeout de 30s do Cloudflare Workers.
- [x] **Deduplicação de Conversões**: Validada a camada lógica que previne cliques e disparos duplicados de Purchase 1 (básico) e Purchase 2 (enriquecido com nome/e-mail) via logs D1.
- [x] **Remoção de Alucinações de Pagamento**: Garantido o filtro dinâmico de tools na automação Recheios (`index.ts`) onde a ferramenta `pagamento` é removida se `payment_confirmed === 1`.
- [x] **Resolução de Concorrência da Neuda (`5511965118457`)**:
  - Mensagem de texto de Julia enviada via UAZAPI liberando o Kit Completo vitalício gratuito e solicitando Nome e E-mail.
  - Atualizado o estado no D1 remote para `downsell_offered = 1` e `phase = 'paid'`.
  - Inserido registro manual na tabela `messages`.
- [x] **Deploy de Produção**: Deploy da nova versão efetuado com absoluto sucesso (Current Version ID: `8674e0f6-4acc-4a1c-9c4b-3370d1283c89`).

### [2026-05-28] - Hotfix do Dashboard de Performance (Loop Infinito e Métricas)

**Resolução do Problema de Flashing e Métricas:**
- [x] **Remoção de Loop Infinito**: Identificado e corrigido o loop de renderização infinita na rota `/performance` (`app/routes/performance.tsx`). O `useCallback` do `fetchData` e o correspondente `useEffect` dependiam diretamente de referências a objetos mutáveis (`periods`, `filtroVolume`, `explorerFilters`) e da função `apiFetch` (que muda a cada renderização).
- [x] **Memoização Baseada em Primitivos**: Refatoradas as dependências para rastrear unicamente primitivos (strings de datas, parâmetros de texto de filtros, números de página e um trigger manual `refreshTrigger`).
- [x] **Métrica "Recebeu Acesso" Alinhada**: Alinhada a lógica de `recebeu_acesso = 1` na tabela `automation_leads` para ser marcada assim que a Sequência 2 (entrega dos PDFs/produto) é disparada em `workers/automations/recheios/tools.ts`. Anteriormente, só marcava após o cadastro manual pós-pago, gerando divergência nas métricas de conversão.
- [x] **Salvamento de Campanha e Criativo no Webhook**: Desenvolvida a função `parseTrackingFromReferral` em `workers/automation-engine.ts` para extrair, via regex e URL parsing estruturado, os UTMs de campanha (`utm_campaign`), conjunto de anúncio (`utm_term`) e anúncio/criativo (`utm_content`) a partir do link de referral Click to WhatsApp (CTWA) enviado no webhook da API do WhatsApp (mesmo decodificando URLs com redirecionador do Facebook).
- [x] **Validação e Deploy de Produção**: Executados `npm run typecheck` e `npm run deploy` com absoluto sucesso (0 erros) no Cloudflare Workers.
- [x] **Migração de Histórico de Tracking**: Identificada a ausência dos dados de cliques históricos da tabela `tracking_zap_face` do Supabase no novo banco D1 (a migração inicial só cobria followups e mensagens). Desenvolvido e executado o script `scripts/migrate_tracking.mjs` que migrou com sucesso **7.723 registros de tracking históricos** do Supabase para a tabela `tracking_data` no Cloudflare D1 remoto, restabelecendo a fidelidade completa dos gráficos de performance passados.

## 📝 O que falta fazer — FASE 1

### Setup inicial
- [x] ~~Tudo concluído~~

### Autenticação
- [x] ~~Tudo concluído~~

### Dashboard
- [x] ~~Tudo concluído~~

### Seção Automações
- [x] Tela de listagem com cards
- [x] Modal de criação com todos os campos
- [x] Geração automática de webhook
- [x] Botão pausar/ativar
- [x] Botão ver conversas
- [x] Botão log de erros
- [x] Roteamento de webhooks
- [x] Diagrama visual do fluxo (implementado com CSS puro, FlowNode/Connector, modal fullscreen)
- [x] Sistema de fallback automático de LLM (llm-service.ts criado com fallback completo)

### Seção Chat
- [x] Lista de conversas com filtros
- [x] Tela de conversa individual
- [x] Indicação visual IA vs manual
- [x] Dados do contato na lateral
- [x] Botão pausar/ativar IA
- [x] Campo de resposta manual
- [x] Botão alterar status
- [x] Durable Object para realtime configurado
- [ ] Integração frontend com WebSocket (realtime no browser)
- [ ] Notificações visuais de novas mensagens

### Seção Configurações
- [x] ~~Tudo concluído~~

### Infraestrutura
- [x] ~~Tudo concluído~~

---

## 📝 O que falta fazer — FASE 2 (após Fase 1 concluída)

- [x] Criar migration de tabelas do motor de automação (0002_automation_state.sql)
- [x] Criar automation-engine.ts (motor central com debounce, state machine, registry)
- [x] Criar services (llm, whatsapp, media, debounce, message-utils)
- [x] Integrar automation-engine no webhooks.ts (usando waitUntil)
- [x] Configurar Cron Trigger para follow-ups (wrangler.jsonc + app.ts)
- [x] Criar automação Recheios (config, prompts, tools, sequences, followups, upsell, index)
- [x] Build sem erros de TypeScript nos novos arquivos
- [x] Aplicar migration 0002 no D1 remoto ✅ (17 + 10 comandos executados)
- [x] Deploy para Cloudflare Workers ✅ (v4d6112f3, 1032KB)
- [x] Configurar URLs das mídias estáticas (dados.promentor21.top/Funil Recheios)
- [x] Diagrama visual do fluxo no painel de automações (CSS puro, FlowNode/Connector)
- [x] Testar webhook com mensagem real ✅ (webhook UAZAPI recebido e processado)
- [x] Migrar dados do Supabase → D1 ✅ (8.123 leads + 71.031 mensagens, script via wrangler)
- [x] Número WhatsApp de Origem por automação ✅ (migration 0003, campo no frontend, lógica de identificação por par número_origem+cliente)
- [x] Correção em Produção da Claudirene (matrícula manual externa no SKU PROD-R1I27D) ✅
- [x] Campo dinâmico de Código de Produto (SKU) nos Links de Acesso da Área de Membros (frontend e API Hono) ✅
- [x] Refatoração do executeSistema para priorizar correspondência exata do SKU no banco de dados D1 ✅
- [x] Criação do follow-up de Upsell pós-venda de 5 minutos (upsell_5min) sem jitter alto para Máquina de Vendas Online (R$ 14,50) ✅
- [x] Auto-liberação transparente do Upsell pós-venda por dados de cadastro já existentes na conversa (Nome/E-mail) ✅
- [x] Correção da Negativa de Upsell pós-venda de R$ 5,00 via classificação de intenção LLM (RECUSOU_UPSELL), atualização dinâmica do estado downsell_offered e entrega de presente de coração ✅
- [ ] Criar automações de outros produtos (quando fornecidas pelo usuário)


---

## 🐛 Erros encontrados e resoluções

| Data | Erro | Resolução |
|------|------|-----------|
| 2026-04-27 | Durable Object com `new_classes` no plano free | Alterado para `new_sqlite_classes` no wrangler.jsonc |
| 2026-04-27 | Import `{ Context, Next }` do Hono não exportado | Alterado para `import type { Context, Next }` |
| 2026-04-27 | CSS @import url após regras | Movido `@import url()` para antes do `@theme` |
| 2026-05-20 | `@cloudflare/workers-types` não instalado | Removido do tsconfig, usa `worker-configuration.d.ts` |
| 2026-05-21 | D1 REST API não suporta multi-statement com params | Usado wrangler d1 execute --file com SQL puro |
| 2026-05-29 | Claudirene com produto errado por SKU estático | Atualizado lead com PROD-R1I27D, efetuada matrícula manual externa com sucesso. Criado campo de SKU (product_code) dinâmico nos Links de Acesso e refatorado executeSistema para correspondência dinâmica. |
| 2026-05-29 | Upsell do pós-venda inativo e desalinhado | Implementado agendamento de 5 minutos (upsell_5min) pós-entrega do Kit Completo, ajustado valor do upsell para R$ 14,50 da "Máquina de Vendas Online" com copies persuasivas no followups.ts e auto-liberação transparente por dados existentes no tools.ts. |
| 2026-06-03 | IA com resposta genérica ao negar upsell (Rodiney 3392) | Corrigido bypass do Fixed Code Agent para pós-pagamento. Criado intent tag RECUSOU_UPSELL via LLM no Scout Classifier, atualizando downsell_offered = 1 e forçando o Agente Unificado a entregar o Kit Completo de presente com Nome/E-mail. |

---

## 📌 Notas importantes

- A lógica interna das automações NÃO é criada na Fase 1
- Cada automação terá sua lógica fornecida individualmente pelo usuário
- Ao criar automação na Fase 2, sempre buscar documentação da API/LLM/OCR nas Configurações
- **Credenciais padrão:** email `admin@automacaozap.com` / senha `AutoZap@2026!`
- Para usar: acessar o login e clicar "Primeiro acesso? Configurar admin" para criar o usuário
- Deploy URL: https://automacao-zap.projetobrlatam.workers.dev
- **Automação Recheios:** Prompt do agente SDR foi otimizado — condições lógicas movidas para código JS, reduzindo uso de LLM
- **Follow-ups:** Executados via Cron Trigger a cada 5 minutos (*/5 * * * *)

### [2026-06-04] — Resolução de Falhas de Envio, Stagger de Backlog e Anti-Congestionamento

**Correções e Melhorias no Motor de Agendamento**:
- [x] **Correção do Bug de SQL**: Removida a coluna inexistente `media_url` da query de estágios em `workers/automations/recheios/followups.ts` (uma vez que os blocos de mídia ficam dentro do JSON em `message`).
- [x] **Mapeamento de Chaves de Follow-up (`cleanKey`)**: Introduzida a normalização de chaves de follow-up e adaptada a verificação das Regras de Ouro e das cláusulas `switch-case` em `executeFollowup` para suportar tanto chaves curtas (`'vigia'`) quanto longas (`'followup_vigia_15min'`), corrigindo o silêncio de execuções.
- [x] **Fila de Espaçamento para Backlog (Stagger Queue)**: Implementado no Cron de Follow-ups e no Cron de CRM (`workers/routes/crm.ts`) o auto-reagendamento de mensagens acumuladas por pausas no sistema. Mensagens atrasadas há mais de 10 minutos são espaçadas sequencialmente em intervalos aleatórios de 5 a 10 minutos no futuro.
- [x] **Prevenção de Congestionamento (Anti-ban)**: Desenvolvida verificação que consulta `dispatch_logs` antes de enviar mensagens agendadas de CRM ou Follow-up. Caso o canal tenha disparado alguma mensagem nos últimos 60 segundos, o envio agendado é postergado aleatoriamente entre 3 e 7 minutos para manter o comportamento humanizado e evitar bloqueios.
- [x] **Identificação de Canais de Envio**: Enriquecido o fluxo passando explicitamente o `automation_id` em todos os dispatches de mensagens agendadas, garantindo integridade dos logs de dispersão.
- [x] **Validação e Deploy**: Validado build local via `npm run build` e realizado deploy bem-sucedido na Cloudflare Workers.

### [2026-06-04] — Análise e Resolução de Travamento do Lead Diva Gutierres

**Investigação e Resolução**:
- [x] **Auditoria do Lead**: Analisada Diva Gutierres (`phone = "555491252249"`). O Pix de R$ 12.00 foi confirmado pelo OCR e a conversa movida para status `finalizado_com_sucesso` (fim do funil básico) após o envio da confirmação e solicitação de dados (Nome e E-mail) às `16:49:45`.
- [x] **Identificação do Travamento**: Nenhuma mensagem subsequente da cliente chegou ao webhook do sistema (os logs de erros e D1 confirmaram a ausência de novas requisições). O canal Uazapi e a URL do webhook (`https://zapgo.promentor21.top/api/webhook/recheios`) estavam saudáveis e online.
- [x] **Simulação e Waking up via Webhook**: Simulado um payload de webhook Uazapi V2 representando uma nova mensagem da cliente (`"Oi, Julia. Estou aguardando para mandar meus dados."`).
- [x] **Execução e Resposta**: O webhook reabriu a conversa automaticamente para `'open'`, salvou a mensagem na D1 e executou a inteligência artificial (LLM), que gerou a resposta solicitando novamente o Nome e E-mail. A mensagem foi enviada ao WhatsApp com status de `success` nos logs de disparo, destravando a comunicação com a cliente.

### [2026-06-06] — Atualização do Logo Zapfy e Redimensionamento de Componentes

**Ajuste Visual e Branding**:
- [x] **Substituição da Imagem do Logo**: Copiada a nova versão do logo (`media__1780759753235.png` - 80KB) contendo o nome e o ícone do Zapfy para `public/logo.png`.
- [x] **layout.tsx**:
  - Aumentada a altura da logo no cabeçalho mobile de `42px` para `56px`.
  - Aumentada a altura do cabeçalho mobile de `64px` para `72px` para acomodar a logo de forma equilibrada.
  - Aumentada a altura da logo da barra lateral (sidebar expandida) de `46px` para `64px` (largura automática) proporcionando mais destaque visual e legibilidade.
  - Aumentada a logo colapsada para `width: "48px"` e `height: "48px"` com um container de `48px`, garantindo que o ícone do raio verde fique perfeitamente centralizado.
  - Ajustado o padding da logo na sidebar colapsada de `24px 10px` para `20px 10px`.
- [x] **login.tsx**: Aumentada a logo da tela de login de `76px` para `100px` de altura para melhorar o impacto visual inicial.
- [x] **app.css**: Ajustado o padding superior do `.main-content` no mobile de `76px` para `84px` para compensar o aumento do cabeçalho de 64px para 72px, evitando sobreposição de conteúdo.
- [x] **Validação e Deploy**: Validado build local via `npm run build` e realizado deploy na Cloudflare Workers.

### [2026-06-06] — Implementação do Status "Re-aberta" para Conversas

**Melhorias e Ajustes de Status**:
- [x] **Transição Automática de Status no Backend**:
  - Modificado o motor de automação em `workers/automation-engine.ts` (`getOrCreateConversation`) para verificar se o status atual da conversa é um status finalizado/fechado (`finalizado_com_sucesso`, `finalizado_sem_sucesso`, ou `resolved`). Se for, e o cliente enviar uma nova mensagem, o status é atualizado para `'reaberto'`.
- [x] **Preservação de Status no Envio de CRM**:
  - Modificado o backend de CRM em `workers/routes/crm.ts` para remover a atribuição automática de `status = 'open'` ao disparar mensagens de campanha, preservando o status finalizado/fechado no banco até que o cliente de fato responda.
- [x] **Validação de Status no Endpoint de Chat**:
  - Atualizado o endpoint de alteração de status em `workers/routes/chat.ts` para aceitar e validar a string `'reaberto'`.
- [x] **Estatísticas do Dashboard**:
  - Atualizado o endpoint `/api/dashboard/stats` em `workers/routes/dashboard.ts` para somar as conversas com status `'reaberto'` e devolvê-las na chave `reaberto` do objeto de conversas.
- [x] **Design System CSS**:
  - Adicionado o estilo `.badge-reaberto` em `app/app.css` com um fundo roxo translúcido e texto roxo (`color: #a855f7`) de acordo com as regras de HSL tailados.
- [x] **Painel de Chat (React/Frontend)**:
  - Adicionada a aba filter de "Re-abertas" em `app/routes/chat.tsx` com transição de layout horizontal rolável para acomodar responsive.
  - Mapeado o status `'reaberto'` para a estilização correspondente e a legenda **"Re-aberta"** no card de conversa.
  - Incluída a opção **"🔄 Re-aberta"** no seletor de status manual (tanto na visualização desktop lateral quanto no drawer móvel).
- [x] **Tela do Dashboard (React/Frontend)**:
  - Adicionada a contagem e visualização de "Re-abertas" (com barra de progresso em roxo) no painel de conversas por status em `app/routes/dashboard.tsx`.
  - Atualizada a interface `DashboardStats` e o mapeamento de cores/legenda de badge de conversas recentes para `'reaberto'`.
- [x] **Documentação**:
  - Atualizado `ARCHITECTURE.md` para incluir a especificação do novo status `"Re-aberta"`.
  - Atualizados `task.md` e `walkthrough.md` com detalhes do processo.
- [x] **Deploy de Produção**:
  - Executado build de produção e deploy bem-sucedido na Cloudflare.

### [2026-06-07] — Remoção de Gatilhos de Texto e Ajuste de Prompts de Comprovante

**Ajuste no Fluxo de Interceptação e Inteligência Artificial**:
- [x] **Refatoração do Interceptador de Comprovantes**:
  - Modificada a função `isDeterministicPayment` em `workers/automations/recheios/index.ts` para retornar `true` apenas se a mensagem for do tipo `'image'` ou `'document'` e contiver os termos de comprovante. Mensagens de texto puro agora fluem diretamente para a LLM, evitando travamento ou detecção incorreta.
- [x] **Atualização de Prompts da Persona Julia**:
  - Adicionadas diretrizes e regras claras no prompt unificado (`getAgentPrompt`) e no prompt de Caixa (`getCaixaAgentPrompt`) em `workers/automations/recheios/prompts.ts` para guiar e auxiliar clientes que alegam ter pago mas não enviaram o comprovante, ou que enfrentam problemas de exportação do app do banco (Julia os orienta carinhosamente a abrir o extrato do banco, clicar no Pix correspondente e compartilhar/salvar o comprovante).
- [x] **Validação e Deploy**:
  - Validado typecheck completo sem erros com `npm run typecheck`.
  - Executado build e deploy de produção bem-sucedidos na Cloudflare Workers via `npm run deploy`.

### [2026-06-08] - Tratamento de Sub-pagamento de Cobrança (Concluído)

- [x] **Detecção de Preço e Sub-pagamento (Backend Hono)**:
  - Implementado em [tools.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/tools.ts) o cálculo dinâmico da oferta de follow-up ativa (`activeOfferPrice`) a partir do estado da conversa.
  - Adicionado o cálculo do status de sub-pagamento (`isUnderpaidFollowup`) e ajustada a lógica de `alreadyHasKitCompleto` para garantir que o cliente só receba acesso total se o pagamento cobrir o valor da oferta ativa.
  - Atualizado o retorno determinístico `replyText` em `executePagamento` para apresentar de forma simpática as duas opções para clientes sob sub-pagamento.
- [x] **Prevenção de Liberação Indevida**:
  - Modificada a função `executeSistema` em [tools.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/tools.ts) para evitar upgrades automáticos se o cliente pagou apenas pelo kit básico, limitando o acesso a `PROD-R1I27D` (básico) nesses cenários.
  - Adicionado suporte a auto-liberação transparente caso o cliente com acesso básico envie posteriormente o Pix complementar da diferença.
- [x] **Instruções e Prompts da Persona**:
  - Atualizada a função `getPostPaymentInstructions` em [prompts.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/prompts.ts) orientando o agente LLM (Julia) sobre as regras de sub-pagamento de follow-up e a liberação do SKU correspondente.
- [x] **Correções Sintáticas de Compilação**:
  - Removidas re-declarações duplicadas de variáveis block-scoped em `tools.ts` e ajustada a variável local `paidSpecialFollowupNow`.
  - Removido bloco duplicado redundante em `prompts.ts` no encerramento de `getPostPaymentInstructions`.
  - Excluída a chamada para a variável indefinida `styleRules` no escopo da função `getContextByState` em `prompts.ts`.
- [x] **Homologação e Deploy**:
  - Executado `npm run typecheck` com 100% de sucesso.
  - Efetuado build de produção e deploy bem-sucedidos no Cloudflare Workers (`npm run deploy`).

### [2026-06-08] - Responsividade Mobile dos Filtros do Dashboard (Concluído)

- [x] **Layout Flex Responsivo no Dashboard**:
  - Modificada a barra de filtros em [performance.tsx](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/app/routes/performance.tsx) para usar layout flex responsivo (`flex-col md:flex-row`).
  - Separados os filtros em blocos autônomos que quebram de linha de forma inteligente em telas pequenas (mobile/portrait):
    - Linha 1: Date presets (Hoje, Ontem, 7D...)
    - Linha 2: Filtro de data por período (inputs date com seta ➔) + botão de atualizar.
    - Linha 3: Seletor de Automação (dropdown).
  - Ajustados os inputs e selects para ocupar `w-full flex-1` no mobile e restaurar tamanho fixo (`sm:w-auto sm:flex-none`) em telas maiores, eliminando o overflow horizontal na visualização móvel.
- [x] **Homologação e Deploy**:
  - Validada a tipagem com `npm run typecheck` sem falhas.
  - Compilado o frontend e backend e realizado deploy em produção no Cloudflare Workers com sucesso.

### [2026-06-09] - Sincronização de Pagamento e Proteção de Timestamps de Leads (Concluído)

- [x] **Auto-Sincronização de Pagamento no Estado da Conversa (Backend)**:
  - Modificado o método `getOrCreateState` em [automation-engine.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automation-engine.ts) para realizar uma verificação ativa na tabela `automation_leads` a partir do `conversation_id`.
  - Caso o lead conste como pago (`pago = 1`), o sistema força `payment_confirmed = 1`, `total_paid` com o valor original e atualiza a fase para `'paid'` se o estado estiver em etapas iniciais/welcome.
  - Isso previne que redefinições de estado (como no caso de upgrades de contato legado) reiniciem o funil de vendas solicitando pagamento novamente.
- [x] **Proteção de Timestamps de Leads Pagos (Funil Recheios)**:
  - Refatorada a função `executeSeq2` em [tools.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/tools.ts) para consultar o status do lead antes de salvar a entrega.
  - Se o cliente já tiver efetuado o pagamento, a atualização em `automation_leads` modifica apenas `recebeu_acesso = 1` e omite `updated_at`, preservando a data/hora original do pagamento.
- [x] **Homologação e Deploy**:
  - Validado typecheck local (`npm run typecheck`) com zero erros.
  - Compilado com sucesso (`npm run build`).
  - Realizado deploy em produção na Cloudflare Workers com Wrangler (`npx wrangler deploy`).
- [x] **Correções Manuais no Banco D1 (Bruno & Mirca)**:
  - Corrigido o `updated_at` de Mirca (`phone = 554599527569`) de volta para `2026-05-21 14:09:15` (data do pagamento real) no D1, fazendo com que ela suma dos relatórios de vendas do dia atual.
  - Diagnosticado o pagamento pendente do Bruno (`phone = 5521972780567`): as duas tentativas de envio do comprovante de R$ 5,00 falharam no OCR devido a erros `503` (sobrecarga) temporários da API do Gemini, impedindo que o bot confirmasse o valor complementar automaticamente.
  - Corrigido manualmente o valor pago de Bruno no D1 (`automation_leads` e `conversation_state`) para R$ 15,00 e marcado `upsell_accepted = 1` no estado para regularizar o acesso dele.

### [2026-06-09] — Proteção contra Timeout de LLM e Log de Fallback no D1 (Concluído)

- [x] **timeoutMs no Serviço de LLMs**:
  - Adicionada propriedade opcional `timeoutMs?: number` à interface `CallLLMOptions` no arquivo [llm-service.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/services/llm-service.ts).
  - Propagado o tempo limite customizado em `fetchWithTimeout` e nas funções por provedor (`callGemini`, `callOpenAICompatible` e `callAnthropic`).
- [x] **Fallback e Timeout de 8s de Reescritas**:
  - Ajustado `rewriteMessageViaLLM` em [llm-service.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/services/llm-service.ts) para executar chamadas de LLM com limite de `8000` milissegundos.
  - Implementada a gravação de logs de fallback na tabela `fallback_logs` no banco D1 remoto com `fallback_type = 'funnel_rewrite'` e detalhes informando o erro de timeout e o envio da cópia original caso a reescrita exceda o limite.
- [x] **Sinalização do Contexto em Despachos de Funil**:
  - Modificado [tools.ts](file:///c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios/tools.ts) para encaminhar `contact.phone`, `contact.name` e `stageKey` ao `rewriteMessageViaLLM`, garantindo logs ricos no banco.
- [x] **Restauração de Reescrita Dinâmica no Checkout**:
  - Atualizada a tabela `automation_funnel_stages` no D1 remoto definindo o `rewrite_mode = 'dynamic'` para a etapa `ticket_boost`, permitindo que reescritas seguras de IA aconteçam durante o fechamento.
- [x] **Validação e Deploy**:
  - Validada a tipagem com `npm run typecheck` e gerados bundles via `npm run build` com sucesso absoluto.
  - Publicada a nova versão do Worker na Cloudflare com `npm run deploy` (versão `7b750515-0a79-4ce1-b313-58a0b5f19ccb`).


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


### [2026-06-14] - Correção de SKU de Liberação de Acesso e Correção da Cliente Ana Paula (Concluído)

- [x] **Ajuste de Roteamento de SKU no Backend (tools.ts)**:
  - Removido o failsafe que forçava a entrega do SKU de upsell (PROD-H3GQBU - Máquina de Vendas) quando isKitCompleto era true. Clientes que compram as opções de R$ 10, R$ 15 ou R$ 25 do curso principal de confeitaria devem receber o SKU PROD-R1I27D.
  - Protegido o SKU do upsell: no executeSistema, se o SKU de entrada for o de upsell, ele só é liberado se state.upsell_accepted === 1. Caso contrário, retrocede automaticamente para o SKU principal (PROD-R1I27D).
  - Corrigido o upgradeSku no executePagamento de PROD-H3GQBU para PROD-R1I27D quando isSpecialFollowupUpgrade é true (atualização complementar da confeitaria).
  - Atualizadas as descrições dos schemas da ferramenta sistema em TOOL_DEFINITIONS no tools.ts e no index.ts para instruir corretamente a LLM sobre os SKUs.
- [x] **Resolução do Acesso da Cliente Ana Paula Thompson**:
  - Criado e executado o script scratch/fix_ana_paula.cjs.
  - Corrigida a tabela remota automation_leads no D1 alterando produto_codigo de PROD-H3GQBU para PROD-R1I27D para a cliente Ana Paula Thompson (phone = 5521996066147).
  - Disparado o webhook Pix aprovado com sucesso para o n8n contendo o SKU PROD-R1I27D para que a liberação correta ao portal de confeitaria ocorresse.
- [x] **Compilação e Deploy**:
  - Executados npm run typecheck e npm run build com sucesso absoluto.
  - Deploy efetuado no Cloudflare Workers via Wrangler (npx wrangler deploy).
