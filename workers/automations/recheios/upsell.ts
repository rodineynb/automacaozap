/**
 * Lógica de Upsell para a automação Recheios
 * 
 * Após o pagamento confirmado, agendamos um upsell para 10 minutos depois.
 * O upsell oferece o Kit Completo por +R$ 5,00.
 * 
 * Se o cliente recusar, a Julia oferece downsell por R$ 7,50.
 * Se recusar novamente, libera o Kit Completo de graça (estratégia de fidelização).
 */

import type { Env } from '../../app';
import { callLLM } from '../../services/llm-service';
import { sendText, sendImage } from '../../services/whatsapp-service';
import { partitionMessage, calculateDelay, sleep, adjustScheduledTimeForSilentHours } from '../../services/message-utils';
import { updateState } from '../../automation-engine';
import { PRODUCT, TEXTS, MEDIA_URLS } from './config';
import { getUpsellPrompt } from './prompts';

// ============================================================
// EXECUÇÃO DO UPSELL
// ============================================================

/**
 * Executa a oferta de upsell (chamado pelo followups.ts)
 */
export async function executeUpsell(
  env: Env,
  followup: {
    conversation_id: string;
    phone: string;
    contact_name: string;
    whatsapp_api_id: string;
    automation_id: string;
  }
): Promise<void> {
  const db = env.DB;
  const nome = followup.contact_name || 'amiga';

  // Verificar estado atual
  const state = await db.prepare(
    'SELECT * FROM conversation_state WHERE conversation_id = ?'
  ).bind(followup.conversation_id).first<{
    upsell_offered: number;
    kit_completo_offered: number;
    total_paid: number;
    payment_confirmed: number;
  }>();

  if (!state) return;

  // Se já ofertou upsell ou já existe oferta de kit completo, não repetir
  if (state.upsell_offered || state.kit_completo_offered) {
    return;
  }

  // Se não pagou, não fazer upsell
  if (!state.payment_confirmed) {
    return;
  }

  // Marcar upsell como oferecido
  await updateState(db, followup.conversation_id, {
    upsell_offered: 1,
    last_tool_called: 'upsell',
  });

  // Enviar imagem de upsell (se configurada)
  if (MEDIA_URLS.upsell.imagem) {
    await sendImage(db, followup.whatsapp_api_id, followup.phone, MEDIA_URLS.upsell.imagem);
    await sleep(3000);
  }

  // Gerar e enviar mensagem de upsell
  try {
    const response = await callLLM({
      db,
      automationId: followup.automation_id,
      systemPrompt: getUpsellPrompt(nome),
      messages: [{ role: 'user', content: 'Gere a mensagem de upsell.' }],
    });

    if (response.content) {
      const parts = partitionMessage(response.content);
      for (let i = 0; i < parts.length; i++) {
        await sendText(db, followup.whatsapp_api_id, followup.phone, parts[i]);
        if (i < parts.length - 1) {
          await sleep(calculateDelay(2000, 4000));
        }
      }

      // Salvar no histórico
      const msgId = crypto.randomUUID();
      await db.prepare(
        'INSERT INTO messages (id, conversation_id, content, role) VALUES (?, ?, ?, \'assistant\')'
      ).bind(msgId, followup.conversation_id, response.content).run();

      try {
        const { notifyNewMessage } = await import("../../services/realtime-service");
        await notifyNewMessage(env, followup.conversation_id, {
          id: msgId,
          content: response.content,
          role: 'assistant',
        });
      } catch {}
    }
  } catch (error) {
    console.error('[Upsell] Erro ao gerar mensagem:', error);

    // Fallback: enviar texto fixo
    const fallbackText = TEXTS.upsellOffer(nome);
    await sendText(db, followup.whatsapp_api_id, followup.phone, fallbackText);

    const msgId = crypto.randomUUID();
    await db.prepare(
      'INSERT INTO messages (id, conversation_id, content, role) VALUES (?, ?, ?, \'assistant\')'
    ).bind(msgId, followup.conversation_id, fallbackText).run();

    try {
      const { notifyNewMessage } = await import("../../services/realtime-service");
      await notifyNewMessage(env, followup.conversation_id, {
        id: msgId,
        content: fallbackText,
        role: 'assistant',
      });
    } catch {}
  }
}

/**
 * Verifica se deve agendar upsell após pagamento
 * Chamado pelo tools.ts após executar a ferramenta "pagamento"
 */
export async function scheduleUpsellIfNeeded(
  db: D1Database,
  conversationId: string,
  automationSlug: string,
  state: {
    upsell_offered: number;
    kit_completo_offered: number;
    seq2_called: number;
    total_paid: number;
  }
): Promise<void> {
  // Só oferecer upsell se:
  // 1. SEQ2 foi chamada (cliente já tem as receitas)
  // 2. Pagamento entre R$10 e R$15 (não pagou kit completo)
  // 3. Upsell ainda não foi oferecido
  // 4. Não existe oferta de kit completo no histórico
  if (
    state.seq2_called &&
    state.total_paid >= 10 && state.total_paid <= 15 &&
    !state.upsell_offered &&
    !state.kit_completo_offered
  ) {
    let scheduledDate = new Date(Date.now() + 10 * 60 * 1000);
    scheduledDate = adjustScheduledTimeForSilentHours(scheduledDate);
    const scheduledFor = scheduledDate.toISOString();
    await db.prepare(
      'INSERT INTO scheduled_followups (id, conversation_id, automation_slug, type, scheduled_for) VALUES (?, ?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), conversationId, automationSlug, 'upsell_10min', scheduledFor).run();
  }
}
