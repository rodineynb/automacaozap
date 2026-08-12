import { Hono } from "hono";
import type { Env } from "../app";

export const reportsRoutes = new Hono<{ Bindings: Env }>();

// GET /api/reports/fallbacks — Listar logs de fallbacks
reportsRoutes.get("/fallbacks", async (c) => {
  const db = c.env.DB;
  const dateFrom = c.req.query("data_inicio");
  const dateTo = c.req.query("data_fim");

  // Cleanup de logs antigos a cada carregamento de página (por segurança e consistência)
  try {
    await cleanupOldFallbackLogs(db);
  } catch (err) {
    console.error("[FallbackRoutes] Erro na autolimpeza de logs antigos:", err);
  }

  try {
    let query = `
      SELECT fl.*, a.name as automation_name
      FROM fallback_logs fl
      LEFT JOIN automations a ON fl.automation_id = a.id
    `;
    const params: any[] = [];

    if (dateFrom && dateTo) {
      query += " WHERE fl.created_at >= ? AND fl.created_at <= ?";
      params.push(`${dateFrom} 00:00:00`, `${dateTo} 23:59:59`);
    }

    query += " ORDER BY fl.created_at DESC LIMIT 300";

    const logs = await db.prepare(query).bind(...params).all();

    return c.json({ data: logs.results || [] });
  } catch (err: any) {
    console.error("[FallbackRoutes] Erro ao buscar logs de fallback:", err);
    return c.json({ error: "Erro ao buscar logs de fallback", details: err.message }, 500);
  }
});

