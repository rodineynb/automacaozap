# DECISOES.md — Decisões Técnicas do Projeto
**Sistema:** Dashboard de Performance de Leads & Criativos
**Regra:** Nunca altere uma decisão documentada aqui sem perguntar ao dono do projeto primeiro.

---

## FORMATO DE REGISTRO

Cada decisão segue o padrão:
- **O quê:** o que foi decidido
- **Por quê:** motivo da decisão
- **Alternativas descartadas:** o que foi considerado e por quê não foi escolhido

---

## DECISÃO 001 — Banco de Dados: Supabase (somente leitura)

**O quê:** O dashboard apenas lê dados do Supabase. Nenhum INSERT/UPDATE/DELETE é feito pelo dashboard.

**Por quê:**
- As tabelas já existem em produção com dados reais
- O dashboard é uma camada de visualização, não de operação
- Evita risco de corromper dados de produção

**Tabelas utilizadas:**
- `bd_recheios_followup` — dados de leads e conversão
- `tracking_zap_face` — origem dos anúncios e criativos
- Join via campo `telefone`

**Alternativas descartadas:**
- Criar banco separado com cópia dos dados — desnecessário, aumenta complexidade

---

## DECISÃO 002 — Infraestrutura: Cloudflare Pages + Workers

**O quê:** Frontend no Cloudflare Pages, API no Cloudflare Workers.

**Por quê:**
- Deploy global com edge computing — rápido em qualquer lugar do Brasil
- Custo baixíssimo (tier gratuito cobre o uso esperado)
- Integração nativa com o ecossistema Cloudflare
- CI/CD automático via GitHub

**Como funciona:**
- Pages: serve o React/Vite buildado (arquivos estáticos)
- Workers: API Hono que faz as queries no Supabase
- Frontend chama o Worker via fetch para pegar os dados

**Alternativas descartadas:**
- Vercel — não há necessidade, Cloudflare já está configurado
- Servidor VPS — sem escalabilidade automática, mais caro

---

## DECISÃO 003 — Backend Framework: Hono

**O quê:** Usar Hono como framework HTTP no Cloudflare Workers.

**Por quê:**
- Feito especificamente para edge computing (Workers, Deno, Bun)
- TypeScript nativo
- Leve e rápido — sem overhead
- Suporte a CORS, validação, middleware de forma simples

**Alternativas descartadas:**
- Express — não roda nativamente em Workers (usa APIs do Node.js)
- Fetch puro — muito trabalhoso para múltiplas rotas

---

## DECISÃO 004 — Frontend: React + Vite + TypeScript

**O quê:** React com Vite para o dashboard.

**Por quê:**
- Build rápido com Vite
- TypeScript garante consistência com o backend
- Amplamente documentado — IA tem muito contexto para trabalhar
- Cloudflare Pages tem suporte nativo a Vite

**Alternativas descartadas:**
- Next.js — desnecessário (dashboard não precisa de SSR)
- Vue.js — menos contexto disponível para IA

---

## DECISÃO 005 — Estilização: Tailwind CSS + shadcn/ui

**O quê:** Tailwind para estilização e shadcn/ui para componentes de UI.

**Por quê:**
- shadcn/ui entrega date picker, selects, tabelas, cards prontos e acessíveis
- Tailwind é rápido para customizar
- Dashboard fica profissional sem esforço extra

**Alternativas descartadas:**
- Material UI — pesado, visual genérico
- CSS puro — muito lento para desenvolver

---

## DECISÃO 006 — Gráficos: Recharts

**O quê:** Usar Recharts para todos os gráficos do dashboard.

**Por quê:**
- Biblioteca React-first (não precisa de wrapper)
- Suporte a linha, barras, funil, área — todos os tipos necessários
- Responsivo por padrão
- Boa documentação

**Alternativas descartadas:**
- Chart.js — necessita wrapper para React, menos integrado
- D3.js — muito baixo nível para esse caso de uso

---

## DECISÃO 007 — Chave de Join: campo telefone

**O quê:** O cruzamento entre as duas tabelas é feito pelo campo `telefone`.

**Por quê:**
- É o único campo comum entre `bd_recheios_followup` e `tracking_zap_face`
- Presente nas duas tabelas com o mesmo formato (5511999999999)

**Atenção:**
- Pode haver leads em followup SEM registro em tracking (leads orgânicos)
- Usar LEFT JOIN para não perder esses leads
- Um telefone pode ter múltiplos registros em tracking (lead entrou por mais de um anúncio)
  — usar o registro mais recente (MAX created_at) ou o primeiro (MIN created_at)

---

## DECISÃO 008 — Período padrão dos filtros: 30 dias

**O quê:** Ao carregar o dashboard, o período padrão é sempre os últimos 30 dias.

**Por quê:**
- Evita queries pesadas sem filtro
- É o período mais relevante para análise de performance de anúncios
- Usuário pode expandir se quiser ver histórico maior

---

## DECISÃO 009 — Ferramenta de desenvolvimento: Antigravity

**O quê:** O projeto é desenvolvido usando Antigravity como IA principal de código.

**Fluxo de trabalho:**
1. Abrir projeto no Antigravity
2. IA lê `.cursorrules` automaticamente
3. Comandar: "Leia PROJETO.md, PROGRESSO.md e DECISOES.md"
4. Desenvolver por módulo seguindo as fases do PROJETO.md
5. Atualizar PROGRESSO.md ao final de cada sessão

---

## DECISÃO 010 — Credenciais: apenas variáveis de ambiente

**O quê:** As credenciais do Supabase NUNCA ficam no código — sempre em `.env` ou nos secrets do Cloudflare.

**Variáveis necessárias:**
- `VITE_SUPABASE_URL` — URL do projeto Supabase
- `VITE_SUPABASE_ANON_KEY` — chave anon pública do Supabase

**No Cloudflare Workers:**
- Adicionadas via `wrangler secret put` ou no Dashboard do Cloudflare
- Nunca commitadas no repositório Git

**Regra:** O arquivo `.env` NUNCA é commitado. Existe apenas `.env.example` com os nomes das variáveis.
