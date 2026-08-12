import { Hono } from "hono";
import type { Env } from "../app";
import { sendText, getProfilePicture, getLatestMessageStatus, sendAudio, sendVideo, sendImage, sendDocument } from "../services/whatsapp-service";
import { rewriteMessageViaLLM } from "../services/llm-service";
import { formatWhatsAppShortParagraphs, getSaoPauloTime } from "../services/message-utils";

export const crmRoutes = new Hono<{ Bindings: Env }>();

// ============================================================
// Mensagens padrão do CRM
// ============================================================

const DEFAULT_MESSAGES = {
  satisfaction: `Oi, {{nome}}! 😊\n\nTudo bem? Aqui é do {{produto}}. Passando pra saber se tá tudo certinho com o seu acesso!\n\nA gente tá sempre buscando melhorar, sabe? Então queria te pedir um favorzão rápido...\n\nO que te chamou mais atenção no nosso produto? O que fez você querer garantir o seu? 🤔\n\nPode falar à vontade, é só pra gente entender melhor e continuar melhorando cada vez mais! 💪`,
  testimonial: `E aí, {{nome}}! 😄\n\nJá faz uns dias que você tá com o {{produto}}... queria saber como tá sendo a experiência!\n\nSe puder, seria incrível se você gravasse um videozinho curtinho (pode ser de 30 segundinhos!) contando o que achou. 🎬\n\nSabe por quê? Tem muita gente que fica na dúvida de comprar pela internet, né? E ouvir de alguém que já comprou ajuda demais essas pessoas a tomarem a decisão!\n\nVocê estaria ajudando muita gente! Se preferir, pode mandar um áudio também, tá? 🎙️\n\nO que acha?`,
  objection: `Oi, {{nome}}! 😊\n\nTudo bem? A gente conversou sobre o {{produto}} e eu queria te pedir uma ajudinha...\n\nA gente tá fazendo uma pesquisinha rápida pra melhorar cada vez mais. Sem compromisso nenhum!\n\nPode me contar o que faltou pra você fechar? Foi o preço, o conteúdo, ou alguma outra coisa? 🤔\n\nQualquer feedback seu ajuda demais a gente aqui! 💛`,
};

// ============================================================
// Helpers
// ============================================================

/**
 * Calcula o intervalo de datas com base no período informado.
 */
function getPeriodDates(period: string, start?: string, end?: string): { startDate: string; endDate: string } {
  const now = new Date();
  let startDate: string;
  let endDate: string = now.toISOString();

  if (period === 'custom' && start && end) {
    startDate = new Date(start).toISOString();
    endDate = new Date(end).toISOString();
  } else {
    const days = period === '30d' ? 30 : period === '15d' ? 15 : 7;
    const d = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    startDate = d.toISOString();
  }

  return { startDate, endDate };
}

// ============================================================
// 1. GET /dashboard — Métricas do CRM + Health Scores por produto
// ============================================================

crmRoutes.get("/dashboard", async (c) => {
  const db = c.env.DB;
  const automationId = c.req.query("automation_id");
  const dateFrom = c.req.query("data_inicio");
  const dateTo = c.req.query("data_fim");

  try {
    let totalsQuery = `
      SELECT
        COUNT(*) as total_sent,
        SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) as total_answered
      FROM crm_responses
    `;
    let totalsParams: any[] = [];
    const totalsConditions: string[] = [];
    if (automationId) {
      totalsConditions.push("automation_id = ?");
      totalsParams.push(automationId);
    }
    if (dateFrom && dateTo) {
      totalsConditions.push("created_at >= ? AND created_at <= ?");
      totalsParams.push(`${dateFrom} 00:00:00`, `${dateTo} 23:59:59`);
    }
    if (totalsConditions.length > 0) {
      totalsQuery += ` WHERE ${totalsConditions.join(" AND ")}`;
    }
    const totals = await db.prepare(totalsQuery).bind(...totalsParams).first<{ total_sent: number; total_answered: number }>();

    const totalSent = totals?.total_sent || 0;
    const totalAnswered = totals?.total_answered || 0;
    const responseRate = totalSent > 0 ? Math.round((totalAnswered / totalSent) * 100) : 0;

    // Agrupado por automação
    let byAutoQuery = `
      SELECT
        cr.automation_id,
        a.name as automation_name,
        COUNT(*) as total_sent,
        SUM(CASE WHEN cr.status = 'answered' THEN 1 ELSE 0 END) as total_answered,
        ROUND(CAST(SUM(CASE WHEN cr.status = 'answered' THEN 1 ELSE 0 END) AS REAL) / NULLIF(COUNT(*), 0) * 100) as response_rate
      FROM crm_responses cr
      LEFT JOIN automations a ON cr.automation_id = a.id
    `;
    let byAutoParams: any[] = [];
    const byAutoConditions: string[] = [];
    if (automationId) {
      byAutoConditions.push("cr.automation_id = ?");
      byAutoParams.push(automationId);
    }
    if (dateFrom && dateTo) {
      byAutoConditions.push("cr.created_at >= ? AND cr.created_at <= ?");
      byAutoParams.push(`${dateFrom} 00:00:00`, `${dateTo} 23:59:59`);
    }
    if (byAutoConditions.length > 0) {
      byAutoQuery += ` WHERE ${byAutoConditions.join(" AND ")}`;
    }
    byAutoQuery += ` GROUP BY cr.automation_id ORDER BY total_sent DESC`;
    
    const byAutoRes = await db.prepare(byAutoQuery).bind(...byAutoParams).all();
    const automations = (byAutoRes.results || []).map((a: any) => ({
      ...a,
      product_id: a.automation_id, // Para retrocompatibilidade
      product_name: a.automation_name || "Sem Nome", // Para retrocompatibilidade
    }));

    // Agrupado por flow_type
    let byFlowQuery = `
      SELECT
        flow_type,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) as answered
      FROM crm_responses
    `;
    let byFlowParams: any[] = [];
    const byFlowConditions: string[] = [];
    if (automationId) {
      byFlowConditions.push("automation_id = ?");
      byFlowParams.push(automationId);
    }
    if (dateFrom && dateTo) {
      byFlowConditions.push("created_at >= ? AND created_at <= ?");
      byFlowParams.push(`${dateFrom} 00:00:00`, `${dateTo} 23:59:59`);
    }
    if (byFlowConditions.length > 0) {
      byFlowQuery += ` WHERE ${byFlowConditions.join(" AND ")}`;
    }
    byFlowQuery += ` GROUP BY flow_type`;
    
    const byFlowType = await db.prepare(byFlowQuery).bind(...byFlowParams).all();

    // Health scores por automação
    const healthScores = automations.map((a: any) => {
      const rate = a.total_sent > 0 ? (a.total_answered / a.total_sent) * 100 : 0;
      let score = 0;
      if (rate >= 60) score = 10;
      else if (rate >= 50) score = 8;
      else if (rate >= 40) score = 7;
      else if (rate >= 30) score = 5;
      else if (rate >= 20) score = 3;
      else score = 1;

      return {
        product_id: a.automation_id, // Para retrocompatibilidade
        product_name: a.automation_name, // Para retrocompatibilidade
        automation_id: a.automation_id,
        automation_name: a.automation_name,
        health_score: score,
        response_rate: Math.round(rate),
      };
    });

    return c.json({
      total_sent: totalSent,
      total_answered: totalAnswered,
      response_rate: responseRate,
      by_product: automations, // Mapeado por automação com compatibilidade
      by_flow_type: (byFlowType.results || []),
      health_scores: healthScores,
    });
  } catch (err: any) {
    console.error("[CRM] Erro no dashboard:", err);
    return c.json({ error: "Erro ao carregar métricas do CRM", details: err.message }, 500);
  }
});

