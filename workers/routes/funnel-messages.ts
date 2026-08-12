import { Hono } from "hono";
import type { Env } from "../app";
import { rewriteMessageViaLLM } from "../services/llm-service";

export const funnelMessagesRoutes = new Hono<{ Bindings: Env; Variables: { userId: string; userEmail: string } }>();

// Helper para gerar URLs públicas a partir da request atual
function getBaseUrl(reqUrl: string): string {
  try {
    const url = new URL(reqUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

// 1. GET /config/:automationId
funnelMessagesRoutes.get("/config/:automationId", async (c) => {
  const db = c.env.DB;
  const automationId = c.req.param("automationId");

  try {
    // 1. Verificar se a automação existe
    const auto = await db.prepare("SELECT id, slug, name FROM automations WHERE id = ?")
      .bind(automationId)
      .first<{ id: string; slug: string; name: string }>();

    if (!auto) {
      return c.json({ error: "Automação não encontrada" }, 404);
    }

    const defaultStages = [
      { key: "welcome", name: "Boas-vindas", sort: 1 },
      { key: "delivery", name: "Entrega / Oferta", sort: 2 },
      { key: "ticket_boost", name: "Oferta Especial", sort: 3 },
      { key: "ticket_boost_declined", name: "Presente Especial", sort: 4 },
      { key: "upsell", name: "Upsell", sort: 5 },
      { key: "downsell", name: "Downsell", sort: 6 },
      { key: "promise", name: "Agendamento", sort: 7 }
    ];

    // 2. Garantir que os estágios padrão existem no banco para esta automação
    for (const s of defaultStages) {
      const stageExists = await db.prepare(
        "SELECT id FROM automation_funnel_stages WHERE automation_id = ? AND stage_key = ?"
      ).bind(automationId, s.key).first();

      if (!stageExists) {
        const stageId = `${automationId}_${s.key}`;
        await db.prepare(`
          INSERT OR IGNORE INTO automation_funnel_stages (id, automation_id, stage_key, name, sort_order, enabled, delay_minutes, rewrite_mode)
          VALUES (?, ?, ?, ?, ?, 1, ?, 'none')
        `).bind(stageId, automationId, s.key, s.name, s.sort, s.key === "upsell" ? 5 : 0).run();
      }
    }

    // 3. Buscar os estágios cadastrados ordenados
    const stagesRes = await db.prepare(
      "SELECT * FROM automation_funnel_stages WHERE automation_id = ? ORDER BY sort_order ASC, created_at ASC"
    ).bind(automationId).all<any>();
    
    const stages = stagesRes.results || [];

    // 4. Buscar os campos de cada estágio (populando defaults individualmente se estiver vazio e for 'recheios')
    const resultStages = [];
    
    const welcomeText = `Oi, *{primeiro_nome}*! Tudo bem? Aqui é a Julia 😊\n\nVou te liberar agora as *200 receitas de recheios a frio* especiais!\n\nVocê confere primeiro e, se estiver tudo certo, depois faz o pagamento de *R$ 10,00.*\n\nE, se quiser ir além, depois eu também posso te mostrar o pacote completo — com receitas de tortinhas, Fatias de Feira mais vendidas, videoaulas e muito mais... 🍰\n\n👇 *Posso te enviar agora?* 🙏`;
    
    const deliveryText1 = `*{primeiro_nome}*, acabei de te enviar as *200 receitas de recheios a frio* que te prometi! Elas vão *transformar qualquer docinho simples* em uma verdadeira obra de arte lucrativa. Dá uma olhadinha nos arquivos acima! 🍰✨`;
    
    const deliveryText2 = `📋 *DADOS DO PIX*:\n\nTipo: *PIX Celular*\nNome: *R G FEITOSA 153DF*\nBanco: *Banco Cora*\nChave PIX: *61982277206*`;
    
    const deliveryTextFinal = `E o melhor de tudo: o Pacote Completo é sempre atualizado com novas tendências, e quem escolhe o Pacote 3 ganha *acesso vitalício* para sempre! Ou seja, você nunca mais precisará gastar com outras apostilas na vida! 😍\n\nAgora é com você: escolha o pacote ideal para começar hoje mesmo e me envie o comprovante do PIX aqui embaixo. Eu libero seu acesso na mesma hora! Não deixe essa chance passar! 🚀\n\n📋 *DADOS DO PIX*:\nTipo: *PIX Celular*\nNome: *R G FEITOSA 153DF*\nBanco: *Banco Cora*\nChave PIX:\n👇 Copia e cola abaixo 👇\n\n61982277206\n\nMe manda o comprovante do PIX e eu libero tudo na hora! 🎯`;

    const ticketBoostText = `*{primeiro_nome}*, seu pagamento de *R$ {valor_pago}* foi confirmado com sucesso! 🎉😍\n\n*{primeiro_nome}*, tenho uma surpresa super especial pra você! 🎁\n\nPor apenas mais *R$ 5,00* você leva o nosso *Kit Completo de Confeitaria* (que custa R$ 25,00)!\n\nNo kit completo você recebe:\n📹 Vídeo aulas passo a passo com o ponto certo dos recheios\n📚 Apostilas extras de brigadeiros premium, bolos no pote e geladinhos gourmet\n🍰 Método Como Ganhar Dinheiro com Fatias de Bolo\nE muito mais!\n\nÉ só fazer o PIX de *R$ 5,00* para o mesmo número celular:\n💰 *Chave PIX:* 61982277206\n\nSe preferir ficar apenas com as receitas que escolheu, basta digitar *"não quero"* ou *"só as receitas"* que já te peço os dados de acesso. O que você acha? 😊`;

    const upsellText = `*{primeiro_nome}*, espero que você já esteja amando e aproveitando cada pedacinho da nossa área de membros! 😍🍰\n\nBut deixa eu te falar uma verdade sincera que eu aprendi na prática: de que adianta ter as receitas de recheios mais incríveis e cremosas do Brasil se a sua cozinha continuar vazia e sem encomendas? 🍰🤔 Ter receitas perfeitas é só metade do caminho. A outra metade — e a mais importante — é saber como atrair clientes prontos para comprar de você todos os dias!\n\nFoi por isso que eu criei o meu treinamento completo *Máquina de Vendas Online*! Nele, eu te entrego o roteiro exato para você usar o seu celular e o Instagram para lotar a sua agenda de clientes na sua cidade, mesmo que você esteja começando do absoluto zero e não queira gastar dinheiro com anúncios!\n\nEle é vendido normalmente por R$ 89,90, mas como você acabou de entrar para o nosso time, hoje eu consigo te liberar o acesso vitalício por apenas *R$ 14,50* adicionais!\n\nCaso você queira garantir essa oportunidade única, basta fazer o Pix de *R$ 14,50* abaixo e me enviar o comprovante aqui que eu te libero o acesso na hora! 🎯\n\n💰 *Pix (Celular):* 61982277206`;

    const ticketBoostDeclinedText = `Tudo bem! O meu principal objetivo é te ajudar a crescer na confeitaria e faturar muito mais, a questão aqui não é só dinheiro. Por isso, de coração, eu vou te liberar todo o nosso *Kit Completo vitalício* de presente de qualquer forma! 💖🎁\n\nPara liberar seu cadastro no sistema, digite seu *Nome Completo* e seu melhor *E-mail* abaixo. 🎯`;

    const downsellText = `*{primeiro_nome}*, eu super te entendo! Às vezes a correria aperta ou a gente fica com aquela insegurança se vai conseguir colocar tudo em prática. 🥺\n\nMas eu não quero que a divulgação seja a pedra no seu caminho. Quero ver a sua cozinha cheia de encomendas todos os dias!\n\nPor isso, conversei com a minha equipe e consegui liberar uma condição única de 50% de desconto para você levar a nossa *Máquina de Vendas Online* agora e não ter desculpa para não decolar!\n\nDe R$ 14,50, você garante o seu acesso vitalício por apenas *R$ 7,50* hoje! É menos que o preço de um docinho para aprender a atrair clientes todos os dias! 🍰🚀\n\nPara garantir esse super desconto, faça o Pix de *R$ 7,50* no mesmo celular abaixo e me mande o comprovante:\n\n💰 *Pix (Celular):* 61982277206`;

    const defaultFields: Record<string, { type: string; content: string; file_name?: string }[]> = {
      welcome: [
        { type: "audio", content: "https://dados.promentor21.top/Funil%20Recheios/audio1-v4.mp3", file_name: "audio1-v4.mp3" },
        { type: "text", content: welcomeText }
      ],
      delivery: [
        { type: "document", content: "https://dados.promentor21.top/Funil%20Recheios/Apostila%205.%20Recheios%20Sem%20Fog%C3%A3o%20(101%20Receitas).pdf", file_name: "Apostila 5. Recheios Sem Fogão (101 Receitas).pdf" },
        { type: "document", content: "https://dados.promentor21.top/Funil%20Recheios/Apostila%201.%20Recheios%20Sem%20Fog%C3%A3o%20(50%20Receitas).pdf", file_name: "Apostila 1. Recheios Sem Fogão (50 Receitas).pdf" },
        { type: "document", content: "https://dados.promentor21.top/Funil%20Recheios/Apostila%203.%20Recheios%20Sem%20Fog%C3%A3o%20(20%20Receitas).pdf", file_name: "Apostila 3. Recheios Sem Fogão (20 Receitas).pdf" },
        { type: "document", content: "https://dados.promentor21.top/Funil%20Recheios/Apostila%204.%20Recheios%20Sem%20Fog%C3%A3o%20(23%20Receitas).pdf", file_name: "Apostila 4. Recheios Sem Fogão (23 Receitas).pdf" },
        { type: "document", content: "https://dados.promentor21.top/Funil%20Recheios/Apostila%202.%20Recheios%20Sem%20Fog%C3%A3o%20(34%20Receitas).pdf", file_name: "Apostila 2. Recheios Sem Fogão (34 Receitas).pdf" },
        { type: "text", content: deliveryText1 },
        { type: "audio", content: "https://dados.promentor21.top/Funil%20Recheios/audio2-v3.mp3", file_name: "audio2-v3.mp3" },
        { type: "text", content: deliveryText2 },
        { type: "image", content: "https://dados.promentor21.top/Funil%20Recheios/img2.jpeg", file_name: "img2.jpeg" },
        { type: "image", content: "https://dados.promentor21.top/Funil%20Recheios/img-bonus.jpeg", file_name: "img-bonus.jpeg" },
        { type: "text", content: deliveryTextFinal }
      ],
      ticket_boost: [
        { type: "text", content: ticketBoostText }
      ],
      ticket_boost_declined: [
        { type: "text", content: ticketBoostDeclinedText }
      ],
      upsell: [
        { type: "image", content: "https://dados.promentor21.top/Funil%20Recheios/img_upssel.png", file_name: "img_upssel.png" },
        { type: "text", content: upsellText }
      ],
      downsell: [
        { type: "text", content: downsellText }
      ],
      promise: [
        { type: "text", content: `Oi, *{primeiro_nome}*! Tudo bem?\n\nDeixei agendado aqui o seu pagamento para o dia tal conforme combinamos. Fico no aguardo e a gente confia muito em você! 💕` }
      ]
    };

    for (const stage of stages) {
      const fieldsRes = await db.prepare(
        "SELECT * FROM automation_funnel_fields WHERE stage_id = ? ORDER BY sort_order ASC"
      ).bind(stage.id).all<any>();
      let fields = fieldsRes.results || [];

      // Se o estágio específico não tiver campos e a automação for de 'recheios', popula com os defaults do estágio
      if (fields.length === 0 && auto.slug.includes("recheios")) {
        console.log(`[Funnel Messages] Populando campos padrão para o estágio ${stage.stage_key} da automação ${auto.slug}`);
        const defaultFieldsForKey = defaultFields[stage.stage_key] || [];
        let sortOrder = 0;
        for (const f of defaultFieldsForKey) {
          const fieldId = crypto.randomUUID();
          await db.prepare(`
            INSERT INTO automation_funnel_fields (id, stage_id, type, content, file_name, sort_order)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(fieldId, stage.id, f.type, f.content, f.file_name || null, sortOrder).run();
          
          fields.push({
            id: fieldId,
            stage_id: stage.id,
            type: f.type,
            content: f.content,
            file_name: f.file_name || null,
            sort_order: sortOrder
          });
          sortOrder++;
        }
      }

      resultStages.push({
        ...stage,
        fields
      });
    }

    return c.json({
      data: {
        automation_id: automationId,
        stages: resultStages
      }
    });
  } catch (err: any) {
    console.error("[Funnel Messages Config] Erro:", err);
    return c.json({ error: "Erro ao buscar configurações do funil", details: err.message }, 500);
  }
});

// 2. PUT /config/:automationId/:stageKey
funnelMessagesRoutes.put("/config/:automationId/:stageKey", async (c) => {
  const db = c.env.DB;
  const automationId = c.req.param("automationId");
  const stageKey = c.req.param("stageKey");

  try {
    const body = await c.req.json<{
      enabled: number;
      delay_minutes?: number;
      rewrite_mode?: "none" | "dynamic" | "static";
      rewrite_count?: number;
      fields: {
        id?: string;
        type: "text" | "audio" | "video" | "image" | "document";
        content: string;
        file_name?: string | null;
      }[];
    }>();

    // 1. Obter ou criar o estágio
    let stage = await db.prepare(
      "SELECT * FROM automation_funnel_stages WHERE automation_id = ? AND stage_key = ?"
    ).bind(automationId, stageKey).first<any>();

    const stageId = stage ? stage.id : `${automationId}_${stageKey}`;

    if (!stage) {
      await db.prepare(`
        INSERT INTO automation_funnel_stages (id, automation_id, stage_key, enabled, delay_minutes, rewrite_mode, rewrite_count)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        stageId,
        automationId,
        stageKey,
        body.enabled ?? 1,
        body.delay_minutes ?? 0,
        body.rewrite_mode || "none",
        body.rewrite_count || 5
      ).run();
      
      stage = await db.prepare("SELECT * FROM automation_funnel_stages WHERE id = ?").bind(stageId).first<any>();
    } else {
      const enabled = body.enabled ?? stage.enabled;
      const delayMinutes = body.delay_minutes ?? stage.delay_minutes;
      const rewriteMode = body.rewrite_mode || stage.rewrite_mode || "none";
      const rewriteCount = Number(body.rewrite_count ?? stage.rewrite_count ?? 5);

      await db.prepare(`
        UPDATE automation_funnel_stages
        SET enabled = ?, delay_minutes = ?, rewrite_mode = ?, rewrite_count = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(enabled, delayMinutes, rewriteMode, rewriteCount, stageId).run();
    }

    // 2. Tratar variações inteligentes de LLM se 'static'
    let variationsJson = stage?.variations || "[]";
    const rewriteMode = body.rewrite_mode || stage?.rewrite_mode || "none";
    const rewriteCount = Number(body.rewrite_count ?? stage?.rewrite_count ?? 5);

    // Encontrar o primeiro campo de texto enviado para reescrever
    const textFields = body.fields.filter(f => f.type === "text");
    const firstTextMessage = textFields.length > 0 ? textFields[0].content : "";

    const modeChangedToStatic = rewriteMode === "static" && (stage?.rewrite_mode !== "static" || variationsJson === "[]");
    const messageChangedInStatic = rewriteMode === "static" && textFields.length > 0 && firstTextMessage !== ""; // Sempre re-gera se receber textos novos no put para simplificar

    if (modeChangedToStatic || messageChangedInStatic) {
      if (firstTextMessage) {
        console.log(`[LLM Rewrite] Pré-gerando ${rewriteCount} variações para o estágio do funil ${stageKey}`);
        const variationsList = await rewriteMessageViaLLM(db, automationId, firstTextMessage, rewriteCount);
        variationsJson = JSON.stringify(variationsList);
      } else {
        variationsJson = "[]";
      }
    } else if (rewriteMode !== "static") {
      variationsJson = "[]";
    }

    // Atualizar as variações no estágio
    await db.prepare(`
      UPDATE automation_funnel_stages
      SET variations = ?
      WHERE id = ?
    `).bind(variationsJson, stageId).run();

    // 3. Deletar os campos antigos
    await db.prepare("DELETE FROM automation_funnel_fields WHERE stage_id = ?").bind(stageId).run();

    // 4. Inserir os novos campos ordenados
    let sortOrder = 0;
    for (const field of body.fields) {
      const fieldId = crypto.randomUUID();
      await db.prepare(`
        INSERT INTO automation_funnel_fields (id, stage_id, type, content, file_name, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(fieldId, stageId, field.type, field.content, field.file_name || null, sortOrder).run();
      
      sortOrder++;
    }

    // 5. Retornar os dados atualizados
    const updatedStage = await db.prepare("SELECT * FROM automation_funnel_stages WHERE id = ?").bind(stageId).first<any>();
    const updatedFields = await db.prepare("SELECT * FROM automation_funnel_fields WHERE stage_id = ? ORDER BY sort_order ASC").bind(stageId).all();

    return c.json({
      message: "Estágio do funil atualizado com sucesso!",
      data: {
        ...updatedStage,
        fields: updatedFields.results || []
      }
    });
  } catch (err: any) {
    console.error("[Funnel Messages Update] Erro:", err);
    return c.json({ error: "Erro ao atualizar estágio do funil", details: err.message }, 500);
  }
});

// 4. POST /config/:automationId/stages — Criar estágio personalizado
funnelMessagesRoutes.post("/config/:automationId/stages", async (c) => {
  const db = c.env.DB;
  const automationId = c.req.param("automationId");

  try {
    const body = await c.req.json<{ name: string }>();
    if (!body.name || body.name.trim() === "") {
      return c.json({ error: "Nome do estágio é obrigatório" }, 400);
    }

    // Gerar slug amigável a partir do nome
    const cleanName = body.name.trim();
    const slug = cleanName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/(^_|_$)/g, "");

    if (slug === "") {
      return c.json({ error: "Nome do estágio inválido" }, 400);
    }

    // Verificar se já existe um estágio com essa key para a mesma automação
    const exists = await db.prepare(
      "SELECT id FROM automation_funnel_stages WHERE automation_id = ? AND stage_key = ?"
    ).bind(automationId, slug).first();

    if (exists) {
      return c.json({ error: "Já existe um estágio com este nome" }, 400);
    }

    // Obter o maior sort_order atual
    const maxSortRes = await db.prepare(
      "SELECT MAX(sort_order) as max_sort FROM automation_funnel_stages WHERE automation_id = ?"
    ).bind(automationId).first<{ max_sort: number | null }>();
    const nextSort = (maxSortRes?.max_sort || 0) + 1;

    const stageId = `${automationId}_${slug}`;

    await db.prepare(`
      INSERT INTO automation_funnel_stages (id, automation_id, stage_key, name, sort_order, enabled, delay_minutes, rewrite_mode)
      VALUES (?, ?, ?, ?, ?, 1, 0, 'none')
    `).bind(stageId, automationId, slug, cleanName, nextSort).run();

    const newStage = await db.prepare(
      "SELECT * FROM automation_funnel_stages WHERE id = ?"
    ).bind(stageId).first<any>();

    return c.json({
      message: "Estágio criado com sucesso!",
      data: {
        ...newStage,
        fields: []
      }
    }, 201);
  } catch (err: any) {
    console.error("[Funnel Stages Create] Erro:", err);
    return c.json({ error: "Erro ao criar estágio", details: err.message }, 500);
  }
});

// 5. DELETE /config/:automationId/stages/:stageId — Deletar estágio personalizado
funnelMessagesRoutes.delete("/config/:automationId/stages/:stageId", async (c) => {
  const db = c.env.DB;
  const automationId = c.req.param("automationId");
  const stageId = c.req.param("stageId");

  try {
    // Buscar o estágio para validar
    const stage = await db.prepare(
      "SELECT * FROM automation_funnel_stages WHERE id = ? AND automation_id = ?"
    ).bind(stageId, automationId).first<{ stage_key: string }>();

    if (!stage) {
      return c.json({ error: "Estágio não encontrado" }, 404);
    }

    // Impedir a exclusão dos estágios padrão
    const standardKeys = ["welcome", "delivery", "ticket_boost", "ticket_boost_declined", "upsell", "downsell", "promise"];
    if (standardKeys.includes(stage.stage_key)) {
      return c.json({ error: "Estágios padrão não podem ser excluídos" }, 400);
    }

    // Excluir os campos associados primeiro
    await db.prepare("DELETE FROM automation_funnel_fields WHERE stage_id = ?").bind(stageId).run();

    // Excluir o estágio
    await db.prepare("DELETE FROM automation_funnel_stages WHERE id = ?").bind(stageId).run();

    return c.json({ message: "Estágio excluído com sucesso!" });
  } catch (err: any) {
    console.error("[Funnel Stages Delete] Erro:", err);
    return c.json({ error: "Erro ao excluir estágio", details: err.message }, 500);
  }
});

// 6. PUT /config/:automationId/reorder — Reordenar estágios em massa
funnelMessagesRoutes.put("/config/:automationId/reorder", async (c) => {
  const db = c.env.DB;
  const automationId = c.req.param("automationId");

  try {
    const body = await c.req.json<{ stages: { id: string; sort_order: number }[] }>();
    if (!body.stages || !Array.isArray(body.stages)) {
      return c.json({ error: "Lista de estágios inválida" }, 400);
    }

    const statements = body.stages.map((s) => {
      return db.prepare(
        "UPDATE automation_funnel_stages SET sort_order = ? WHERE id = ? AND automation_id = ?"
      ).bind(s.sort_order, s.id, automationId);
    });

    await db.batch(statements);

    return c.json({ message: "Ordenação atualizada com sucesso!" });
  } catch (err: any) {
    console.error("[Funnel Stages Reorder] Erro:", err);
    return c.json({ error: "Erro ao reordenar estágios", details: err.message }, 500);
  }
});

// 3. POST /upload/:automationId — Subir arquivo para o R2 e retornar a URL
funnelMessagesRoutes.post("/upload/:automationId", async (c) => {
  const db = c.env.DB;
  const r2 = c.env.STORAGE;
  const automationId = c.req.param("automationId");

  try {
    const auto = await db.prepare("SELECT name FROM automations WHERE id = ?").bind(automationId).first();
    if (!auto) {
      return c.json({ error: "Automação não encontrada" }, 404);
    }

    const formData = await c.req.parseBody();
    const file = formData.file;

    if (!file || !(file instanceof File)) {
      return c.json({ error: "Nenhum arquivo válido enviado" }, 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const fieldId = crypto.randomUUID();

    // Limpar nome do arquivo para usar na key do R2
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const fileExtension = file.name.split(".").pop() || "";

    // Determinar o tipo de arquivo
    let fileType = "unknown";
    if (file.type.startsWith("image/")) fileType = "image";
    else if (file.type.startsWith("audio/")) fileType = "audio";
    else if (file.type.startsWith("video/")) fileType = "video";
    else if (file.type === "application/pdf" || fileExtension.toLowerCase() === "pdf") fileType = "pdf";

    // Chave única de armazenamento do R2
    const r2Key = `funnel-messages/${automationId}/${fieldId}-${cleanFileName}`;

    // Salvar arquivo físico no R2
    console.log(`[R2] Fazendo upload de ${cleanFileName} (${fileType}) para o R2 com chave: ${r2Key}`);
    await r2.put(r2Key, arrayBuffer, {
      httpMetadata: { contentType: file.type }
    });

    const baseUrl = getBaseUrl(c.req.url);
    const publicUrl = `${baseUrl}/api/media/${r2Key}`;

    return c.json({
      data: {
        public_url: publicUrl,
        file_name: file.name,
        file_type: fileType
      },
      message: "Upload concluído com sucesso!"
    }, 201);
  } catch (err: any) {
    console.error("[Funnel Messages Upload R2] Erro:", err);
    return c.json({ error: `Falha no upload: ${err.message || err}` }, 500);
  }
});
