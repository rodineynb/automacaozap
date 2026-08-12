# PROJETO.md — Dashboard de Performance de Leads
**Versão:** 1.0
**Infraestrutura:** Cloudflare Pages + Workers + Supabase
**Última atualização:** ver PROGRESSO.md

---

## 1. VISÃO GERAL

Dashboard analítico para cruzar dados de leads (followup via WhatsApp) com a origem
dos anúncios (Facebook/Instagram), permitindo visualizar quais criativos convertem mais,
qual o volume de leads por período e qual a receita gerada.

### O problema que resolve:
- Hoje os dados estão em duas tabelas separadas no Supabase
- Não há como ver facilmente: "o lead X veio do anúncio Y e pagou"
- O dashboard faz esse cruzamento automaticamente e exibe em gráficos com filtros

### Fontes de dados:
- `bd_recheios_followup` — dados do lead, produto, status de pagamento
- `tracking_zap_face` — origem do anúncio, campanha, criativo
- Chave de join: campo `telefone` (presente nas duas tabelas)

---

## 2. FUNCIONALIDADES

### 2.1 Cards de Métricas (topo do dashboard)

| Card | Métrica | Fonte |
|------|---------|-------|
| Total de Leads | COUNT de registros no período | followup.created_at |
| Taxa de Conversão | (pago=true / total) * 100 | followup.pago |
| Leads Pagantes | COUNT onde pago=true | followup.pago |
| Leads que Clicaram | COUNT onde clicou_url=true | followup.clicou_url |

### 2.2 Gráfico — Volume de Leads por Período
- Tipo: gráfico de linha
- Eixo X: data (dia / semana / mês — selecionável)
- Eixo Y: quantidade de leads
- Filtro: período personalizado

### 2.3 Gráfico — Criativos que Mais Vendem
- Tipo: gráfico de barras horizontais
- Eixo X: quantidade de vendas (pago=true)
- Eixo Y: nome do criativo (tracking.anuncio)
- Ranking do maior para o menor

### 2.4 Gráfico — Taxa de Conversão por Campanha
- Tipo: gráfico de barras
- Mostra: campanha + % de conversão
- Ordenado por maior taxa de conversão

### 2.5 Tabela — Leads Detalhados
- Colunas: nome, telefone, produto, campanha, criativo, data entrada, pagou, clicou URL
- Paginação: 50 linhas por página
- Exportação: CSV

### 2.6 Análise de Funil
- Entrou como lead → clicou na URL → pagou
- Exibido como gráfico de funil ou barras decrescentes

---

## 3. FILTROS DO DASHBOARD

Todos os filtros se aplicam a TODOS os gráficos e cards simultaneamente.

| Filtro | Tipo | Padrão |
|--------|------|--------|
| Período | Date range picker | Últimos 30 dias |
| Campanha | Multiselect | Todas |
| Criativo (Anúncio) | Multiselect | Todos |
| Produto | Select | Todos |
| Status Pagamento | Select (todos/pago/não pago) | Todos |

---

## 4. QUERIES PRINCIPAIS

### Taxa de conversão geral:
```sql
SELECT
  COUNT(*) as total_leads,
  SUM(CASE WHEN pago = true THEN 1 ELSE 0 END) as total_pagos,
  ROUND(SUM(CASE WHEN pago = true THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as taxa_conversao
FROM bd_recheios_followup
WHERE created_at BETWEEN :data_inicio AND :data_fim
```

### Criativos que mais vendem:
```sql
SELECT
  t.anuncio,
  t.campanha,
  COUNT(*) as total_leads,
  SUM(CASE WHEN f.pago = true THEN 1 ELSE 0 END) as total_vendas,
  ROUND(SUM(CASE WHEN f.pago = true THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as taxa_conversao
FROM bd_recheios_followup f
LEFT JOIN tracking_zap_face t ON f.telefone = t.telefone
WHERE f.created_at BETWEEN :data_inicio AND :data_fim
GROUP BY t.anuncio, t.campanha
ORDER BY total_vendas DESC
```