// ============================================================
// 2. GET /responses — Listar respostas CRM com filtros e paginação
// ============================================================

crmRoutes.get("/responses", async (c) => {
  const db = c.env.DB;

  const productId = c.req.query("product_id");
  const automationId = c.req.query("automation_id");
  const flowType = c.req.query("flow_type");
  const status = c.req.query("status");
  const period = c.req.query("period") || "30d";
  const dateFrom = c.req.query("data_inicio");
  const dateTo = c.req.query("data_fim");
  const page = parseInt(c.req.query("page") || "1", 10);
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const offset = (page - 1) * limit;

  try {
    const conditions: string[] = [];
    const params: any[] = [];

    // Filtro de período
    if (dateFrom && dateTo) {
      conditions.push("cr.created_at >= ? AND cr.created_at <= ?");
      params.push(`${dateFrom} 00:00:00`, `${dateTo} 23:59:59`);
    } else {
      const { startDate } = getPeriodDates(period);
      conditions.push("cr.created_at >= ?");
      params.push(startDate);
    }

    if (automationId) {
      conditions.push("cr.automation_id = ?");
      params.push(automationId);
    } else if (productId && productId !== "all") {
      conditions.push("cr.product_id = ?");
      params.push(productId);
    }
    if (flowType) {
      conditions.push("cr.flow_type = ?");
      params.push(flowType);
    }
    if (status) {
      conditions.push("cr.status = ?");
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Contagem total
    const countResult = await db.prepare(
      `SELECT COUNT(*) as total FROM crm_responses cr ${whereClause}`
    ).bind(...params).first<{ total: number }>();

    const total = countResult?.total || 0;

    // Dados paginados
    const data = await db.prepare(`
      SELECT cr.*, a.name as product_name
      FROM crm_responses cr
      LEFT JOIN automations a ON cr.automation_id = a.id
      ${whereClause}
      ORDER BY cr.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();

    return c.json({
      data: data.results || [],
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error("[CRM] Erro ao listar respostas:", err);
    return c.json({ error: "Erro ao listar respostas do CRM", details: err.message }, 500);
  }
});

// ============================================================
// 3. GET /responses/:id — Detalhe de uma resposta
// ============================================================

crmRoutes.get("/responses/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");

  try {
    const response = await db.prepare(`
      SELECT cr.*, p.name as product_name
      FROM crm_responses cr
      LEFT JOIN products p ON cr.product_id = p.id
      WHERE cr.id = ?
    `).bind(id).first();

    if (!response) {
      return c.json({ error: "Resposta não encontrada" }, 404);
    }

    return c.json({ data: response });
  } catch (err: any) {
    console.error("[CRM] Erro ao buscar resposta:", err);
    return c.json({ error: "Erro ao buscar resposta", details: err.message }, 500);
  }
});

// ============================================================
// 4. POST /analyze — Análise por IA (LLM)
// ============================================================

crmRoutes.post("/analyze", async (c) => {
  const db = c.env.DB;

  try {
    const body = await c.req.json<{
      period: '7d' | '15d' | '30d' | 'custom';
      start?: string;
      end?: string;
      product_id?: string;
      automation_id?: string;
    }>();

    const { startDate, endDate } = getPeriodDates(body.period, body.start, body.end);

    // Buscar respostas respondidas no período
    const conditions: string[] = [
      "cr.status = 'answered'",
      "cr.created_at >= ?",
      "cr.created_at <= ?",
    ];
    const params: any[] = [startDate, endDate];

    if (body.automation_id) {
      conditions.push("cr.automation_id = ?");
      params.push(body.automation_id);
    } else if (body.product_id && String(body.product_id) !== "all") {
      conditions.push("cr.product_id = ?");
      params.push(body.product_id);
    }

    const whereClause = conditions.join(" AND ");

    const responses = await db.prepare(`
      SELECT cr.*, a.name as product_name
      FROM crm_responses cr
      LEFT JOIN automations a ON cr.automation_id = a.id
      WHERE ${whereClause}
      ORDER BY cr.flow_type, cr.created_at DESC
    `).bind(...params).all();

    const results = responses.results || [];

    if (results.length === 0) {
      return c.json({ error: "Nenhuma resposta encontrada no período selecionado" }, 400);
    }

    // Categorizar respostas por flow_type
    const categorized: Record<string, string[]> = {};
    for (const r of results as any[]) {
      const ft = r.flow_type || 'outros';
      if (!categorized[ft]) categorized[ft] = [];
      categorized[ft].push(`- [${r.lead_name || 'Anônimo'}]: "${r.response_text || ''}"`);
    }

    // Montar prompt
    let responsesSummary = '';
    for (const [type, items] of Object.entries(categorized)) {
      const label = type === 'satisfaction' ? 'Satisfação' : type === 'testimonial' ? 'Depoimentos' : type === 'objection' ? 'Objeções' : type;
      responsesSummary += `\n## ${label} (${items.length} respostas)\n${items.join('\n')}\n`;
    }

    const prompt = `Você é um analista de marketing e CRM especialista. Analise as seguintes respostas de clientes coletadas via WhatsApp e retorne uma análise estruturada em português brasileiro.

Período: ${body.period === 'custom' ? `${body.start} a ${body.end}` : `últimos ${body.period.replace('d', ' dias')}`}
Total de respostas: ${results.length}

${responsesSummary}

Retorne a análise no seguinte formato estruturado:

### 1. Perfil de Persona
Descreva o perfil demográfico e comportamental dos clientes baseado nas respostas.

### 2. Motivações de Compra (Top 5)
Liste as 5 principais motivações que levaram os clientes a comprar.

### 3. Objeções Principais (Top 5)
Liste as 5 principais objeções ou barreiras que impedem a compra.

### 4. Sugestões para Criativos
Dê sugestões práticas de como melhorar os anúncios com base nas respostas.

### 5. Sugestões para Funil
Dê sugestões de como melhorar o funil de vendas.

### 6. Pontos Fortes
O que os clientes mais elogiaram.

### 7. Pontos de Melhoria
O que os clientes mais criticaram ou sugeriram melhorar.

### 8. NPS Estimado (0-10)
Estime um Net Promoter Score baseado no sentimento geral das respostas.

Seja direto, prático e use dados das respostas para embasar cada ponto.`;

    // Buscar LLM configurada
    const llm = await db.prepare('SELECT * FROM llms ORDER BY sort_order ASC, id ASC LIMIT 1').first();
    if (!llm) return c.json({ error: 'Nenhuma LLM configurada' }, 400);

    const apiKey = (llm as any).api_key;
    const model = (llm as any).model || 'gemini-2.5-flash';
    const provider = (llm as any).provider || 'google';

    let analysisText = '';

    if (provider === 'google' || provider === 'gemini') {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 4000 }
        })
      });
      const data = await resp.json() as any;
      analysisText = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Erro na análise';
    } else if (provider === 'openai') {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7, max_tokens: 4000
        })
      });
      const data = await resp.json() as any;
      analysisText = data?.choices?.[0]?.message?.content || 'Erro na análise';
    } else {
      return c.json({ error: `Provedor LLM não suportado: ${provider}` }, 400);
    }

    return c.json({
      analysis: analysisText,
      metadata: {
        period: body.period,
        total_responses: results.length,
        by_type: Object.fromEntries(Object.entries(categorized).map(([k, v]) => [k, v.length])),
        llm_used: (llm as any).name || model,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error("[CRM] Erro na análise por IA:", err);
    return c.json({ error: "Erro ao gerar análise por IA", details: err.message }, 500);
  }
});

