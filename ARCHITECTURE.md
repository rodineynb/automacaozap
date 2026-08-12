# ARCHITECTURE.md — Arquitetura do Sistema

> ⚠️ Mantenha este arquivo sempre atualizado após qualquer mudança estrutural.
> ⚠️ Mantenha este arquivo sempre atualizado após qualquer mudança estrutural.
> Última atualização: 2026-05-31

## 🌐 Deploy

- **URL:** https://automacao-zap.projetobrlatam.workers.dev
- **Worker:** `automacao-zap`
- **Região:** ENAM (US East)

## 📁 Estrutura Real de Arquivos

```
AutomacaoZAP/
├── AGENTS.md / ARCHITECTURE.md / STACK.md / PROGRESS.md / APIs.md
├── .env                           ← credenciais reais (nunca commitar)
├── env.example                    ← template sem credenciais
├── wrangler.jsonc                 ← config Cloudflare (D1, R2, KV, DO, Cron)
├── package.json / vite.config.ts / tsconfig.json
├── migrations/
│   ├── 0001_initial_schema.sql    ← schema do banco D1
│   ├── 0002_automation_state.sql  ← estado de conversas, follow-ups, leads
│   ├── 0003_whatsapp_number.sql   ← número de WhatsApp de origem por automação
│   ├── 0004_facebook_tracking.sql  ← pixel/token e rastreamento de anúncios (Facebook CAPI)
│   ├── 0013_delivery_link_product_code.sql ← código do produto dinâmico para liberação de acesso
│   └── 0014_product_upsells_schema.sql   ← tabela de configurações de upsell pós-venda por produto
├── workers/                       ← Backend (Hono no Cloudflare Workers)
│   ├── app.ts                     ← entry point com rotas, CORS, registro de automações
│   ├── automation-engine.ts       ← motor central de automações (debounce, state machine, registry)
│   ├── middleware/
│   │   └── auth.ts                ← JWT + hash de senha (puro, sem deps)
│   ├── routes/
│   │   ├── auth.ts                ← login, setup, perfil
│   │   ├── settings.ts            ← CRUD APIs/LLMs/OCR/Domínios
│   │   ├── automations.ts         ← CRUD automações + webhook
│   │   ├── chat.ts                ← conversas, mensagens, status
│   │   ├── dashboard.ts           ← métricas e stats
│   │   ├── reports.ts             ← rotas de relatórios e fallbacks
│   │   ├── crm.ts                 ← endpoints de CRM, health score, AI analysis e cron cron-job
│   │   ├── users.ts               ← CRUD de usuários e controle de permissões (Apenas Admin)
│   │   └── webhooks.ts            ← recepção de mensagens WhatsApp + cron follow-ups + endpoint do seq2 passo a passo (chaining HTTP)
│   ├── services/                  ← Serviços do motor de automações
│   │   ├── llm-service.ts         ← LLM unificado com fallback (6 provedores)
│   │   ├── whatsapp-service.ts    ← Envio de mensagens WhatsApp (multi-API)
│   │   ├── media-service.ts       ← OCR, transcrição de áudio (Gemini)
│   │   ├── facebook-tracking.ts   ← Rastreamento Facebook Conversions API (CAPI)
│   │   ├── debounce-service.ts    ← Debounce de mensagens via KV
│   │   ├── message-utils.ts       ← Utilitários de processamento
│   │   └── app-registry.ts        ← Registro global da instância do Hono (loopback local)
│   ├── automations/               ← Módulos de automação (um por produto)
│   │   └── recheios/              ← Automação "Recheios à Prova de Fogo"
│   │       ├── index.ts           ← Módulo principal (handleMessage)
│   │       ├── config.ts          ← Dados do produto, preços, URLs, delays
│   │       ├── prompts.ts         ← Prompts de IA dinâmicos por fase
│   │       ├── tools.ts           ← Ferramentas: SEQ1, SEQ2, Pagamento, Sistema
│   │       ├── followups.ts       ← Follow-ups agendados (20min → 1 dia)
│   │       └── upsell.ts          ← Oferta de upsell/downsell pós-pagamento
│   └── durable-objects/
│       └── chat-room.ts           ← WebSocket realtime
├── app/                           ← Frontend (React 19 + Tailwind CSS v4)
│   ├── app.css                    ← design system global
│   ├── root.tsx                   ← layout raiz + AuthProvider
│   ├── routes.ts                  ← definição de rotas
│   ├── contexts/
│   │   └── auth-context.tsx       ← contexto de autenticação
│   ├── components/
│   │   └── layout.tsx             ← sidebar + conteúdo principal
│   └── routes/
│       ├── login.tsx              ← página de login
│       ├── performance.tsx        ← dashboard de performance com métricas e stats (inclui Métricas de Follow-up)
│       ├── automations.tsx        ← gestão de automações
│       ├── chat.tsx               ← layout split-screen unificado (lista + conversa)
│       ├── chat-detail.tsx        ← wrapper da conversa individual (reutiliza chat.tsx)
│       ├── reports.tsx            ← relatórios (CAPI, Erros, Fallbacks, Histórico de Follow-ups, Explorar Leads)
│       ├── crm.tsx                ← painel administrativo do CRM (6 abas)
│       ├── followup.tsx           ← painel de follow-ups estilo CRM (Visão Geral de réguas por produto)
│       ├── funnel-messages.tsx    ← painel de mensagens do funil (welcome, delivery, upgrade Pix, upsell, downsell)
│       └── settings.tsx           ← configurações (5 abas)
└── build/                         ← gerado pelo vite (não commitar)```

