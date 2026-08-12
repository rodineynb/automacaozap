/**
 * Lógica de Follow-ups para a automação ReceitasVIP
 * 
 * Executado periodicamente pelo cron trigger a cada 5 minutos.
 * Utiliza máquina de estados declarativa baseada em tags de estado para
 * auto-cancelamento ou disparo silencioso dos jobs.
 */

import type { Env } from '../../app';
import { callLLM, rewriteMessageViaLLM } from '../../services/llm-service';
import { sendText, sendImage, sendVideo, sendPixButton, sendAudio, sendDocument } from '../../services/whatsapp-service';
import { partitionMessage, calculateDelay, sleep, getSaoPauloTime, formatWhatsAppShortParagraphs } from '../../services/message-utils';
import { PRODUCT, MEDIA_URLS } from './config';
import { sendFunnelStage } from './tools';
import { 
  getVigiaSilentPrompt,
  getFinalizadorCloserPrompt,
  getIncentivadorPrompt,
  getCobradorAmigoPrompt,
  getCobradorCuriosoPrompt,
  getCobradorFinalPrompt,
  getApoiadorPromoterPrompt
} from './prompts';

// ============================================================
// AUXILIAR: Mapeamento de tipo de follow-up para chave do banco
// ============================================================
export function mapFollowupTypeToKey(type: string): string {
  if (type === 'followup_vigia_15min' || type === 'vigia') return 'vigia';
  if (type === 'followup_finalizador_12h' || type === 'finalizador') return 'finalizador';
  if (type === 'followup_incentivador_1h' || type === 'incentivador') return 'incentivador';
  if (type === 'followup_cobrador_amigo_10h' || type === 'cobrador_amigo') return 'cobrador_amigo';
  if (type === 'followup_cobrador_curioso_34h' || type === 'cobrador_curioso') return 'cobrador_curioso';
  if (type === 'followup_cobrador_final_58h' || type === 'cobrador_final') return 'cobrador_final';
  return type;
}

// ============================================================
// EXECUTOR DE FOLLOW-UPS (Chamado pelo Cron Trigger)
// ============================================================