// ============================================================
// 5. GET /testimonials — Listar depoimentos
// ============================================================

crmRoutes.get("/testimonials", async (c) => {
  const db = c.env.DB;
  const productId = c.req.query("product_id");
  const automationId = c.req.query("automation_id");
  const dateFrom = c.req.query("data_inicio");
  const dateTo = c.req.query("data_fim");

  try {
    const conditions: string[] = [
      "cr.flow_type = 'testimonial'",
      "cr.status = 'answered'",
    ];
    const params: any[] = [];

    if (automationId) {
      conditions.push("cr.automation_id = ?");
      params.push(automationId);
    } else if (productId && productId !== "all") {
      conditions.push("cr.product_id = ?");
      params.push(productId);
    }

    if (dateFrom && dateTo) {
      conditions.push("cr.created_at >= ? AND cr.created_at <= ?");
      params.push(`${dateFrom} 00:00:00`, `${dateTo} 23:59:59`);
    }

    const whereClause = conditions.join(" AND ");

    const testimonials = await db.prepare(`
      SELECT cr.*, a.name as product_name
      FROM crm_responses cr
      LEFT JOIN automations a ON cr.automation_id = a.id
      WHERE ${whereClause}
      ORDER BY cr.created_at DESC
    `).bind(...params).all();

    return c.json({ data: testimonials.results || [] });
  } catch (err: any) {
    console.error("[CRM] Erro ao listar depoimentos:", err);
    return c.json({ error: "Erro ao listar depoimentos", details: err.message }, 500);
  }
});

// ============================================================
// 6. GET /tags — Listar tags únicas com contagem
// ============================================================

crmRoutes.get("/tags", async (c) => {
  const db = c.env.DB;
  const productId = c.req.query("product_id");
  const automationId = c.req.query("automation_id");
  const dateFrom = c.req.query("data_inicio");
  const dateTo = c.req.query("data_fim");

  try {
    let query = "SELECT ai_tags FROM crm_responses WHERE ai_tags IS NOT NULL AND ai_tags != ''";
    const params: any[] = [];

    if (automationId) {
      query += " AND automation_id = ?";
      params.push(automationId);
    } else if (productId && productId !== "all") {
      query += " AND product_id = ?";
      params.push(productId);
    }

    if (dateFrom && dateTo) {
      query += " AND created_at >= ? AND created_at <= ?";
      params.push(`${dateFrom} 00:00:00`, `${dateTo} 23:59:59`);
    }

    const rows = await db.prepare(query).bind(...params).all();

    const tagCounts: Record<string, number> = {};

    for (const row of (rows.results || []) as any[]) {
      try {
        const tags: string[] = JSON.parse(row.ai_tags);
        if (Array.isArray(tags)) {
          for (const tag of tags) {
            const normalized = tag.trim().toLowerCase();
            if (normalized) {
              tagCounts[normalized] = (tagCounts[normalized] || 0) + 1;
            }
          }
        }
      } catch {
        // ai_tags não é JSON válido, ignorar
      }
    }

    // Converter para array ordenada por contagem
    const sortedTags = Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);

    return c.json({ data: sortedTags });
  } catch (err: any) {
    console.error("[CRM] Erro ao listar tags:", err);
    return c.json({ error: "Erro ao listar tags", details: err.message }, 500);
  }
});

// ============================================================
// ============================================================
// 7. GET /config/:automationId — Config CRM de uma Automação
// ============================================================
crmRoutes.get("/config/:automationId", async (c) => {
  const db = c.env.DB;
  const automationId = c.req.param("automationId");

  try {
    // 1. Verificar se a automação existe
    const autoExists = await db.prepare("SELECT id FROM automations WHERE id = ?").bind(automationId).first();
    if (!autoExists) {
      return c.json({ error: "Automação não encontrada" }, 404);
    }

    // 2. Checar contagem de estágios na tabela de estágios
    const countRes = await db.prepare(
      "SELECT COUNT(*) as count FROM automation_crm_stages WHERE automation_id = ?"
    ).bind(automationId).first<{ count: number }>();

    if (!countRes || countRes.count === 0) {
      // Popular com os fluxos padrão (retrocompatibilidade)
      const defaultStages = [
        { key: 'satisfaction', name: 'Satisfação', delay: 48, message: DEFAULT_MESSAGES.satisfaction, class: 'sucesso' },
        { key: 'testimonial', name: 'Depoimento', delay: 120, message: DEFAULT_MESSAGES.testimonial, class: 'sucesso' },
        { key: 'objection', name: 'Objeções', delay: 24, message: DEFAULT_MESSAGES.objection, class: 'sem_sucesso' }
      ];

      for (const s of defaultStages) {
        await db.prepare(`
          INSERT INTO automation_crm_stages (id, automation_id, key, name, enabled, delay_hours, message, class)
          VALUES (?, ?, ?, ?, 1, ?, ?, ?)
        `).bind(crypto.randomUUID(), automationId, s.key, s.name, s.delay, s.message, s.class).run();
      }
    }

    // 3. Carregar todos os estágios de CRM da automação ordenados por sort_order
    const stages = await db.prepare(
      "SELECT * FROM automation_crm_stages WHERE automation_id = ? ORDER BY sort_order ASC, delay_hours ASC"
    ).bind(automationId).all();

    return c.json({
      data: {
        automation_id: automationId,
        stages: stages.results || []
      }
    });
  } catch (err: any) {
    console.error("[CRM Config] Erro:", err);
    return c.json({ error: "Erro ao buscar configurações do CRM", details: err.message }, 500);
  }
});