---

## Visão Geral

Plataforma web de gerenciamento de atendimento automatizado via WhatsApp.
Permite criar múltiplas automações independentes, cada uma para um produto ou serviço,
com sua própria lógica, API WhatsApp e LLM configurada.

---

## Seções Principais do Sistema

---

### 1. 🤖 AUTOMAÇÕES

**O que é:**
Área onde o usuário cria e gerencia os fluxos de atendimento por produto/serviço.

**Como funciona a criação de uma automação:**
1. Usuário clica em "Nova Automação"
2. Preenche:
   - Nome da automação (ex: "Produto X")
   - Seleciona o domínio (dos cadastrados em Configurações)
   - Seleciona qual API WhatsApp usar (das cadastradas em Configurações)
   - Seleciona LLMs em ordem de prioridade (fallback automático)
   - Seleciona serviço de OCR (dos cadastrados em Configurações)
3. Sistema gera automaticamente o webhook:
   - Formato: `https://{dominio-selecionado}/webhook/{slug-da-automacao}`
4. Usuário copia o webhook e cadastra na API do WhatsApp
5. A partir daí, mensagens chegam nesse webhook e são roteadas para essa automação

**Card visual de cada automação exibe:**
- Nome do produto/serviço
- Webhook gerado
- API WhatsApp atribuída
- LLMs em ordem de prioridade
- Serviço de OCR atribuído
- Diagrama visual simplificado da lógica do fluxo (gerado quando a lógica for criada)
- Status: Ativa / Pausada

**Botões no card:**
- Editar configurações
- Pausar / Ativar automação
- Ver Conversas (abre o Chat filtrado por essa automação)
- Log de erros

**Lógica das automações:**
- ⚠️ A lógica interna de cada automação será fornecida pelo usuário na Fase 2
- Cada automação vive em seu próprio módulo em `src/worker/automations/{slug}/`
- Nunca misturar lógica de automações diferentes
- Ao criar nova automação baseada em existente, duplicar o módulo e aplicar novas regras

**Fallback de LLM:**
- Se a LLM principal falhar, tenta automaticamente a 2ª, depois a 3ª
- Registrar no log qual LLM foi usada em cada resposta

---

### 2. 💬 CHAT

**O que é:**
Monitor de conversas em tempo real, estilo Chatwoot.

**Funcionalidades:**
- Lista de todas as conversas agrupadas por automação
- Filtro por automação, status e data
- Status das conversas: Aberta / Pendente / Re-aberta / Resolvida
- Notificações em tempo real de novas mensagens

**Dentro de cada conversa:**
- Histórico completo de mensagens (cliente + IA)
- Indicação visual de qual mensagem foi da IA e qual foi manual
- Dados do cliente na lateral (nome, número, histórico)
- Botão **"Pausar IA"** → IA para de responder, usuário atende manualmente
- Botão **"Ativar IA"** → IA volta a responder automaticamente
- Botão marcar como: Aberta / Pendente / Re-aberta / Resolvida
- Campo para resposta manual quando IA estiver pausada

**Realtime:**
- Usar Cloudflare Durable Objects para atualizações em tempo real
- Novas mensagens aparecem sem precisar recarregar a página

---

### 3. ⚙️ CONFIGURAÇÕES

**O que é:**
Central de cadastros de todos os serviços e integrações do sistema.

---

