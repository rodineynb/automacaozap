import { Hono } from "hono";
import type { Env } from "../app";
import { rewriteMessageViaLLM } from "../services/llm-service";

export const followupRoutes = new Hono<{ Bindings: Env }>();

const DEFAULT_TEMPLATES = {
  vigia_message: `*{{nome}}*, dá uma olhadinha no vídeo aqui em cima! 😍\n\nSei que o dia a dia é corrido, mas não queria que você perdesse a chance de mudar sua jornada com os doces.\n\nSó hoje, consigo liberar para você o nosso *Kit Completo de Confeitaria* — com videoaulas passo a passo, apostila de massas, bolos no pote e todas as atualizações de graça por apenas *R$ 19,90*!\n\n💰 *Pix (Celular):* 61982277206\n\nGostaria que eu te liberasse o acesso agora mesmo? 💕`,
  finalizador_message: `*{{nome}}*, essa é a minha última mensagem por aqui pra não te incomodar, tá? Mas eu precisava te dar essa oportunidade final... 🙏\n\nVou liberar todo o nosso *Kit Completo* de Confeitaria, vitalício e com videoaulas por apenas *R$ 12,90* agora, Pix Cora.\n\n💰 *Chave Pix (Celular):* 61982277206\n\nÉ a sua última chance de começar a lucrar de verdade! Se quiser aproveitar, faz o Pix e me manda o comprovante aqui. Que Deus abençoe muito a sua jornada confeiteira! 🤗`,
  incentivador_message: `*{{nome}}*, viu esse vídeo lindo de fatias que te mandei aqui em cima? 🍰😍\n\nSó de olhar já dá água na boca! Cada fatia dessa você vende facilmente por *R$ 8,00 a R$ 12,00* na sua vizinhança ou pelas redes sociais.\n\nOu seja, fazendo o Pix de apenas *R$ 10,00* pelas nossas receitas sem fogão (que economizam muito gás!), você recupera todo o seu investimento na venda de um único pedaço de bolo!\n\n💰 *Pix (Celular):* 61982277206\n*Destinatário:* R G FEITOSA 153DF\n\nDá uma olhadinha nos arquivos que te mandei e me conta se ficou alguma dúvida! Estou torcendo muito pelo seu sucesso! 💕`,
  cobrador_amigo_message: `Oi, *{{nome}}*! Tudo bem? Passando só pra te mandar um abraço e ver se deu certo de abrir as apostilas! 🤗\n\nSei bem que a nossa rotina na cozinha é uma loucura e às vezes a gente acaba esquecendo das coisas!\n\nEu confio muito na sua honestidade e no seu trabalho, tá? Quando tiver um tempinho, você pode fazer o Pix de *R$ 10,00* por aqui:\n\n💰 *Pix (Celular):* 61982277206\n*Destinatário:* R G FEITOSA 153DF\n\nQualquer coisa me avisa, estou aqui! 💕`,
  cobrador_curioso_message: `*{{nome}}*! Tudo bem? Menina, fiquei curiosa aqui... 🤭\n\nVocê conseguiu dar uma olhada na receita do *Recheio Cremoso de Ninho* ou no de *Chocolate Trufado* que estão na apostila 1? Eles não vão ao fogo e ficam absurdamente firmes!\n\nSei que a correria está grande, mas se puder dar aquela forcinha fazendo o Pix de *R$ 10,00* da nossa apostila, me ajuda muito a continuar produzindo esses materiais com tanto carinho!\n\n💰 *Pix (Celular):* 61982277206\n*Destinatário:* R G FEITOSA 153DF\n\nUma semana abençoada pra você e boas fornadas! 🍰✨`,
  cobrador_final_message: `*{{nome}}*, estou passando pra te fazer a minha proposta final e te dar um presente de verdade para encerrarmos nossa conversa! 💕\n\nComo você já está com as receitas, se fizer o Pix de *R$ 10,00* hoje, eu vou te liberar de graça todo o nosso *Kit Completo de Confeitaria* (vitalício, com videoaulas, massas e brigadeiros sem fogo)!\n\nÉ isso mesmo: o Kit Completo que custa R$ 25,00 sai por apenas *R$ 10,00* pra você começar com o pé direito! Mas esse link expira *hoje à meia-noite*, tá?\n\n💰 *Pix (Celular):* 61982277206\n*Destinatário:* R G FEITOSA 153DF\n\nFaz o Pix, me manda o comprovante aqui que eu te matriculo na hora com tudo liberado! Um abraço forte e muito sucesso na cozinha! 🤗`
};