// ============================================================
// 8. POST /config/:automationId/stages — Criar Estágio CRM
// ============================================================
crmRoutes.post("/config/:automationId/stages", async (c) => {
  const db = c.env.DB;
  const automationId = c.req.param("automationId");

  try {
    const body = await c.req.json<{
      name: string;
      delay_hours: number;
      message: string;
      rewrite_mode?: 'none' | 'dynamic' | 'static';
      rewrite_count?: number;
      class?: 'sucesso' | 'sem_sucesso';
    }>();

    if (!body.name || !body.message || !body.delay_hours) {
      return c.json({ error: "Campos obrigatórios ausentes" }, 400);
    }

    // Gerar slug key
    const key = body.name
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    const id = crypto.randomUUID();
    const rewriteMode = body.rewrite_mode || 'none';
    const rewriteCount = Number(body.rewrite_count) || 5;
    const stageClass = body.class || 'sucesso';

    let variationsList: string[] = [];
    if (rewriteMode === 'static') {
      let textToRewrite = body.message;
      if (body.message && body.message.startsWith('[')) {
        try {
          const blocks = JSON.parse(body.message) as any[];
          const textFields = blocks.filter(f => f.type === "text");
          textToRewrite = textFields.length > 0 ? textFields[0].content : "";
        } catch (e) {
          console.error("Erro ao fazer parse dos blocos de crm:", e);
        }
      }
      if (textToRewrite) {
        variationsList = await rewriteMessageViaLLM(db, automationId, textToRewrite, rewriteCount);
      }
    }
    const variationsJson = JSON.stringify(variationsList);

    await db.prepare(`
      INSERT INTO automation_crm_stages (id, automation_id, key, name, enabled, delay_hours, message, rewrite_mode, rewrite_count, variations, class)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
    `).bind(id, automationId, key, body.name, body.delay_hours, body.message, rewriteMode, rewriteCount, variationsJson, stageClass).run();

    const created = await db.prepare("SELECT * FROM automation_crm_stages WHERE id = ?").bind(id).first();

    return c.json({ data: created, message: "Estágio de CRM criado com sucesso!" });
  } catch (err: any) {
    console.error("[CRM Add Stage] Erro:", err);
    return c.json({ error: "Erro ao criar estágio de CRM", details: err.message }, 500);
  }
});