#### 3.1 APIs WhatsApp
Cadastro de APIs de WhatsApp disponíveis para usar nas automações.

Campos por cadastro:
- Nome da API (ex: "Evolution v2", "Meta Oficial")
- URL base da API
- Chave de autenticação (API Key / Token)
- Link da documentação ← IA usa este link ao criar automações

---

#### 3.2 LLMs
Cadastro de modelos de linguagem disponíveis.

Campos por cadastro:
- Nome do modelo (ex: "Gemini 2.5 Flash", "Claude Sonnet", "GPT-4o")
- Provedor (Google, Anthropic, OpenAI)
- Chave de API
- Link da documentação ← IA usa este link ao criar automações

---

#### 3.3 OCR
Cadastro de serviços de OCR para leitura de comprovantes de pagamento.

Campos por cadastro:
- Nome do serviço (ex: "Gemini 2.5 Flash OCR")
- URL / endpoint
- Chave de API
- Link da documentação ← IA usa este link ao criar automações

Padrão inicial: Gemini 2.5 Flash

---

#### 3.4 Domínios
Cadastro de domínios para geração de webhooks.

Campos por cadastro:
- Domínio (ex: "meudominio.com")
- Ativo / Inativo

Pode cadastrar múltiplos domínios.

---

#### 3.5 Perfil / Autenticação
- Alterar nome de usuário
- Alterar email
- Alterar senha

---

## 🏠 Dashboard (Tela Inicial)

Exibe visão geral do sistema:
- Total de conversas ativas hoje
- Quantas a IA resolveu sozinha vs. atendimento manual
- Qual automação está mais movimentada
- Alertas de falha de LLM ou API
- Últimas conversas recentes

---

## 🔐 Autenticação

- Login com usuário e senha
- Sistema cria automaticamente um usuário e senha padrão no primeiro deploy
- IA deve informar ao usuário as credenciais padrão geradas
- Dentro do sistema o usuário pode alterar: nome, email e senha
- Usar JWT para sessões
- Todas as rotas protegidas por autenticação (exceto webhooks de entrada)

---

## 🔗 Fluxo de uma Mensagem no Sistema

```
1. Mensagem chega no WhatsApp do cliente
2. API WhatsApp envia para o webhook da automação
   → https://{dominio}/webhook/{slug-automacao}
3. Worker recebe a requisição
4. Verifica se a automação está ativa ou pausada
   → Pausada: registra mensagem, notifica no Chat, aguarda resposta manual
   → Ativa: executa a lógica da automação
5. Lógica da automação processa a mensagem
   → Consulta histórico no D1
   → Chama LLM principal (fallback automático se falhar)
   → Executa ações necessárias (OCR, banco, etc.)
6. Resposta enviada ao cliente via API WhatsApp
7. Conversa atualizada no Chat em tempo real
```

---

## 🗄️ Banco de Dados (Cloudflare D1)

Tabelas principais:

