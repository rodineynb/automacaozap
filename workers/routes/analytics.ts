import { Hono } from "hono";
import type { Env } from "../app";

export const analyticsRoutes = new Hono<{ Bindings: Env }>();

// Impedir que o navegador ou o CDN faça cache dos dados analíticos em tempo real
analyticsRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  c.header("Pragma", "no-cache");
  c.header("Expires", "0");
  await next();
});

// ────────────────────────────────────────────────────────
//  Date & Time Utilities
// ────────────────────────────────────────────────────────

function formatDateSP(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

function getUtcRange(dataInicioStr: string, dataFimStr: string) {
  // Converte datas YYYY-MM-DD em fuso de SP para UTC no SQLite
  const startLocal = new Date(`${dataInicioStr}T00:00:00-03:00`);
  const endLocal = new Date(`${dataFimStr}T23:59:59-03:00`);

  const formatToSql = (d: Date) => {
    return d.toISOString().replace('T', ' ').substring(0, 19);
  };

  return {
    startUtc: formatToSql(startLocal),
    endUtc: formatToSql(endLocal),
  };
}

function getPreviousPeriod(dataInicioStr: string, dataFimStr: string) {
  const start = new Date(`${dataInicioStr}T12:00:00-03:00`);
  const end = new Date(`${dataFimStr}T12:00:00-03:00`);
  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;

  const prevStart = new Date(start);
  prevStart.setDate(prevStart.getDate() - diffDays);

  const prevEnd = new Date(end);
  prevEnd.setDate(prevEnd.getDate() - diffDays);

  const formatToYmd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return {
    prevInicioYmd: formatToYmd(prevStart),
    prevFimYmd: formatToYmd(prevEnd),
  };
}

// Helper para compor os filtros comuns de SQL por data de ação
function buildFilters(c: any) {
  const todaySP = formatDateSP(new Date());
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyAgoSP = formatDateSP(thirtyDaysAgo);

  const data_inicio = c.req.query('data_inicio') || thirtyAgoSP;
  const data_fim = c.req.query('data_fim') || todaySP;
  const produto = c.req.query('produto') || '';
  const automation_id = c.req.query('automation_id') || '';
  const pago = c.req.query('pago') || '';
  const campanha = c.req.query('campanha') || '';
  const anuncio = c.req.query('anuncio') || '';
  const busca = c.req.query('busca') || '';

  const { startUtc, endUtc } = getUtcRange(data_inicio, data_fim);
  const { prevInicioYmd, prevFimYmd } = getPreviousPeriod(data_inicio, data_fim);
  const { startUtc: prevStartUtc, endUtc: prevEndUtc } = getUtcRange(prevInicioYmd, prevFimYmd);

  const getWhereClause = (start: string, end: string, timeField: string) => {
    let clauses = [`${timeField} BETWEEN ? AND ?`];
    let bindings = [start, end];

    if (automation_id) {
      clauses.push("al.automation_id = ?");
      bindings.push(automation_id);
    } else if (produto) {
      clauses.push("al.produto_codigo = ?");
      bindings.push(produto);
    }
    
    if (pago === 'true') {
      clauses.push("al.pago = 1");
    } else if (pago === 'false') {
      clauses.push("al.pago = 0");
    }
    
    if (busca) {
      clauses.push("(al.nome LIKE ? OR al.phone LIKE ?)");
      bindings.push(`%${busca}%`, `%${busca}%`);
    }
    
    if (campanha) {
      const campaigns = campanha.split(',');
      clauses.push(`td.campanha IN (${campaigns.map(() => '?').join(',')})`);
      bindings.push(...campaigns);
    }
    
    if (anuncio) {
      const ads = anuncio.split(',');
      clauses.push(`td.anuncio IN (${ads.map(() => '?').join(',')})`);
      bindings.push(...ads);
    }

    return {
      sql: " WHERE " + clauses.join(" AND "),
      bindings,
    };
  };

  return {
    data_inicio,
    data_fim,
    produto,
    pago,
    campanha,
    anuncio,
    busca,
    startUtc,
    endUtc,
    prevStartUtc,
    prevEndUtc,
    
    // Período Atual
    whereLeads: getWhereClause(startUtc, endUtc, 'al.created_at'),
    wherePayments: getWhereClause(startUtc, endUtc, 'al.updated_at'),
    whereLost: getWhereClause(startUtc, endUtc, 'cs.updated_at'),
    
    // Período Anterior
    whereLeadsPrev: getWhereClause(prevStartUtc, prevEndUtc, 'al.created_at'),
    wherePaymentsPrev: getWhereClause(prevStartUtc, prevEndUtc, 'al.updated_at'),
    whereLostPrev: getWhereClause(prevStartUtc, prevEndUtc, 'cs.updated_at'),
  };
}

// ────────────────────────────────────────────────────────
//  Endpoints
// ────────────────────────────────────────────────────────

// 1. GET /api/analytics/filtros — Opções para os filtros do dashboard
analyticsRoutes.get("/filtros", async (c) => {
  const db = c.env.DB;
  try {
    const campaigns = await db.prepare(
      "SELECT DISTINCT campanha FROM tracking_data WHERE campanha IS NOT NULL AND campanha != '' ORDER BY campanha ASC"
    ).all<{ campanha: string }>();

    const ads = await db.prepare(
      "SELECT DISTINCT anuncio FROM tracking_data WHERE anuncio IS NOT NULL AND anuncio != '' ORDER BY anuncio ASC"
    ).all<{ anuncio: string }>();

    const products = await db.prepare(
      "SELECT DISTINCT produto_codigo FROM automation_leads WHERE produto_codigo IS NOT NULL AND produto_codigo != '' ORDER BY produto_codigo ASC"
    ).all<{ produto_codigo: string }>();

    return c.json({
      campanhas: (campaigns.results || []).map(r => r.campanha),
      anuncios: (ads.results || []).map(r => r.anuncio),
      produtos: (products.results || []).map(r => r.produto_codigo),
    });
  } catch (e: any) {
    console.error("[Analytics] Erro em /filtros:", e);
    return c.json({ error: e.message }, 500);
  }
});

// 2. GET /api/analytics/metrics — Cards de métricas principais com comparativos
analyticsRoutes.get("/metrics", async (c) => {
  const db = c.env.DB;
  try {
    const f = buildFilters(c);

    // ────────────────────────────────────────────────────────
    // Período Atual
    // ────────────────────────────────────────────────────────
    
    // 2.1 Leads & Receberam Acesso (por data de criação do lead)
    const currentLeadsRes = await db.prepare(`
      SELECT 
        COUNT(*) as total_leads,
        SUM(CASE WHEN al.recebeu_acesso = 1 THEN 1 ELSE 0 END) as receberam_acesso
      FROM automation_leads al
      LEFT JOIN (SELECT *, ROW_NUMBER() OVER (PARTITION BY phone, automation_id ORDER BY CASE WHEN ctwaclid IS NOT NULL THEN 1 ELSE 0 END DESC, id DESC) as rn FROM tracking_data) td ON td.phone = al.phone AND td.automation_id = al.automation_id AND td.rn = 1
      ${f.whereLeads.sql}
    `).bind(...f.whereLeads.bindings).first<any>();

    // 2.2 Vendas & Faturamento (por data do Pix / pagamento)
    const currentPaymentsRes = await db.prepare(`
      SELECT 
        COUNT(*) as total_pagos,
        SUM(al.valor_pago) as faturamento
      FROM automation_leads al
      LEFT JOIN (SELECT *, ROW_NUMBER() OVER (PARTITION BY phone, automation_id ORDER BY CASE WHEN ctwaclid IS NOT NULL THEN 1 ELSE 0 END DESC, id DESC) as rn FROM tracking_data) td ON td.phone = al.phone AND td.automation_id = al.automation_id AND td.rn = 1
      ${f.wherePayments.sql} AND al.pago = 1
    `).bind(...f.wherePayments.bindings).first<any>();

    // 2.3 Leads Perdidos / Finalizados Sem Pagar (por data de fechamento do estado do funil)
    const currentLostRes = await db.prepare(`
      SELECT 
        COUNT(*) as finalizados_sem_pagar
      FROM automation_leads al
      LEFT JOIN (SELECT *, ROW_NUMBER() OVER (PARTITION BY phone, automation_id ORDER BY CASE WHEN ctwaclid IS NOT NULL THEN 1 ELSE 0 END DESC, id DESC) as rn FROM tracking_data) td ON td.phone = al.phone AND td.automation_id = al.automation_id AND td.rn = 1
      JOIN contacts ct ON ct.phone = al.phone AND ct.automation_id = al.automation_id
      JOIN conversations cv ON cv.contact_id = ct.id
      JOIN conversation_state cs ON cs.conversation_id = cv.id
      ${f.whereLost.sql} AND cs.funil_encerrado = 1 AND al.pago = 0
    `).bind(...f.whereLost.bindings).first<any>();

    // ────────────────────────────────────────────────────────
    // Período Anterior (Comparativo)
    // ────────────────────────────────────────────────────────

    // 2.4 Leads & Acesso Anterior
    const prevLeadsRes = await db.prepare(`
      SELECT 
        COUNT(*) as total_leads,
        SUM(CASE WHEN al.recebeu_acesso = 1 THEN 1 ELSE 0 END) as receberam_acesso
      FROM automation_leads al
      LEFT JOIN (SELECT *, ROW_NUMBER() OVER (PARTITION BY phone, automation_id ORDER BY CASE WHEN ctwaclid IS NOT NULL THEN 1 ELSE 0 END DESC, id DESC) as rn FROM tracking_data) td ON td.phone = al.phone AND td.automation_id = al.automation_id AND td.rn = 1
      ${f.whereLeadsPrev.sql}
    `).bind(...f.whereLeadsPrev.bindings).first<any>();

    // 2.5 Vendas & Faturamento Anterior
    const prevPaymentsRes = await db.prepare(`
      SELECT 
        COUNT(*) as total_pagos,
        SUM(al.valor_pago) as faturamento
      FROM automation_leads al
      LEFT JOIN (SELECT *, ROW_NUMBER() OVER (PARTITION BY phone, automation_id ORDER BY CASE WHEN ctwaclid IS NOT NULL THEN 1 ELSE 0 END DESC, id DESC) as rn FROM tracking_data) td ON td.phone = al.phone AND td.automation_id = al.automation_id AND td.rn = 1
      ${f.wherePaymentsPrev.sql} AND al.pago = 1
    `).bind(...f.wherePaymentsPrev.bindings).first<any>();

    // 2.6 Leads Perdidos Anterior
    const prevLostRes = await db.prepare(`
      SELECT 
        COUNT(*) as finalizados_sem_pagar
      FROM automation_leads al
      LEFT JOIN (SELECT *, ROW_NUMBER() OVER (PARTITION BY phone, automation_id ORDER BY CASE WHEN ctwaclid IS NOT NULL THEN 1 ELSE 0 END DESC, id DESC) as rn FROM tracking_data) td ON td.phone = al.phone AND td.automation_id = al.automation_id AND td.rn = 1
      JOIN contacts ct ON ct.phone = al.phone AND ct.automation_id = al.automation_id
      JOIN conversations cv ON cv.contact_id = ct.id
      JOIN conversation_state cs ON cs.conversation_id = cv.id
      ${f.whereLostPrev.sql} AND cs.funil_encerrado = 1 AND al.pago = 0
    `).bind(...f.whereLostPrev.bindings).first<any>();

    // Consolidação dos dados primitivos
    const total_leads = currentLeadsRes?.total_leads || 0;
    const total_pagos = currentPaymentsRes?.total_pagos || 0;
    const faturamento = currentPaymentsRes?.faturamento || 0;
    const receberam_acesso = currentLeadsRes?.receberam_acesso || 0;
    const finalizados_sem_pagar = currentLostRes?.finalizados_sem_pagar || 0;
    const taxa_conversao = total_leads > 0 ? Math.round((total_pagos / total_leads) * 1000) / 10 : 0;
    const taxa_acesso_pagamento = receberam_acesso > 0 ? Math.round((total_pagos / receberam_acesso) * 1000) / 10 : 0;

    const prev_total = prevLeadsRes?.total_leads || 0;
    const prev_pagos = prevPaymentsRes?.total_pagos || 0;
    const prev_faturamento = prevPaymentsRes?.faturamento || 0;
    const prev_receberam_acesso = prevLeadsRes?.receberam_acesso || 0;
    const prev_finalizados_sem_pagar = prevLostRes?.finalizados_sem_pagar || 0;
    const prev_taxa = prev_total > 0 ? Math.round((prev_pagos / prev_total) * 1000) / 10 : 0;
    const prev_taxa_acesso = prev_receberam_acesso > 0 ? Math.round((prev_pagos / prev_receberam_acesso) * 1000) / 10 : 0;

    return c.json({
      total_leads,
      total_pagos,
      faturamento,
      taxa_conversao,
      receberam_acesso,
      taxa_acesso_pagamento,
      finalizados_sem_pagar,
      comparacao: {
        total_leads: prev_total,
        total_pagos: prev_pagos,
        faturamento: prev_faturamento,
        taxa_conversao: prev_taxa,
        receberam_acesso: prev_receberam_acesso,
        taxa_acesso_pagamento: prev_taxa_acesso,
        finalizados_sem_pagar: prev_finalizados_sem_pagar,
      }
    });
  } catch (e: any) {
    console.error("[Analytics] Erro em /metrics:", e);
    return c.json({ error: e.message }, 500);
  }
});

// 3. GET /api/analytics/leads-por-dia — Volume e faturamento por dia (eixo X dos gráficos)
analyticsRoutes.get("/leads-por-dia", async (c) => {
  const db = c.env.DB;
  try {
    const f = buildFilters(c);

    // Agrupa e projeta os leads e pagamentos em SP Timezone de forma unificada
    const leadsRes = await db.prepare(`
      SELECT 
        dia,
        SUM(total_leads) as total_leads,
        SUM(total_pagos) as total_pagos,
        SUM(faturamento) as faturamento
      FROM (
        SELECT 
          strftime('%Y-%m-%d', al.created_at, '-3 hours') as dia,
          COUNT(*) as total_leads,
          0 as total_pagos,
          0 as faturamento
        FROM automation_leads al
        LEFT JOIN (SELECT *, ROW_NUMBER() OVER (PARTITION BY phone, automation_id ORDER BY CASE WHEN ctwaclid IS NOT NULL THEN 1 ELSE 0 END DESC, id DESC) as rn FROM tracking_data) td ON td.phone = al.phone AND td.automation_id = al.automation_id AND td.rn = 1
        ${f.whereLeads.sql}
        GROUP BY dia

        UNION ALL

        SELECT 
          strftime('%Y-%m-%d', al.updated_at, '-3 hours') as dia,
          0 as total_leads,
          COUNT(*) as total_pagos,
          SUM(al.valor_pago) as faturamento
        FROM automation_leads al
        LEFT JOIN (SELECT *, ROW_NUMBER() OVER (PARTITION BY phone, automation_id ORDER BY CASE WHEN ctwaclid IS NOT NULL THEN 1 ELSE 0 END DESC, id DESC) as rn FROM tracking_data) td ON td.phone = al.phone AND td.automation_id = al.automation_id AND td.rn = 1
        ${f.wherePayments.sql} AND al.pago = 1
        GROUP BY dia
      )
      GROUP BY dia
      ORDER BY dia ASC
    `).bind(...f.whereLeads.bindings, ...f.wherePayments.bindings).all<any>();

    return c.json(leadsRes.results || []);
  } catch (e: any) {
    console.error("[Analytics] Erro em /leads-por-dia:", e);
    return c.json({ error: e.message }, 500);
  }
});

// 4. GET /api/analytics/criativos — Ranking de vendas e faturamento por criativo/anúncio
analyticsRoutes.get("/criativos", async (c) => {
  const db = c.env.DB;
  try {
    const f = buildFilters(c);

    const result = await db.prepare(`
      SELECT 
        COALESCE(anuncio, 'Orgânico') as anuncio,
        MAX(COALESCE(campanha, 'Orgânico')) as campanha,
        SUM(total_leads) as total_leads,
        SUM(total_vendas) as total_vendas,
        SUM(faturamento) as faturamento
      FROM (
        SELECT 
          td.anuncio,
          MAX(td.campanha) as campanha,
          COUNT(*) as total_leads,
          0 as total_vendas,
          0 as faturamento
        FROM automation_leads al
        LEFT JOIN (SELECT *, ROW_NUMBER() OVER (PARTITION BY phone, automation_id ORDER BY CASE WHEN ctwaclid IS NOT NULL THEN 1 ELSE 0 END DESC, id DESC) as rn FROM tracking_data) td ON td.phone = al.phone AND td.automation_id = al.automation_id AND td.rn = 1
        ${f.whereLeads.sql}
        GROUP BY td.anuncio

        UNION ALL

        SELECT 
          td.anuncio,
          MAX(td.campanha) as campanha,
          0 as total_leads,
          COUNT(*) as total_vendas,
          SUM(al.valor_pago) as faturamento
        FROM automation_leads al
        LEFT JOIN (SELECT *, ROW_NUMBER() OVER (PARTITION BY phone, automation_id ORDER BY CASE WHEN ctwaclid IS NOT NULL THEN 1 ELSE 0 END DESC, id DESC) as rn FROM tracking_data) td ON td.phone = al.phone AND td.automation_id = al.automation_id AND td.rn = 1
        ${f.wherePayments.sql} AND al.pago = 1
        GROUP BY td.anuncio
      )
      GROUP BY anuncio
      ORDER BY faturamento DESC
    `).bind(...f.whereLeads.bindings, ...f.wherePayments.bindings).all<any>();

    const mapped = (result.results || []).map(r => ({
      anuncio: r.anuncio,
      campanha: r.campanha,
      total_leads: r.total_leads,
      total_vendas: r.total_vendas,
      faturamento: r.faturamento,
      valores_detalhados: [], // opcional na v2
      taxa_conversao: r.total_leads > 0 ? Math.round((r.total_vendas / r.total_leads) * 1000) / 10 : 0,
    }));

    return c.json(mapped);
  } catch (e: any) {
    console.error("[Analytics] Erro em /criativos:", e);
    return c.json({ error: e.message }, 500);
  }
});

// 5. GET /api/analytics/campanhas — Ranking de performance por campanha do Facebook Ads
analyticsRoutes.get("/campanhas", async (c) => {
  const db = c.env.DB;
  try {
    const f = buildFilters(c);

    const result = await db.prepare(`
      SELECT 
        COALESCE(campanha, 'Orgânico') as campanha,
        SUM(total_leads) as total_leads,
        SUM(total_pagos) as total_pagos,
        SUM(faturamento) as faturamento
      FROM (
        SELECT 
          td.campanha,
          COUNT(*) as total_leads,
          0 as total_pagos,
          0 as faturamento
        FROM automation_leads al
        LEFT JOIN (SELECT *, ROW_NUMBER() OVER (PARTITION BY phone, automation_id ORDER BY CASE WHEN ctwaclid IS NOT NULL THEN 1 ELSE 0 END DESC, id DESC) as rn FROM tracking_data) td ON td.phone = al.phone AND td.automation_id = al.automation_id AND td.rn = 1
        ${f.whereLeads.sql}
        GROUP BY td.campanha

        UNION ALL

        SELECT 
          td.campanha,
          0 as total_leads,
          COUNT(*) as total_pagos,
          SUM(al.valor_pago) as faturamento
        FROM automation_leads al
        LEFT JOIN (SELECT *, ROW_NUMBER() OVER (PARTITION BY phone, automation_id ORDER BY CASE WHEN ctwaclid IS NOT NULL THEN 1 ELSE 0 END DESC, id DESC) as rn FROM tracking_data) td ON td.phone = al.phone AND td.automation_id = al.automation_id AND td.rn = 1
        ${f.wherePayments.sql} AND al.pago = 1
        GROUP BY td.campanha
      )
      GROUP BY campanha
      ORDER BY faturamento DESC
    `).bind(...f.whereLeads.bindings, ...f.wherePayments.bindings).all<any>();

    const mapped = (result.results || []).map(r => ({
      campanha: r.campanha,
      total_leads: r.total_leads,
      total_pagos: r.total_pagos,
      faturamento: r.faturamento,
      taxa_conversao: r.total_leads > 0 ? Math.round((r.total_pagos / r.total_leads) * 1000) / 10 : 0,
    }));

    return c.json(mapped);
  } catch (e: any) {
    console.error("[Analytics] Erro em /campanhas:", e);
    return c.json({ error: e.message }, 500);
  }
});

// 6. GET /api/analytics/funil — Métricas das etapas do funil de vendas
analyticsRoutes.get("/funil", async (c) => {
  const db = c.env.DB;
  try {
    const f = buildFilters(c);

    const currentLeadsRes = await db.prepare(`
      SELECT 
        COUNT(*) as total_leads,
        SUM(CASE WHEN al.recebeu_acesso = 1 THEN 1 ELSE 0 END) as receberam_acesso
      FROM automation_leads al
      LEFT JOIN (SELECT *, ROW_NUMBER() OVER (PARTITION BY phone, automation_id ORDER BY CASE WHEN ctwaclid IS NOT NULL THEN 1 ELSE 0 END DESC, id DESC) as rn FROM tracking_data) td ON td.phone = al.phone AND td.automation_id = al.automation_id AND td.rn = 1
      ${f.whereLeads.sql}
    `).bind(...f.whereLeads.bindings).first<any>();

    const currentPaymentsRes = await db.prepare(`
      SELECT 
        COUNT(*) as total_pagos,
        SUM(al.valor_pago) as faturamento
      FROM automation_leads al
      LEFT JOIN (SELECT *, ROW_NUMBER() OVER (PARTITION BY phone, automation_id ORDER BY CASE WHEN ctwaclid IS NOT NULL THEN 1 ELSE 0 END DESC, id DESC) as rn FROM tracking_data) td ON td.phone = al.phone AND td.automation_id = al.automation_id AND td.rn = 1
      ${f.wherePayments.sql} AND al.pago = 1
    `).bind(...f.wherePayments.bindings).first<any>();

    return c.json({
      total_leads: currentLeadsRes?.total_leads || 0,
      receberam_acesso: currentLeadsRes?.receberam_acesso || 0,
      pagaram: currentPaymentsRes?.total_pagos || 0,
      faturamento: currentPaymentsRes?.faturamento || 0,
    });
  } catch (e: any) {
    console.error("[Analytics] Erro em /funil:", e);
    return c.json({ error: e.message }, 500);
  }
});

// 7. GET /api/analytics/analytics — Horas quentes e tempo médio de compra
analyticsRoutes.get("/analytics", async (c) => {
  const db = c.env.DB;
  try {
    const f = buildFilters(c);

    const result = await db.prepare(`
      SELECT al.created_at, al.updated_at as data_pagamento
      FROM automation_leads al
      LEFT JOIN (SELECT *, ROW_NUMBER() OVER (PARTITION BY phone, automation_id ORDER BY CASE WHEN ctwaclid IS NOT NULL THEN 1 ELSE 0 END DESC, id DESC) as rn FROM tracking_data) td ON td.phone = al.phone AND td.automation_id = al.automation_id AND td.rn = 1
      ${f.wherePayments.sql} AND al.pago = 1
    `).bind(...f.wherePayments.bindings).all<any>();

    const pagos = result.results || [];

    if (pagos.length === 0) {
      return c.json({
        total_pagos: 0,
        tempo_medio_minutos: 0,
        tempo_mediana_minutos: 0,
        faixas: [],
        horas_quentes: [],
      });
    }

    const tempos: number[] = [];
    const horaCompra: number[] = [];

    for (const lead of pagos) {
      const created = new Date(lead.created_at.replace(' ', 'T') + 'Z');
      const pagamento = new Date(lead.data_pagamento.replace(' ', 'T') + 'Z');
      const diffMs = pagamento.getTime() - created.getTime();
      const diffMin = diffMs / (1000 * 60);

      if (diffMin >= 0 && diffMin <= 43200) {
        tempos.push(diffMin);
      }

      // Hora da compra em SP
      const horaSP = new Date(lead.data_pagamento.replace(' ', 'T') + 'Z').toLocaleString('en-US', {
        timeZone: 'America/Sao_Paulo',
        hour: 'numeric',
        hour12: false,
      });
      horaCompra.push(parseInt(horaSP) || 0);
    }

    tempos.sort((a, b) => a - b);
    const soma = tempos.reduce((acc, t) => acc + t, 0);
    const media = tempos.length > 0 ? soma / tempos.length : 0;

    let mediana = 0;
    if (tempos.length > 0) {
      const mid = Math.floor(tempos.length / 2);
      mediana = tempos.length % 2 !== 0 ? tempos[mid] : (tempos[mid - 1] + tempos[mid]) / 2;
    }

    const faixasConfig = [
      { label: 'Até 15min', min: 0, max: 15 },
      { label: '15min - 30min', min: 15, max: 30 },
      { label: '30min - 1h', min: 30, max: 60 },
      { label: '1h - 2h', min: 60, max: 120 },
      { label: '2h - 6h', min: 120, max: 360 },
      { label: '6h - 12h', min: 360, max: 720 },
      { label: '12h - 24h', min: 720, max: 1440 },
      { label: '24h+', min: 1440, max: Infinity },
    ];

    const faixas = faixasConfig.map(fx => {
      const count = tempos.filter(t => t >= fx.min && t < fx.max).length;
      return {
        label: fx.label,
        quantidade: count,
        percentual: tempos.length > 0 ? Math.round((count / tempos.length) * 1000) / 10 : 0,
      };
    }).filter(fx => fx.quantidade > 0 || faixasConfig.indexOf(faixasConfig.find(fc => fc.label === fx.label)!) < 5);

    const horasMap = new Map<number, number>();
    for (let h = 0; h < 24; h++) horasMap.set(h, 0);
    for (const h of horaCompra) {
      horasMap.set(h, (horasMap.get(h) || 0) + 1);
    }

    const horas_quentes = Array.from(horasMap.entries())
      .map(([hora, quantidade]) => ({
        hora,
        label: `${String(hora).padStart(2, '0')}h`,
        quantidade,
        percentual: pagos.length > 0 ? Math.round((quantidade / pagos.length) * 1000) / 10 : 0,
      }))
      .sort((a, b) => a.hora - b.hora);

    return c.json({
      total_pagos: pagos.length,
      tempo_medio_minutos: Math.round(media * 10) / 10,
      tempo_mediana_minutos: Math.round(mediana * 10) / 10,
      faixas,
      horas_quentes,
    });
  } catch (e: any) {
    console.error("[Analytics] Erro em /analytics:", e);
    return c.json({ error: e.message }, 500);
  }
});

// 8. GET /api/analytics/leads — Tabela detalhada de leads paginada
analyticsRoutes.get("/leads", async (c) => {
  const db = c.env.DB;
  try {
    const f = buildFilters(c);
    const page = parseInt(c.req.query('page') || '1');
    const per_page = 50;
    const offset = (page - 1) * per_page;

    // Se o filtro de pagamento estiver marcado como PAGOS (pago === 'true'),
    // nós filtramos pela data de pagamento (wherePayments) para alinhar 100% com os cards de faturamento.
    // Caso contrário, filtramos pela data de criação/entrada (whereLeads) padrão.
    const isPayingFilter = f.pago === 'true';
    const activeWhere = isPayingFilter ? f.wherePayments : f.whereLeads;
    
    let sqlCondition = activeWhere.sql;
    if (isPayingFilter) {
      sqlCondition += " AND al.pago = 1";
    }

    const countRes = await db.prepare(`
      SELECT COUNT(*) as count
      FROM automation_leads al
      LEFT JOIN (SELECT *, ROW_NUMBER() OVER (PARTITION BY phone, automation_id ORDER BY CASE WHEN ctwaclid IS NOT NULL THEN 1 ELSE 0 END DESC, id DESC) as rn FROM tracking_data) td ON td.phone = al.phone AND td.automation_id = al.automation_id AND td.rn = 1
      ${sqlCondition}
    `).bind(...activeWhere.bindings).first<{ count: number }>();

    let listBindings = [...activeWhere.bindings, per_page, offset];

    const listRes = await db.prepare(`
      SELECT 
        al.nome,
        al.phone as telefone,
        al.produto_codigo as produto,
        al.pago,
        al.valor_pago as valor_pagamento,
        al.updated_at as data_pagamento,
        al.created_at,
        COALESCE(td.campanha, 'Sem campanha') as campanha,
        COALESCE(td.anuncio, 'Sem criativo') as anuncio,
        al.recebeu_acesso as clicou_url
      FROM automation_leads al
      LEFT JOIN (SELECT *, ROW_NUMBER() OVER (PARTITION BY phone, automation_id ORDER BY CASE WHEN ctwaclid IS NOT NULL THEN 1 ELSE 0 END DESC, id DESC) as rn FROM tracking_data) td ON td.phone = al.phone AND td.automation_id = al.automation_id AND td.rn = 1
      ${sqlCondition}
      ORDER BY ${isPayingFilter ? 'al.updated_at' : 'al.created_at'} DESC
      LIMIT ? OFFSET ?
    `).bind(...listBindings).all<any>();

    const data = (listRes.results || []).map(lead => ({
      ...lead,
      pago: lead.pago === 1,
      clicou_url: lead.clicou_url === 1,
    }));

    return c.json({
      data,
      total: countRes?.count || 0,
      page,
      per_page,
    });
  } catch (e: any) {
    console.error("[Analytics] Erro em /leads:", e);
    return c.json({ error: e.message }, 500);
  }
});

// 9. GET /api/analytics/export-meta — Exportar leads para Custom Audiences do Facebook
analyticsRoutes.get("/export-meta", async (c) => {
  const db = c.env.DB;
  try {
    const tipo = c.req.query('tipo') || 'compradores';
    const automation_id = c.req.query('automation_id') || '';

    let sql = `
      SELECT al.nome, al.phone as telefone, al.email, al.valor_pago as valor_pagamento
      FROM automation_leads al
    `;
    let clauses: string[] = [];
    const params: any[] = [];

    if (tipo === 'compradores') {
      clauses.push("al.pago = 1");
    } else if (tipo === 'acesso') {
      clauses.push("al.recebeu_acesso = 1");
    } else if (tipo === 'acesso_sem_pagar') {
      clauses.push("al.recebeu_acesso = 1 AND al.pago = 0");
    } else if (tipo === 'sem_acesso') {
      clauses.push("al.recebeu_acesso = 0");
    }

    if (automation_id) {
      clauses.push("al.automation_id = ?");
      params.push(automation_id);
    }

    if (clauses.length > 0) {
      sql += " WHERE " + clauses.join(" AND ");
    }

    const result = params.length > 0 
      ? await db.prepare(sql).bind(...params).all<any>()
      : await db.prepare(sql).all<any>();
    const data = result.results || [];

    if (data.length === 0) {
      return c.text('Nenhum lead encontrado', 404);
    }

    function cleanPhone(phone: string): string {
      let clean = phone.replace(/\D/g, '');
      if (clean.startsWith('55') && clean.length >= 12) return clean;
      if (clean.length >= 10 && clean.length <= 11) return '55' + clean;
      return clean;
    }

    function splitName(nome: string | null): { fn: string; ln: string } {
      if (!nome || !nome.trim()) return { fn: '', ln: '' };
      const parts = nome.trim().toLowerCase().split(/\s+/);
      return {
        fn: parts[0] || '',
        ln: parts.length > 1 ? parts.slice(1).join(' ') : '',
      };
    }

    const headers = ['phone', 'email', 'fn', 'ln', 'country', 'value'];
    const rows = data.map(lead => {
      const phone = cleanPhone(lead.telefone || '');
      const email = (lead.email || '').toLowerCase().trim();
      const { fn, ln } = splitName(lead.nome);
      const value = lead.valor_pagamento ? Number(lead.valor_pagamento).toFixed(2) : '';
      return [phone, email, fn, ln, 'br', value].join(',');
    });

    const validRows = rows.filter(row => {
      const phone = row.split(',')[0];
      return phone.length >= 10;
    });

    const csv = [headers.join(','), ...validRows].join('\n');

    const filename = tipo === 'compradores'
      ? 'meta_compradores.csv'
      : tipo === 'acesso'
        ? 'meta_acesso.csv'
        : tipo === 'acesso_sem_pagar'
          ? 'meta_acesso_sem_pagar.csv'
          : tipo === 'sem_acesso'
            ? 'meta_sem_acesso.csv'
            : 'meta_todos_leads.csv';

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e: any) {
    console.error("[Analytics] Erro em /export-meta:", e);
    return c.json({ error: e.message }, 500);
  }
});

// 10. GET /api/analytics/export-conversas — Relatório TXT formatado de todas as conversas da IA
analyticsRoutes.get("/export-conversas", async (c) => {
  const db = c.env.DB;
  try {
    const result = await db.prepare(`
      SELECT cv.id as session_id, m.role, m.content, m.created_at
      FROM messages m
      JOIN conversations cv ON m.conversation_id = cv.id
      ORDER BY cv.id, m.created_at ASC
    `).all<any>();

    const messages = result.results || [];

    if (messages.length === 0) {
      return c.text('Nenhuma conversa encontrada', 404);
    }

    // Agrupar mensagens por session_id
    const sessionsMap = new Map<string, any[]>();
    for (const msg of messages) {
      const sid = msg.session_id;
      const existing = sessionsMap.get(sid) || [];
      existing.push(msg);
      sessionsMap.set(sid, existing);
    }

    const lines: string[] = [];

    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('  CONVERSAS - HISTÓRICO COMPLETO DA PLATAFORMA');
    lines.push(`  Total: ${sessionsMap.size} conversas | ${messages.length} mensagens`);
    lines.push(`  Exportado em: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('');

    let conversaNum = 0;
    for (const [sessionId, sessionMsgs] of sessionsMap.entries()) {
      conversaNum++;
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push(`  CONVERSA #${conversaNum} | ID Conversa: ${sessionId}`);
      lines.push(`  Total de mensagens: ${sessionMsgs.length}`);
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push('');

      for (const msg of sessionMsgs) {
        const remetente = msg.role === 'user' ? '👤 CLIENTE' : msg.role === 'assistant' ? '🤖 IA' : `📌 ${String(msg.role).toUpperCase()}`;
        lines.push(`  ${remetente} (${msg.created_at}):`);
        const contentLines = (msg.content || '').split('\n');
        for (const cl of contentLines) {
          lines.push(`    ${cl}`);
        }
        lines.push('');
      }

      lines.push('');
    }

    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('  FIM DO RELATÓRIO');
    lines.push('═══════════════════════════════════════════════════════════');

    const txt = lines.join('\n');

    return new Response(txt, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'attachment; filename="conversas_plataforma.txt"',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e: any) {
    console.error("[Analytics] Erro em /export-conversas:", e);
    return c.json({ error: e.message }, 500);
  }
});