### Volume de leads por dia:
```sql
SELECT
  DATE(f.created_at) as dia,
  COUNT(*) as total_leads,
  SUM(CASE WHEN f.pago = true THEN 1 ELSE 0 END) as total_pagos
FROM bd_recheios_followup f
WHERE f.created_at BETWEEN :data_inicio AND :data_fim
GROUP BY DATE(f.created_at)
ORDER BY dia ASC
```

### Funil de conversão:
```sql
SELECT
  COUNT(*) as total_leads,
  SUM(CASE WHEN clicou_url = true THEN 1 ELSE 0 END) as clicaram_url,
  SUM(CASE WHEN pago = true THEN 1 ELSE 0 END) as pagaram
FROM bd_recheios_followup
WHERE created_at BETWEEN :data_inicio AND :data_fim
```

---

## 5. INFRAESTRUTURA

### Frontend (Cloudflare Pages)
- React + Vite + TypeScript
- Tailwind CSS + shadcn/ui para componentes
- Recharts para gráficos
- Deploy automático via GitHub

### Backend (Cloudflare Workers)
- Hono como framework HTTP
- Conecta ao Supabase via @supabase/supabase-js
- Rotas da API:
  - `GET /api/metrics` — cards de métricas
  - `GET /api/criativos` — ranking de criativos
  - `GET /api/leads-por-dia` — volume temporal
  - `GET /api/campanhas` — performance por campanha
  - `GET /api/funil` — dados do funil
  - `GET /api/leads` — listagem paginada
  - `GET /api/filtros` — listas para os selects (campanhas, criativos, produtos)

### Supabase
- Apenas consultas (SELECT) — nunca INSERT/UPDATE/DELETE pelo dashboard
- RLS (Row Level Security) configurado no Supabase para a anon key
- Tabelas existentes: bd_recheios_followup, tracking_zap_face

---

## 6. SEGURANÇA

- Credenciais do Supabase NUNCA no código — sempre em variáveis de ambiente
- Worker valida todas as queries antes de executar
- CORS configurado para aceitar apenas o domínio do Pages
- Sem autenticação na v1 (dashboard interno) — adicionar login na v2 se necessário

---

## 7. FASES DE DESENVOLVIMENTO

### FASE 1 — Estrutura e conexão
- [ ] Setup do projeto (frontend Vite + worker Hono)
- [ ] Configurar wrangler.toml
- [ ] Criar cliente Supabase no worker
- [ ] Criar cliente Supabase no frontend
- [ ] Testar conexão com as tabelas existentes
- [ ] Criar rota GET /api/metrics com query básica
- [ ] Renderizar 4 cards no frontend com dados reais

### FASE 2 — Gráficos e filtros
- [ ] Implementar date range picker
- [ ] Gráfico de linha: volume de leads por dia
- [ ] Gráfico de barras: criativos que mais vendem
- [ ] Gráfico de barras: taxa de conversão por campanha
- [ ] Implementar filtros (campanha, criativo, produto, status)
- [ ] Conectar filtros a todos os gráficos

### FASE 3 — Tabela e funil
- [ ] Tabela detalhada de leads com paginação
- [ ] Exportação CSV
- [ ] Gráfico de funil (lead → clicou → pagou)
- [ ] Loading states e tratamento de erros

### FASE 4 — Deploy e polish
- [ ] Deploy frontend no Cloudflare Pages
- [ ] Deploy worker no Cloudflare Workers
- [ ] Configurar variáveis de ambiente no Cloudflare
- [ ] Testes finais com dados reais
- [ ] Responsivo mobile

---

## 8. STACK TÉCNICA RESUMIDA

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + Vite + TypeScript |
| UI Components | shadcn/ui |
| Estilização | Tailwind CSS |
| Gráficos | Recharts |
| Backend | Hono + Cloudflare Workers |
| Banco | Supabase (PostgreSQL) |
| Deploy Frontend | Cloudflare Pages |
| Deploy Backend | Cloudflare Workers |
| CI/CD | GitHub Actions / Cloudflare CI |