```sql
-- Usuários do sistema
users (id, name, email, password_hash, role, allowed_sections, allowed_automations, allowed_products, created_at)

-- Domínios cadastrados
domains (id, domain, active, created_at)

-- APIs WhatsApp cadastradas
whatsapp_apis (id, name, base_url, api_key, docs_url, created_at)

-- LLMs cadastradas
llms (id, name, provider, api_key, docs_url, sort_order, created_at)

-- Serviços OCR cadastrados
ocr_services (id, name, endpoint, api_key, docs_url, sort_order, created_at)

-- Serviços de Transcrição cadastrados
transcription_services (id, name, provider, api_key, endpoint, sort_order, created_at)

-- Automações criadas
automations (id, name, slug, domain_id, whatsapp_api_id, ocr_service_id, transcription_service_id, whatsapp_number, pixel_id, facebook_token, waba_id, page_id, status, attendant_name, created_at)

-- LLMs por automação (com ordem de prioridade)
automation_llms (id, automation_id, llm_id, priority_order)

-- OCRs por automação (com ordem de prioridade)
automation_ocrs (id, automation_id, ocr_service_id, priority_order)

-- Transcrições por automação (com ordem de prioridade)
automation_transcriptions (id, automation_id, transcription_service_id, priority_order)

-- Contatos (clientes)
contacts (id, phone, name, automation_id, created_at)

-- Conversas
conversations (id, contact_id, automation_id, status, ai_active, created_at, updated_at)

-- Mensagens
messages (id, conversation_id, content, role, llm_used, created_at)

-- Log de erros
error_logs (id, automation_id, error_type, error_message, created_at)

-- Estado de conversa na automação (máquina de estados)
conversation_state (id, conversation_id, automation_slug, phase, seq1_called, seq2_called, payment_confirmed, total_paid, upsell_offered, upsell_accepted, downsell_offered, kit_completo_offered, kit_completo_price, client_name, client_email, access_delivered, last_tool_called, metadata, crm_tags, promessa_pagamento_data, created_at, updated_at)

-- Configurações de CRM por produto
crm_product_config (id, product_id, satisfaction_enabled, satisfaction_delay_hours, satisfaction_message, testimonial_enabled, testimonial_delay_hours, testimonial_message, objection_enabled, objection_delay_hours, objection_message, created_at, updated_at)

-- Respostas CRM coletadas
crm_responses (id, product_id, automation_id, phone, lead_name, product_name, flow_type, question_sent, response_text, response_media_url, response_media_type, ai_summary, ai_tags, status, sent_at, answered_at, created_at, updated_at)

-- Agendamentos de envio do CRM (Cron)
crm_scheduled (id, product_id, automation_id, phone, flow_type, scheduled_for, status, crm_response_id, created_at)

-- Relatório de fallbacks (LLM, OCR, transcrição de áudio) com retenção de 15 dias
fallback_logs (id, automation_id, lead_phone, lead_name, product_name, fallback_type, details, created_at)

-- Logs de Envio de Mensagens (Canais de Disparo) com retenção de 7 dias
dispatch_logs (id, automation_id, phone, message_type, message_content, status, error_message, sent_at)

-- Configurações de Follow-up por Produto (Vigia, Finalizador, Incentivador, Cobradores)
followup_product_config (id, product_id, use_llm_variations, vigia_enabled, vigia_delay_minutes, vigia_message, finalizador_enabled, finalizador_delay_minutes, finalizador_message, incentivador_enabled, incentivador_delay_minutes, incentivador_message, cobrador_amigo_enabled, cobrador_amigo_delay_minutes, cobrador_amigo_message, cobrador_curioso_enabled, cobrador_curioso_delay_minutes, cobrador_curioso_message, cobrador_final_enabled, cobrador_final_delay_minutes, cobrador_final_message, created_at, updated_at)

-- Agendamentos de envio de Follow-up (Cron)
scheduled_followups (id, conversation_id, type, status, scheduled_for, executed_at, created_at)

-- Estágios granulares de Follow-up por Automação (Suporta criação ilimitada e customização completa estilo CRM)
automation_followup_stages (id, automation_id, key, name, class, delay_minutes, message, media_url, enabled, created_at, updated_at)

-- Estágios granulares de CRM por Automação (Suporta criação ilimitada e customização completa estilo CRM)
automation_crm_stages (id, automation_id, key, name, enabled, delay_hours, message, rewrite_mode, rewrite_count, variations, class, created_at, updated_at)

-- Estágios de Funil Configuráveis (Welcome, Delivery, Ticket Boost, Ticket Boost Declined, Upsell, Downsell)
automation_funnel_stages (id, automation_id, stage_key, enabled, delay_minutes, rewrite_mode, rewrite_count, variations, created_at, updated_at)

-- Blocos de Mensagens/Campos dentro de cada estágio de Funil (Texto e Mídias)
automation_funnel_fields (id, stage_id, type, content, file_name, sort_order, created_at)

-- 1. Tabela Principal de Produtos
products (id, name, description, deliver_pdfs, deliver_links, created_at, updated_at)

-- 2. Tabela de Ofertas/Valores Dinâmicos
product_offers (id, product_id, name, value, tag, created_at)

-- 3. Tabela de Mídias e PDFs (Upload no R2)
product_assets (id, product_id, name, r2_key, public_url, file_type, tag, is_delivery_file, created_at)

-- 4. Tabela de Links de Acesso (Área de Membros)
product_delivery_links (id, product_id, title, login_url, instructions, video_url, product_code, created_at)

-- 5. Tabela Pivô (Muitos para Muitos: Relação com Automações)
product_automations (product_id, automation_id)

-- 6. Tabela de Configurações de Upsell Pós-Venda por Produto
product_upsells (id, product_id, upsell_sku, upsell_url, use_main_login_url, delay_minutes, price, created_at, updated_at)

```

---

## 📦 Storage (Cloudflare R2)

Usado para armazenar:
- Imagens de comprovantes de pagamento enviados pelos clientes
- Qualquer mídia recebida via WhatsApp que precise de processamento
