# STACK.md — Stack Técnica do Projeto

> ⚠️ Atualize este arquivo sempre que adicionar ou remover uma tecnologia.

---

## Infraestrutura

| Serviço | Uso |
|---|---|
| Cloudflare Workers | Backend / API / Webhooks |
| Cloudflare Pages | Hospedagem do Frontend |
| Cloudflare D1 | Banco de dados (SQLite na edge) |
| Cloudflare R2 | Storage de imagens e arquivos |
| Cloudflare Durable Objects | Realtime do Chat |
| Cloudflare KV | Cache e sessões |

---

## Frontend

| Tecnologia | Versão | Uso |
|---|---|---|
| React | 19 | Framework de UI |
| Vite | 6 | Build tool e dev server |
| React Router | v7 | Roteamento de páginas |
| shadcn/ui | latest | Componentes visuais prontos |
| Tailwind CSS | v4 | Estilização |

---

## Backend

| Tecnologia | Uso |
|---|---|
| Hono | Framework de rotas para Cloudflare Workers |
| JavaScript (ES Modules) | Linguagem principal |
| JWT | Autenticação de sessões |

---

## Template Base

Usar o template oficial da Cloudflare como ponto de partida:

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/react-router-hono-fullstack-template
```

Referência: https://github.com/cloudflare/templates/tree/main/react-router-hono-fullstack-template

Template alternativo otimizado para IA:
https://github.com/henkisdabro/cloudflare-workers-react-boilerplate

---

## Deploy

```bash
# Desenvolvimento local
npx wrangler dev

# Deploy para produção
npx wrangler deploy
```

---

## Variáveis de Ambiente

Todas as variáveis sensíveis ficam no arquivo `.env` (nunca subir para repositório).
Veja o `.env.example` para a lista completa.

---

## Comandos Úteis

```bash
# Instalar dependências
npm install

# Criar banco D1
npx wrangler d1 create nome-do-banco

# Rodar migrations
npx wrangler d1 migrations apply nome-do-banco

# Criar bucket R2
npx wrangler r2 bucket create nome-do-bucket

# Ver logs em produção
npx wrangler tail
```

---

## Documentações de Referência

- Cloudflare Workers: https://developers.cloudflare.com/workers/
- Cloudflare D1: https://developers.cloudflare.com/d1/
- Cloudflare R2: https://developers.cloudflare.com/r2/
- Cloudflare Durable Objects: https://developers.cloudflare.com/durable-objects/
- Hono: https://hono.dev/docs/
- React 19: https://react.dev/
- shadcn/ui: https://ui.shadcn.com/
- Cloudflare llms.txt (para IAs): https://developers.cloudflare.com/llms.txt