// Classificação dos follow-ups em 2 classes
const REENGAJAMENTO_TYPES = [
  'followup_vigia_15min',
  'followup_finalizador_12h',
];

const COBRANCA_TYPES = [
  'followup_incentivador_1h',
  'followup_cobrador_amigo_10h',
  'followup_cobrador_curioso_34h',
  'followup_cobrador_final_58h',
];

// ============================================================
// 1. GET /dashboard — Métricas Gerais de Follow-ups
// ============================================================
followupRoutes.get("/dashboard", async (c) => {
  const db = c.env.DB;
  const automationId = c.req.query("automation_id") || null;
  const dateFrom = c.req.query("data_inicio");
  const dateTo = c.req.query("data_fim");

  try {
    // Filtro opcional por automação (via conversations → automations)
    const automationJoin = automationId
      ? `JOIN conversations conv_f ON sf.conversation_id = conv_f.id AND conv_f.automation_id = '${automationId}'`
      : '';

    let dateConditions = "";
    const dateParams: string[] = [];
    if (dateFrom && dateTo) {
      dateConditions = " AND sf.executed_at >= ? AND sf.executed_at <= ?";
      dateParams.push(`${dateFrom} 00:00:00`, `${dateTo} 23:59:59`);
    }

    // 1. Total Enviado
    const totalSentRes = await db.prepare(`
      SELECT COUNT(*) as total FROM scheduled_followups sf
      ${automationJoin}
      WHERE sf.status = 'executed' ${dateConditions}
    `).bind(...dateParams).first<{ total: number }>();
    const totalSent = totalSentRes?.total || 0;

    // 2. Total Respostas (lead respondeu dentro de 24h após o follow-up)
    const totalRepliesRes = await db.prepare(`
      SELECT COUNT(DISTINCT sf.conversation_id) as total
      FROM scheduled_followups sf
      ${automationJoin}
      JOIN messages m ON m.conversation_id = sf.conversation_id
      WHERE sf.status = 'executed'
        AND m.role = 'user'
        AND m.created_at > sf.executed_at
        AND m.created_at <= datetime(sf.executed_at, '+24 hours')
        ${dateConditions}
    `).bind(...dateParams).first<{ total: number }>();
    const totalReplies = totalRepliesRes?.total || 0;

    // 3. Total Conversões — ATRIBUIÇÃO AO ÚLTIMO FOLLOW-UP
    // Para cada lead que pagou, encontrar o ÚLTIMO follow-up executado antes do pagamento
    // Apenas esse follow-up recebe crédito pela conversão
    const totalConversionsRes = await db.prepare(`
      SELECT COUNT(DISTINCT sf.conversation_id) as total
      FROM scheduled_followups sf
      JOIN conversation_state cs ON sf.conversation_id = cs.conversation_id
      ${automationJoin}
      WHERE sf.status = 'executed'
        AND cs.payment_confirmed = 1
        AND sf.executed_at = (
          SELECT MAX(sf2.executed_at)
          FROM scheduled_followups sf2
          WHERE sf2.conversation_id = sf.conversation_id
            AND sf2.status = 'executed'
            AND sf2.executed_at < cs.updated_at
        )
        ${dateConditions}
    `).bind(...dateParams).first<{ total: number }>();
    const totalConversions = totalConversionsRes?.total || 0;

    // 4. Detalhamento por Tipo — Enviados
    const sentByType = await db.prepare(`
      SELECT sf.type, COUNT(*) as sent 
      FROM scheduled_followups sf
      ${automationJoin}
      WHERE sf.status = 'executed' ${dateConditions}
      GROUP BY sf.type
    `).bind(...dateParams).all<{ type: string; sent: number }>();

    // 5. Detalhamento por Tipo — Respostas
    const repliesByType = await db.prepare(`
      SELECT sf.type, COUNT(DISTINCT sf.conversation_id) as replies
      FROM scheduled_followups sf
      ${automationJoin}
      JOIN messages m ON m.conversation_id = sf.conversation_id
      WHERE sf.status = 'executed'
        AND m.role = 'user'
        AND m.created_at > sf.executed_at
        AND m.created_at <= datetime(sf.executed_at, '+24 hours')
        ${dateConditions}
      GROUP BY sf.type
    `).bind(...dateParams).all<{ type: string; replies: number }>();

    // 6. Detalhamento por Tipo — Conversões (último follow-up antes do pagamento)
    const conversionsByType = await db.prepare(`
      SELECT sf.type, COUNT(DISTINCT sf.conversation_id) as conversions
      FROM scheduled_followups sf
      JOIN conversation_state cs ON sf.conversation_id = cs.conversation_id
      ${automationJoin}
      WHERE sf.status = 'executed'
        AND cs.payment_confirmed = 1
        AND sf.executed_at = (
          SELECT MAX(sf2.executed_at)
          FROM scheduled_followups sf2
          WHERE sf2.conversation_id = sf.conversation_id
            AND sf2.status = 'executed'
            AND sf2.executed_at < cs.updated_at
        )
        ${dateConditions}
      GROUP BY sf.type
    `).bind(...dateParams).all<{ type: string; conversions: number }>();

    // Agrupar detalhamento com classificação
    const breakdownMap: Record<string, { type: string; sent: number; replies: number; conversions: number; class: string }> = {};
    
    for (const t of REENGAJAMENTO_TYPES) {
      breakdownMap[t] = { type: t, sent: 0, replies: 0, conversions: 0, class: 'reengajamento' };
    }
    for (const t of COBRANCA_TYPES) {
      breakdownMap[t] = { type: t, sent: 0, replies: 0, conversions: 0, class: 'cobranca' };
    }
    // Upsells como classe separada
    breakdownMap['upsell_5min'] = { type: 'upsell_5min', sent: 0, replies: 0, conversions: 0, class: 'upsell' };
    breakdownMap['upsell_10min'] = { type: 'upsell_10min', sent: 0, replies: 0, conversions: 0, class: 'upsell' };

    const normalizeType = (type: string): string => {
      if (type === 'vigia' || type === 'followup_vigia_15min') return 'followup_vigia_15min';
      if (type === 'finalizador' || type === 'followup_finalizador_12h') return 'followup_finalizador_12h';
      if (type === 'incentivador' || type === 'followup_incentivador_1h') return 'followup_incentivador_1h';
      if (type === 'cobrador_amigo' || type === 'followup_cobrador_amigo_10h') return 'followup_cobrador_amigo_10h';
      if (type === 'cobrador_curioso' || type === 'followup_cobrador_curioso_34h') return 'followup_cobrador_curioso_34h';
      if (type === 'cobrador_final' || type === 'followup_cobrador_final_58h') return 'followup_cobrador_final_58h';
      return type;
    };

    for (const r of (sentByType.results || [])) {
      const normType = normalizeType(r.type);
      if (breakdownMap[normType]) breakdownMap[normType].sent += r.sent;
    }
    for (const r of (repliesByType.results || [])) {
      const normType = normalizeType(r.type);
      if (breakdownMap[normType]) breakdownMap[normType].replies += r.replies;
    }
    for (const r of (conversionsByType.results || [])) {
      const normType = normalizeType(r.type);
      if (breakdownMap[normType]) breakdownMap[normType].conversions += r.conversions;
    }

    return c.json({
      total_sent: totalSent,
      total_replies: totalReplies,
      total_conversions: totalConversions,
      conversion_rate: totalSent > 0 ? Math.round((totalConversions / totalSent) * 1000) / 10 : 0,
      breakdown: Object.values(breakdownMap)
    });
  } catch (err: any) {
    console.error("[Followup Dashboard] Erro:", err);
    return c.json({ error: "Erro ao buscar métricas de follow-up", details: err.message }, 500);
  }
});