// ============================================================
// 9. PUT /config/:automationId/stages/:stageId — Editar Estágio CRM
// ============================================================
crmRoutes.put("/config/:automationId/stages/:stageId", async (c) => {
  const db = c.env.DB;
  const stageId = c.req.param("stageId");
  const automationId = c.req.param("automationId");

  try {
    const body = await c.req.json<{
      name?: string;
      delay_hours?: number;
      message?: string;
      enabled?: number;
      rewrite_mode?: 'none' | 'dynamic' | 'static';
      rewrite_count?: number;
      class?: 'sucesso' | 'sem_sucesso';
    }>();

    const existing = await db.prepare("SELECT * FROM automation_crm_stages WHERE id = ?").bind(stageId).first<any>();
    if (!existing) {
      return c.json({ error: "Estágio de CRM não encontrado" }, 404);
    }

    const name = body.name ?? existing.name;
    const delay = body.delay_hours ?? existing.delay_hours;
    const message = body.message ?? existing.message;
    const enabled = body.enabled !== undefined ? body.enabled : existing.enabled;
    const rewriteMode = body.rewrite_mode ?? existing.rewrite_mode ?? 'none';
    const rewriteCount = Number(body.rewrite_count ?? existing.rewrite_count ?? 5);
    const stageClass = body.class ?? existing.class ?? 'sucesso';

    let variationsJson = existing.variations || '[]';

    // Gerar variações se:
    // 1. O modo passou a ser 'static' (e antes não era, ou variações estavam vazias)
    // 2. Ou se o modo já era 'static' e a mensagem ou a quantidade de variações mudou
    const modeChangedToStatic = rewriteMode === 'static' && (existing.rewrite_mode !== 'static' || variationsJson === '[]');
    const countChangedInStatic = rewriteMode === 'static' && rewriteCount !== existing.rewrite_count;
    const messageChangedInStatic = rewriteMode === 'static' && body.message !== undefined && body.message !== existing.message;

    if (modeChangedToStatic || countChangedInStatic || messageChangedInStatic) {
      console.log(`[LLM Rewrite] Pré-gerando ${rewriteCount} variações para o estágio de CRM ${stageId}`);
      let textToRewrite = message;
      if (message && message.startsWith('[')) {
        try {
          const blocks = JSON.parse(message) as any[];
          const textFields = blocks.filter(f => f.type === "text");
          textToRewrite = textFields.length > 0 ? textFields[0].content : "";
        } catch (e) {
          console.error("Erro ao fazer parse dos blocos de crm:", e);
        }
      }
      if (textToRewrite) {
        const variationsList = await rewriteMessageViaLLM(db, automationId, textToRewrite, rewriteCount);
        variationsJson = JSON.stringify(variationsList);
      } else {
        variationsJson = '[]';
      }
    } else if (rewriteMode !== 'static') {
      variationsJson = '[]';
    }

    await db.prepare(`
      UPDATE automation_crm_stages
      SET name = ?, delay_hours = ?, message = ?, enabled = ?, rewrite_mode = ?, rewrite_count = ?, variations = ?, class = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(name, delay, message, enabled, rewriteMode, rewriteCount, variationsJson, stageClass, stageId).run();

    const updated = await db.prepare("SELECT * FROM automation_crm_stages WHERE id = ?").bind(stageId).first();

    return c.json({ data: updated, message: "Estágio de CRM atualizado com sucesso!" });
  } catch (err: any) {
    console.error("[CRM Edit Stage] Erro:", err);
    return c.json({ error: "Erro ao editar estágio de CRM", details: err.message }, 500);
  }
});

// ============================================================
// 10. DELETE /config/:automationId/stages/:stageId — Deletar Estágio CRM
// ============================================================
crmRoutes.delete("/config/:automationId/stages/:stageId", async (c) => {
  const db = c.env.DB;
  const stageId = c.req.param("stageId");

  try {
    const existing = await db.prepare("SELECT * FROM automation_crm_stages WHERE id = ?").bind(stageId).first();
    if (!existing) {
      return c.json({ error: "Estágio de CRM não encontrado" }, 404);
    }

    await db.prepare("DELETE FROM automation_crm_stages WHERE id = ?").bind(stageId).run();

    return c.json({ message: "Estágio de CRM removido com sucesso!" });
  } catch (err: any) {
    console.error("[CRM Delete Stage] Erro:", err);
    return c.json({ error: "Erro ao remover estágio de CRM", details: err.message }, 500);
  }
});

// ============================================================
// 10.1. PUT /config/:automationId/reorder — Reordenar Estágios de CRM
// ============================================================
crmRoutes.put("/config/:automationId/reorder", async (c) => {
  const db = c.env.DB;
  const automationId = c.req.param("automationId");

  try {
    const body = await c.req.json<{ stages: { id: string; sort_order: number }[] }>();
    if (!body.stages || !Array.isArray(body.stages)) {
      return c.json({ error: "Lista de estágios inválida" }, 400);
    }

    const statements = body.stages.map((s) => {
      return db.prepare(
        "UPDATE automation_crm_stages SET sort_order = ? WHERE id = ? AND automation_id = ?"
      ).bind(s.sort_order, s.id, automationId);
    });

    await db.batch(statements);

    return c.json({ message: "Ordenação de CRM atualizada com sucesso!" });
  } catch (err: any) {
    console.error("[CRM Stages Reorder] Erro:", err);
    return c.json({ error: "Erro ao reordenar estágios de CRM", details: err.message }, 500);
  }
});


// ============================================================
// 9. GET /health-scores — Health Scores de todos os produtos
// ============================================================

crmRoutes.get("/health-scores", async (c) => {
  const db = c.env.DB;

  try {
    const data = await db.prepare(`
      SELECT
        cr.automation_id as product_id,
        a.name as product_name,
        cr.flow_type,
        COUNT(*) as total,
        SUM(CASE WHEN cr.status = 'answered' THEN 1 ELSE 0 END) as answered
      FROM crm_responses cr
      LEFT JOIN automations a ON cr.automation_id = a.id
      GROUP BY cr.automation_id, cr.flow_type
      ORDER BY cr.automation_id
    `).all();

    const rows = (data.results || []) as any[];

    // Agrupar por produto
    const productMap: Record<string, {
      product_id: string;
      product_name: string;
      satisfaction: { total: number; answered: number };
      testimonial: { total: number; answered: number };
      objection: { total: number; answered: number };
    }> = {};

    for (const row of rows) {
      const pid = row.product_id;
      if (!productMap[pid]) {
        productMap[pid] = {
          product_id: pid,
          product_name: row.product_name || 'Sem nome',
          satisfaction: { total: 0, answered: 0 },
          testimonial: { total: 0, answered: 0 },
          objection: { total: 0, answered: 0 },
        };
      }
      const ft = row.flow_type as 'satisfaction' | 'testimonial' | 'objection';
      if (productMap[pid][ft]) {
        productMap[pid][ft].total = row.total;
        productMap[pid][ft].answered = row.answered;
      }
    }

    // Calcular scores
    const scores = Object.values(productMap).map((p) => {
      const satRate = p.satisfaction.total > 0 ? (p.satisfaction.answered / p.satisfaction.total) : 0;
      const testRate = p.testimonial.total > 0 ? (p.testimonial.answered / p.testimonial.total) : 0;
      const objRate = p.objection.total > 0 ? (p.objection.answered / p.objection.total) : 0;

      // Peso: satisfação 40%, depoimento 35%, objeção 25%
      const weightedScore = (satRate * 0.4 + testRate * 0.35 + objRate * 0.25) * 10;
      const healthScore = Math.round(Math.min(10, Math.max(0, weightedScore)) * 10) / 10;

      return {
        product_id: p.product_id,
        product_name: p.product_name,
        health_score: healthScore,
        satisfaction_rate: Math.round(satRate * 100),
        testimonial_rate: Math.round(testRate * 100),
        objection_rate: Math.round(objRate * 100),
        details: {
          satisfaction: p.satisfaction,
          testimonial: p.testimonial,
          objection: p.objection,
        },
      };
    });

    return c.json({ data: scores });
  } catch (err: any) {
    console.error("[CRM] Erro ao calcular health scores:", err);
    return c.json({ error: "Erro ao calcular health scores", details: err.message }, 500);
  }
});

// ============================================================
// Função de Cron — Processar mensagens agendadas do CRM
// ============================================================

/**
 * Processa mensagens agendadas do CRM.
 * Chamada pelo cron trigger a cada 5 minutos.
 *
 * 1. Busca itens pendentes cuja data agendada já passou
 * 2. Para cada item, monta a mensagem e envia via WhatsApp
 * 3. Cria registro em crm_responses e atualiza crm_scheduled
 *
 * @returns Número de itens processados
 */
export async function processCrmScheduled(env: Env): Promise<number> {
  const db = env.DB;
  let processed = 0;

  // ── JANELA SILENCIOSA (00:00 - 07:00 SP TIME) — AUTO-REAGENDAMENTO EM LOTE ──
  const nowTime = new Date();
  const spTime = getSaoPauloTime(nowTime);
  if (spTime.hour >= 0 && spTime.hour < 7) {
    console.log(`[CRM Cron] Horário silencioso detectado (${spTime.hour}:${spTime.minute} SP). Adiando CRMs pendentes para a janela da manhã (07:00 - 11:00 SP).`);
    try {
      // 07:00 SP = 10:00 UTC. Adicionamos abs(random() % 240) minutos para distribuir os disparos de forma aleatória em 4h
      await db.prepare(`
        UPDATE crm_scheduled
        SET scheduled_for = datetime('now', 'start of day', '+10 hours', '+' || (abs(random() % 240)) || ' minutes')
        WHERE status = 'pending' AND scheduled_for <= datetime('now')
      `).run();
      console.log(`[CRM Cron] Sucesso ao redistribuir CRMs pendentes para a janela da manhã.`);
    } catch (err) {
      console.error(`[CRM Cron] Falha ao reagendar CRMs em horário silencioso:`, err);
    }
    return 0; // Aborta execução durante a madrugada
  }

  // ── LIMITADOR DIÁRIO (MÁXIMO 40 ENVIOS POR DIA EM SP TIME) ──
  try {
    const todaySPStr = new Date(Date.now() - 3 * 3600 * 1000).toISOString().split('T')[0];
    const startOfTodayUTC = `${todaySPStr} 03:00:00`; // 00:00 SP = 03:00 UTC

    const crmSentCheck = await db.prepare(`
      SELECT COUNT(*) as count FROM crm_responses
      WHERE (status = 'sent' OR status = 'delivered' OR status = 'answered')
        AND sent_at >= ?
    `).bind(startOfTodayUTC).first<{ count: number }>();

    const totalCrmSentToday = crmSentCheck?.count || 0;
    if (totalCrmSentToday >= 40) {
      console.log(`[CRM Cron] Limite diário de 40 envios atingido para hoje (${totalCrmSentToday} enviados). Pulando disparos para amanhã.`);
      return 0;
    }
  } catch (err) {
    console.error(`[CRM Cron] Erro ao validar limitador diário de CRMs:`, err);
  }

  // ── INTERVALO MÍNIMO DE 10 MINUTOS ENTRE DISPAROS CONSECUTIVOS ──
  try {
    const lastSentCheck = await db.prepare(`
      SELECT sent_at FROM crm_responses
      WHERE status = 'sent' OR status = 'delivered' OR status = 'answered'
      ORDER BY sent_at DESC LIMIT 1
    `).first<{ sent_at: string }>();

    if (lastSentCheck && lastSentCheck.sent_at) {
      const lastSentTime = new Date(lastSentCheck.sent_at.replace(' ', 'T') + 'Z').getTime();
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
      if (lastSentTime > tenMinutesAgo) {
        const remainingMs = lastSentTime + 10 * 60 * 1000 - Date.now();
        console.log(`[CRM Cron] Menos de 10 minutos desde o último disparo do CRM. Espaçamento ativo (faltam ${Math.round(remainingMs / 1000)}s). Pulando.`);
        return 0;
      }
    }
  } catch (err) {
    console.error(`[CRM Cron] Erro ao validar intervalo mínimo de CRMs:`, err);
  }

  // ── RESCHEDULE OVERDUE CRM BACKLOG TO PREVENT NUMBER BAN (STAGGER QUEUE) ──
  try {
    const overdueCrm = await db.prepare(`
      SELECT cs.id, cs.automation_id
      FROM crm_scheduled cs
      JOIN automations a ON cs.automation_id = a.id
      WHERE cs.status = 'pending'
        AND cs.scheduled_for <= datetime('now', '-10 minutes')
        AND a.status = 'active'
      ORDER BY cs.automation_id, cs.scheduled_for ASC
    `).all<{ id: string; automation_id: string }>();

    if (overdueCrm.results && overdueCrm.results.length > 1) {
      console.log(`[CRM Cron] Detectadas ${overdueCrm.results.length} mensagens CRM atrasadas em backlog. Espaçando fila...`);
      
      const byAutomation: Record<string, typeof overdueCrm.results> = {};
      for (const f of overdueCrm.results) {
        if (!byAutomation[f.automation_id]) {
          byAutomation[f.automation_id] = [];
        }
        byAutomation[f.automation_id].push(f);
      }

      for (const [autoId, list] of Object.entries(byAutomation)) {
        if (list.length > 1) {
          for (let i = 1; i < list.length; i++) {
            const item = list[i];
            const delayMinutes = 5 * i + Math.floor(Math.random() * 6); // 5i + random(0..5)
            await db.prepare(`
              UPDATE crm_scheduled
              SET scheduled_for = datetime('now', '+' || ? || ' minutes')
              WHERE id = ?
            `).bind(delayMinutes, item.id).run();
            console.log(`[CRM Cron Stagger] Reagendado CRM backlog ${item.id} (auto: ${autoId}) para +${delayMinutes} min`);
          }
        }
      }
    }
  } catch (err) {
    console.error(`[CRM Cron Stagger] Erro ao re-espaçar CRMs atrasados:`, err);
  }

  try {
    // 1. Buscar itens pendentes prontos para envio
    const pending = await db.prepare(`
      SELECT cs.*, p.name as product_name, al.nome as customer_name,
             ct.had_profile_pic, conv.id as conversation_id
      FROM crm_scheduled cs
      LEFT JOIN products p ON cs.product_id = p.id
      LEFT JOIN automation_leads al ON cs.phone = al.phone AND cs.automation_id = al.automation_id
      LEFT JOIN contacts ct ON cs.phone = ct.phone AND cs.automation_id = ct.automation_id
      LEFT JOIN conversations conv ON ct.id = conv.contact_id AND cs.automation_id = conv.automation_id
      WHERE cs.status = 'pending' AND cs.scheduled_for <= datetime('now')
      ORDER BY cs.scheduled_for ASC
      LIMIT 50
    `).all();

    const items = (pending.results || []) as any[];

    if (items.length === 0) {
      return 0;
    }

    console.log(`[CRM Cron] Processando ${items.length} mensagens agendadas`);

    for (const item of items) {
      try {
        // 2a. Buscar config do produto (ou usar defaults)
        let config: any = null;
        if (item.product_id) {
          config = await db.prepare(
            "SELECT * FROM crm_product_config WHERE product_id = ?"
          ).bind(item.product_id).first();
        }

        // 2b. Buscar o whatsapp_api_id e status da automação
        let whatsappApiId: string | null = null;
        let automationStatus: string | null = null;
        if (item.automation_id) {
          const automation = await db.prepare(
            "SELECT whatsapp_api_id, status FROM automations WHERE id = ?"
          ).bind(item.automation_id).first<{ whatsapp_api_id: string; status: string }>();
          whatsappApiId = automation?.whatsapp_api_id || null;
          automationStatus = automation?.status || null;
        }

        if (automationStatus === 'paused') {
          console.log(`[CRM Cron] Automação ${item.automation_id} está pausada. Pulando disparo CRM ${item.id} para evitar envios em canal inativo.`);
          continue;
        }

        if (!whatsappApiId) {
          console.warn(`[CRM Cron] Automação sem API WhatsApp para item ${item.id}, pulando.`);
          await db.prepare(
            "UPDATE crm_scheduled SET status = 'error' WHERE id = ?"
          ).bind(item.id).run();
          continue;
        }

        // ── CONGESTION CHECK ──
        // Se já enviamos alguma mensagem por esta automação nos últimos 60 segundos,
        // adiamos o envio atual para evitar rajadas e manter comportamento natural.
        const recentSend = await db.prepare(`
          SELECT COUNT(*) as count FROM dispatch_logs
          WHERE automation_id = ? AND sent_at >= datetime('now', '-1 minute')
        `).bind(item.automation_id).first<{ count: number }>();

        if (recentSend && recentSend.count > 0) {
          const postponeMinutes = 3 + Math.floor(Math.random() * 5); // 3 a 7
          await db.prepare(
            "UPDATE crm_scheduled SET scheduled_for = datetime('now', '+' || ? || ' minutes') WHERE id = ?"
          ).bind(postponeMinutes, item.id).run();
          console.log(`[CRM Cron] Canal congestionado (${recentSend.count} msg nos últimos 60s). Adiado CRM ${item.flow_type} de ${item.phone} em ${postponeMinutes} min.`);
          continue;
        }

        // ── REGRA HÍBRIDA DE BLOQUEIO (Foto de Perfil & Tracinhos ACK) ──
        const hadProfilePic = item.had_profile_pic || 0;
        let isBlocked = false;

        if (item.conversation_id) {
          if (hadProfilePic === 1) {
            // Regra 1: O lead tinha foto inicialmente. Verificamos se ela sumiu.
            try {
              const currentPicUrl = await getProfilePicture(db, whatsappApiId, item.phone);
              if (!currentPicUrl) {
                console.log(`[CRM Cron] 🛑 Bloqueio detectado para ${item.phone}! (Tinha foto de perfil inicial, mas ela sumiu)`);
                isBlocked = true;
              }
            } catch (picErr) {
              console.error(`[CRM Cron] Erro ao verificar foto de perfil para ${item.phone}:`, picErr);
            }
          } else {
            // Regra 2: O lead NÃO tinha foto inicialmente. Fallback para verificação do Tracinho (ACK = 1 por mais de 2 horas)
            try {
              // Buscar a última mensagem do assistente no banco D1 para saber quando foi enviada
              const lastMsg = await db.prepare(`
                SELECT created_at FROM messages 
                WHERE conversation_id = ? AND role = 'assistant'
                ORDER BY created_at DESC LIMIT 1
              `).bind(item.conversation_id).first<{ created_at: string }>();

              if (lastMsg && lastMsg.created_at) {
                const lastSentTime = new Date(lastMsg.created_at.replace(' ', 'T') + 'Z').getTime();
                const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);

                if (lastSentTime < twoHoursAgo) {
                  // A mensagem foi enviada há mais de 2 horas. Consultamos o status real na UAZAPI.
                  const status = await getLatestMessageStatus(db, whatsappApiId, item.phone);
                  
                  if (status === 1) {
                    // Status 1 = Sent (1 tracinho, não entregue). Após 2 horas, indica bloqueio.
                    console.log(`[CRM Cron] 🛑 Bloqueio detectado para ${item.phone}! (Última mensagem enviada há mais de 2h continua com 1 tracinho - status 1)`);
                    isBlocked = true;
                  }
                }
              }
            } catch (ackErr) {
              console.error(`[CRM Cron] Erro ao validar status de entrega (ACK) para ${item.phone}:`, ackErr);
            }
          }
        }

        if (isBlocked) {
          // Cancelar TODOS os agendamentos pendentes do CRM deste contato
          await db.prepare(`
            UPDATE crm_scheduled 
            SET status = 'cancelled'
            WHERE phone = ? AND automation_id = ? AND status = 'pending'
          `).bind(item.phone, item.automation_id).run();
          
          if (item.conversation_id) {
            // Pausar IA do contato para não disparar mais nada no futuro
            await db.prepare(`
              UPDATE conversations 
              SET ai_active = 0, status = 'arquivado', updated_at = datetime('now')
              WHERE id = ?
            `).bind(item.conversation_id).run();

            // Registrar uma mensagem de log do sistema no histórico para fins de visualização no Chat
            await db.prepare(`
              INSERT INTO messages (id, conversation_id, content, role)
              VALUES (?, ?, ?, 'manual')
            `).bind(
              crypto.randomUUID(), 
              item.conversation_id, 
              '⚠️ IA Pausada Automaticamente: Possível bloqueio detectado (o contato removeu a foto de perfil ou as mensagens não foram entregues).'
            ).run();
          }

          console.log(`[CRM Cron] IA desativada e agendamentos de CRM cancelados para o lead bloqueador ${item.phone}.`);
          continue;
        }

        const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

        // 2c. Determinar a mensagem a enviar
        let messageTemplate: string = '';

        // Buscar estágio correspondente dinâmico no banco de dados
        const stage = await db.prepare(
          "SELECT * FROM automation_crm_stages WHERE automation_id = ? AND key = ? LIMIT 1"
        ).bind(item.automation_id, item.flow_type).first<any>();

        if (stage && stage.enabled === 0) {
          console.log(`[CRM Cron] Estágio ${item.flow_type} está desativado na automação ${item.automation_id}. Cancelando agendamento ${item.id}.`);
          await db.prepare(
            "UPDATE crm_scheduled SET status = 'cancelled' WHERE id = ?"
          ).bind(item.id).run();
          continue;
        }

        if (stage) {
          const rewriteMode = stage.rewrite_mode || 'none';
          const variationsText = stage.variations || '[]';
          
          if (rewriteMode === 'dynamic') {
            console.log(`[CRM Cron] Acionando LLM em tempo real para reescrever estágio ${stage.id} para ${item.phone}`);
            if (stage.message && stage.message.startsWith('[')) {
              try {
                const blocks = JSON.parse(stage.message) as any[];
                const textIdx = blocks.findIndex(f => f.type === "text");
                if (textIdx !== -1) {
                  const dynList = await rewriteMessageViaLLM(db, item.automation_id, blocks[textIdx].content, 1);
                  blocks[textIdx].content = dynList[0] || blocks[textIdx].content;
                }
                messageTemplate = JSON.stringify(blocks);
              } catch (e) {
                console.error("Erro no rewrite dinâmico de blocos CRM:", e);
                messageTemplate = stage.message;
              }
            } else {
              const dynList = await rewriteMessageViaLLM(db, item.automation_id, stage.message, 1);
              messageTemplate = dynList[0] || stage.message;
            }
          } else if (rewriteMode === 'static' && variationsText !== '[]') {
            try {
              const variationsList = JSON.parse(variationsText);
              if (Array.isArray(variationsList) && variationsList.length > 0) {
                // Rotação sequencial baseada no ID incremental do agendamento
                const index = Number(item.id) % variationsList.length;
                const rewrittenText = variationsList[index];
                console.log(`[CRM Cron] Rotação estática ativada (Var ${index + 1}/${variationsList.length}) para ${item.phone}`);

                if (stage.message && stage.message.startsWith('[')) {
                  const blocks = JSON.parse(stage.message) as any[];
                  const textIdx = blocks.findIndex(f => f.type === "text");
                  if (textIdx !== -1) {
                    blocks[textIdx].content = rewrittenText;
                  }
                  messageTemplate = JSON.stringify(blocks);
                } else {
                  messageTemplate = rewrittenText;
                }
              } else {
                messageTemplate = stage.message;
              }
            } catch {
              messageTemplate = stage.message;
            }
          } else {
            messageTemplate = stage.message;
          }
        } else {
          // Retrocompatibilidade se não encontrar estágio cadastrado
          const flowType = item.flow_type as 'satisfaction' | 'testimonial' | 'objection';
          if (config) {
            const configMsg = config[`${flowType}_message`];
            messageTemplate = configMsg || DEFAULT_MESSAGES[flowType] || DEFAULT_MESSAGES.satisfaction;
          } else {
            messageTemplate = DEFAULT_MESSAGES[flowType] || DEFAULT_MESSAGES.satisfaction;
          }
        }

        // Substituir variáveis & Enviar via WhatsApp
        const customerName = item.customer_name || 'cliente';
        const productName = item.product_name || 'nosso produto';
        let messageTextToLog = "";

        if (messageTemplate.startsWith('[')) {
          try {
            const fields = JSON.parse(messageTemplate) as any[];
            const messageLog: string[] = [];

            for (let i = 0; i < fields.length; i++) {
              const field = fields[i];
              if (i > 0) {
                await sleep(2000);
              }

              if (field.type === 'text') {
                let text = field.content
                  .replace(/\{\{primeiro_nome\}\}/g, customerName.split(/\s+/)[0])
                  .replace(/\{primeiro_nome\}/g, customerName.split(/\s+/)[0])
                  .replace(/\{\{primeiro_name\}\}/g, customerName.split(/\s+/)[0])
                  .replace(/\{primeiro_name\}/g, customerName.split(/\s+/)[0])
                  .replace(/\{\{nome\}\}/g, customerName)
                  .replace(/\{nome\}/g, customerName)
                  .replace(/\{\{nome_cliente\}\}/g, customerName)
                  .replace(/\{nome_cliente\}/g, customerName)
                  .replace(/\{\{produto\}\}/g, productName)
                  .replace(/\{produto\}/g, productName);
                
                const formatted = formatWhatsAppShortParagraphs(text);
                await sendText(db, whatsappApiId, item.phone, formatted, undefined, item.automation_id);
                messageLog.push(formatted);
              } else if (field.type === 'audio') {
                await sendAudio(db, whatsappApiId, item.phone, field.content, undefined, item.automation_id);
                messageLog.push(`[Áudio de CRM enviado]`);
              } else if (field.type === 'image') {
                await sendImage(db, whatsappApiId, item.phone, field.content, field.file_name || undefined, env.KV, item.automation_id);
                messageLog.push(`[Imagem enviada]`);
              } else if (field.type === 'video') {
                await sendVideo(db, whatsappApiId, item.phone, field.content, field.file_name || undefined, env.KV, item.automation_id);
                messageLog.push(`[Vídeo enviado]`);
              } else if (field.type === 'document') {
                await sendDocument(db, whatsappApiId, item.phone, field.content, field.file_name || 'documento.pdf', undefined, item.automation_id);
                messageLog.push(`[PDF de CRM enviado: ${field.file_name || 'documento'}]`);
              }
            }

            // Consolidar mensagens no banco
            for (const logText of messageLog) {
              if (item.conversation_id) {
                const msgId = crypto.randomUUID();
                await db.prepare(
                  "INSERT INTO messages (id, conversation_id, content, role) VALUES (?, ?, ?, 'assistant')"
                ).bind(msgId, item.conversation_id, logText).run();
                
                try {
                  const { notifyNewMessage } = await import("../services/realtime-service");
                  await notifyNewMessage(env, item.conversation_id, {
                    id: msgId,
                    content: logText,
                    role: 'assistant',
                  });
                } catch {}
              }
            }

            messageTextToLog = messageLog.filter(t => !t.startsWith('[') && !t.endsWith(']')).join('\n\n') || "Mensagem de CRM enviada";

          } catch (jsonErr) {
            console.error("[CRM Cron] Erro ao processar blocks JSON, caindo de volta para texto puro:", jsonErr);
            const messageText = messageTemplate
              .replace(/\{\{primeiro_nome\}\}/g, customerName.split(/\s+/)[0])
              .replace(/\{primeiro_nome\}/g, customerName.split(/\s+/)[0])
              .replace(/\{\{primeiro_name\}\}/g, customerName.split(/\s+/)[0])
              .replace(/\{primeiro_name\}/g, customerName.split(/\s+/)[0])
              .replace(/\{\{nome\}\}/g, customerName)
              .replace(/\{nome\}/g, customerName)
              .replace(/\{\{nome_cliente\}\}/g, customerName)
              .replace(/\{nome_cliente\}/g, customerName)
              .replace(/\{\{produto\}\}/g, productName)
              .replace(/\{produto\}/g, productName);
            const formatted = formatWhatsAppShortParagraphs(messageText);
            await sendText(db, whatsappApiId, item.phone, formatted, undefined, item.automation_id);
            messageTextToLog = formatted;

            if (item.conversation_id) {
              const msgId = crypto.randomUUID();
              await db.prepare(
                "INSERT INTO messages (id, conversation_id, content, role) VALUES (?, ?, ?, 'assistant')"
              ).bind(msgId, item.conversation_id, formatted).run();
              
              try {
                const { notifyNewMessage } = await import("../services/realtime-service");
                await notifyNewMessage(env, item.conversation_id, {
                  id: msgId,
                  content: formatted,
                  role: 'assistant',
                });
              } catch {}
            }
          }
        } else {
          const messageText = messageTemplate
            .replace(/\{\{primeiro_nome\}\}/g, customerName.split(/\s+/)[0])
            .replace(/\{primeiro_nome\}/g, customerName.split(/\s+/)[0])
            .replace(/\{\{primeiro_name\}\}/g, customerName.split(/\s+/)[0])
            .replace(/\{primeiro_name\}/g, customerName.split(/\s+/)[0])
            .replace(/\{\{nome\}\}/g, customerName)
            .replace(/\{nome\}/g, customerName)
            .replace(/\{\{nome_cliente\}\}/g, customerName)
            .replace(/\{nome_cliente\}/g, customerName)
            .replace(/\{\{produto\}\}/g, productName)
            .replace(/\{produto\}/g, productName);
          const formatted = formatWhatsAppShortParagraphs(messageText);
          await sendText(db, whatsappApiId, item.phone, formatted, undefined, item.automation_id);
          messageTextToLog = formatted;

          if (item.conversation_id) {
            const msgId = crypto.randomUUID();
            await db.prepare(
              "INSERT INTO messages (id, conversation_id, content, role) VALUES (?, ?, ?, 'assistant')"
            ).bind(msgId, item.conversation_id, formatted).run();
            
            try {
              const { notifyNewMessage } = await import("../services/realtime-service");
              await notifyNewMessage(env, item.conversation_id, {
                id: msgId,
                content: formatted,
                role: 'assistant',
              });
            } catch {}
          }
        }

        // Reativar IA da conversa para que o Agente de CRM possa interagir se o cliente responder!
        if (item.conversation_id) {
          await db.prepare(
            "UPDATE conversations SET ai_active = 1, updated_at = datetime('now') WHERE id = ?"
          ).bind(item.conversation_id).run();
          
          try {
            const { notifyConversationUpdated } = await import("../services/realtime-service");
            await notifyConversationUpdated(env, item.conversation_id, {
              ai_active: 1,
              updated_at: new Date().toISOString()
            });
          } catch {}
        }

        // 2e. Criar registro em crm_responses
        const responseId = crypto.randomUUID();
        await db.prepare(`
          INSERT INTO crm_responses (
            id, product_id, automation_id, phone, lead_name,
            flow_type, status, question_sent, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'sent', ?, datetime('now'))
        `).bind(
          responseId,
          item.product_id || null,
          item.automation_id || null,
          item.phone,
          customerName || null,
          item.flow_type,
          messageTextToLog,
        ).run();

        // 2f. Atualizar status do agendamento
        await db.prepare(
          "UPDATE crm_scheduled SET status = 'sent' WHERE id = ?"
        ).bind(item.id).run();

        processed++;
        console.log(`[CRM Cron] Mensagem ${item.flow_type} enviada para ${item.phone} (produto: ${productName})`);
      } catch (itemErr: any) {
        console.error(`[CRM Cron] Erro ao processar item ${item.id}:`, itemErr);
        // Marcar como erro para não reprocessar infinitamente
        try {
          await db.prepare(
            "UPDATE crm_scheduled SET status = 'error' WHERE id = ?"
          ).bind(item.id).run();
        } catch {
          // Ignorar erro ao atualizar status
        }
      }
    }

    console.log(`[CRM Cron] Processamento concluído: ${processed}/${items.length} mensagens enviadas`);
  } catch (err: any) {
    console.error("[CRM Cron] Erro geral no processamento:", err);
  }

  return processed;
}