export async function processScheduledFollowups(env: Env): Promise<number> {
  const db = env.DB;
  
  // Pruning automático de logs de erros e rastreamento (manter apenas últimas 48 horas / 2 dias)
  try {
    await db.prepare("DELETE FROM error_logs WHERE created_at < datetime('now', '-2 days')").run();
    await db.prepare("DELETE FROM facebook_tracking_logs WHERE created_at < datetime('now', '-2 days')").run();
    await db.prepare("DELETE FROM dispatch_logs WHERE sent_at < datetime('now', '-7 days')").run();
    console.log(`[Cron] Expurgo de logs concluído: registros de erro/tracking antigos (<2d) e dispatch_logs (<7d) foram removidos.`);
  } catch (err) {
    console.error(`[Cron] Falha ao expurgar logs antigos:`, err);
  }

  // ── JANELA SILENCIOSA (00:00 - 07:00 SP TIME) — AUTO-REAGENDAMENTO EM LOTE ──
  const nowTime = new Date();
  const spTime = getSaoPauloTime(nowTime);
  if (spTime.hour >= 0 && spTime.hour < 7) {
    console.log(`[Followup Cron] Horário silencioso detectado (${spTime.hour}:${spTime.minute} SP). Adiando follow-ups pendentes para a janela da manhã (07:00 - 11:00 SP).`);
    try {
      // 07:00 SP = 10:00 UTC. Adicionamos abs(random() % 240) minutos para distribuir os disparos de forma aleatória em 4h
      await db.prepare(`
        UPDATE scheduled_followups
        SET scheduled_for = datetime('now', 'start of day', '+10 hours', '+' || (abs(random() % 240)) || ' minutes')
        WHERE status = 'pending' AND scheduled_for <= ?
      `).bind(nowTime.toISOString()).run();
      console.log(`[Followup Cron] Sucesso ao redistribuir follow-ups pendentes para a janela da manhã.`);
    } catch (err) {
      console.error(`[Followup Cron] Falha ao reagendar follow-ups em horário silencioso:`, err);
    }
    return 0; // Aborta execução durante a madrugada
  }

  // ── SWEEP DE AUTO-RECUPERAÇÃO DE LEADS TRAVADOS ──
  try {
    console.log(`[Cron] Iniciando sweep de auto-recuperação de leads travados...`);
    
    const stuckLeads = await db.prepare(`
      SELECT cv.id as conversation_id, 
             cv.status, 
             cv.ai_active, 
             ct.phone, 
             ct.name as contact_name,
             a.id as automation_id, 
             a.name as automation_name, 
             a.slug as automation_slug, 
             a.product_name, 
             a.status as automation_status, 
             a.whatsapp_api_id, 
             a.ocr_service_id, 
             a.transcription_service_id, 
             a.whatsapp_number, 
             a.pixel_id, 
             a.facebook_token, 
             a.waba_id, 
             a.page_id,
             (SELECT id FROM messages WHERE conversation_id = cv.id ORDER BY created_at DESC LIMIT 1) as last_msg_id,
             (SELECT content FROM messages WHERE conversation_id = cv.id ORDER BY created_at DESC LIMIT 1) as last_msg_content
      FROM conversations cv
      JOIN contacts ct ON cv.contact_id = ct.id
      JOIN automations a ON cv.automation_id = a.id
      WHERE cv.status IN ('open', 'pending')
        AND cv.ai_active = 1
        AND (
          SELECT role FROM messages 
          WHERE conversation_id = cv.id 
          ORDER BY created_at DESC LIMIT 1
        ) = 'user'
        AND (
          SELECT created_at FROM messages 
          WHERE conversation_id = cv.id 
          ORDER BY created_at DESC LIMIT 1
        ) <= datetime('now', '-3 minutes')
        AND (
          SELECT created_at FROM messages 
          WHERE conversation_id = cv.id 
          ORDER BY created_at DESC LIMIT 1
        ) >= datetime('now', '-2 hours')
    `).all<any>();

    if (stuckLeads.results && stuckLeads.results.length > 0) {
      console.log(`[Cron] Encontrados ${stuckLeads.results.length} leads travados no sweep.`);
      const { processMessageAsync } = await import('../../automation-engine');

      for (const row of stuckLeads.results) {
        const phone = row.phone;
        const slug = row.automation_slug;
        console.log(`[Cron] Recuperando lead ${phone} na automação ${slug}...`);

        // 1. Limpar chaves de lock KV e filas residuais
        const processingKey = `processing:${slug}:${phone}`;
        const isDeliveringKey = `is_delivering_seq2:${slug}:${phone}`;
        const hasQueuedKey = `has_queued_messages:${slug}:${phone}`;
        const queueKey = `queue:${slug}:${phone}`;

        await env.KV.delete(processingKey);
        await env.KV.delete(isDeliveringKey);
        await env.KV.delete(hasQueuedKey);
        await env.KV.delete(queueKey);

        // 2. Mover a última mensagem do usuário para o debounce
        const dbKey = `debounce:${slug}:${phone}`;
        const incomingMsg = {
          id: row.last_msg_id || crypto.randomUUID(),
          phone,
          senderName: row.contact_name || 'Cliente',
          messageType: 'text',
          textContent: row.last_msg_content || '',
          rawBody: {}
        };
        await env.KV.put(dbKey, JSON.stringify([incomingMsg]), { expirationTtl: 60 });

        // 3. Re-disparar o processamento assíncrono
        const mappedAutomation = {
          id: row.automation_id,
          name: row.automation_name,
          slug: row.automation_slug,
          product_name: row.product_name || null,
          status: row.automation_status,
          whatsapp_api_id: row.whatsapp_api_id,
          ocr_service_id: row.ocr_service_id || null,
          transcription_service_id: row.transcription_service_id || null,
          whatsapp_number: row.whatsapp_number || null,
          pixel_id: row.pixel_id || null,
          facebook_token: row.facebook_token || null,
          waba_id: row.waba_id || null,
          page_id: row.page_id || null,
        };

        if (env.executionCtx && typeof env.executionCtx.waitUntil === 'function') {
          env.executionCtx.waitUntil(
            processMessageAsync(env, mappedAutomation, phone, slug)
          );
        } else {
          await processMessageAsync(env, mappedAutomation, phone, slug);
        }
        console.log(`[Cron] Lead ${phone} destravado e re-enfileirado com sucesso.`);
      }
    } else {
      console.log(`[Cron] Nenhum lead travado detectado no sweep.`);
    }
  } catch (sweepErr) {
    console.error(`[Cron] Erro durante o sweep de auto-recuperação:`, sweepErr);
  }

  const now = new Date().toISOString();

  // ── DETECÇÃO DE ALTA CARGA DO SISTEMA (LOAD DEFERRAL) ──
  try {
    const loadCheck = await db.prepare(`
      SELECT COUNT(*) as recent_count FROM messages 
      WHERE created_at > datetime('now', '-2 minutes')
    `).first<{ recent_count: number }>();
    
    const recentCount = loadCheck?.recent_count || 0;
    const SYSTEM_LOAD_THRESHOLD = 15; // Se houver mais de 15 mensagens em 2min, o sistema está sob alta carga
    
    if (recentCount > SYSTEM_LOAD_THRESHOLD) {
      console.log(`[Cron] Alta carga detectada (${recentCount} mensagens nos últimos 2min). Adiando tarefas pendentes em 5 minutos.`);
      
      // Buscar os IDs de follow-ups que já deveriam ter sido executados
      const pendingToPostpone = await db.prepare(`
        SELECT id FROM scheduled_followups 
        WHERE status = 'pending' AND scheduled_for <= ?
      `).bind(now).all<{ id: string }>();
      
      if (pendingToPostpone.results && pendingToPostpone.results.length > 0) {
        for (const f of pendingToPostpone.results) {
          await db.prepare(`
            UPDATE scheduled_followups 
            SET scheduled_for = datetime('now', '+5 minutes') 
            WHERE id = ?
          `).bind(f.id).run();
        }
        console.log(`[Cron] Sucesso ao adiar ${pendingToPostpone.results.length} follow-ups devido à carga.`);
      }
      return 0; // Processou 0 nesta rodada devido à carga
    }
  } catch (loadErr) {
    console.error(`[Cron] Erro ao verificar carga do sistema:`, loadErr);
  }

  // ── RESCHEDULE OVERDUE BACKLOG TO PREVENT NUMBER BAN (STAGGER QUEUE) ──
  try {
    const overdueFollowups = await db.prepare(`
      SELECT sf.id, sf.conversation_id, conv.automation_id, sf.scheduled_for
      FROM scheduled_followups sf
      JOIN conversations conv ON sf.conversation_id = conv.id
      JOIN automations a ON conv.automation_id = a.id
      WHERE sf.status = 'pending'
        AND sf.scheduled_for <= datetime('now', '-10 minutes')
        AND a.status = 'active'
      ORDER BY conv.automation_id, sf.scheduled_for ASC
    `).all<{ id: string; conversation_id: string; automation_id: string; scheduled_for: string }>();

    if (overdueFollowups.results && overdueFollowups.results.length > 1) {
      console.log(`[Followup Cron] Detectados ${overdueFollowups.results.length} follow-ups atrasados em backlog. Espaçando fila...`);
      
      const byAutomation: Record<string, typeof overdueFollowups.results> = {};
      for (const f of overdueFollowups.results) {
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
              UPDATE scheduled_followups
              SET scheduled_for = datetime('now', '+' || ? || ' minutes')
              WHERE id = ?
            `).bind(delayMinutes, item.id).run();
            console.log(`[Followup Cron Stagger] Reagendado followup backlog ${item.id} (auto: ${autoId}) para +${delayMinutes} min`);
          }
        }
      }
    }
  } catch (err) {
    console.error(`[Followup Cron Stagger] Erro ao re-espaçar follow-ups atrasados:`, err);
  }

  // Buscar follow-ups pendentes que já passaram do horário programado
  const pending = await db.prepare(`
    SELECT sf.*, 
           cs.phase,
           cs.payment_confirmed,
           cs.total_paid,
           cs.seq2_called,
           cs.access_delivered,
           cs.funil_encerrado,
           cs.oferta_19_90_feita,
           cs.upsell_enviado,
           cs.promessa_pagamento_data,
           c.phone,
           ct.name as contact_name,
           ct.had_profile_pic,
           a.whatsapp_api_id,
           a.id as automation_id,
           a.slug as automation_slug,
           a.attendant_name
    FROM scheduled_followups sf
    JOIN conversation_state cs ON sf.conversation_id = cs.conversation_id
    JOIN conversations conv ON sf.conversation_id = conv.id
    JOIN contacts ct ON conv.contact_id = ct.id
    JOIN automations a ON conv.automation_id = a.id
    LEFT JOIN (
      SELECT id as contact_id, phone FROM contacts
    ) c ON ct.id = c.contact_id
    WHERE sf.status = 'pending' 
      AND sf.scheduled_for <= ?
      AND a.status = 'active'
    ORDER BY sf.scheduled_for ASC
    LIMIT 20
  `).bind(now).all<{
    id: string;
    conversation_id: string;
    type: string;
    created_at: string;
    phase: string;
    payment_confirmed: number;
    total_paid: number;
    seq2_called: number;
    access_delivered: number;
    funil_encerrado: number;
    oferta_19_90_feita: number;
    upsell_enviado: number;
    promessa_pagamento_data?: string | null;
    phone: string;
    contact_name: string;
    had_profile_pic: number;
    whatsapp_api_id: string;
    automation_id: string;
    automation_slug: string;
    attendant_name?: string;
  }>();

  let processed = 0;

  for (const followup of (pending.results || [])) {
    try {
      const cleanKey = mapFollowupTypeToKey(followup.type);

      // ── CONGESTION CHECK ──
      // Se já enviamos alguma mensagem por esta automação nos últimos 60 segundos,
      // adiamos o envio atual para evitar rajadas e manter comportamento natural.
      const recentSend = await db.prepare(`
        SELECT COUNT(*) as count FROM dispatch_logs
        WHERE automation_id = ? AND sent_at >= datetime('now', '-1 minute')
      `).bind(followup.automation_id).first<{ count: number }>();

      if (recentSend && recentSend.count > 0) {
        const postponeMinutes = 3 + Math.floor(Math.random() * 5); // 3 a 7
        await db.prepare(
          "UPDATE scheduled_followups SET scheduled_for = datetime('now', '+' || ? || ' minutes') WHERE id = ?"
        ).bind(postponeMinutes, followup.id).run();
        console.log(`[Followup Cron] Canal congestionado (${recentSend.count} msg nos últimos 60s). Adiado job ${followup.type} de ${followup.phone} em ${postponeMinutes} min.`);
        continue;
      }

      // ── REGRA DE OURO 1: Se o cliente já pagou, já tem acesso ou funil encerrou, cancela qualquer job pendente
      // EXCEÇÃO: follow-ups de upsell pós-venda (upsell_5min, upsell_10min) são projetados para disparar
      // DEPOIS que o cliente já pagou e recebeu acesso — por isso são excluídos desta regra.
      const isUpsellFollowup = cleanKey.startsWith('upsell_');

      if (!isUpsellFollowup && (followup.payment_confirmed || followup.access_delivered || (followup.funil_encerrado && cleanKey !== 'finalizador' && cleanKey !== 'cobrador_final'))) {
        await markFollowup(db, followup.id, 'cancelled');
        console.log(`[Followup] Job ${followup.type} para ${followup.phone} CANCELADO (cliente já pagou/acesso entregue/funil encerrado).`);
        continue;
      }

      // ── REGRA DE OURO 1B: Para upsell pós-venda, cancelar apenas se o upsell já foi enviado
      if (isUpsellFollowup && followup.upsell_enviado) {
        await markFollowup(db, followup.id, 'cancelled');
        console.log(`[Followup] Job ${followup.type} para ${followup.phone} CANCELADO (upsell já foi enviado anteriormente).`);
        continue;
      }

      // ── REGRA DE OURO 2: Jobs de Silêncio (Vigia / Finalizador)
      // Se já recebeu os PDFs (seq2_called = 1), cancela pois o lead já reengajou
      if ((cleanKey === 'vigia' || cleanKey === 'finalizador') && followup.seq2_called) {
        await markFollowup(db, followup.id, 'cancelled');
        console.log(`[Followup] Job de Silêncio ${followup.type} para ${followup.phone} CANCELADO (lead já reengajou/seq2 enviada).`);
        continue;
      }

      // ── REGRA DE OURO 3: Jobs de Cobrança / Incentivo (Incentivador / Cobradores)
      // Se ainda não recebeu os PDFs (seq2_called = 0), cancela pois não há o que cobrar/incentivar
      if ((cleanKey === 'incentivador' || cleanKey.startsWith('cobrador_')) && !followup.seq2_called) {
        await markFollowup(db, followup.id, 'cancelled');
        console.log(`[Followup] Job de Cobrança ${followup.type} para ${followup.phone} CANCELADO (e-books ainda não foram entregues).`);
        continue;
      }

      // ── REGRA DE OURO 4: Verificar se o estágio está desativado no banco de dados (enabled = 0) ──
      const stageConfig = await db.prepare(
        "SELECT enabled, delay_minutes FROM automation_followup_stages WHERE automation_id = ? AND key = ?"
      ).bind(followup.automation_id, cleanKey).first<{ enabled: number; delay_minutes: number }>();
      
      if (stageConfig && stageConfig.enabled === 0) {
        await markFollowup(db, followup.id, 'cancelled');
        console.log(`[Followup] Job ${followup.type} para ${followup.phone} CANCELADO (estágio desativado no painel).`);
        continue;
      }

      // ── REGRA DE OURO 5: Verificação Dinâmica de Delay (respeitar mudanças de tempo no painel) ──
      // Se o usuário mudou o delay no frontend (ex: 15min → 20min), o follow-up deve respeitar o novo tempo.
      // Calcula: created_at + delay_minutes_atual >= agora? Se não, reagenda para o tempo correto.
      if (stageConfig && stageConfig.delay_minutes && followup.created_at) {
        try {
          const createdAtMs = new Date(followup.created_at.replace(' ', 'T') + 'Z').getTime();
          const expectedFireMs = createdAtMs + (stageConfig.delay_minutes * 60 * 1000);
          const nowMs = Date.now();

          if (nowMs < expectedFireMs) {
            // O delay foi aumentado no painel — reagendar para o novo tempo correto
            const newScheduledFor = new Date(expectedFireMs).toISOString();
            await db.prepare(
              "UPDATE scheduled_followups SET scheduled_for = ? WHERE id = ?"
            ).bind(newScheduledFor, followup.id).run();
            console.log(`[Followup] Job ${followup.type} para ${followup.phone} REAGENDADO para ${newScheduledFor} (delay atualizado no painel para ${stageConfig.delay_minutes}min).`);
            continue;
          }
        } catch (delayErr) {
          console.error(`[Followup] Erro ao verificar delay dinâmico para ${followup.type}:`, delayErr);
          // Em caso de erro, segue com o disparo normal
        }
      }

      // ── REGRA HÍBRIDA DE BLOQUEIO (Foto de Perfil & Tracinhos ACK) ──
      const hadProfilePic = followup.had_profile_pic || 0;
      let isBlocked = false;

      if (hadProfilePic === 1) {
        // Regra 1: O lead tinha foto inicialmente. Verificamos se ela sumiu.
        try {
          const { getProfilePicture } = await import('../../services/whatsapp-service');
          const currentPicUrl = await getProfilePicture(db, followup.whatsapp_api_id, followup.phone);
          if (!currentPicUrl) {
            console.log(`[Followup] 🛑 Bloqueio detectado para ${followup.phone}! (Tinha foto de perfil inicial, mas ela sumiu)`);
            isBlocked = true;
          }
        } catch (picErr) {
          console.error(`[Followup] Erro ao verificar foto de perfil para ${followup.phone}:`, picErr);
        }
      } else {
        // Regra 2: O lead NÃO tinha foto inicialmente. Fallback para verificação do Tracinho (ACK = 1 por mais de 2 horas)
        try {
          const { getLatestMessageStatus } = await import('../../services/whatsapp-service');
          
          // Buscar a última mensagem do assistente no banco D1 para saber quando foi enviada
          const lastMsg = await db.prepare(`
            SELECT created_at FROM messages 
            WHERE conversation_id = ? AND role = 'assistant'
            ORDER BY created_at DESC LIMIT 1
          `).bind(followup.conversation_id).first<{ created_at: string }>();

          if (lastMsg && lastMsg.created_at) {
            const lastSentTime = new Date(lastMsg.created_at.replace(' ', 'T') + 'Z').getTime();
            const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);

            if (lastSentTime < twoHoursAgo) {
              // A mensagem foi enviada há mais de 2 horas. Consultamos o status real na UAZAPI.
              const status = await getLatestMessageStatus(db, followup.whatsapp_api_id, followup.phone);
              
              if (status === 1) {
                // Status 1 = Sent (1 tracinho, não entregue). Após 2 horas, indica bloqueio.
                console.log(`[Followup] 🛑 Bloqueio detectado para ${followup.phone}! (Última mensagem enviada há mais de 2h continua com 1 tracinho - status 1)`);
                isBlocked = true;
              }
            }
          }
        } catch (ackErr) {
          console.error(`[Followup] Erro ao validar status de entrega (ACK) para ${followup.phone}:`, ackErr);
        }
      }

      if (isBlocked) {
        // Cancelar follow-up atual
        await markFollowup(db, followup.id, 'cancelled');
        
        // Pausar IA do contato para não disparar mais nada no futuro
        await db.prepare(`
          UPDATE conversations 
          SET ai_active = 0, status = 'arquivado', updated_at = datetime('now')
          WHERE id = ?
        `).bind(followup.conversation_id).run();

        // Registrar uma mensagem de log do sistema no histórico para fins de visualização no Chat
        await db.prepare(`
          INSERT INTO messages (id, conversation_id, content, role)
          VALUES (?, ?, ?, 'manual')
        `).bind(
          crypto.randomUUID(), 
          followup.conversation_id, 
          '⚠️ IA Pausada Automaticamente: Possível bloqueio detectado (o contato removeu a foto de perfil ou as mensagens não foram entregues).'
        ).run();

        console.log(`[Followup] IA desativada e follow-ups cancelados para o lead bloqueador ${followup.phone}.`);
        continue;
      }

      // Registrar env no realtime-service para acesso global na request
      try {
        const { registerEnv } = await import("../../services/realtime-service");
        registerEnv(followup.conversation_id, env);
      } catch (err) {
        console.error("[processScheduledFollowups] Error registering env:", err);
      }

      try {
        // Executar o follow-up
        await executeFollowup(env, followup);
      } finally {
        // Desregistrar env do realtime-service
        try {
          const { unregisterEnv } = await import("../../services/realtime-service");
          unregisterEnv(followup.conversation_id);
        } catch {}
      }

      // Marcar como executado
      await markFollowup(db, followup.id, 'executed');
      processed++;

    } catch (error) {
      console.error(`[Followup] Erro no follow-up ${followup.id}:`, error);
      // Evitar loop infinito em caso de falha de rede/LLM
      await markFollowup(db, followup.id, 'executed');
    }
  }

  return processed;
}

// ============================================================
// EXECUTOR INDIVIDUAL DE CADA AGENTE
// ============================================================

export async function executeFollowup(
  env: Env,
  followup: {
    id: string;
    conversation_id: string;
    type: string;
    phase: string;
    payment_confirmed: number;
    total_paid: number;
    seq2_called: number;
    oferta_19_90_feita: number;
    phone: string;
    contact_name: string;
    whatsapp_api_id: string;
    automation_id: string;
    automation_slug: string;
    attendant_name?: string;
    promessa_pagamento_data?: string | null;
  }
): Promise<void> {
  const db = env.DB;
  const nome = followup.contact_name || 'amiga';
  const firstName = nome.split(/\s+/)[0] || 'amiga';

  const cleanKey = mapFollowupTypeToKey(followup.type);

  // ── PRÉ-CHECAGEM DE PAGAMENTO PARA PROMESSA DE PAGAMENTO ──
  if (cleanKey === 'followup_cobranca_promessa') {
    const leadPaid = await db.prepare(
      "SELECT pago, valor_pago FROM automation_leads WHERE phone = ? AND automation_id = ?"
    ).bind(followup.phone, followup.automation_id).first<{ pago: number; valor_pago: number }>();

    const statePaid = await db.prepare(
      "SELECT payment_confirmed, access_delivered FROM conversation_state WHERE conversation_id = ?"
    ).bind(followup.conversation_id).first<{ payment_confirmed: number; access_delivered: number }>();

    const hasPaid = (leadPaid && leadPaid.pago === 1) || (statePaid && (statePaid.payment_confirmed === 1 || statePaid.access_delivered === 1));

    if (hasPaid) {
      console.log(`[Followup Promessa] Cliente ${followup.phone} já realizou o pagamento. Cancelando lembrete de cobrança e finalizando chat.`);
      
      // Marcar follow-up como cancelado no banco
      await markFollowup(db, followup.id, 'cancelled');
      
      // Marcar conversa como finalizada com sucesso
      await db.prepare(
        "UPDATE conversations SET status = 'finalizado_com_sucesso', updated_at = datetime('now') WHERE id = ?"
      ).bind(followup.conversation_id).run();
      
      return;
    }
  }

  // Buscar se existe a configuração customizada desta etapa na automação
  let customStage: { message: string | null; class: string | null; rewrite_mode: string | null; variations: string | null } | null = null;
  try {
    customStage = await db.prepare(
      "SELECT message, class, rewrite_mode, variations FROM automation_followup_stages WHERE automation_id = ? AND key = ? AND enabled = 1"
    ).bind(followup.automation_id, cleanKey).first();
  } catch (err) {
    console.error(`[Followup] Erro ao buscar configuração da etapa ${cleanKey} (tipo: ${followup.type}) no D1:`, err);
  }

  // Interceptador para envio de follow-up customizado do banco de dados
  if (customStage && customStage.message) {
    console.log(`[Followup Custom] Enviando etapa customizada '${followup.type}' para ${followup.phone}`);

    const rewriteMode = customStage.rewrite_mode || 'none';
    const variationsText = customStage.variations || '[]';

    // Se a mensagem for uma lista serializada em JSON de blocos
    if (customStage.message.startsWith('[')) {
      try {
        const fields = JSON.parse(customStage.message) as {
          type: "text" | "audio" | "image" | "video" | "document";
          content: string;
          file_name?: string | null;
        }[];

        // Pré-carregar reescritas dinâmicas em paralelo para evitar timeouts de requisições sequenciais no cron
        const rewrittenTexts = new Map<number, string>();
        const rewritePromises: Promise<any>[] = [];

        if (rewriteMode === 'dynamic') {
          fields.forEach((field, index) => {
            if (field.type === 'text') {
              rewritePromises.push(
                rewriteMessageViaLLM(db, followup.automation_id, field.content, 1)
                  .then(dynList => {
                    const rewritten = dynList[0] || field.content;
                    rewrittenTexts.set(index, rewritten);
                  })
                  .catch(err => {
                    console.error(`[Followup Custom Dynamic Rewrite] Erro no bloco ${index}:`, err);
                    rewrittenTexts.set(index, field.content);
                  })
              );
            }
          });
        }

        if (rewritePromises.length > 0) {
          console.log(`[Followup Custom] Executando ${rewritePromises.length} reescritas dinâmicas em paralelo...`);
          await Promise.all(rewritePromises);
        }

        const messageLog: string[] = [];
        let hasPixKey = false;

        for (let i = 0; i < fields.length; i++) {
          const field = fields[i];
          if (i > 0) {
            await sleep(2000);
          }

          if (field.type === 'text') {
            let textToSend = field.content;

            if (rewriteMode === 'dynamic') {
              textToSend = rewrittenTexts.get(i) || field.content;
            } else if (rewriteMode === 'static' && variationsText !== '[]') {
              try {
                const variationsList = JSON.parse(variationsText);
                if (Array.isArray(variationsList) && variationsList.length > 0) {
                  // Rotação sequencial - apenas para o primeiro bloco de texto
                  const isFirstText = fields.filter(f => f.type === 'text')[0] === field;
                  if (isFirstText) {
                    let index = 0;
                    const numId = Number(followup.id);
                    if (!isNaN(numId)) {
                      index = numId % variationsList.length;
                    } else {
                      const charSum = followup.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                      index = charSum % variationsList.length;
                    }
                    textToSend = variationsList[index];
                  }
                }
              } catch (e) {
                console.error("[Followup Message Static Variations] Erro:", e);
              }
            }

            let text = textToSend
              .replace(/{{nome}}/g, nome)
              .replace(/{nome}/g, nome)
              .replace(/{{primeiro_nome}}/g, firstName)
              .replace(/{primeiro_nome}/g, firstName)
              .replace(/{{nome_cliente}}/g, nome)
              .replace(/{nome_cliente}/g, nome);

            let upsellPrice = 14.50;
            if (followup.type.startsWith('upsell_')) {
              try {
                const upsellConfig = await db.prepare(`
                  SELECT price FROM product_upsells pu
                  JOIN product_automations pa ON pu.product_id = pa.product_id
                  WHERE pa.automation_id = ?
                `).bind(followup.automation_id).first<{ price: number }>();
                if (upsellConfig) upsellPrice = upsellConfig.price;
              } catch (e) {}
            }

            const formattedPrice = upsellPrice.toFixed(2).replace('.', ',');
            text = text
              .replace(/{{valor}}/g, formattedPrice)
              .replace(/{valor}/g, formattedPrice)
              .replace(/{{preco}}/g, formattedPrice)
              .replace(/{preco}/g, formattedPrice);

            if (text.includes('61982277206')) {
              hasPixKey = true;
            }

            await sendText(db, followup.whatsapp_api_id, followup.phone, text, env.KV, followup.automation_id);
            messageLog.push(text);

          } else if (field.type === 'audio') {
            await sendAudio(db, followup.whatsapp_api_id, followup.phone, field.content, env.KV, followup.automation_id);
            messageLog.push(`[Áudio de follow-up enviado]`);
          } else if (field.type === 'image') {
            await sendImage(db, followup.whatsapp_api_id, followup.phone, field.content, field.file_name || undefined, env.KV, followup.automation_id);
            messageLog.push(`[Imagem enviada]`);
          } else if (field.type === 'video') {
            await sendVideo(db, followup.whatsapp_api_id, followup.phone, field.content, field.file_name || undefined, env.KV, followup.automation_id);
            messageLog.push(`[Vídeo enviado]`);
          } else if (field.type === 'document') {
            await sendDocument(db, followup.whatsapp_api_id, followup.phone, field.content, field.file_name || 'documento.pdf', env.KV, followup.automation_id);
            messageLog.push(`[PDF de follow-up enviado: ${field.file_name || 'documento'}]`);
          }
        }

        // Salvar as mensagens no histórico
        for (const logText of messageLog) {
          await saveFollowupMessage(db, followup.conversation_id, logText);
        }

        // Enviar Pix button se detectado
        if (hasPixKey) {
          try {
            console.log(`[Followup] Enviando botão nativo do Pix para ${followup.phone}`);
            await sendPixButton(db, followup.whatsapp_api_id, followup.phone, '61982277206', 'PHONE', 'R G FEITOSA 153DF', env.KV, followup.automation_id);
          } catch (pixErr) {
            console.error(`[Followup] Erro ao enviar botão do Pix no followup:`, pixErr);
          }
        }

      } catch (jsonErr) {
        console.error("[Followup Custom] Erro ao processar blocks JSON, caindo de volta para texto puro:", jsonErr);
        // Fallback para texto simples se der erro no JSON parse
        let text = customStage.message
          .replace(/{{nome}}/g, nome)
          .replace(/{nome}/g, nome)
          .replace(/{{primeiro_nome}}/g, firstName)
          .replace(/{primeiro_nome}/g, firstName)
          .replace(/{{nome_cliente}}/g, nome)
          .replace(/{nome_cliente}/g, nome);
        
        let upsellPrice = 14.50;
        if (followup.type.startsWith('upsell_')) {
          try {
            const upsellConfig = await db.prepare(`
              SELECT price FROM product_upsells pu
              JOIN product_automations pa ON pu.product_id = pa.product_id
              WHERE pa.automation_id = ?
            `).bind(followup.automation_id).first<{ price: number }>();
            if (upsellConfig) upsellPrice = upsellConfig.price;
          } catch (e) {}
        }
        const formattedPrice = upsellPrice.toFixed(2).replace('.', ',');
        text = text
          .replace(/{{valor}}/g, formattedPrice)
          .replace(/{valor}/g, formattedPrice)
          .replace(/{{preco}}/g, formattedPrice)
          .replace(/{preco}/g, formattedPrice);
        
        await sendFollowupMessage(db, followup, text);
      }
    } else {
      // 1. Determinar o template de mensagem (aplicar reescrita com IA se configurado)
      let messageTemplate = customStage.message;

      if (rewriteMode === 'dynamic') {
        console.log(`[Followup Custom] Acionando LLM em tempo real para reescrever follow-up ${followup.type} para ${followup.phone}`);
        const dynList = await rewriteMessageViaLLM(db, followup.automation_id, customStage.message, 1);
        messageTemplate = dynList[0] || customStage.message;
      } else if (rewriteMode === 'static' && variationsText !== '[]') {
        try {
          const variationsList = JSON.parse(variationsText);
          if (Array.isArray(variationsList) && variationsList.length > 0) {
            // Rotação sequencial baseada no ID incremental ou UUID char sum
            let index = 0;
            const numId = Number(followup.id);
            if (!isNaN(numId)) {
              index = numId % variationsList.length;
            } else {
              // Se for UUID, usar a soma dos caracteres para decidir o index de forma determinística por lead
              const charSum = followup.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
              index = charSum % variationsList.length;
            }
            messageTemplate = variationsList[index];
            console.log(`[Followup Custom] Rotação estática ativada (Var ${index + 1}/${variationsList.length}) para ${followup.phone}`);
          }
        } catch (e) {
          console.error("[Followup Custom] Erro ao rotacionar variações:", e);
        }
      }

      // 2. Enviar mídia associada (customizada ou fallback padrão da etapa)
      let mediaUrl = null;
      if (cleanKey === 'vigia' || followup.type === 'followup_vigia_15min') mediaUrl = MEDIA_URLS.seq3.video;
      else if (cleanKey === 'incentivador' || followup.type === 'followup_incentivador_1h') mediaUrl = MEDIA_URLS.seq3.video2;
      else if (cleanKey.startsWith('upsell_') || followup.type.startsWith('upsell_')) mediaUrl = MEDIA_URLS.upsell.imagem;

      if (mediaUrl) {
        try {
          const isVideo = mediaUrl.toLowerCase().endsWith('.mp4');
          if (isVideo) {
            await sendVideo(db, followup.whatsapp_api_id, followup.phone, mediaUrl, undefined, env.KV, followup.automation_id);
          } else {
            await sendImage(db, followup.whatsapp_api_id, followup.phone, mediaUrl, undefined, env.KV, followup.automation_id);
          }
          await sleep(3000);
        } catch (mediaErr) {
          console.error(`[Followup Custom] Erro ao enviar mídia:`, mediaErr);
        }
      }

      // 3. Formatar e enviar mensagem
      let text = messageTemplate
        .replace(/{{nome}}/g, nome)
        .replace(/{nome}/g, nome)
        .replace(/{{primeiro_nome}}/g, firstName)
        .replace(/{primeiro_nome}/g, firstName)
        .replace(/{{nome_cliente}}/g, nome)
        .replace(/{nome_cliente}/g, nome);

      // Se for upsell, buscar preço dinâmico
      let upsellPrice = 14.50;
      if (followup.type.startsWith('upsell_')) {
        try {
          const upsellConfig = await db.prepare(`
            SELECT price FROM product_upsells pu
            JOIN product_automations pa ON pu.product_id = pa.product_id
            WHERE pa.automation_id = ?
          `).bind(followup.automation_id).first<{ price: number }>();
          if (upsellConfig) upsellPrice = upsellConfig.price;
        } catch (e) {}
      }
      
      const formattedPrice = upsellPrice.toFixed(2).replace('.', ',');
      text = text
        .replace(/{{valor}}/g, formattedPrice)
        .replace(/{valor}/g, formattedPrice)
        .replace(/{{preco}}/g, formattedPrice)
        .replace(/{preco}/g, formattedPrice);

      await sendFollowupMessage(db, followup, text);
    }

    // 3. Executar ações de estado pós-envio de cada etapa
    if (cleanKey === 'vigia' || followup.type === 'followup_vigia_15min') {
      await db.prepare(`
        UPDATE conversation_state 
        SET oferta_19_90_feita = 1, last_tool_called = 'vigia', updated_at = datetime('now')
        WHERE conversation_id = ?
      `).bind(followup.conversation_id).run();
    } else if (cleanKey === 'finalizador' || followup.type === 'followup_finalizador_12h') {
      await db.prepare(`
        UPDATE conversation_state 
        SET funil_encerrado = 1, last_tool_called = 'finalizador', updated_at = datetime('now')
        WHERE conversation_id = ?
      `).bind(followup.conversation_id).run();

      await db.prepare(`
        UPDATE conversations SET status = 'finalizado_sem_sucesso', updated_at = datetime('now') WHERE id = ?
      `).bind(followup.conversation_id).run();
    } else if (cleanKey === 'cobrador_final' || followup.type === 'followup_cobrador_final_58h') {
      await db.prepare(`
        UPDATE conversation_state 
        SET funil_encerrado = 1, last_tool_called = 'cobrador_final', updated_at = datetime('now')
        WHERE conversation_id = ?
      `).bind(followup.conversation_id).run();

      await db.prepare(`
        UPDATE conversations SET status = 'finalizado_sem_sucesso', updated_at = datetime('now') WHERE id = ?
      `).bind(followup.conversation_id).run();
    } else if (cleanKey.startsWith('upsell_') || followup.type.startsWith('upsell_')) {
      try {
        await sendPixButton(db, followup.whatsapp_api_id, followup.phone, '61982277206', 'PHONE', 'R G FEITOSA 153DF', env.KV, followup.automation_id);
      } catch (pixErr) {}

      await db.prepare(`
        UPDATE conversation_state 
        SET upsell_enviado = 1, last_tool_called = 'apoiador', updated_at = datetime('now')
        WHERE conversation_id = ?
      `).bind(followup.conversation_id).run();
    } else {
      // Outras etapas customizadas criadas pelo usuário
      await db.prepare(`
        UPDATE conversation_state 
        SET last_tool_called = ?, updated_at = datetime('now')
        WHERE conversation_id = ?
      `).bind(followup.type, followup.conversation_id).run();
    }

    return; // Encerrar execução com sucesso!
  }

  switch (cleanKey) {    
    // ── 1. VIGIA (Antigo Watchdog — 15min de Silêncio Inicial) ──
    case 'followup_vigia_15min':
    case 'vigia': {
      console.log(`[Followup] Executando Vigia (15min) para ${followup.phone}...`);

      // Envia vídeo dos doces
      if (MEDIA_URLS.seq3.video) {
        await sendVideo(db, followup.whatsapp_api_id, followup.phone, MEDIA_URLS.seq3.video, undefined, env.KV, followup.automation_id);
        await sleep(4000);
      }

      const variations = [
        `Oi, *${firstName}*! 👋

Vi que você ainda não respondeu e fiquei pensando...

Talvez os *200 recheios a frio* não fossem exatamente o que você estava buscando — e tudo bem!

Por isso quero te mostrar algo diferente. Dá uma olhadinha nesse vídeo aqui em cima 👆

Tudo que você viu ali — esses bolos lindos, as fatias generosas, os recheios irresistíveis — *você consegue fazer também.* Não só os recheios, mas qualquer um desses doces.

Porque o que eu tenho pra te oferecer é o *Kit Completo de Confeitaria* 🎉

Olha tudo que vem:

🎥 *Vídeo Aulas Passo a Passo* — aprenda o ponto exato dos recheios na prática, sem erro e sem desperdício
🧁 *Apostila de Massas Especiais* — massas fofinhas, úmidas e bem estruturadas
🍫 *Guia de Brigadeiros sem Fogo* — praticidade e economia sem perder a qualidade gourmet
🍰 *Receitas de Bolo no Pote* — o produto campeão de vendas de qualquer confeiteira
✨ *Recheios Magníficos* — segredos das confeitarias de luxo pra você cobrar mais e se destacar
🌾 *Livro Digital +200 Receitas Zero Açúcar e Zero Glúten* — atenda clientes com restrições e amplie sua clientela
🧊 *Geladinhos Gourmet* — inclusive o famoso geladinho de Nutella que vende igual água no verão
🍿 *Pipocas Gourmet Lucrativas* — produto barato de produzir com margem de lucro altíssima
🥤 *Copos da Felicidade* — a tendência das redes sociais que você pode usar pra lucrar muito
🍮 *Tortinhas Doces no Potinho* — mais de 50 receitas pra vender no delivery, em eventos ou na vizinhança
🏡 *Caseirinho (Bolos Caseiros Lucrativos)* — receita que nossas clientes estão usando pra vender demais
🍰 *Método Fatias de Feira* — mais uma exclusividade que está bombando nas vendas

E o melhor: o kit é *simpre atualizado com receitas novas* e quem garante hoje tem *acesso vitalício* — nunca mais precisa comprar receita nenhuma!

Esse kit completo vale *R$ 120,00 (R$ 10,00 cada receita, estou te enviando 12)* — mas como você ainda não aproveitou a primeira oferta, quero te dar uma condição especial:

👉 *R$19,90 só hoje* e eu libero tudo na hora!

É só fazer o Pix e me mandar o comprovante:

*Chave PIX:*
61982277206

Que Deus abençoe você e abra portas lindas em tudo que você tocar! 🙏`,

        `Olá, *${firstName}*! Tudo bem? 😊

Passando para ver se você conseguiu ver minha última mensagem. Fiquei pensando que talvez só os recheios a frio não fossem exatamente o que você precisava no momento...

Por isso, quero te fazer uma proposta muito melhor! Dá uma olhada no vídeo acima 👆

Você pode produzir exatamente esses mesmos bolos maravilhosos, fatias perfeitas e doces irresistíveis.

Estou liberando para você o nosso *Kit Completo de Confeitaria* 🎉

Veja tudo o que está incluído:

🎥 *Vídeo Aulas Passo a Passo* — o ponto exato de cada recheio na prática, sem desperdício
🧁 *Apostila de Massas Especiais* — estruturadas, fofinhas e super úmidas
🍫 *Guia de Brigadeiros sem Fogo* — receita gourmet rápida, econômica e deliciosa
🍰 *Receitas de Bolo no Pote* — líder absoluto de vendas em qualquer confeitaria
✨ *Recheios Magníficos* — segredos profissionais para valorizar seu produto e cobrar mais
🌾 *Livro Digital +200 Receitas Zero Açúcar e Zero Glúten* — para atender clientes com restrições e lucrar mais
🧊 *Geladinhos Gourmet* — incluindo o de Nutella que vende incrivelmente no calor
🍿 *Pipocas Gourmet Lucrativas* — alta margem de lucro com baixíssimo custo de produção
🥤 *Copos da Felicidade* — o queridinho das redes sociais para você vender muito
🍮 *Tortinhas Doces no Potinho* — mais de 50 receitas práticas para delivery e eventos
🏡 *Caseirinho (Bolos Caseiros Lucrativos)* — o bolo caseiro perfeito que vende todos os dias
🍰 *Método Fatias de Feira* — fatias generosas que estão fazendo o maior sucesso

Esse kit tem atualizações constantes e seu acesso é *vitalício*!

O valor normal do kit é de *R$ 120,00*, mas para te incentivar a começar hoje mesmo, preparei essa condição especial:

👉 *Apenas R$ 19,90 hoje* com liberação imediata!

Faça o Pix e me envie o comprovante:

*Chave PIX:*
61982277206

Desejo que Deus te abençoe muito e ilumine seus caminhos! 🙏✨`,

        `Ei, *${firstName}*! 🌸 Passando rapidinho para te mostrar o vídeo aqui em cima!

Percebi que você não respondeu e imaginei que os recheios a frio fossem pouco para o que você realmente quer alcançar na confeitaria.

Então, decidi fazer algo incrível: vou te dar acesso ao nosso *Kit Completo de Confeitaria*! 🎂✨

Olha a variedade de produtos que você vai receber:

🎥 *Vídeo Aulas Passo a Passo* — para você aprender o ponto perfeito do recheio sem errar nunca
🧁 *Apostila de Massas Especiais* — massas profissionais, úmidas e perfeitas para estruturar bolos
🍫 *Guia de Brigadeiros sem Fogo* — praticidade e extrema economia de gás com sabor gourmet
🍰 *Receitas de Bolo no Pote* — o doce mais vendido e lucrativo do mercado
✨ *Recheios Magníficos* — segredos das confeitarias finas para destacar seu cardápio
🌾 *Livro Digital +200 Receitas Zero Açúcar e Zero Glúten* — conquiste um público qualificado e fiel
🧊 *Geladinhos Gourmet* — a febre do verão com o famoso geladinho de Nutella
🍿 *Pipocas Gourmet Lucrativas* — custo muito baixo de produção e excelente retorno financeiro
🥤 *Copos da Felicidade* — a grande tendência de vendas rápida da internet
🍮 *Tortinhas Doces no Potinho* — mais de 50 receitas incríveis para delivery ou festas
🏡 *Caseirinho (Bolos Caseiros Lucrativos)* — receitas tradicionais que as clientes amam e compram muito
🍰 *Método Fatias de Feira* — o segredo das fatias gigantes que vendem sozinhas

Tudo isso com *acesso vitalício* e atualizações gratuitas incluídas!

Esse material todo vale facilmente *R$ 120,00*, mas quero abrir essa exceção exclusiva para você hoje:

👉 *Só R$ 19,90 agora* e o acesso é todo seu!

Garanta sua vaga fazendo o Pix e mandando o comprovante:

*Chave PIX:*
61982277206

Que Deus abençoe sua vida e derrame prosperidade em seu negócio! 🙏💕`,

        `*${firstName}*, tudo bem? 🥰

Fiquei preocupada porque não tive seu retorno... Talvez a apostila de *200 recheios a frio* não fosse exatamente o que você procurava no momento.

Por isso, quero expandir sua oportunidade com o vídeo acima! 👆

Com o nosso método, você vai dominar a arte de fazer massas, recheios e doces perfeitos para vender todos os dias!

Apresento o nosso *Kit Completo de Confeitaria* 🏆

Veja o passo a passo de tudo que você vai liberar:

🎥 *Vídeo Aulas Passo a Passo* — aprenda o ponto correto de cada recheio de forma visual e simples
🧁 *Apostila de Massas Especiais* — a base ideal com massas fofinhas e estruturadas
🍫 *Guia de Brigadeiros sem Fogo* — faça doces incríveis economizando tempo e gás
🍰 *Receitas de Bolo no Pote* — a receita certeira para faturar alto toda semana
✨ *Recheios Magníficos* — receitas nobres para você se diferenciar da concorrência
🌾 *Livro Digital +200 Receitas Zero Açúcar e Zero Glúten* — atenda a um público gigante com restrições alimentares
🧊 *Geladinhos Gourmet* — o doce refrescante que vende o ano inteiro (inclui sabor Nutella)
🍿 *Pipocas Gourmet Lucrativas* — margens de lucro gigantescas com ingredientes simples
🥤 *Copos da Felicidade* — monte copos lindos que chamam atenção e vendem muito rápido
🍮 *Tortinhas Doces no Potinho* — +50 receitas de sucesso garantido para vender na sua região
🏡 *Caseirinho (Bolos Caseiros Lucrativos)* — bolos afetivos perfeitos para o café da tarde dos seus clientes
🍰 *Método Fatias de Feira* — a tendência de fatias generosas e extremamente lucrativas

Esse kit é atualizado frequentemente e seu acesso nunca expira (*vitalício*)!

O valor original é de *R$ 120,00*, mas hoje você leva tudo com um super desconto:

👉 *Apenas R$ 19,90 hoje*!

Aproveite essa chance fazendo o Pix e enviando o comprovante:

*Chave PIX:*
61982277206

Que Deus te guarde, abençoe seus planos e multiplique suas vendas! 🙏❤️`,

        `*${firstName}*! Dá uma espiadinha no vídeo que enviei logo acima! 👆🍿

Sei que sua rotina deve ser corrida, por isso não respondeu. Pensei aqui: e se em vez de apenas recheios, eu te entregasse a estrutura completa para você montar seu próprio negócio de doces em casa?

Estou falando do nosso aclamado *Kit Completo de Confeitaria*! 🧁✨

Olha a quantidade de apostilas e aulas que preparei para você:

🎥 *Vídeo Aulas Passo a Passo* — aulas práticas mostrando o ponto exato dos recheios sem erros
🧁 *Apostila de Massas Especiais* — receitas testadas de massas fofas e estruturadas
🍫 *Guia de Brigadeiros sem Fogo* — doces finos sem precisar fogão, rápido e econômico
🍰 *Receitas de Bolo no Pote* — o produto perfeito para começar a vender e lucrar no mesmo dia
✨ *Recheios Magníficos* — o toque gourmet que faz os clientes pagarem mais pelos seus bolos
🌾 *Livro Digital +200 Receitas Zero Açúcar e Zero Glúten* — multiplique suas vendas atendendo dietas restritivas
🧊 *Geladinhos Gourmet* — receitas refrescantes de sucesso, incluindo o de Nutella cremosa
🍿 *Pipocas Gourmet Lucrativas* — doce prático de fazer com um retorno financeiro gigante
🥤 *Copos da Felicidade* — a sobremesa mais desejada do momento nas redes sociais
🍮 *Tortinhas Doces no Potinho* — 50+ receitas para faturar muito em eventos e delivery
🏡 *Caseirinho (Bolos Caseiros Lucrativos)* — os bolos caseiros que vendem sozinhos no dia a dia
🍰 *Método Fatias de Feira* — fatias maravilhosas que encantam os clientes e geram alta margem

E mais: você terá *acesso vitalício* a todas as futuras atualizações gratuitamente!

Este kit completo custaria *R$ 120,00*, mas hoje faço essa oferta única:

👉 *Só R$ 19,90 hoje* com entrega imediata!

Faça o Pix e me mande o comprovante por aqui:

*Chave PIX:*
61982277206

Desejo que Deus te dê muita saúde, abra portas maravilhosas e derrame bênçãos em sua vida! 🙏💕`
      ];
      const text = variations[Math.floor(Math.random() * variations.length)];
      await sendFollowupMessage(db, followup, text);
      
      // Atualiza estado do D1 indicando a oferta
      await db.prepare(`
        UPDATE conversation_state 
        SET oferta_19_90_feita = 1, last_tool_called = 'vigia', updated_at = datetime('now')
        WHERE conversation_id = ?
      `).bind(followup.conversation_id).run();
      break;
    }

    // ── 2. FINALIZADOR (Antigo Closer — 12h pós-Vigia Silêncio) ──
    case 'followup_finalizador_12h':
    case 'finalizador': {
      console.log(`[Followup] Executando Finalizador (12h) para ${followup.phone}...`);

      const variations = [
        `*${firstName}*! 🌟

Olha, eu sei que já te mandei algumas mensagens e prometo que essa é a última.

Mas eu não conseguiria encerrar sem fazer uma última tentativa — porque eu realmente acredito que tudo que te mostrei pode mudar o seu dia a dia de um jeito que você ainda não imagina.

*R$12,90.* Sabe o que isso representa? É menos do que um lanche. É menos do que um corrida de aplicativo. E é o valor que eu estou colocando em todo o kit completo — com acesso vitalício, receitas novas toda atualização, e tudo aquilo que já te apresentei antes. 👇

Eu poderia ter fechado essa oferta ontem. Mas fui estendendo porque quero de verdade ver as pessoas aproveitando isso — não só vender. Só que hoje é o limite real. Quando o relógio bater meia-noite, esse valor some e eu não consigo mais segurar.

Não é pressão. É só a realidade.

Se você deixar passar, pode até encontrar o kit em outro momento — mas não por esse preço. Esse valor foi um esforço meu pra tornar acessível pra qualquer pessoa, independente da situação.

*Chave PIX:*
61982277206

Manda o comprovante até meia-noite e eu libero tudo na mesma hora. Simples assim.

Que Deus abençoe cada passo seu, abra portas que ninguém pode fechar e derrame prosperidade em tudo que você tocar! 🙏`,

        `*${firstName}*! 🌸

Sei que já te enviei algumas mensagens e prometo de coração que esta será a minha última tentativa de falar com você por aqui.

Eu só não podia desistir sem te dar uma chance definitiva — porque eu sei o quanto o nosso Kit Completo de Confeitaria pode transformar a sua renda e trazer praticidade para o seu dia a dia.

Por apenas *R$ 12,90*. Pensa bem: é menos que o valor de um pão de queijo com café. Menos que uma tarifa de transporte. E por esse valor simbólico, você garante o Kit Completo vitalício com vídeo aulas e atualizações constantes! 👇

Eu poderia ter encerrado essa oportunidade ontem. Mas estendi o prazo porque meu objetivo maior é ver você lucrando e crescendo na confeitaria. Só que hoje é o prazo final. Quando der meia-noite, o sistema desativa esse preço promocional e eu não consigo reativar.

Não quero te pressionar, é apenas para você não perder essa oportunidade única.

Se deixar passar, poderá até adquirir o kit depois, mas pagará o valor cheio. Fiz de tudo para deixar esse preço acessível para qualquer pessoa começar hoje.

*Chave PIX:*
61982277206

Faça o Pix de *R$ 12,90* e envie o comprovante até a meia-noite para eu liberar seu acesso na hora!

Que Deus guie seus passos, abra caminhos de sucesso e traga abundância para a sua vida! 🙏✨`,

        `Ei, *${firstName}*! 🌟

Passando para te dar um último alô. Prometo que essa é a última mensagem que te envio para respeitar o seu espaço, tudo bem?

Mas eu me sentiria mal se não tentasse uma última vez. Acredito demais no potencial das nossas receitas e aulas para mudar o rumo das suas vendas de doces.

Por apenas *R$ 12,90*. Sabe o que isso compra hoje em dia? Quase nada! É menos que um salgado na padaria. Mas esse pequeno valor pode te dar acesso ao Kit Completo com todas as receitas de bolos no pote, massas, brigadeiros sem fogo e aulas em vídeo com acesso vitalício! 👇

Era para essa oferta ter saído do ar ontem. Eu segurei o desconto porque quero de verdade te ver produzindo e vendendo, e não apenas por negócio. Mas hoje é o limite real. À meia-noite de hoje, o preço vai subir e não tenho como manter essa condição.

É a realidade pura e simples, sem pressão.

Se você decidir não aproveitar agora, talvez encontre o kit mais para frente, mas pelo valor original de R$ 120,00. Esse preço de R$ 12,90 foi um esforço real meu para caber no bolso de qualquer pessoa.

*Chave PIX:*
61982277206

Me mande o comprovante de *R$ 12,90* até a meia-noite e eu libero tudo no seu e-mail imediatamente!

Desejo que Deus te abençoe grandemente, abra portas de prosperidade e prospere tudo que você realizar! 🙏❤️`,

        `*${firstName}*! 🥰

Esta é a minha última mensagem por aqui, prometo que não vou mais te incomodar, tá bom?

Mas eu precisava fazer esse último esforço por você. Tenho plena certeza de que o Kit Completo de Confeitaria é a chave para você começar a faturar alto com doces sem precisar de grandes investimentos.

Estamos falando de apenas *R$ 12,90*. É mais barato que uma caixinha de morangos! Um valor muito pequeno por um material completo com mais de 12 apostilas de massas, bolos, tortas e vídeo aulas vitalícias com atualizações automáticas! 👇

O prazo final era ontem, mas eu insisti em deixar ativo porque quero ver a sua vida mudar através da confeitaria. Mas hoje é o limite definitivo. À meia-noite em ponto, o desconto sai do ar e o preço volta ao normal.

Esta é a nossa realidade final.

Se deixar passar essa oportunidade, você perderá um desconto de quase 90%. Criei esse valor simbólico de R$ 12,90 para que a falta de dinheiro não fosse um obstáculo para você começar.

*Chave PIX:*
61982277206

Mande o comprovante do Pix de *R$ 12,90* até a meia-noite e seu login de aluna é liberado na mesma hora.

Que Deus derrame chuvas de bênçãos sobre você, abra portas onde não há e faça prosperar cada um de seus sonhos! 🙏✨`,

        `Olá, *${firstName}*! 🌟

Sei que já conversamos e prometo que essa é a última mensagem que você vai receber de mim.

Mas eu não podia encerrar nosso contato sem te fazer essa proposta de despedida. Eu realmente acredito no poder transformador do nosso Kit Completo para o seu negócio de doces em casa.

Por apenas *R$ 12,90*. Esse valor é irrisório: é menos que um lanche rápido na rua. Mas é o investimento único que vai te dar acesso vitalício a todas as receitas profissionais, vídeo aulas práticas passo a passo e atualizações gratuitas! 👇

Eu segurei essa oferta o máximo que pude, porque meu desejo sincero é ver você prosperando. Mas hoje é o prazo final absoluto. Quando o relógio bater meia-noite, essa promoção expira e não poderei fazer nada para recuperá-la.

É apenas um aviso sincero da nossa realidade.

Se você perder essa chance, o kit ainda estará disponível no futuro, mas pelo preço normal dele. Preparei essa condição de R$ 12,90 com muito carinho para que qualquer pessoa pudesse ter a oportunidade de mudar de vida.

*Chave PIX:*
61982277206

Basta fazer o Pix de *R$ 12,90* e me enviar a foto do comprovante até a meia-noite para receber tudo imediatamente.

Que Deus te cubra de bênçãos, abra portas extraordinárias e derrame prosperidade em cada projeto seu! 🙏💕`
      ];
      const text = variations[Math.floor(Math.random() * variations.length)];
      await sendFollowupMessage(db, followup, text);
      
      // Encerra o funil
      await db.prepare(`
        UPDATE conversation_state 
        SET funil_encerrado = 1, last_tool_called = 'finalizador', updated_at = datetime('now')
        WHERE conversation_id = ?
      `).bind(followup.conversation_id).run();

      // Marcar conversa como resolvida (final de funil sem resposta)
      await db.prepare(`
        UPDATE conversations
        SET status = 'finalizado_sem_sucesso', updated_at = datetime('now')
        WHERE id = ?
      `).bind(followup.conversation_id).run();
      break;
    }

    // ── 3. INCENTIVADOR (Antigo Ranger — 1h pós-recebimento) ──
    case 'followup_incentivador_1h':
    case 'incentivador': {
      console.log(`[Followup] Executando Incentivador (1h) para ${followup.phone}...`);

      // Envia vídeo motivacional
      if (MEDIA_URLS.seq3.video2) {
        await sendVideo(db, followup.whatsapp_api_id, followup.phone, MEDIA_URLS.seq3.video2, undefined, env.KV, followup.automation_id);
        await sleep(4000);
      }

      const variations = [
        `*${firstName}*, viu esse vídeo lindo de fatias que te mandei aqui em cima? 🍰😍\n\nSó de olhar já dá água na boca! Cada fatia dessa você vende facilmente por *R$ 8,00 a R$ 12,00* na sua vizinhança ou pelas redes sociais.\n\nOu seja, fazendo o Pix de apenas *R$ 10,00* pelas nossas receitas sem fogão (que economizam muito gás!), você recupera todo o seu investimento na venda de um único pedaço de bolo!\n\n💰 *Pix (Celular):* 61982277206\n*Destinatário:* R G FEITOSA 153DF\n\nDá uma olhadinha nos arquivos que te mandei e me conta se ficou alguma dúvida! Estou torcendo muito pelo seu sucesso! 💕`,
        `Ei, *${firstName}*! Reparou na lindeza dessas fatias de bolo no vídeo acima? 🍰✨\n\nElas vendem super rápido! Cada pedaço desse você consegue vender facilmente por *R$ 8,00 a R$ 12,00*.\n\nIsso quer dizer que ao fazer o Pix de *R$ 10,00* pelas receitas de recheios (que são a frio e economizam gás), você recupera o valor pago vendendo apenas 1 fatia!\n\n💰 *Chave Pix (Celular):* 61982277206\n*Destinatário:* R G FEITOSA 153DF\n\nBaixa as apostilas aí e começa a planejar. Qualquer dúvida que tiver, pode me chamar por aqui! 🤗`,
        `*${firstName}*, dá uma olhada nesse vídeo maravilhoso de fatias gourmet! 😍🍰\n\nNa confeitaria, a apresentação é tudo! Você pode vender essas fatias facilmente por *R$ 8,00 a R$ 12,00* cada uma.\n\nO Pix simbólico de *R$ 10,00* pelas nossas receitas sem fogão se paga sozinho logo na primeira fatia que você vender!\n\n💰 *Pix (Celular):* 61982277206\n*Destinatário:* R G FEITOSA 153DF\n\nNão perde tempo, abre os arquivos e dá uma olhada no conteúdo incrível. Estou por aqui se precisar de ajuda! 💕`,
        `Oi, *${firstName}*! Viu que espetáculo de fatias no vídeo acima? Dá vontade de comer na hora! 🍰😋\n\nSabia que você pode faturar de *R$ 8,00 a R$ 12,00* por fatia na sua região?\n\nOu seja, com o Pix de *R$ 10,00* pelas receitas de recheios rápidos que te mandei, você recupera 100% do investimento vendendo apenas uma única fatia de bolo!\n\n💰 *Chave Pix (Celular):* 61982277206\n*Destinatário:* R G FEITOSA 153DF\n\nEstou torcendo muito para você começar a produzir e lucrar. Qualquer dúvida, estou à disposição! 🥰`,
        `*${firstName}*, olha que perfeição essas fatias de bolo no vídeo! 😍✨\n\nElas fazem o maior sucesso de vendas. Você consegue vender cada uma por *R$ 8,00 a R$ 12,00* sem esforço!\n\nO Pix de apenas *R$ 10,00* pelas 200 receitas de recheio a frio se paga na venda de um único pedaço de bolo, além de economizar muito gás de cozinha!\n\n💰 *Pix (Celular):* 61982277206\n*Destinatário:* R G FEITOSA 153DF\n\nMe conta se conseguiu ver as apostilas que enviei! Estou aqui para te apoiar! 💕`
      ];
      const text = variations[Math.floor(Math.random() * variations.length)];
      await sendFollowupMessage(db, followup, text);
      break;
    }

    // ── 4. COBRADOR AMIGO (Antigo Collector 10h) ──
    case 'followup_cobrador_amigo_10h':
    case 'cobrador_amigo': {
      console.log(`[Followup] Executando Cobrador Amigo (10h) para ${followup.phone}...`);

      const variations = [
        `Oi, *${firstName}*! Tudo bem? Passando só pra te mandar um abraço e ver se deu certo de abrir as apostilas! 🤗\n\nSei bem que a nossa rotina na cozinha é uma loucura e às vezes a gente acaba esquecendo das coisas!\n\nEu confio muito na sua honestidade e no seu trabalho, tá? Quando tiver um tempinho, você pode fazer o Pix de *R$ 10,00* por aqui:\n\n💰 *Pix (Celular):* 61982277206\n*Destinatário:* R G FEITOSA 153DF\n\nQualquer coisa me avisa, estou aqui! 💕`,
        `Olá, *${firstName}*! Como estão as coisas por aí? Passando rapidinho para te dar um oi e ver se deu tudo certo com os arquivos! 😊🍰\n\nA nossa vida é super movimentada e é super normal esquecer de fazer algum Pix na correria do dia a dia, eu super entendo!\n\nEu tenho certeza da sua integridade e do sucesso das suas receitas. Se puder, faz o Pix de *R$ 10,00* por aqui:\n\n💰 *Chave Pix (Celular):* 61982277206\n*Destinatário:* R G FEITOSA 153DF\n\nEstou torcendo por você! Qualquer dúvida, estou à disposição! 🥰`,
        `*${firstName}*, tudo joia? Passando para te deixar um abraço carinhoso de confeiteira e saber se as apostilas abriram certinho no seu celular! 🤗\n\nSei como a nossa rotina diária é agitada e cheia de tarefas, e um Pix de valor tão baixinho acaba passando batido na correria!\n\nComo confio totalmente na sua palavra, quando você tiver um momento tranquilo, pode fazer o Pix de *R$ 10,00* por aqui:\n\n💰 *Pix (Celular):* 61982277206\n*Destinatário:* R G FEITOSA 153DF\n\nMuito sucesso nas suas vendas! Qualquer coisa é só me chamar! 💕`,
        `Oi, *${firstName}*! Como você está? Espero que muito bem! Passando só para saber se deu tudo certo no download das receitas! 😍\n\nA correria na cozinha é grande e às vezes esquecemos de pequenas pendências, faz parte da nossa vida de confeiteira!\n\nEu confio muito em você e no valor desse material para o seu crescimento. Quando puder, você faz o Pix de *R$ 10,00* por aqui:\n\n💰 *Chave Pix (Celular):* 61982277206\n*Destinatário:* R G FEITOSA 153DF\n\nQualquer dúvida com as receitas, estou por aqui para te apoiar! 🤗`,
        `Olá, *${firstName}*! Tudo bem por aí? Espero que sim! Passando para ver se deu certo de baixar os e-books e se gostou das receitas! 😊✨\n\nNosso dia a dia é sempre corrido e cheinho de afazeres, por isso é normal esquecer de fazer o pagamento na hora!\n\nEu acredito muito na sua honestidade e no seu potencial. Quando tiver um tempinho na cozinha, faz o Pix de *R$ 10,00* por aqui:\n\n💰 *Pix (Celular):* 61982277206\n*Destinatário:* R G FEITOSA 153DF\n\nTe desejo ótimas vendas e conte comigo! 💕`
      ];
      const text = variations[Math.floor(Math.random() * variations.length)];
      await sendFollowupMessage(db, followup, text);
      break;
    }

    // ── 5. COBRADOR CURIOSO (Antigo Collector 34h) ──
    case 'followup_cobrador_curioso_34h':
    case 'cobrador_curioso': {
      console.log(`[Followup] Executando Cobrador Curioso (34h) para ${followup.phone}...`);

      const variations = [
        `*${firstName}*! Tudo bem? Menina, fiquei curiosa aqui... 🤭\n\nVocê conseguiu dar uma olhada na receita do *Recheio Cremoso de Ninho* ou no de *Chocolate Trufado* que estão na apostila 1? Eles não vão ao fogo e ficam absurdamente firmes!\n\nSei que a correria está grande, mas se puder dar aquela forcinha fazendo o Pix de *R$ 10,00* da nossa apostila, me ajuda muito a continuar produzindo esses materiais com tanto carinho!\n\n💰 *Pix (Celular):* 61982277206\n*Destinatário:* R G FEITOSA 153DF\n\nUma semana abençoada pra você e boas fornadas! 🍰✨`,
        `Oi, *${firstName}*! Tudo bom? Fiquei com uma pontinha de curiosidade aqui... 🤭🍰\n\nVocê já viu a receita do *Recheio Cremoso de Ninho* ou do *Chocolate Trufado* na primeira apostila? O ponto deles é simplesmente perfeito e não gasta gás de cozinha!\n\nSei que o tempo é curto, mas se você puder fazer o Pix de *R$ 10,00* para acertar a apostila, me ajuda demais a continuar mantendo o projeto de pé!\n\n💰 *Chave Pix (Celular):* 61982277206\n*Destinatário:* R G FEITOSA 153DF\n\nDesejo muitas vendas na sua semana! Qualquer dúvida com as receitas me avisa! 💕`,
        `*${firstName}*, tudo joia? Menina, me conta uma coisa... 🤭✨\n\nChegou a abrir a apostila 1 e ver o *Recheio Cremoso de Ninho* e o de *Chocolate Trufado*? Eles são os maiores campeões de elogios porque ficam super firmes em minutos!\n\nSei que a correria do dia a dia é brava, mas se puder dar aquela força fazendo o Pix de *R$ 10,00* do material, me ajuda muito a continuar preparando essas delícias para vocês!\n\n💰 *Pix (Celular):* 61982277206\n*Destinatário:* R G FEITOSA 153DF\n\nUm super abraço e ótimas fornadas por aí! 🥰`,
        `Oi, *${firstName}*! Como estão as coisas? Fiquei super curiosa para saber... 🤭🍰\n\nVocê viu o segredo do *Recheio Cremoso de Ninho* ou do *Chocolate Trufado* que deixei na apostila? Eles são super práticos e não vão ao fogão!\n\nQuando puder, faz o Pix de *R$ 10,00* para apoiar o nosso trabalho e me ajudar a continuar produzindo esses materiais incríveis!\n\n💰 *Chave Pix (Celular):* 61982277206\n*Destinatário:* R G FEITOSA 153DF\n\nQue sua semana seja muito produtiva e cheia de encomendas! 💕`,
        `*${firstName}*, tudo bem por aí? Olha, não aguentei de curiosidade e tive que passar para perguntar... 🤭✨\n\nVocê já viu o passo a passo do *Recheio Cremoso de Ninho* e do *Chocolate Trufado* que estão logo no início da apostila? É de longe a receita que o pessoal mais ama!\n\nSei como a vida na cozinha é movimentada, mas se conseguir fazer o Pix de *R$ 10,00* da apostila hoje, ajuda imensamente o nosso trabalho com a confeitaria!\n\n💰 *Pix (Celular):* 61982277206\n*Destinatário:* R G FEITOSA 153DF\n\nTenha uma semana muito abençoada e cheia de clientes! 🥰`
      ];
      const text = variations[Math.floor(Math.random() * variations.length)];
      await sendFollowupMessage(db, followup, text);
      break;
    }

    // ── 6. COBRADOR FINAL (Antigo Collector 58h — Oferta R$10 Kit) ──
    case 'followup_cobrador_final_58h':
    case 'cobrador_final': {
      console.log(`[Followup] Executando Cobrador Final (58h) para ${followup.phone}...`);

      const variations = [
        `*${firstName}*, estou passando pra te fazer a minha proposta final e te dar um presente de verdade para encerrarmos nossa conversa! 💕\n\nComo você já está com as receitas, se fizer o Pix de *R$ 10,00* hoje, eu vou te liberar de graça todo o nosso *Kit Completo de Confeitaria* (vitalício, com videoaulas, massas e brigadeiros sem fogo)!\n\nÉ isso mesmo: o Kit Completo que custa R$ 25,00 sai por apenas *R$ 10,00* pra você começar com o pé direito! Mas esse link expira *hoje à meia-noite*, tá?\n\n💰 *Pix (Celular):* 61982277206\n*Destinatário:* R G FEITOSA 153DF\n\nFaz o Pix, me manda o comprovante aqui que eu te matriculo na hora com tudo liberado! Um abraço forte e muito sucesso na cozinha! 🤗`,
        `Olá, *${firstName}*! Estou passando para te fazer uma proposta de encerramento incrível e te dar um super presente! ❤️🍰\n\nJá que você está com as receitas de recheios, se fizer o Pix de *R$ 10,00* hoje, eu vou te liberar de graça todo o nosso *Kit Completo de Confeitaria* (videoaulas, brigadeiros sem fogo, massas gourmet e suporte)!\n\nO Kit Completo custa R$ 25,00, mas sai por apenas *R$ 10,00* para você! Mas essa condição especial expira *hoje à meia-noite*, combinado?\n\n💰 *Chave Pix (Celular):* 61982277206\n*Destinatário:* R G FEITOSA 153DF\n\nBasta fazer o Pix, me enviar o comprovante por aqui e eu te libero todo o acesso na hora. Muito sucesso em suas vendas! 🥰`,
        `*${firstName}*, trago uma oportunidade final e imperdível para te dar um grande empurrão nas suas receitas hoje! 💕\n\nPara fecharmos nossa pendência, fazendo o Pix de *R$ 10,00* hoje, eu vou te presentear com o nosso *Kit Completo de Confeitaria* (com todas as videoaulas, receitas de massas e bônus da área de membros)!\n\nIsso mesmo: o Kit Completo de R$ 25,00 por apenas *R$ 10,00*! Mas olha, essa oferta expira *hoje à meia-noite* de verdade!\n\n💰 *Pix (Celular):* 61982277206\n*Destinatário:* R G FEITOSA 153DF\n\nFaz o Pix e me envia o comprovante para eu te matricular agora mesmo. Torço muito pelo seu progresso! 🤗`,
        `Oi, *${firstName}*! Passando rapidinho para te fazer uma proposta de encerramento maravilhosa! 😍✨\n\nComo as receitas de recheio já estão com você, se fizer o Pix de *R$ 10,00* hoje, eu te libero de presente o acesso vitalício ao nosso *Kit Completo de Confeitaria* com videoaulas passo a passo e dezenas de e-books extras!\n\nDe R$ 25,00 por apenas *R$ 10,00*! É a sua chance de levar tudo pelo preço de um único produto, mas esse desconto acaba *hoje à meia-noite*, tá?\n\n💰 *Chave Pix (Celular):* 61982277206\n*Destinatário:* R G FEITOSA 153DF\n\nFaz o Pix, manda o comprovante aqui e já começo o seu cadastro. Um forte abraço e ótimos negócios! 💕`,
        `*${firstName}*, para finalizarmos nossa pendência e te dar um baita incentivo na confeitaria, montei essa condição exclusiva de encerramento! 🤗🍰\n\nFazendo o Pix de *R$ 10,00* hoje, eu vou te dar de presente o *Kit Completo de Confeitaria* vitalício com videoaulas práticas, massas fofinhas e muito mais!\n\nVocê leva todo o Kit Completo de R$ 25,00 por apenas *R$ 10,00*! Mas atenção, esse link e desconto expiram *hoje à meia-noite*!\n\n💰 *Pix (Celular):* 61982277206\n*Destinatário:* R G FEITOSA 153DF\n\nÉ só fazer o Pix e me mandar a foto do comprovante para eu liberar seu acesso na hora. Muito sucesso na sua cozinha e Deus te abençoe! 💕`
      ];
      const text = variations[Math.floor(Math.random() * variations.length)];
      await sendFollowupMessage(db, followup, text);
      
      // Encerra o funil
      await db.prepare(`
        UPDATE conversation_state 
        SET funil_encerrado = 1, last_tool_called = 'cobrador_final', updated_at = datetime('now')
        WHERE conversation_id = ?
      `).bind(followup.conversation_id).run();

      // Marcar conversa como resolvida (final de funil de cobrança)
      await db.prepare(`
        UPDATE conversations
        SET status = 'finalizado_sem_sucesso', updated_at = datetime('now')
        WHERE id = ?
      `).bind(followup.conversation_id).run();
      break;
    }

    // ── 7. APOIADOR (Antigo Promoter — 5min/10min pós-compra Máquina de Vendas Online) ──
    case 'upsell_5min':
    case 'upsell_10min': {
      console.log(`[Followup] Executando Apoiador/Upsell (${followup.type}) para ${followup.phone}...`);

      // Buscar se o estágio de upsell está configurado e enabled
      const stage = await db.prepare(
        "SELECT id, enabled, rewrite_mode, variations FROM automation_funnel_stages WHERE automation_id = ? AND stage_key = 'upsell'"
      ).bind(followup.automation_id).first<{ id: string; enabled: number; rewrite_mode: string; variations: string }>();

      if (stage && stage.enabled) {
        console.log(`[Followup Upsell] Enviando estágio do funil 'upsell' dinâmico para ${followup.phone}`);
        const stateRow = await db.prepare(
          "SELECT client_email FROM conversation_state WHERE conversation_id = ?"
        ).bind(followup.conversation_id).first<{ client_email: string }>();

        const mockContact = { name: followup.contact_name };
        const mockState = { 
          client_email: stateRow?.client_email || '', 
          total_paid: followup.total_paid 
        };

        const automationObj = { id: followup.automation_id, slug: followup.automation_slug };

        const stageRes = await sendFunnelStage(
          db, 
          followup.whatsapp_api_id, 
          followup.phone, 
          automationObj, 
          mockContact, 
          mockState, 
          'upsell', 
          env.KV
        );

        if (stageRes.sent) {
          // Salvar mensagens no histórico
          for (const msg of stageRes.messageLog) {
            await saveFollowupMessage(db, followup.conversation_id, msg);
          }

          // Enviar botão oficial do Pix com o valor dinâmico do upsell
          let upsellPrice = 14.50;
          try {
            const upsellConfig = await db.prepare(`
              SELECT price FROM product_upsells pu
              JOIN product_automations pa ON pu.product_id = pa.product_id
              WHERE pa.automation_id = ?
            `).bind(followup.automation_id).first<{ price: number }>();
            if (upsellConfig) upsellPrice = upsellConfig.price;
          } catch (e) {}

          try {
            console.log(`[Followup Upsell] Enviando botão oficial Pix R$ ${upsellPrice} para ${followup.phone}`);
            await sendPixButton(db, followup.whatsapp_api_id, followup.phone, '61982277206', 'PHONE', 'R G FEITOSA 153DF');
          } catch (pixErr) {
            console.error(`[Followup] Erro ao enviar botão do Pix:`, pixErr);
          }

          // Salva a flag no estado
          await db.prepare(`
            UPDATE conversation_state 
            SET upsell_enviado = 1, last_tool_called = 'apoiador', updated_at = datetime('now')
            WHERE conversation_id = ?
          `).bind(followup.conversation_id).run();

          break;
        }
      }

      // Buscar configuração do upsell no banco
      let upsellConfig: any = null;
      try {
        upsellConfig = await db.prepare(`
          SELECT pu.* 
          FROM product_upsells pu
          JOIN product_automations pa ON pu.product_id = pa.product_id
          WHERE pa.automation_id = ?
        `).bind(followup.automation_id).first();
      } catch (dbErr) {
        console.error('[Followup] Erro ao buscar configuração de upsell no D1:', dbErr);
      }

      const upsellPrice = upsellConfig ? upsellConfig.price : 14.50;
      const upsellPriceFormatted = upsellPrice.toFixed(2).replace('.', ',');

      // Enviar imagem do upsell antes do texto explicativo
      if (MEDIA_URLS.upsell.imagem) {
        try {
          console.log(`[Followup] Enviando imagem de upsell para ${followup.phone}: ${MEDIA_URLS.upsell.imagem}`);
          await sendImage(db, followup.whatsapp_api_id, followup.phone, MEDIA_URLS.upsell.imagem);
          await sleep(2500); // Aguardar o carregamento da imagem antes do texto
        } catch (imgErr) {
          console.error(`[Followup] Erro ao enviar imagem de upsell:`, imgErr);
        }
      }

      const rawVariations = [
        `*${firstName}*, espero que você já esteja amando e aproveitando cada pedacinho da nossa área de membros! 😍🍰\n\nBut deixa eu te falar uma verdade sincera que eu aprendi na prática: de que adianta ter as receitas de recheios mais incríveis e cremosas do Brasil se a sua cozinha continuar vazia e sem encomendas? 🍰🤔 Ter receitas perfeitas é só metade do caminho. A outra metade — e a mais importante — é saber como atrair clientes prontos para comprar de você todos os dias!\n\nFoi por isso que eu criei o meu treinamento completo *Máquina de Vendas Online*! Nele, eu te entrego o roteiro exato para você usar o seu celular e o Instagram para lotar a sua agenda de clientes na sua cidade, mesmo que você esteja começando do absoluto zero e não queira gastar dinheiro com anúncios!\n\nEle é vendido normalmente por R$ 89,90, mas como você acabou de entrar para o nosso time, hoje eu consigo te liberar o acesso vitalício por apenas *R$ {PRICE}* adicionais!\n\nCaso você queira garantir essa oportunidade única, basta fazer o Pix de *R$ {PRICE}* abaixo e me enviar o comprovante aqui que eu te libero o acesso na hora! 🎯\n\n💰 *Pix (Celular):* 61982277206`,
        `Ei, *${firstName}*! Tudo certinho? Espero que esteja adorando a nossa área de membros! 🥰🍰\n\nDeixa eu te fazer uma pergunta rápida: você quer viver de confeitaria ou ter apenas um hobby de fim de semana? 🤭 A diferença entre uma confeiteira que fatura alto e uma que só trabalha muito é a divulgação. Não adianta ter o melhor doce da sua região se as pessoas não sabem que você existe!\n\nPor isso, o treinamento *Máquina de Vendas Online* é tão vital. Eu te mostro o passo a passo perfeito para transformar as suas redes sociais em um ímã de clientes locais, enchendo o seu celular de mensagens de pedidos todos os dias! É a chave para fazer as receitas que você acabou de levar venderem de verdade!\n\nO valor normal dele fora daqui é R$ 89,90, mas hoje, como você é nossa nova aluna, você garante tudo com acesso vitalício por apenas *R$ {PRICE}* adicionais!\n\nSi você quiser aproveitar essa chance, faça o Pix de *R$ {PRICE}* abaixo e me envie o comprovante aqui que eu te libero o acesso na hora! 🎯\n\n💰 *Pix (Celular):* 61982277206`,
        `*${firstName}*, espero que o seu primeiro contato com a nossa área de membros esteja sendo espetacular! 😍✨\n\nDeixa eu te dar um conselho de amiga: o maior erro de quem começa na confeitaria é achar que basta fazer um doce gostoso para vender. A verdade é que sem a estratégia certa de vendas, as receitas perfeitas acabam ficando paradas na geladeira... e isso desanima muito! 🍰🤔\n\nCom a *Máquina de Vendas Online*, você vai aprender a divulgar seus doces no Instagram, WhatsApp e Facebook da forma certa para fazer as vendas acontecerem de verdade na sua cidade. É o método definitivo para você ter encomendas batendo à sua porta todos os dias!\n\nO preço oficial dele é R$ 89,90, mas hoje eu consigo liberar a sua vaga por apenas *R$ {PRICE}* adicionais!\n\nCaso você queira garantir, basta fazer o Pix de *R$ {PRICE}* na chave abaixo e me enviar o comprovante aqui que eu te libero o acesso na hora! 🎯\n\n💰 *Pix (Celular):* 61982277206`,
        `Oi, *${firstName}*! Como está sendo a experiência na área de membros? Espero que maravilhosa! 🥰🍰\n\nMe conta uma coisa: você já se imaginou com o celular apitando toda hora com novas mensagens de clientes encomendando seus doces? 📲✨ Essa é a realidade das alunas que aplicam o método *Máquina de Vendas Online*!\n\nEu criei esse curso rápido para te dar o roteiro exato de como lotar a sua agenda de pedidos locais usando apenas o celular e as redes sociais. É a engrenagem que falta para transformar suas receitas de recheio em um negócio altamente lucrativo!\n\nEle costuma ser vendido por R$ 89,90, mas apenas hoje você pode adicionar esse curso vitalício no seu painel por apenas *R$ {PRICE}* adicionais!\n\nSe você quiser garantir o seu acesso agora, basta fazer o Pix de *R$ {PRICE}* abaixo e me enviar o comprovante aqui que eu te libero o acesso na hora! 🎯\n\n💰 *Pix (Celular):* 61982277206`,
        `*${firstName}*, passando rapidinho para saber se já deu tudo certo com o seu acesso e se já está testando as receitas! 😍🍰\n\nEu torço muito pelo seu sucesso, e por isso preciso ser sincera: receitas deliciosas são a base, mas o que coloca dinheiro no seu bolso todos os dias são as vendas! E ficar esperando o cliente aparecer sozinho é o caminho mais demorado... 🤭🍰\n\nNa *Máquina de Vendas Online*, eu te ensino a usar o Instagram e o WhatsApp de forma estratégica para atrair dezenas de clientes da sua cidade toda semana. É o segredo que as confeitarias de sucesso usam para vender todos os dias!\n\nO valor dele na plataforma é R$ 89,90, mas hoje sai por apenas *R$ {PRICE}* adicionais com acesso vitalício!\n\nCaso você queira aproveitar essa oportunidade única, faça o Pix de *R$ {PRICE}* na chave abaixo e me enviar o comprovante aqui que eu te libero o acesso na hora! 🎯\n\n💰 *Pix (Celular):* 61982277206`
      ];

      const variationSelected = rawVariations[Math.floor(Math.random() * rawVariations.length)];
      const text = variationSelected.replace(/{PRICE}/g, upsellPriceFormatted);

      await sendFollowupMessage(db, followup, text);

      // Enviar botão oficial do Pix com o valor dinâmico
      try {
        console.log(`[Followup] Enviando botão oficial Pix R$ ${upsellPrice} para ${followup.phone}`);
        await sendPixButton(db, followup.whatsapp_api_id, followup.phone, '61982277206', 'PHONE', 'R G FEITOSA 153DF', env.KV, followup.automation_id);
      } catch (pixErr) {
        console.error(`[Followup] Erro ao enviar botão do Pix:`, pixErr);
      }

      // Salva a flag no estado
      await db.prepare(`
        UPDATE conversation_state 
        SET upsell_enviado = 1, last_tool_called = 'apoiador', updated_at = datetime('now')
        WHERE conversation_id = ?
      `).bind(followup.conversation_id).run();
      break;
    }

    case 'followup_cobranca_promessa': {
      console.log(`[Followup] Executando Cobrança de Promessa de Pagamento para ${followup.phone}...`);

      const attendant = followup.attendant_name || 'Julia';
      const { getPromessaCobrancaPrompt } = await import('./prompts');
      const systemPrompt = getPromessaCobrancaPrompt(firstName, attendant);

      const generatedText = await callFollowupLLM(db, followup.automation_id, systemPrompt);

      const fallbackText = `*${firstName}*, tudo bem? 😊 Passando rapidinho para te dar um oi e saber se está tudo certinho por aí!
      
Verifiquei aqui no sistema e vi que o seu Pix ainda não foi confirmado. Como você tinha combinado comigo de fazer hoje, queria ver se deu algum problema ou se posso te ajudar em alguma coisa? 🍰

Qualquer dúvida, estou aqui! Se precisar dos dados do Pix novamente, é a nossa chave celular:

💰 *Chave PIX:* 61982277206
👤 *Destinatário:* R G FEITOSA 153DF
🏛️ *Banco:* Banco Cora

Que Deus te abençoe! 🙏💕`;

      const finalText = generatedText ? formatWhatsAppShortParagraphs(generatedText) : fallbackText;

      await sendFollowupMessage(db, followup, finalText);
      break;
    }

    default:
      console.warn(`[Followup] Tipo desconhecido omitido: ${followup.type}`);
  }
}

// ============================================================
// CHamadas AUXILIARES
// ============================================================

/**
 * Auxiliar para chamar a LLM para geração do follow-up
 */
async function callFollowupLLM(
  db: D1Database,
  automationId: string,
  systemPrompt: string
): Promise<string | null> {
  try {
    const response = await callLLM({
      db,
      automationId,
      systemPrompt,
      messages: [{ role: 'user', content: 'Gere a cópia para a mensagem do follow-up de vendas.' }],
    });

    return response.content || null;
  } catch (error) {
    console.error('[Followup LLM] Falha ao invocar LLM de follow-up:', error);
    return null;
  }
}

/**
 * Envia mensagem de follow-up ao cliente (particiona se houver mais de 1000 caracteres)
 */
async function sendFollowupMessage(
  db: D1Database,
  followup: { whatsapp_api_id: string; phone: string; conversation_id: string; automation_id?: string },
  text: string,
  env?: any
): Promise<void> {
  // Se a mensagem for longa, contiver nova linha ou a oferta do Kit Completo,
  // evitamos fatiá-la para preservar a formatação rica de parágrafos e listas do WhatsApp.
  const isLongOrFormatted = text.length > 500 || text.includes('Kit Completo') || text.includes('\n');

  if (isLongOrFormatted) {
    // Dividir a mensagem em blocos de parágrafos naturais de até 800 caracteres para evitar o botão "Ler mais"
    const blocks = splitIntoParagraphBlocks(text, 800);

    for (let i = 0; i < blocks.length; i++) {
      await sendText(db, followup.whatsapp_api_id, followup.phone, blocks[i], undefined, followup.automation_id);
      if (i < blocks.length - 1) {
        await sleep(calculateDelay(3000, 5000)); // Delay humano de digitação entre blocks
      }
    }
  } else {
    const parts = partitionMessage(text);

    for (let i = 0; i < parts.length; i++) {
      await sendText(db, followup.whatsapp_api_id, followup.phone, parts[i], undefined, followup.automation_id);
      if (i < parts.length - 1) {
        await sleep(calculateDelay(2000, 4000));
      }
    }
  }

  // Se a mensagem contiver a chave Pix celular, enviar o botão nativo Pix de forma segura
  if (text.includes('61982277206')) {
    try {
      console.log(`[Followup] Enviando botão nativo do Pix para ${followup.phone}`);
      await sendPixButton(db, followup.whatsapp_api_id, followup.phone, '61982277206', 'PHONE', 'R G FEITOSA 153DF', undefined, followup.automation_id);
    } catch (pixErr) {
      console.error(`[Followup] Erro ao enviar botão do Pix no followup:`, pixErr);
    }
  }

  await saveFollowupMessage(db, followup.conversation_id, text, env);
}

/**
 * Divide uma mensagem longa em blocos de parágrafos naturais,
 * mantendo a formatação interna (\n\n) intacta, mas limitando o tamanho
 * de cada bloco para evitar o truncamento do WhatsApp (botão "Ler mais").
 */
function splitIntoParagraphBlocks(text: string, maxChars: number = 800): string[] {
  if (!text) return [];

  // Dividir por quebras de linha duplas (parágrafos)
  const paragraphs = text.split(/\n\s*\n/);
  const blocks: string[] = [];
  let currentBlock: string[] = [];
  let currentLength = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // Se adicionar este parágrafo excede o limite, salva o bloco atual e inicia um novo
    if (currentBlock.length > 0 && currentLength + trimmed.length + 2 > maxChars) {
      blocks.push(currentBlock.join('\n\n'));
      currentBlock = [];
      currentLength = 0;
    }

    currentBlock.push(trimmed);
    currentLength += trimmed.length + (currentBlock.length > 1 ? 2 : 0);
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock.join('\n\n'));
  }

  return blocks;
}

/**
 * Grava mensagem do follow-up no histórico
 */
async function saveFollowupMessage(
  db: D1Database,
  conversationId: string,
  content: string,
  env?: any
): Promise<void> {
  const msgId = crypto.randomUUID();
  await db.prepare(
    'INSERT INTO messages (id, conversation_id, content, role) VALUES (?, ?, ?, \'assistant\')'
  ).bind(msgId, conversationId, content).run();

  await db.prepare(
    'UPDATE conversations SET updated_at = datetime(\'now\') WHERE id = ?'
  ).bind(conversationId).run();

  try {
    const { getRegisteredEnv, notifyNewMessage } = await import("../../services/realtime-service");
    const activeEnv = env || getRegisteredEnv(conversationId);
    if (activeEnv) {
      await notifyNewMessage(activeEnv, conversationId, {
        id: msgId,
        content,
        role: 'assistant'
      });
    }
  } catch (err) {
    console.error("[saveFollowupMessage] Error notifying realtime follow-up message:", err);
  }
}

/**
 * Atualiza status do follow-up
 */
async function markFollowup(
  db: D1Database,
  followupId: string,
  status: 'executed' | 'cancelled'
): Promise<void> {
  await db.prepare(
    'UPDATE scheduled_followups SET status = ?, executed_at = datetime(\'now\') WHERE id = ?'
  ).bind(status, followupId).run();
}