// ============================================================
// 2. GET /config/:automationId — Configurações de uma Automação
// ============================================================
followupRoutes.get("/config/:automationId", async (c) => {
  const db = c.env.DB;
  const automationId = c.req.param("automationId");

  try {
    // 1. Verificar se a automação existe
    const autoExists = await db.prepare("SELECT id, use_llm_variations FROM automations WHERE id = ?").bind(automationId).first<{ id: string; use_llm_variations: number }>();
    if (!autoExists) {
      return c.json({ error: "Automação não encontrada" }, 404);
    }

    // 2. Checar contagem de estágios na tabela de estágios
    const countRes = await db.prepare(
      "SELECT COUNT(*) as count FROM automation_followup_stages WHERE automation_id = ?"
    ).bind(automationId).first<{ count: number }>();

    if (!countRes || countRes.count === 0) {
      // Popular com os templates padrão (retrocompatibilidade)
      const defaultStages = [
        { key: 'vigia', name: 'Vigia', class: 'reengajamento', delay: 15, message: DEFAULT_TEMPLATES.vigia_message, tag: 'followup_vigia' },
        { key: 'finalizador', name: 'Finalizador', class: 'reengajamento', delay: 720, message: DEFAULT_TEMPLATES.finalizador_message, tag: 'followup_finalizador' },
        { key: 'incentivador', name: 'Incentivador', class: 'cobranca', delay: 60, message: DEFAULT_TEMPLATES.incentivador_message, tag: 'followup_incentivador' },
        { key: 'cobrador_amigo', name: 'Cobrador Amigo', class: 'cobranca', delay: 600, message: DEFAULT_TEMPLATES.cobrador_amigo_message, tag: 'followup_cobrador_amigo' },
        { key: 'cobrador_curioso', name: 'Cobrador Curioso', class: 'cobranca', delay: 2040, message: DEFAULT_TEMPLATES.cobrador_curioso_message, tag: 'followup_cobrador_curioso' },
        { key: 'cobrador_final', name: 'Cobrador Final', class: 'cobranca', delay: 3480, message: DEFAULT_TEMPLATES.cobrador_final_message, tag: 'followup_cobrador_final' }
      ];

      for (const s of defaultStages) {
        await db.prepare(`
          INSERT INTO automation_followup_stages (id, automation_id, key, name, class, enabled, delay_minutes, message, tag_to_add)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
        `).bind(crypto.randomUUID(), automationId, s.key, s.name, s.class, s.delay, s.message, s.tag).run();
      }
    }

    // 3. Carregar todos os estágios ordenados por sort_order
    const stages = await db.prepare(
      "SELECT * FROM automation_followup_stages WHERE automation_id = ? ORDER BY sort_order ASC, delay_minutes ASC"
    ).bind(automationId).all();

    return c.json({
      data: {
        automation_id: automationId,
        use_llm_variations: autoExists.use_llm_variations || 0,
        stages: stages.results || []
      }
    });
  } catch (err: any) {
    console.error("[Followup Config] Erro:", err);
    return c.json({ error: "Erro ao buscar configurações de follow-up", details: err.message }, 500);
  }
});

