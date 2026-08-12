# APIs.md — Documentações e Referências de APIs

> Este arquivo serve como referência central de todas as APIs usadas no projeto.
> O usuário vai cadastrar as APIs diretamente na seção Configurações do sistema.
> As documentações cadastradas lá serão usadas pela IA ao criar cada automação.

---

## ⚠️ Instrução importante para a IA programadora

Ao criar ou modificar uma automação na Fase 2:
1. Acesse a seção Configurações do sistema
2. Busque a API WhatsApp atribuída àquela automação
3. Leia o link da documentação cadastrado
4. Busque a LLM atribuída àquela automação
5. Leia o link da documentação cadastrado
6. Busque o serviço de OCR atribuído àquela automação
7. Leia o link da documentação cadastrado
8. Use essas documentações para criar todas as rotas e integrações corretamente

---

## 📱 APIs WhatsApp (serão cadastradas pelo usuário nas Configurações)

O usuário cadastrará cada API com:
- Nome
- URL base
- Chave de autenticação
- Link da documentação

APIs previstas para uso:
- Evolution API v2
- Meta WhatsApp Business API (oficial)
- _(outras podem ser adicionadas pelo usuário)_

---

## 🤖 LLMs (serão cadastradas pelo usuário nas Configurações)

O usuário cadastrará cada LLM com:
- Nome do modelo
- Provedor
- Chave de API
- Link da documentação

LLMs previstas para uso:
- Gemini 2.5 Flash (Google)
- Gemini 2.5 Pro (Google)
- Claude Sonnet (Anthropic)
- Claude Opus (Anthropic)
- GPT-4o (OpenAI)
- _(outras podem ser adicionadas pelo usuário)_

---

## 🔍 OCR (serão cadastrados pelo usuário nas Configurações)

O usuário cadastrará cada serviço com:
- Nome do serviço
- Endpoint
- Chave de API
- Link da documentação

Serviço padrão inicial:
- Gemini 2.5 Flash (usado para leitura de comprovantes de pagamento)

---

## 🔗 Referências de Infraestrutura (Cloudflare)

Documentação completa da Cloudflare para IA:
- Todos os produtos: https://developers.cloudflare.com/llms.txt
- Workers completo: https://developers.cloudflare.com/workers/llms-full.txt
- D1 completo: https://developers.cloudflare.com/d1/llms-full.txt
- R2 completo: https://developers.cloudflare.com/r2/llms-full.txt
- Durable Objects: https://developers.cloudflare.com/durable-objects/llms-full.txt

---

## 📝 Notas adicionais

_(IA e usuário podem adicionar notas aqui conforme necessário)_
