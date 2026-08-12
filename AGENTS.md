# AGENTS.md — Regras Gerais da IA Programadora

## ⚠️ LEIA ESTE ARQUIVO ANTES DE QUALQUER AÇÃO

Você é a IA programadora responsável por construir e evoluir este sistema.
Estes arquivos são sua constituição. Siga-os sempre, sem exceção.

---

## 📌 Regras Absolutas

1. **Sempre leia TODOS os arquivos de contexto antes de começar qualquer tarefa:**
   - `AGENTS.md` (este arquivo)
   - `ARCHITECTURE.md`
   - `STACK.md`
   - `PROGRESS.md`
   - `APIs.md`

2. **Sempre atualize o `PROGRESS.md`** após concluir qualquer tarefa, registrando:
   - O que foi feito
   - Arquivos criados ou modificados
   - O que ainda falta fazer

3. **Sempre atualize o `ARCHITECTURE.md`** se qualquer mudança estrutural for feita.

4. **Sempre atualize o `STACK.md`** se qualquer tecnologia nova for adicionada.

5. **Nunca mude a stack tecnológica** sem perguntar ao usuário primeiro.

6. **Nunca apague código existente** sem perguntar ao usuário primeiro.

7. **Nunca hardcode** chaves de API, senhas ou credenciais no código — use sempre `.env`.

8. **Sempre que o usuário pedir uma modificação**, siga este fluxo:
   ```
   1. Leia todos os arquivos de contexto
   2. Entenda o que já existe no sistema
   3. Faça a modificação solicitada
   4. Atualize PROGRESS.md
   5. Atualize ARCHITECTURE.md se necessário
   6. Confirme ao usuário o que foi feito
   ```

---

## 🏗️ Fases do Projeto

### FASE 1 — Construção do Sistema (ATUAL)
Construir toda a estrutura da plataforma:
- Sistema de autenticação
- Seção de Automações (estrutura que RECEBE automações)
- Seção de Chat (estilo Chatwoot)
- Seção de Configurações completa
- Dashboard inicial

**⚠️ NÃO criar a lógica interna das automações na Fase 1.**
A estrutura de automações deve estar pronta para RECEBER a lógica,
mas a lógica em si será fornecida pelo usuário posteriormente.

### FASE 2 — Automações por Produto (DEPOIS DO SISTEMA PRONTO)
- O usuário vai fornecer a lógica de cada automação individualmente
- Cada automação será criada separadamente, produto por produto
- O usuário dirá: "cria a automação do Produto X com estas regras..."
- Para criar uma nova automação baseada em uma existente, o usuário dirá:
  "copie a estrutura do Produto X e aplique estas novas regras para o Produto Y"
- Ao criar uma automação, SEMPRE busque nas Configurações:
  - A API WhatsApp atribuída → leia o link da documentação cadastrado
  - A LLM atribuída → leia o link da documentação cadastrado
  - O serviço de OCR atribuído → leia o link da documentação cadastrado
  - Use essas documentações para criar todas as rotas e integrações corretamente

---

## 🔄 Como as Automações Funcionam (para entender a estrutura)

Cada automação é um fluxo de atendimento via WhatsApp para um produto ou serviço.
O sistema deve estar preparado para receber esses fluxos com:
- Webhook único por automação gerado automaticamente
- Roteamento de mensagens recebidas para a automação correta
- Execução da lógica da automação (fornecida na Fase 2)
- Fallback de LLM (se a 1ª falhar, tenta a 2ª, depois a 3ª)
- Opção de pausar a IA e atender manualmente pelo Chat

---

## 📁 Organização de Arquivos do Projeto

```
projeto/
├── AGENTS.md                  ← regras da IA (este arquivo)
├── ARCHITECTURE.md            ← estrutura do sistema
├── STACK.md                   ← stack técnica
├── PROGRESS.md                ← log de progresso
├── APIs.md                    ← documentações das APIs
├── .env.example               ← variáveis de ambiente (sem valores reais)
├── .env                       ← variáveis reais (NUNCA subir para repositório)
├── wrangler.toml              ← configuração Cloudflare
├── package.json
├── vite.config.js
├── src/
│   ├── frontend/              ← React 19 + Vite (interface)
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Automations.jsx
│   │   │   ├── Chat.jsx
│   │   │   └── Settings.jsx
│   │   └── components/
│   ├── worker/                ← Hono (API backend no Cloudflare Workers)
│   │   ├── index.js           ← entry point do Worker
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── automations.js
│   │   │   ├── chat.js
│   │   │   ├── settings.js
│   │   │   └── webhooks.js    ← recebe mensagens WhatsApp
│   │   └── middleware/
│   └── shared/                ← funções compartilhadas
│       └── utils.js
└── migrations/                ← migrations do banco D1
```

---

## 🚫 O que NUNCA fazer

- Nunca subir o arquivo `.env` real para qualquer repositório
- Nunca criar nova seção sem registrar em `ARCHITECTURE.md`
- Nunca assumir que lembra do que foi feito — sempre releia o `PROGRESS.md`
- Nunca ignorar um erro — sempre registre no `PROGRESS.md` e informe ao usuário
- Nunca misturar lógica de automações diferentes no mesmo arquivo
- Nunca criar a lógica de automação sem o usuário fornecer as regras

---

## ✅ Checklist antes de responder ao usuário

- [ ] Li todos os arquivos de contexto?
- [ ] Entendi o que já existe no sistema?
- [ ] Minha mudança quebra algo que já funciona?
- [ ] Atualizei o PROGRESS.md?
- [ ] Atualizei o ARCHITECTURE.md se necessário?
- [ ] Atualizei o STACK.md se necessário?