// GET /api/reports/dispatches — Listar logs de envios de mensagens (7 dias) com paginação e filtros
reportsRoutes.get("/dispatches", async (c) => {
  const db = c.env.DB;
  const automationId = c.req.query("automation_id");
  const status = c.req.query("status");
  const dateFrom = c.req.query("data_inicio");
  const dateTo = c.req.query("data_fim");
  const search = c.req.query("busca"); // número de telefone ou conteúdo
  const page = parseInt(c.req.query("page") || "1", 10);
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const offset = (page - 1) * limit;

  try {
    const conditions: string[] = [];
    const params: any[] = [];

    if (automationId && automationId !== "all") {
      conditions.push("dl.automation_id = ?");
      params.push(automationId);
    }

    if (status && status !== "all") {
      conditions.push("dl.status = ?");
      params.push(status);
    }

    if (dateFrom && dateTo) {
      conditions.push("dl.sent_at >= ? AND dl.sent_at <= ?");
      params.push(`${dateFrom} 00:00:00`, `${dateTo} 23:59:59`);
    }

    if (search) {
      conditions.push("(dl.phone LIKE ? OR dl.message_content LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // 1. Contagem total
    const countResult = await db.prepare(
      `SELECT COUNT(*) as total FROM dispatch_logs dl ${whereClause}`
    ).bind(...params).first<{ total: number }>();
    const total = countResult?.total || 0;

    // 2. Logs de Disparos paginados
    const logs = await db.prepare(`
      SELECT dl.*, a.name as automation_name
      FROM dispatch_logs dl
      LEFT JOIN automations a ON dl.automation_id = a.id
      ${whereClause}
      ORDER BY dl.sent_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();

    // 3. Stats do período filtrado
    let statsQuery = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN dl.status = 'success' THEN 1 ELSE 0 END) as success_count,
        SUM(CASE WHEN dl.status = 'error' THEN 1 ELSE 0 END) as error_count
      FROM dispatch_logs dl
      ${whereClause}
    `;
    const statsResult = await db.prepare(statsQuery).bind(...params).first<{ total: number; success_count: number; error_count: number }>();

    // 4. Stats globais dos últimos 7 dias (para ter o panorama da semana)
    let last7DaysQuery = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN dl.status = 'success' THEN 1 ELSE 0 END) as success_count,
        SUM(CASE WHEN dl.status = 'error' THEN 1 ELSE 0 END) as error_count
      FROM dispatch_logs dl
      WHERE dl.sent_at >= datetime('now', '-7 days')
    `;
    let last7DaysParams: any[] = [];
    if (automationId && automationId !== "all") {
      last7DaysQuery += " AND dl.automation_id = ?";
      last7DaysParams.push(automationId);
    }
    const last7DaysResult = await db.prepare(last7DaysQuery).bind(...last7DaysParams).first<{ total: number; success_count: number; error_count: number }>();

    return c.json({
      data: logs.results || [],
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
      stats: {
        filtered: {
          total: statsResult?.total || 0,
          success: statsResult?.success_count || 0,
          error: statsResult?.error_count || 0,
          success_rate: (statsResult?.total || 0) > 0 
            ? Math.round(((statsResult?.success_count || 0) / (statsResult?.total || 1)) * 100) 
            : 0
        },
        last7days: {
          total: last7DaysResult?.total || 0,
          success: last7DaysResult?.success_count || 0,
          error: last7DaysResult?.error_count || 0,
          success_rate: (last7DaysResult?.total || 0) > 0 
            ? Math.round(((last7DaysResult?.success_count || 0) / (last7DaysResult?.total || 1)) * 100) 
            : 0
        }
      }
    });
  } catch (err: any) {
    console.error("[ReportsRoutes] Erro ao buscar logs de disparos:", err);
    return c.json({ error: "Erro ao buscar logs de disparos", details: err.message }, 500);
  }
});

// GET /api/reports/funnel/:automationId/export — Exportar Mapa de Funil Completo (Markdown)
reportsRoutes.get("/funnel/:automationId/export", async (c) => {
  const db = c.env.DB;
  const automationId = c.req.param("automationId");

  try {
    // 1. Buscar a automação
    const auto = await db.prepare("SELECT * FROM automations WHERE id = ?").bind(automationId).first<any>();
    if (!auto) {
      return c.text("Automação não encontrada", 404);
    }

    const slug = auto.slug || "";
    const name = auto.name || "Sem Nome";

    // 2. Buscar produtos vinculados
    const productsRes = await db.prepare(`
      SELECT p.* FROM products p
      JOIN product_automations pa ON p.id = pa.product_id
      WHERE pa.automation_id = ?
    `).bind(automationId).all<any>();
    const products = productsRes.results || [];

    // 3. Buscar ofertas, mídias e acessos para cada produto
    const productsDetails: any[] = [];
    for (const prod of products) {
      const offersRes = await db.prepare("SELECT * FROM product_offers WHERE product_id = ?").bind(prod.id).all<any>();
      const assetsRes = await db.prepare("SELECT * FROM product_assets WHERE product_id = ?").bind(prod.id).all<any>();
      const linksRes = await db.prepare("SELECT * FROM product_delivery_links WHERE product_id = ?").bind(prod.id).all<any>();

      productsDetails.push({
        ...prod,
        offers: offersRes.results || [],
        assets: assetsRes.results || [],
        links: linksRes.results || []
      });
    }

    // 4. Buscar estágios de follow-up
    const followupsRes = await db.prepare(`
      SELECT * FROM automation_followup_stages 
      WHERE automation_id = ? 
      ORDER BY class, delay_minutes
    `).bind(automationId).all<any>();
    const followups = followupsRes.results || [];

    // 5. Buscar estágios de CRM
    const crmRes = await db.prepare(`
      SELECT * FROM automation_crm_stages 
      WHERE automation_id = ? 
      ORDER BY delay_hours
    `).bind(automationId).all<any>();
    const crmStages = crmRes.results || [];

    // 6. Montar o documento Markdown das Mensagens do Funil
    let md = "";
    md += `# 💬 Mensagens do Funil: ${name}\n\n`;
    md += `Este documento apresenta todas as mensagens, áudios, imagens, PDFs e réguas de follow-up/CRM ativas para a automação **${name}**.\n\n`;
    md += `---\n\n`;

    // 6a. Buscar os estágios de funil e seus campos do banco D1
    const stageKeys = ["welcome", "delivery", "ticket_boost", "ticket_boost_declined", "upsell", "downsell"];
    const stageNames: Record<string, string> = {
      welcome: "👋 Boas-vindas",
      delivery: "📦 Entrega / Oferta",
      ticket_boost: "⚡ Oferta Especial",
      ticket_boost_declined: "💝 Presente Especial",
      upsell: "🚀 Upsell",
      downsell: "🎁 Downsell",
    };

    md += `## 🔄 Etapas Principais do Funil de Atendimento\n\n`;

    for (const key of stageKeys) {
      const stageName = stageNames[key] || key;
      const stage = await db.prepare(
        "SELECT id, stage_key, enabled, delay_minutes FROM automation_funnel_stages WHERE automation_id = ? AND stage_key = ?"
      ).bind(automationId, key).first<any>();

      if (stage) {
        const statusStr = stage.enabled === 1 ? "🟢 Ativo" : "🔴 Inativo";
        const delayStr = key === "upsell" ? ` (Atraso: ${stage.delay_minutes}min após entrega)` : "";
        md += `### ${stageName} [${statusStr}${delayStr}]\n\n`;

        const fieldsRes = await db.prepare(
          "SELECT type, content, file_name FROM automation_funnel_fields WHERE stage_id = ? ORDER BY sort_order ASC"
        ).bind(stage.id).all<any>();
        const fields = fieldsRes.results || [];

        if (fields.length === 0) {
          md += `*Sem mensagens ou mídias cadastradas para esta etapa.*\n\n`;
        } else {
          for (const f of fields) {
            if (f.type === "text") {
              md += `💬 **[Texto]**:\n${f.content}\n\n`;
            } else if (f.type === "audio") {
              const fileName = f.file_name || "audio.mp3";
              const transcription = getAudioTranscription(fileName, f.content);
              md += `🎙️ **[Áudio]**: \`${fileName}\` (URL: ${f.content})${transcription}\n\n`;
            } else if (f.type === "document") {
              md += `📄 **[PDF / Documento]**: PDF do produto - \`${f.file_name || "documento.pdf"}\` (URL: ${f.content})\n\n`;
            } else if (f.type === "image") {
              const fileName = f.file_name || "imagem.png";
              let desc = "Imagem da etapa";
              if (fileName.includes("img2")) {
                desc = "Contém a tabela comparativa de pacotes e valores (R$ 10, R$ 15 e R$ 25).";
              } else if (fileName.includes("bonus")) {
                desc = "Contém os bônus especiais inclusos no Kit Completo de Confeitaria.";
              } else if (fileName.includes("upssel") || fileName.includes("upsell")) {
                desc = "Contém visual explicativo e chamada para o treinamento de atração de clientes.";
              }
              md += `🖼️ **[Imagem]**: Contém \`${fileName}\` - *${desc}* (URL: ${f.content})\n\n`;
            } else if (f.type === "video") {
              md += `🎬 **[Vídeo]**: Contém \`${f.file_name || "video.mp4"}\` (URL: ${f.content})\n\n`;
            }
          }
        }
        md += `---\n\n`;
      }
    }

    // 6b. Mensagens das Réguas de Follow-up
    md += `## ⏰ Mensagens de Follow-up (Recuperação e Cobrança)\n\n`;
    if (followups.length === 0) {
      md += `*Nenhum follow-up cadastrado no momento.*\n\n`;
    } else {
      for (const f of followups) {
        const statusStr = f.enabled === 1 ? "🟢 Ativo" : "🔴 Inativo";
        const delayStr = f.delay_minutes >= 60 
          ? `${Math.round(f.delay_minutes / 60)}h` 
          : `${f.delay_minutes}min`;
        md += `### 🔔 Follow-up: ${f.name} [${statusStr} - Delay: ${delayStr}]\n`;
        if (f.message && f.message.startsWith("[")) {
          try {
            const blocks = JSON.parse(f.message) as any[];
            for (const block of blocks) {
              if (block.type === "text") {
                md += `💬 **[Texto]**:\n${block.content}\n\n`;
              } else if (block.type === "audio") {
                const fileName = block.file_name || "audio.mp3";
                const transcription = getAudioTranscription(fileName, block.content);
                md += `🎙️ **[Áudio]**: \`${fileName}\` (URL: ${block.content})${transcription}\n\n`;
              } else if (block.type === "image") {
                md += `🖼️ **[Imagem]**: \`${block.file_name || "imagem.png"}\` (URL: ${block.content})\n\n`;
              } else if (block.type === "video") {
                md += `🎬 **[Vídeo]**: \`${block.file_name || "video.mp4"}\` (URL: ${block.content})\n\n`;
              } else if (block.type === "document") {
                md += `📄 **[PDF / Documento]**: \`${block.file_name || "documento.pdf"}\` (URL: ${block.content})\n\n`;
              }
            }
          } catch (e) {
            md += `💬 **[Texto/JSON Inválido]**:\n${f.message}\n\n`;
          }
        } else {
          md += `💬 **[Texto]**:\n${f.message}\n\n`;
          if (f.media_url) {
            md += `🖼️ **[Mídia de Apoio]**: ${f.media_url}\n\n`;
          }
        }
        md += `---\n\n`;
      }
    }

    // 6c. Mensagens das Campanhas de CRM
    md += `## 📋 Mensagens de CRM (Pós-Funil)\n\n`;
    if (crmStages.length === 0) {
      md += `*Nenhum CRM cadastrado no momento.*\n\n`;
    } else {
      for (const s of crmStages) {
        const statusStr = s.enabled === 1 ? "🟢 Ativo" : "🔴 Inativo";
        md += `### 🎯 CRM: ${s.name} [${statusStr} - Delay: ${s.delay_hours}h]\n`;
        if (s.message && s.message.startsWith("[")) {
          try {
            const blocks = JSON.parse(s.message) as any[];
            for (const block of blocks) {
              if (block.type === "text") {
                md += `💬 **[Texto]**:\n${block.content}\n\n`;
              } else if (block.type === "audio") {
                const fileName = block.file_name || "audio.mp3";
                const transcription = getAudioTranscription(fileName, block.content);
                md += `🎙️ **[Áudio]**: \`${fileName}\` (URL: ${block.content})${transcription}\n\n`;
              } else if (block.type === "image") {
                md += `🖼️ **[Imagem]**: \`${block.file_name || "imagem.png"}\` (URL: ${block.content})\n\n`;
              } else if (block.type === "video") {
                md += `🎬 **[Vídeo]**: \`${block.file_name || "video.mp4"}\` (URL: ${block.content})\n\n`;
              } else if (block.type === "document") {
                md += `📄 **[PDF / Documento]**: \`${block.file_name || "documento.pdf"}\` (URL: ${block.content})\n\n`;
              }
            }
          } catch (e) {
            md += `💬 **[Texto/JSON Inválido]**:\n${s.message}\n\n`;
          }
        } else {
          md += `💬 **[Texto]**:\n${s.message}\n\n`;
        }
        md += `---\n\n`;
      }
    }

    md += `\n*Fim do documento de mensagens do funil. Gerado automaticamente pelo sistema.*`;

    // 7. Retornar resposta
    return new Response(md, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="mensagens_funil_${slug}.md"`,
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (err: any) {
    console.error("[Export Funnel Map] Erro:", err);
    return c.json({ error: "Erro ao exportar mapa do funil", details: err.message }, 500);
  }
});

function getAudioTranscription(fileName: string, url: string): string {
  const fileLower = (fileName || "").toLowerCase();
  const urlLower = (url || "").toLowerCase();

  if (fileLower.includes("audio1") || urlLower.includes("audio1")) {
    return `\n*Transcrição:* "Oi, tudo bem? Aqui é a Júlia. Olha, eu vi que você veio aqui querendo saber mais sobre as receitas, né? Então, deixa eu te contar uma coisa. Eu faço esses recheios todos sem ligar o fogão uma vez sequer. Ninho, maracujá, chocolate, pistache, tudo a frio, pronto em minutinhos. Comecei fazendo para minha família mesmo, para os vizinhos. Aí foi crescendo e hoje não para de chegar encomenda aqui em casa. Então, olha o que eu vou fazer. Eu te mando mais de 200 receitas agora, antes de você me pagar qualquer coisa. Você abre, dá uma olhada com calma e se gostar, aí você me manda o pix de R$ 10, tá? Ah, e tenho também um pacote completo com vídeo aulas e as receitas que mais vendem aqui para mim. Mas isso a gente vê depois. Primeiro, me confirma que você paga os R$ 10 depois de receber, que eu já mando tudo para você agora. Posso confiar em você?"`;
  }

  if (fileLower.includes("audio2") || urlLower.includes("audio2")) {
    return `\n*Transcrição:* "Acabei de te enviar as 200 receitas de recheios a frio que vão transformar qualquer docinho simples em algo incrível. Agora você tem três opções para seguir comigo. Pacote 1, R$ 10. Você garante os recheios gourmet a frio, perfeitos para começar a vender de forma diferenciada. Pacote 2, R$ 15. Por R$ 5 a mais, além dos recheios, você vai levar também minhas receitas de massas especiais que vão dar um toque único aos seus doces. Pacote 3, R$ 25. O kit completo. Você recebe os recheios, as massas, videoaulas exclusivas com passo a passo e o melhor, o método Fatias de Feira, as receitas mais vendidas que eu entrego de bandeja, com anos de experiência. E tem mais, como bônus, vou te passar minha estratégia de vendas para os primeiros 30 dias, que vai te ajudar a vender mais rápido e ter sucesso logo de cara. Escolhe o pacote que mais combina com você e me manda o comprovante do Pix logo abaixo."`;
  }

  return "";
}

/**
 * Exclui registros de fallbacks com mais de 15 dias de idade.
 * Executada no Cron Trigger ou nas requisições.
 */
export async function cleanupOldFallbackLogs(db: D1Database): Promise<void> {
  try {
    const res = await db.prepare(
      "DELETE FROM fallback_logs WHERE created_at < datetime('now', '-15 days')"
    ).run();
    console.log(`[FallbackCleanup] Limpeza executada com sucesso. ${res.meta.changes || 0} logs antigos removidos.`);
  } catch (err) {
    console.error("[FallbackCleanup] Falha ao executar a limpeza de logs de 15 dias:", err);
  }
}