// ============================================================
// ============================================================
// 3. POST /config/:automationId/stages — Criar Estágio
// ============================================================
followupRoutes.post("/config/:automationId/stages", async (c) => {
  const db = c.env.DB;
  const automationId = c.req.param("automationId");

  try {
    const body = await c.req.json<{
      name: string;
      class: 'reengajamento' | 'cobranca';
      delay_minutes: number;
      message: string;
      tag_to_add?: string;
      rewrite_mode?: 'none' | 'dynamic' | 'static';
      rewrite_count?: number;
    }>();

    if (!body.name || !body.class || !body.message || !body.delay_minutes) {
      return c.json({ error: "Campos obrigatórios ausentes" }, 400);
    }

    // Gerar slug a partir do nome
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
    
    let variationsList: string[] = [];
    if (rewriteMode === 'static') {
      let textToRewrite = body.message;
      if (body.message && body.message.startsWith('[')) {
        try {
          const blocks = JSON.parse(body.message) as any[];
          const textFields = blocks.filter(f => f.type === "text");
          textToRewrite = textFields.length > 0 ? textFields[0].content : "";
        } catch (e) {
          console.error("Erro ao fazer parse dos blocos de follow-up:", e);
        }
      }
      if (textToRewrite) {
        variationsList = await rewriteMessageViaLLM(db, automationId, textToRewrite, rewriteCount);
      }
    }
    const variationsJson = JSON.stringify(variationsList);

    await db.prepare(`
      INSERT INTO automation_followup_stages (id, automation_id, key, name, class, enabled, delay_minutes, message, tag_to_add, rewrite_mode, rewrite_count, variations)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      automationId,
      key,
      body.name,
      body.class,
      body.delay_minutes,
      body.message,
      body.tag_to_add || null,
      rewriteMode,
      rewriteCount,
      variationsJson
    ).run();

    const created = await db.prepare("SELECT * FROM automation_followup_stages WHERE id = ?").bind(id).first();

    return c.json({ data: created, message: "Estágio de follow-up criado com sucesso!" });
  } catch (err: any) {
    console.error("[Followup Add Stage] Erro:", err);
    return c.json({ error: "Erro ao criar estágio de follow-up", details: err.message }, 500);
  }
});

// ============================================================
// 4. PUT /config/:automationId/stages/:stageId — Editar Estágio
// ============================================================
followupRoutes.put("/config/:automationId/stages/:stageId", async (c) => {
  const db = c.env.DB;
  const stageId = c.req.param("stageId");
  const automationId = c.req.param("automationId");

  try {
    const body = await c.req.json<{
      name?: string;
      delay_minutes?: number;
      message?: string;
      tag_to_add?: string | null;
      enabled?: number;
      rewrite_mode?: 'none' | 'dynamic' | 'static';
      rewrite_count?: number;
    }>();

    // Carregar estágio existente
    const existing = await db.prepare("SELECT * FROM automation_followup_stages WHERE id = ?").bind(stageId).first<any>();
    if (!existing) {
      return c.json({ error: "Estágio de follow-up não encontrado" }, 404);
    }

    const name = body.name ?? existing.name;
    const delay = body.delay_minutes ?? existing.delay_minutes;
    const message = body.message ?? existing.message;
    const tag = body.tag_to_add !== undefined ? body.tag_to_add : existing.tag_to_add;
    const enabled = body.enabled !== undefined ? body.enabled : existing.enabled;
    const rewriteMode = body.rewrite_mode ?? existing.rewrite_mode ?? 'none';
    const rewriteCount = Number(body.rewrite_count ?? existing.rewrite_count ?? 5);

    let variationsJson = existing.variations || '[]';

    // Gerar variações se:
    // 1. O modo passou a ser 'static' (e antes não era, ou variações estavam vazias)
    // 2. Ou se o modo já era 'static' e a mensagem ou a quantidade de variações mudou
    const modeChangedToStatic = rewriteMode === 'static' && (existing.rewrite_mode !== 'static' || variationsJson === '[]');
    const countChangedInStatic = rewriteMode === 'static' && rewriteCount !== existing.rewrite_count;
    const messageChangedInStatic = rewriteMode === 'static' && body.message !== undefined && body.message !== existing.message;

    if (modeChangedToStatic || countChangedInStatic || messageChangedInStatic) {
      console.log(`[LLM Rewrite] Pré-gerando ${rewriteCount} variações para o estágio de follow-up ${stageId}`);
      let textToRewrite = message;
      if (message && message.startsWith('[')) {
        try {
          const blocks = JSON.parse(message) as any[];
          const textFields = blocks.filter(f => f.type === "text");
          textToRewrite = textFields.length > 0 ? textFields[0].content : "";
        } catch (e) {
          console.error("Erro ao fazer parse dos blocos de follow-up:", e);
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
      UPDATE automation_followup_stages
      SET name = ?, delay_minutes = ?, message = ?, tag_to_add = ?, enabled = ?, rewrite_mode = ?, rewrite_count = ?, variations = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(name, delay, message, tag, enabled, rewriteMode, rewriteCount, variationsJson, stageId).run();

    const updated = await db.prepare("SELECT * FROM automation_followup_stages WHERE id = ?").bind(stageId).first();

    return c.json({ data: updated, message: "Estágio de follow-up atualizado com sucesso!" });
  } catch (err: any) {
    console.error("[Followup Edit Stage] Erro:", err);
    return c.json({ error: "Erro ao editar estágio de follow-up", details: err.message }, 500);
  }
});

// ============================================================
// 5. DELETE /config/:automationId/stages/:stageId — Deletar Estágio
// ============================================================
followupRoutes.delete("/config/:automationId/stages/:stageId", async (c) => {
  const db = c.env.DB;
  const stageId = c.req.param("stageId");

  try {
    const existing = await db.prepare("SELECT * FROM automation_followup_stages WHERE id = ?").bind(stageId).first();
    if (!existing) {
      return c.json({ error: "Estágio de follow-up não encontrado" }, 404);
    }

    await db.prepare("DELETE FROM automation_followup_stages WHERE id = ?").bind(stageId).run();

    return c.json({ message: "Estágio de follow-up removido com sucesso!" });
  } catch (err: any) {
    console.error("[Followup Delete Stage] Erro:", err);
    return c.json({ error: "Erro ao remover estágio de follow-up", details: err.message }, 500);
  }
});

// ============================================================
// 5.1. PUT /config/:automationId/reorder — Reordenar Estágios de Follow-up
// ============================================================
followupRoutes.put("/config/:automationId/reorder", async (c) => {
  const db = c.env.DB;
  const automationId = c.req.param("automationId");

  try {
    const body = await c.req.json<{ stages: { id: string; sort_order: number }[] }>();
    if (!body.stages || !Array.isArray(body.stages)) {
      return c.json({ error: "Lista de estágios inválida" }, 400);
    }

    const statements = body.stages.map((s) => {
      return db.prepare(
        "UPDATE automation_followup_stages SET sort_order = ? WHERE id = ? AND automation_id = ?"
      ).bind(s.sort_order, s.id, automationId);
    });

    await db.batch(statements);

    return c.json({ message: "Ordenação de follow-ups atualizada com sucesso!" });
  } catch (err: any) {
    console.error("[Followup Stages Reorder] Erro:", err);
    return c.json({ error: "Erro ao reordenar estágios de follow-up", details: err.message }, 500);
  }
});

// ============================================================
// 6. PUT /config/:automationId/global — Salvar Variações LLM
// ============================================================
followupRoutes.put("/config/:automationId/global", async (c) => {
  const db = c.env.DB;
  const automationId = c.req.param("automationId");

  try {
    const body = await c.req.json<{ use_llm_variations: number }>();
    
    await db.prepare(
      "UPDATE automations SET use_llm_variations = ? WHERE id = ?"
    ).bind(body.use_llm_variations ?? 0, automationId).run();

    return c.json({ message: "Configuração global de follow-up atualizada com sucesso!" });
  } catch (err: any) {
    console.error("[Followup Global Config] Erro:", err);
    return c.json({ error: "Erro ao salvar configuração global", details: err.message }, 500);
  }
});


// ============================================================
// 4. GET /logs — Histórico de Execução com Filtros
// ============================================================
followupRoutes.get("/logs", async (c) => {
  const db = c.env.DB;
  const page = parseInt(c.req.query("page") || "1", 10);
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const offset = (page - 1) * limit;

  // Filtros
  const automationSlug = c.req.query("automation_slug") || null;
  const dateFrom = c.req.query("date_from") || null;
  const dateTo = c.req.query("date_to") || null;
  const classFilter = c.req.query("class") || null; // 'reengajamento' | 'cobranca'

  try {
    // Construir cláusulas WHERE dinâmicas
    const conditions: string[] = [];
    const binds: any[] = [];

    if (automationSlug) {
      conditions.push("sf.automation_slug = ?");
      binds.push(automationSlug);
    }

    if (dateFrom) {
      conditions.push("sf.created_at >= ?");
      binds.push(dateFrom + "T00:00:00");
    }

    if (dateTo) {
      conditions.push("sf.created_at <= ?");
      binds.push(dateTo + "T23:59:59");
    }

    if (classFilter === 'reengajamento') {
      const typesList = REENGAJAMENTO_TYPES.map(t => `'${t}'`).join(',');
      conditions.push(`sf.type IN (${typesList})`);
    } else if (classFilter === 'cobranca') {
      const typesList = COBRANCA_TYPES.map(t => `'${t}'`).join(',');
      conditions.push(`sf.type IN (${typesList})`);
    }

    const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    // Count total
    const countQuery = `SELECT COUNT(*) as total FROM scheduled_followups sf ${whereClause}`;
    const countStmt = db.prepare(countQuery);
    const totalRes = binds.length > 0
      ? await countStmt.bind(...binds).first<{ total: number }>()
      : await countStmt.first<{ total: number }>();
    const total = totalRes?.total || 0;

    // Fetch logs com JOINs
    const logsQuery = `
      SELECT sf.*, ct.phone, ct.name as customer_name, a.name as automation_name
      FROM scheduled_followups sf
      JOIN conversations conv ON sf.conversation_id = conv.id
      JOIN contacts ct ON conv.contact_id = ct.id
      JOIN automations a ON conv.automation_id = a.id
      ${whereClause}
      ORDER BY sf.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const logBinds = [...binds, limit, offset];
    const logsStmt = db.prepare(logsQuery);
    const logs = await logsStmt.bind(...logBinds).all();

    return c.json({
      data: logs.results || [],
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    });
  } catch (err: any) {
    console.error("[Followup Logs] Erro:", err);
    return c.json({ error: "Erro ao buscar logs de follow-up", details: err.message }, 500);
  }
});

// ============================================================
// 5. GET /automations — Listar automações para o dropdown de filtro
// ============================================================
followupRoutes.get("/automations", async (c) => {
  const db = c.env.DB;
  try {
    const result = await db.prepare(
      "SELECT id, name, slug FROM automations WHERE status = 'active' ORDER BY name"
    ).all<{ id: string; name: string; slug: string }>();
    return c.json({ data: result.results || [] });
  } catch (err: any) {
    return c.json({ error: "Erro ao listar automações", details: err.message }, 500);
  }
});
