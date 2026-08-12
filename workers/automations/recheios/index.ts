/**
 * Módulo principal da automação ReceitasVIP (Recheios à Prova de Fogo)
 * 
 * Motor de execução híbrido com agente unificado para o funil de vendas.
 * Combina código determinístico para ações físicas com IA de diálogo contextual.
 */

import type { AutomationModule, AutomationContext } from '../../automation-engine';
import { updateState } from '../../automation-engine';
import { callLLM } from '../../services/llm-service';
import { sendText, downloadMedia, sendPixButton } from '../../services/whatsapp-service';
import { ocrImage, ocrPdf, transcribeAudio } from '../../services/media-service';
import { partitionMessage, calculateDelay, sleep, formatWhatsAppShortParagraphs } from '../../services/message-utils';
import { getCachedOcrApiKey, getCachedTranscriptionApiKey } from '../../services/cache-service';
import { PRODUCT, DELAYS } from './config';
import {
  getAgentPrompt,
  getScoutClassifierPrompt,
  getCRMAgentPrompt
} from './prompts';
import { TOOL_DEFINITIONS, executeTool, saveAssistantMessages, sendFunnelStage } from './tools';

// ============================================================
// FILTROS DETERMINÍSTICOS EM CÓDIGO (PATTERN MATCHING DE ALTA PRECISÃO)
// ============================================================

/**
 * Detecta se a mensagem é um aceite simples (ex: "Ok", "sim", "👍").
 */
function isSimpleAcceptance(text: string): boolean {
  if (!text) return false;
  
  // Normalizar: minúsculo, sem acentos comuns, sem pontuação, sem espaços extras
  const clean = text
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, ""); // remove pontuação

  // Termos exatos ou curtos que representam concordância
  const exactMatches = new Set([
    'ok', 'okey', 'okay', 'sim', 'quero', 'pode', 'manda', 'bora', 'fechado',
    'aceito', 'gostaria', 'interesse', 'ta', 'tá', 'bom', 'pode mandar', 'pode enviar',
    'quero sim', 'sim por favor', 'sim pfv', 'ta bom', 'tá bom', 'combinado', 'perfeito',
    'pode ser', 'manda ai', 'envia ai', 'com certeza'
  ]);

  if (exactMatches.has(clean)) {
    return true;
  }

  // Emojis de joinha ou concordância
  const emojis = ['👍', '🆗', '👌', '🤝', '🙌', '👏', '✅'];
  for (const emoji of emojis) {
    if (text.includes(emoji)) {
      // Garantir que não existam negações explícitas na frase
      if (!clean.includes('nao') && !clean.includes('nem') && !clean.includes('nunca')) {
        return true;
      }
    }
  }

  // Análise flexível de frases curtas positivas (ex: "quero sim!", "sim por favor")
  if (clean.length < 15) {
    const positiveWords = ['pode', 'manda', 'envia', 'quero', 'sim', 'ok', 'bora'];
    const negativeWords = ['nao', 'nem', 'nunca', 'rejeito', 'recuso', 'cancelar', 'no', 'diferente'];
    
    const hasPositive = positiveWords.some(word => clean.includes(word));
    const hasNegative = negativeWords.some(word => clean.includes(word));
    
    if (hasPositive && !hasNegative) {
      return true;
    }
  }

  return false;
}

/**
 * Detecta se a mensagem é um comprovante ou pix determinístico.
 */
function isDeterministicPayment(text: string, msgType: string): boolean {
  if (!text) return false;
  const clean = text.toLowerCase();

  const hasPaymentKeywords = clean.includes('comprovante') || 
                             clean.includes('paguei') || 
                             clean.includes('pagamento') || 
                             clean.includes('transferencia') || 
                             clean.includes('transferência') ||
                             clean.includes('enviei o pix') ||
                             clean.includes('pix feito') ||
                             clean.includes('comprovant') ||
                             clean.includes('cora') ||
                             clean.includes('feitosa') ||
                             clean.includes('r$');

  if (msgType === 'image' || msgType === 'document') {
    return hasPaymentKeywords;
  }

  return false;
}

/**
 * Detecta se a mensagem é um pedido determinístico de reenvio.
 */
function isRequestingResend(text: string): boolean {
  if (!text) return false;
  
  // Normalizar: minúsculo, sem acentos, sem pontuação, sem espaços extras
  const clean = text
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "") // remove pontuação
    .replace(/\s+/g, ' '); // remove espaços extras

  // Expressões comuns de reenvio
  const triggers = [
    'manda de novo',
    'me manda de novo',
    'envia de novo',
    'enviar de novo',
    'mandar de novo',
    'manda novamente',
    'envia novamente',
    'enviar novamente',
    'mandar novamente',
    'nao recebi',
    'nao chegou',
    'nao veio',
    'cade as receitas',
    'cade meu link',
    'kd as receitas',
    'kd meu link',
    'nao recebi o link',
    'nao recebi o material',
    'nao recebi as receitas',
    'reenvia',
    'reenviar',
    'mandar novamente',
    'manda mais uma vez',
    'mandar mais uma vez',
    'envia mais uma vez',
    'consegue me mandar de novo',
    'pode me mandar de novo',
    'consegue mandar de novo',
    'pode mandar de novo',
    'me envia de novo',
    'me envia novamente',
    'cade os pdf',
    'cade os pdfs',
    'cade o pdf',
    'kd os pdfs',
    'kd o pdf',
    'manda o pdf',
    'manda os pdfs',
    'nao chegou os pdfs',
    'nao recebi os pdfs',
    'cade as apostilas',
    'cade a apostila',
    'kd as apostilas',
    'kd a apostila',
    'cade os arquivos',
    'cade os arquivo',
    'kd os arquivos',
    'kd os arquivo'
  ];

  for (const trigger of triggers) {
    if (clean === trigger || clean.includes(trigger)) {
      return true;
    }
  }

  // Verifica se o texto contém padrões clássicos como "nao recebi nada", "nao veio nada"
  if (clean.includes('nao recebi') || clean.includes('nao veio') || clean.includes('nao chegou')) {
    return true;
  }

  return false;
}

/**
 * Realiza uma auditoria rigorosa no comprovante de pagamento Pix usando LLM com fallback síncrono.
 * Valida a presença do destinatário correto (FEITOSA), ID de transação, status e chave Pix.
 */
async function validateAndExtractReceipt(
  text: string,
  ctx: AutomationContext
): Promise<{ isValid: boolean; reason: string; value: number }> {
  const { env, automation } = ctx;
  const cleanText = text.trim();

  // 1. Filtragem prévia síncrona contra falsos positivos gritantes
  const cleanLower = cleanText.toLowerCase();
  const hasBasicKeywords = cleanLower.includes('feitosa') || 
                           cleanLower.includes('cora') || 
                           cleanLower.includes('61982277206') ||
                           cleanLower.includes('autenticacao') || 
                           cleanLower.includes('autenticação') ||
                           cleanLower.includes('transacao') || 
                           cleanLower.includes('transação') ||
                           cleanLower.includes('fim a fim') ||
                           cleanLower.includes('endtoend') ||
                           cleanLower.includes('comprovante');

  if (!hasBasicKeywords || cleanText.length < 25) {
    return {
      isValid: false,
      reason: 'O texto enviado não apresenta os dados estruturados de um comprovante Pix legítimo (faltam chaves Pix, ID de transação ou destinatário correto). Por favor, envie uma foto legível do comprovante Pix realizado.',
      value: 10
    };
  }

  // 2. Auditoria rigorosa via LLM para precisão absoluta
  try {
    const systemPrompt = `Você é um auditor financeiro sênior especializado em auditoria de comprovantes de pagamento PIX no Brasil.
Seu objetivo é analisar o texto extraído por OCR de uma imagem/documento e determinar de forma extremamente rigorosa se o texto corresponde a um comprovante legítimo de pagamento PIX concluído com sucesso.

Regras Estritas de Validação:
1. Destinatário Correto: O destinatário do pagamento DEVE ser "R G FEITOSA" ou conter "FEITOSA". Se o destinatário for diferente (ou se não for possível identificá-lo sob nenhuma variação viável), o comprovante deve ser REJEITADO.
2. ID da Transação: O comprovante DEVE conter um código de transação / ID de transação Pix legítimo (ID fim a fim, que geralmente começa com "E" e possui 32 caracteres contendo letras e números, ou um código de autenticação legível). Se não houver ID/Autenticação de transação, REJEITE.
3. Chave Pix ou Banco: Deve indicar a chave Pix celular "61982277206", ou o banco destinatário "Cora" / "Banco Cora", ou referências à transação para o recebedor.
4. Status de Sucesso: O comprovante DEVE ser de uma transação concluída/paga com sucesso (ex: "Pix realizado", "Pagamento concluído", "Transferência enviada", "Comprovante de Pix"). Se for apenas um agendamento futuro ("Agendado", "Comprovante de Agendamento") ou transação falhada, REJEITE.
5. Texto de conversa comum ou alegações simples ("paguei", "enviei", "vou enviar") sem dados bancários de comprovante são ESTRITAMENTE REJEITADOS.
6. Flexibilidade de Valor: NÃO rejeite o comprovante com base no valor pago. Aceitamos pequenas variações para mais ou para menos em relação às ofertas do funil (como R$ 9,90, R$ 10,00, R$ 12,90, R$ 14,50, R$ 19,90, R$ 25,00, etc.). O foco absoluto deve ser na autenticidade e legitimidade do Pix. Apenas extraia o valor numérico real em BRL pago e retorne no campo 'value'.
7. Ruídos e Captchas: Ignore completamente qualquer texto de CAPTCHA, desafios de segurança ("digite os caracteres da imagem", etc.), marcas d'água ou ruídos de sobreposição. Foque única e exclusivamente nos dados financeiros do comprovante Pix.

Sua resposta DEVE ser estritamente um JSON no seguinte formato (sem blocos markdown \`\`\`json ou explicações extras, apenas o JSON puro):
{
  "is_valid": true ou false,
  "reason": "Explicação detalhada e amigável em português do motivo da aprovação ou da rejeição (diga o que faltou, ex: destinatário incorreto, agendamento de pagamento, ou falta do ID de transação)",
  "value": 10.00 (o valor numérico decimal extraído se for válido, ou null se for inválido)
}`;

    const response = await callLLM({
      db: env.DB,
      automationId: automation.id,
      systemPrompt: systemPrompt,
      messages: [{ role: 'user', content: `Analise o seguinte texto e retorne o JSON de auditoria:\n\n${cleanText}` }],
      kv: env.KV,
      leadPhone: ctx.contact.phone,
      leadName: ctx.contact.name || ctx.state.client_name || '',
    });

    const llmContent = response.content.trim();
    console.log(`[OCR Receipt Auditor] LLM raw response: "${llmContent}"`);
    
    // Tentar parsear o JSON retornado pela LLM
    // Limpar possíveis marcações markdown
    const jsonStr = llmContent.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(jsonStr) as { is_valid: boolean; reason: string; value: number | null };
    
    if (result && typeof result.is_valid === 'boolean') {
      const parsedValue = typeof result.value === 'number' ? result.value : 10;
      console.log(`[OCR Receipt Auditor] LLM Audited: isValid=${result.is_valid}, value=${parsedValue}, reason="${result.reason}"`);
      return {
        isValid: result.is_valid,
        reason: result.reason || 'Comprovante auditado com sucesso.',
        value: parsedValue
      };
    }
  } catch (err) {
    console.error('[OCR Receipt Auditor] LLM auditing failed, executing regex fallback:', err);
  }

  // Fallback determinístico síncrono por segurança se a LLM falhar por completo
  const hasFeitosa = cleanLower.includes('feitosa');
  const hasTransactionId = /e\d{8,}/.test(cleanLower) || cleanLower.includes('autenticacao') || cleanLower.includes('autenticação') || cleanLower.includes('transação') || cleanLower.includes('transacao') || cleanLower.includes('fim a fim') || cleanLower.includes('autenticad');
  const isAgendamento = cleanLower.includes('agendamento') || cleanLower.includes('agendada');

  if (hasFeitosa && hasTransactionId && !isAgendamento) {
    // Tentar extrair o valor via regex clássico
    let extractedValue = 10;
    const brlMatch = cleanText.match(/(?:r\$|pix|pago)\s*([\d,.]+)/i);
    if (brlMatch && brlMatch[1]) {
      const valStr = brlMatch[1].replace(',', '.');
      const parsed = parseFloat(valStr);
      if (!isNaN(parsed)) extractedValue = parsed;
    }
    return {
      isValid: true,
      reason: 'Aprovado via auditoria de fallback determinística (Destinatário e ID identificados).',
      value: extractedValue
    };
  }

  return {
    isValid: false,
    reason: 'Não foi possível confirmar os dados deste comprovante de forma automática (chave Pix, ID de transação ou destinatário incorreto). Por favor, envie uma foto legível do comprovante Pix realizado.',
    value: 10
  };
}

// ============================================================
// MÓDULO DE AUTOMAÇÃO PRINCIPAL
// ============================================================

const recheiosModule: AutomationModule = {
  async handleMessage(ctx: AutomationContext): Promise<void> {
    const { message, state, env, automation, contact, conversation, history } = ctx;

    try {
      // ── PASSO 1: Porteiro filtra primeiro contato ────────────────
      if (!state.seq1_called) {
        // Envia direto para o HERALD (Anunciador)
        await executeTool(ctx, 'seq1', {});
        return;
      }

      // ── PASSO 2: Processar mídia se houver (OCR / Transcrição) ──
      let processedText = message.textContent;

      if (message.messageType === 'image' && message.mediaId) {
        processedText = await processImageWithFallback(ctx);
      } else if (message.messageType === 'audio' && message.mediaId) {
        processedText = await processAudioWithFallback(ctx);
      } else if (message.messageType === 'document' && message.mediaId) {
        processedText = await processDocumentWithFallback(ctx);
      }

      if (!processedText || processedText.trim() === '') {
        return;
      }

      // ── INTERCEPTADOR DETERMINÍSTICO DE PAGAMENTO ────────────────
      if (isDeterministicPayment(processedText, message.messageType)) {
        console.log(`[Recheios] Interceptador determinístico de Pagamento ativado para ${contact.phone}`);
        const audit = await validateAndExtractReceipt(processedText, ctx);
        if (audit.isValid) {
          console.log(`[Recheios] Comprovante válido (Valor: ${audit.value}). Registrando pagamento...`);
          let dateStr = 'hoje';
          const dateMatch = processedText.match(/• DATA DO PAGAMENTO:\s*([^\n\r]+)/);
          if (dateMatch && dateMatch[1] && !dateMatch[1].includes('não')) {
            dateStr = dateMatch[1].trim();
          }
          // Extrair ID da transação se disponível no texto formatado
          let txId = null;
          const txMatch = processedText.match(/• ID DA TRANSAÇÃO \/ AUTENTICAÇÃO:\s*([^\n\r]+)/i);
          if (txMatch && txMatch[1] && !txMatch[1].includes('não')) {
            txId = txMatch[1].trim();
          }

          await executeTool(ctx, 'pagamento', {
            valor_pagamento: audit.value,
            pago: 'true',
            data_comprovante: dateStr,
            ...(txId ? { id_transacao: txId } : {})
          });
          return;
        } else {
          console.log(`[Recheios] Comprovante inválido ou imagem de suporte. Não abortando para permitir processamento pela LLM. Razão: ${audit.reason}`);
        }
      }

      // (Fixed Code Agent removed. Pre-payment phase is now processed entirely by LLM)


      // ── PASSO 2.5 (PORTEIRO CRM): Verificar se um disparo de CRM foi enviado a este cliente ──
      const hasCrmSent = await env.DB.prepare(
        "SELECT id FROM crm_responses WHERE phone = ? AND automation_id = ? LIMIT 1"
      ).bind(contact.phone, automation.id).first<{ id: string }>();

      // ── DETECTOR DETERMINÍSTICO DE ACEITE SIMPLES ────────────────
      if (!state.seq2_called && isSimpleAcceptance(processedText)) {
        console.log(`[Recheios] Interceptador determinístico de Aceite ativado para ${contact.phone}: "${processedText}"`);
        await executeTool(ctx, 'seq2', {});
        return;
      }

      // ── PASSO 3: Roteamento ──
      // 3a. Se há disparo de CRM ativo, rotear para o Agente CRM (fluxo separado)
      if (hasCrmSent) {
        console.log(`[Recheios] Roteamento para CRM Agent para ${contact.phone}`);
        const crmOutput = await runCRMAgent(ctx, processedText);
        if (crmOutput && crmOutput.trim() !== '') {
          // Extrair apenas o texto conversacional (sem resultados técnicos de ferramentas)
          const textPart = crmOutput.split('[Resultado Técnico das Ações]')[0].trim();
          if (textPart) {
            const formattedCrm = formatWhatsAppShortParagraphs(textPart);
            await sendResponse(ctx, formattedCrm);

            // Auto-enviar botão Pix se a resposta mencionar dados do Pix
            const upperText = textPart.toUpperCase();
            if (upperText.includes('PIX') || upperText.includes('61982277206') || upperText.includes('CHAVE') || upperText.includes('R G FEITOSA')) {
              try {
                await sendPixButton(env.DB, automation.whatsapp_api_id, contact.phone, '61982277206', 'PHONE', 'R G FEITOSA 153DF', env.KV);
              } catch (pixErr) {
                console.error(`[CRM] Erro ao enviar botão Pix:`, pixErr);
              }
            }
          }
        }
        return;
      }

      // ── PASSO 3b: Agente Unificado (Vendas + Checkout + Suporte em um) ──
      const lead = await env.DB.prepare(
        'SELECT id, cliente_codigo FROM automation_leads WHERE phone = ? AND automation_id = ?'
      ).bind(contact.phone, automation.id).first<{ id: string; cliente_codigo: number | null }>();

      const leadId = lead?.cliente_codigo ? String(lead.cliente_codigo) : (lead?.id || 'unknown');
      const clientName = contact.name || state.client_name || 'amiga';
      const attendantName = (automation as any).attendant_name || 'Julia';

      // Scout Classifier para enriquecer o contexto do agente
      const intentTag = await runTriagemClassifier(ctx, processedText);

      // Se o classificador de intenções detectou aceitação e a seq2 ainda não foi chamada,
      // executamos a entrega de receitas (seq2) diretamente para garantir robustez total.
      if (intentTag === 'ACEITOU' && !state.seq2_called) {
        console.log(`[Recheios] Interceptador Scout de Aceite ativado para ${contact.phone}. Executando seq2...`);
        await executeTool(ctx, 'seq2', {});
        return;
      }

      if (intentTag === 'RECUSOU_UPSELL') {
        const firstName = clientName.split(/\s+/)[0] || 'amiga';
        if (state.access_delivered === 0) {
          console.log(`[Recheios] RECUSOU_UPSELL (rejeitou Oferta Especial R$ 5) para ${contact.phone}.`);
          // Disparar o estágio 'ticket_boost_declined' dinâmico ou fallback (Presente de Fidelidade)
          const stageRes = await sendFunnelStage(
            env.DB,
            automation.whatsapp_api_id,
            contact.phone,
            automation,
            contact,
            state,
            'ticket_boost_declined',
            env.KV
          );

          if (stageRes.sent) {
            await saveAssistantMessages(env.DB, state.conversation_id, stageRes.messageLog);
          } else {
            // Fallback legado se desativado ou sem campos (Presente de Fidelidade)
            const fallbackDownsell = `Tudo bem! O meu principal objetivo é te ajudar a crescer na confeitaria e faturar muito mais, a questão aqui não é só dinheiro. Por isso, de coração, eu vou te liberar todo o nosso *Kit Completo vitalício* de presente de qualquer forma! 💖🎁\n\nPara liberar seu cadastro no sistema, digite seu *Nome Completo* e seu melhor *E-mail* abaixo. 🎯`;
            const formattedDownsell = fallbackDownsell
              .replace(/Julia/g, attendantName)
              .replace(/{{nome}}/g, contact.name || 'amiga')
              .replace(/{nome}/g, contact.name || 'amiga');
            await sendText(env.DB, automation.whatsapp_api_id, contact.phone, formattedDownsell, env.KV);
            await saveAssistantMessages(env.DB, state.conversation_id, [formattedDownsell]);
          }
          return;
        } else {
          console.log(`[Recheios] RECUSOU_UPSELL (rejeitou Upsell R$ 14,50) para ${contact.phone}. Atualizando downsell_offered = 1.`);
          await updateState(env.DB, conversation.id, {
            downsell_offered: 1,
          });
          state.downsell_offered = 1;

          // Disparar o estágio 'downsell' dinâmico ou fallback (Nova copy R$ 7,50)
          const stageRes = await sendFunnelStage(
            env.DB,
            automation.whatsapp_api_id,
            contact.phone,
            automation,
            contact,
            state,
            'downsell',
            env.KV
          );

          if (stageRes.sent) {
            await saveAssistantMessages(env.DB, state.conversation_id, stageRes.messageLog);
          } else {
            // Fallback legado se desativado ou sem campos (Downsell R$ 7,50)
            const fallbackDownsell = `*{primeiro_nome}*, eu super te entendo! Às vezes a correria aperta ou a gente fica com aquela insegurança se vai conseguir colocar tudo em prática. 🥺\n\nMas eu não quero que a divulgação seja a pedra no seu caminho. Quero ver a sua cozinha cheia de encomendas todos os dias!\n\nPor isso, conversei com a minha equipe e consegui liberar uma condição única de 50% de desconto para você levar a nossa *Máquina de Vendas Online* agora e não ter desculpa para não decolar!\n\nDe R$ 14,50, você garante o seu acesso vitalício por apenas *R$ 7,50* hoje! 🍰🚀\n\nPara garantir esse super desconto, faça o Pix de *R$ 7,50* no mesmo celular abaixo e me mande o comprovante:\n\n💰 *Pix (Celular):* 61982277206`;
            const formattedDownsell = fallbackDownsell
              .replace(/Julia/g, attendantName)
              .replace(/{{primeiro_nome}}/g, firstName)
              .replace(/{primeiro_nome}/g, firstName)
              .replace(/{{nome}}/g, contact.name || 'amiga')
              .replace(/{nome}/g, contact.name || 'amiga');
            await sendText(env.DB, automation.whatsapp_api_id, contact.phone, formattedDownsell, env.KV);
            await saveAssistantMessages(env.DB, state.conversation_id, [formattedDownsell]);

            // Auto-enviar botão Pix de R$ 7,50
            try {
              await sendPixButton(env.DB, automation.whatsapp_api_id, contact.phone, '61982277206', 'PHONE', 'R G FEITOSA 153DF', env.KV);
            } catch (pixErr) {
              console.error(`[Recheios] Erro ao enviar botão do Pix para Downsell:`, pixErr);
            }
          }
          return;
        }
      }

      // Prompt unificado com máquina de estados (Negociador + Caixa + Suporte integrados)
      const systemPrompt = getAgentPrompt(state, leadId, clientName, history, attendantName, intentTag);

      const llmMessages = history.map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      }));
      llmMessages.push({ role: 'user', content: processedText });

      // Filtro de ferramentas baseado no estado do funil
      const hasPhysicalMedia = message.messageType === 'image' || message.messageType === 'document';
      const availableTools = TOOL_DEFINITIONS.filter(t => {
        // Bloquear 'pagamento' sem mídia física (prevenir hallucination de pagamento por texto)
        if (t.name === 'pagamento' && !hasPhysicalMedia) return false;
        // Pós-acesso: apenas ferramentas de suporte (re-liberação e reenvio)
        if (state.access_delivered === 1) {
          return t.name === 'sistema' || t.name === 'seq2';
        }
        return true;
      });

      console.log(`[Recheios] Agente Unificado para ${contact.phone} | Fase: ${state.seq2_called ? '2' : '1'} | Intent: ${intentTag} | Tools: ${availableTools.map(t => t.name).join(',')}`);

      const response = await callLLM({
        db: env.DB,
        automationId: automation.id,
        systemPrompt,
        messages: llmMessages,
        tools: availableTools,
        kv: env.KV,
        leadPhone: contact.phone,
        leadName: contact.name || state.client_name || '',
      });

      // Executar ferramentas chamadas pelo agente
      let seq2Called = false;
      let directSendToolCalled = false;
      if (response.toolCalls && response.toolCalls.length > 0) {
        for (const toolCall of response.toolCalls) {
          console.log(`[Recheios] Executando ferramenta: ${toolCall.name}`);
          const result = await executeTool(ctx, toolCall.name, toolCall.arguments);
          console.log(`[Recheios] Ferramenta ${toolCall.name}: success=${result.success}`);

          if (toolCall.name === 'seq2' && result.success) {
            seq2Called = true;
          }

          if (['seq1', 'seq2', 'pagamento', 'sistema', 'entregar_pdf_crm'].includes(toolCall.name) && result.success) {
            directSendToolCalled = true;
          }

          if (result.success) {
            // Recarregar estado do banco após execução de ferramenta
            const updatedState = await env.DB.prepare(
              'SELECT * FROM conversation_state WHERE conversation_id = ?'
            ).bind(conversation.id).first();
            if (updatedState) {
              Object.assign(state, updatedState);
            }
          }
        }
      }

      // Fallback de segurança: se a LLM responder com o emoji "👆" (regra de silêncio do prompt para seq2)
      // mas a ferramenta seq2 não foi executada via toolCall, nós a executamos manualmente pelo código.
      const rawContent = response.content ? response.content.trim() : '';
      if (rawContent === '👆' && !seq2Called) {
        console.log(`[Recheios] Fallback de texto "👆" ativado para ${contact.phone}. Executando seq2...`);
        const result = await executeTool(ctx, 'seq2', {});
        if (result.success) {
          const updatedState = await env.DB.prepare(
            'SELECT * FROM conversation_state WHERE conversation_id = ?'
          ).bind(conversation.id).first();
          if (updatedState) {
            Object.assign(state, updatedState);
          }
        }
      }

      // Enviar resposta conversacional (se houver texto além de tool calls e nenhuma ferramenta de envio direto foi chamada)
      if (response.content && response.content.trim() !== '' && !directSendToolCalled && rawContent !== '👆') {
        const cleanResponse = response.content.trim();
        const formattedResponse = formatWhatsAppShortParagraphs(cleanResponse);
        await sendResponse(ctx, formattedResponse);

        // Atualizar estados de ofertas baseado na resposta do agente
        if (cleanResponse.includes('R$ 14,50')) {
          await updateState(env.DB, conversation.id, {
            kit_completo_offered: 1,
            kit_completo_price: 14.50,
          });
        }
        const lowerClean = cleanResponse.toLowerCase();
        if (lowerClean.includes('presente') || lowerClean.includes('coração') || lowerClean.includes('coracao') || lowerClean.includes('de graça')) {
          await updateState(env.DB, conversation.id, {
            downsell_offered: 1,
          });
        }

        // Auto-enviar botão nativo do Pix se a resposta mencionar dados do Pix
        const upperCleanText = cleanResponse.toUpperCase();
        const hasPixKeywords = upperCleanText.includes('PIX') || 
                               upperCleanText.includes('61982277206') ||
                               upperCleanText.includes('CHAVE') ||
                               upperCleanText.includes('BANCO CORA') ||
                               upperCleanText.includes('R G FEITOSA');
        if (hasPixKeywords) {
          try {
            console.log(`[Recheios] Enviando botão nativo do Pix para ${contact.phone}`);
            await sendPixButton(env.DB, automation.whatsapp_api_id, contact.phone, '61982277206', 'PHONE', 'R G FEITOSA 153DF', env.KV);
          } catch (pixErr) {
            console.error(`[Recheios] Erro ao enviar botão do Pix:`, pixErr);
          }
        }
      }

    } catch (error) {
      console.error('[ReceitasVIP] Erro crítico no handleMessage:', error);
      await env.DB.prepare(
        'INSERT INTO error_logs (id, automation_id, error_type, error_message) VALUES (?, ?, ?, ?)'
      ).bind(crypto.randomUUID(), automation.id, 'automation_error', String(error)).run();
    }
  },
};

export default recheiosModule;

// ============================================================
// AGENTE TRIAGEM (SCOUT CLASSIFIER)
// ============================================================

async function runTriagemClassifier(ctx: AutomationContext, text: string): Promise<string> {
  const { env, automation, history } = ctx;
  
  try {
    const prompt = getScoutClassifierPrompt(history, text);
    const response = await callLLM({
      db: env.DB,
      automationId: automation.id,
      systemPrompt: prompt,
      messages: [{ role: 'user', content: 'Classifique a mensagem do cliente.' }],
      kv: env.KV,
      leadPhone: ctx.contact.phone,
      leadName: ctx.contact.name || ctx.state.client_name || '',
    });

    const cleaned = response.content.trim().toUpperCase();
    
    // Lista de tags válidas
    const validTags = ['ACEITOU', 'RECUSOU_UPSELL', 'NEGOU', 'DUVIDA', 'COMPROVANTE', 'ACESSO_PROBLEMA', 'PROMESSA_PAGAMENTO', 'OUTROS'];
    for (const tag of validTags) {
      if (cleaned.includes(tag)) return tag;
    }
    
    return 'OUTROS';
  } catch (err) {
    console.error('[Triagem] Falha na classificação de intenções:', err);
    return 'OUTROS';
  }
}

// ============================================================
// PROCESSAMENTO DE MÍDIAS COM FALLBACK DE PRIORIDADES
// ============================================================

/**
 * Busca todas as chaves de API de OCR no banco ordenadas por prioridade
 */
async function getOcrApiKeysWithFallback(
  db: D1Database, 
  automationId: string,
  ocrServiceId: string | null, 
  kv?: KVNamespace
): Promise<string[]> {
  const keys: string[] = [];
  
  // 1. Tentar os serviços configurados na automação em ordem de prioridade
  try {
    const priorityOcrs = await db.prepare(`
      SELECT o.api_key 
      FROM automation_ocrs ao
      JOIN ocr_services o ON ao.ocr_service_id = o.id
      WHERE ao.automation_id = ?
      ORDER BY ao.priority_order ASC
    `).bind(automationId).all<{ api_key: string }>();
    
    if (priorityOcrs.results && priorityOcrs.results.length > 0) {
      for (const row of priorityOcrs.results) {
        if (row.api_key && !keys.includes(row.api_key)) {
          keys.push(row.api_key);
        }
      }
    }
  } catch (err) {
    console.error('[FallbackOCR] Erro ao buscar OCRs prioritários:', err);
  }

  // 2. Se nenhum foi encontrado pela tabela prioritária, tenta o ocrServiceId legado da automação
  if (keys.length === 0 && ocrServiceId) {
    try {
      const key = await getCachedOcrApiKey(db, kv, ocrServiceId);
      if (key) keys.push(key);
    } catch {}
  }
  
  // 3. Tentar os outros OCRs ordenados por sort_order ASC
  try {
    const others = await db.prepare("SELECT api_key FROM ocr_services ORDER BY sort_order ASC, created_at DESC").all<{ api_key: string }>();
    if (others.results) {
      for (const row of others.results) {
        if (row.api_key && !keys.includes(row.api_key)) {
          keys.push(row.api_key);
        }
      }
    }
  } catch {}
  
  // 4. Fallback final: buscar chave do Gemini da tabela llms
  try {
    const gemini = await db.prepare("SELECT api_key FROM llms WHERE provider = 'google' OR name LIKE '%gemini%' LIMIT 1").first<{ api_key: string }>();
    if (gemini?.api_key && !keys.includes(gemini.api_key)) {
      keys.push(gemini.api_key);
    }
  } catch {}
  
  return keys;
}

interface TranscriptionConfig {
  apiKey: string;
  endpoint?: string;
}

/**
 * Busca todas as configurações de API de Transcrição no banco ordenadas por prioridade
 */
async function getTranscriptionConfigsWithFallback(
  db: D1Database, 
  automationId: string,
  serviceId: string | null, 
  kv?: KVNamespace
): Promise<TranscriptionConfig[]> {
  const configs: TranscriptionConfig[] = [];
  
  // 1. Tentar os serviços configurados na automação em ordem de prioridade
  try {
    const priorityTranscriptions = await db.prepare(`
      SELECT t.api_key, t.endpoint 
      FROM automation_transcriptions at
      JOIN transcription_services t ON at.transcription_service_id = t.id
      WHERE at.automation_id = ?
      ORDER BY at.priority_order ASC
    `).bind(automationId).all<{ api_key: string; endpoint: string | null }>();
    
    if (priorityTranscriptions.results && priorityTranscriptions.results.length > 0) {
      for (const row of priorityTranscriptions.results) {
        if (row.api_key && !configs.some(c => c.apiKey === row.api_key)) {
          configs.push({
            apiKey: row.api_key,
            endpoint: row.endpoint || undefined
          });
        }
      }
    }
  } catch (err) {
    console.error('[FallbackTranscription] Erro ao buscar transcrições prioritárias:', err);
  }

  // 2. Se nenhum foi encontrado pela tabela prioritária, tenta o serviceId legado da automação
  if (configs.length === 0 && serviceId) {
    try {
      const service = await db.prepare(
        "SELECT api_key, endpoint FROM transcription_services WHERE id = ?"
      ).bind(serviceId).first<{ api_key: string; endpoint: string }>();
      
      if (service && service.api_key) {
        configs.push({
          apiKey: service.api_key,
          endpoint: service.endpoint || undefined
        });
      }
    } catch {}
  }
  
  // 3. Tentar os outros serviços de transcrição ordenados por sort_order
  try {
    const others = await db.prepare(
      "SELECT api_key, endpoint FROM transcription_services ORDER BY sort_order ASC, created_at DESC"
    ).all<{ api_key: string; endpoint: string }>();
    if (others.results) {
      for (const row of others.results) {
        if (row.api_key && !configs.some(c => c.apiKey === row.api_key)) {
          configs.push({
            apiKey: row.api_key,
            endpoint: row.endpoint || undefined
          });
        }
      }
    }
  } catch {}
  
  // 4. Fallback final: Gemini das LLMs
  if (configs.length === 0) {
    try {
      const gemini = await db.prepare("SELECT api_key FROM llms WHERE provider = 'google' OR name LIKE '%gemini%' LIMIT 1").first<{ api_key: string }>();
      if (gemini?.api_key) {
        configs.push({
          apiKey: gemini.api_key
        });
      }
    } catch {}
  }
  
  return configs;
}

/**
 * Atualiza a última mensagem do usuário (que estava vazia por ser mídia) com a transcrição ou texto do OCR.
 */
async function updateLastEmptyMessage(db: D1Database, conversationId: string, content: string): Promise<void> {
  try {
    await db.prepare(`
      UPDATE messages 
      SET content = ? 
      WHERE id = (
        SELECT id FROM messages 
        WHERE conversation_id = ? AND role = 'user' AND (content = '' OR content IS NULL) 
        ORDER BY created_at DESC LIMIT 1
      )
    `).bind(content, conversationId).run();
  } catch (err) {
    console.error('[Media] Erro ao atualizar mensagem de mídia no banco:', err);
  }
}

/**
 * Detecta se o texto extraído por OCR é provavelmente um comprovante de pagamento Pix.
 */
function isLikelyReceipt(ocrText: string): boolean {
  if (!ocrText) return false;
  const clean = ocrText.toLowerCase();
  
  return clean.includes('feitosa') || 
         clean.includes('cora') || 
         clean.includes('comprovante') || 
         clean.includes('transferencia') || 
         clean.includes('transferência') || 
         clean.includes('pagamento realizado') || 
         clean.includes('pix realizado') ||
         clean.includes('pagamento efetuado') ||
         clean.includes('transação realizada') ||
         clean.includes('autenticação') ||
         clean.includes('autenticacao');
}

// Helper para formatar e organizar os dados confusos do OCR usando Regex antes de enviar para a LLM
function formatReceiptOcrTextWithRegex(ocrText: string): string {
  if (!ocrText) return '';
  const clean = ocrText.trim();
  
  // 1. Extração de Valor (R$ 10,00, R$25.00, Pago: 10, etc.)
  let valor = 'não identificado';
  const valMatches = clean.match(/(?:r\$|valor(?:\s+pago)?|pago|recebido)\s*:?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d{1,3}(?:,\d{3})*\.\d{2}|\d+[\d,.]*)/i);
  if (valMatches && valMatches[1]) {
    valor = valMatches[1].trim();
  }

  // 2. Extração de Data (DD/MM/AAAA ou ISO YYYY-MM-DD)
  let data = 'não identificada';
  const dateMatches = clean.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (dateMatches) {
    data = `${dateMatches[1]}/${dateMatches[2]}/${dateMatches[3]}`;
  } else {
    // Fallback para datas textuais em português (ex: "03 de junho de 2026")
    const textDateMatch = clean.match(/(\d{1,2})\s+de\s+([a-zA-ZçÇ]+)\s+de\s+(\d{4})/i);
    if (textDateMatch) {
      const day = textDateMatch[1].padStart(2, '0');
      const monthName = textDateMatch[2].toLowerCase();
      const year = textDateMatch[3];
      const months: Record<string, string> = {
        janeiro: '01',
        fevereiro: '02',
        marco: '03', março: '03',
        abril: '04',
        maio: '05',
        junho: '06',
        julho: '07',
        agosto: '08',
        setembro: '09',
        outubro: '10',
        novembro: '11',
        dezembro: '12'
      };
      const month = months[monthName] || months[monthName.normalize("NFD").replace(/[\u0300-\u036f]/g, "")];
      if (month) {
        data = `${day}/${month}/${year}`;
      }
    }
  }

  // 3. Extração de Destinatário/Recebedor
  let recebedor = 'não identificado';
  if (/feitosa/i.test(clean)) {
    recebedor = 'R G FEITOSA 153DF';
  } else {
    const recMatches = clean.match(/(?:recebedor|destinatário|pago\s+a)\s*:?\s*([^\n\r]+)/i);
    if (recMatches && recMatches[1]) {
      recebedor = recMatches[1].trim();
    }
  }

  // 4. Extração de ID de transação/Autenticação
  let idTransacao = 'não identificado';
  const idMatches = clean.match(/(?:id\s+transação|id\s+transacao|autenticação|autenticacao|codigo\s+transacao|código\s+transação|transacao|transação)\s*:?\s*([a-z0-9]+)/i);
  if (idMatches && idMatches[1]) {
    idTransacao = idMatches[1].trim();
  } else {
    const pixIdMatch = clean.match(/(e\d{8,}[a-z0-9]+)/i);
    if (pixIdMatch) {
      idTransacao = pixIdMatch[1].trim();
    }
  }

  return `--- DADOS ESTRUTURADOS E ORGANIZADOS DO COMPROVANTE (REGEX) ---
• VALOR DO COMPROVANTE: R$ ${valor}
• DATA DO PAGAMENTO: ${data}
• RECEBEDOR / DESTINATÁRIO: ${recebedor}
• ID DA TRANSAÇÃO / AUTENTICAÇÃO: ${idTransacao}
----------------------------------------------------------------

[Texto bruto extraído do OCR]:
${clean}`;
}

/**
 * Processa imagem: baixa, executa OCR com fallback de chaves e retorna texto
 */
async function processImageWithFallback(ctx: AutomationContext): Promise<string> {
  const { message, automation, env, conversation, contact, state } = ctx;

  let resultText = "";
  try {
    const media = await downloadMedia(env.DB, automation.whatsapp_api_id, message.mediaId!, env.KV);
    if (!media || !media.base64Data) {
      resultText = message.caption || '[Imagem recebida]';
    } else {
      let r2Url = "";
      try {
        if (env.STORAGE) {
          const binaryString = atob(media.base64Data);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const mediaBuffer = bytes.buffer;

          let ext = "jpg";
          if (media.mimetype) {
            if (media.mimetype.includes("png")) ext = "png";
            else if (media.mimetype.includes("gif")) ext = "gif";
            else if (media.mimetype.includes("webp")) ext = "webp";
          }
          const assetId = crypto.randomUUID();
          const r2Key = `media/incoming/${contact.phone}/${assetId}.${ext}`;

          await env.STORAGE.put(r2Key, mediaBuffer, {
            httpMetadata: { contentType: media.mimetype || "image/jpeg" }
          });

          const hostUrl = ctx.baseUrl || "";
          r2Url = `${hostUrl}/api/media/${r2Key}`;
        }
      } catch (r2Err) {
        console.error('[Media] Erro ao salvar imagem no R2:', r2Err);
      }

      const ocrApiKeys = await getOcrApiKeysWithFallback(env.DB, automation.id, automation.ocr_service_id, env.KV);
      let ocrText = "";
      let lastError = null;

      for (let i = 0; i < ocrApiKeys.length; i++) {
        const key = ocrApiKeys[i];
        try {
          console.log(`[Media] Tentando OCR com chave: ...${key.slice(-5)}`);
          ocrText = await ocrImage({
            apiKey: key,
            imageBase64: media.base64Data,
            mimeType: media.mimetype || 'image/jpeg',
          });
          if (ocrText && ocrText.trim() !== "") {
            break; // Sucesso
          }
        } catch (err: any) {
          lastError = err;
          const msg = err?.message ?? String(err);
          // Gravar fallback de OCR se houver outro a tentar
          if (ocrApiKeys.length > 1 && i < ocrApiKeys.length - 1) {
            try {
              const nextKey = ocrApiKeys[i + 1];
              await env.DB.prepare(`
                INSERT INTO fallback_logs (automation_id, lead_phone, lead_name, product_name, fallback_type, details)
                VALUES (?, ?, ?, ?, 'ocr', ?)
              `).bind(
                automation.id,
                contact.phone,
                contact.name || state.client_name || 'unknown',
                automation.product_name || 'Desconhecido',
                `Falhou chave OCR ${i + 1} (...${key.slice(-5)}). Erro: ${msg.substring(0, 150)}. Assumindo próxima chave (...${nextKey.slice(-5)})`
              ).run();
            } catch (logErr) {
              console.error(`[OCR Fallback Log] Erro:`, logErr);
            }
          }
        }
      }

      if (!ocrText && lastError) {
        throw lastError;
      }

      const formattedText = isLikelyReceipt(ocrText)
        ? formatReceiptOcrTextWithRegex(ocrText)
        : ocrText;

      if (r2Url) {
        const caption = message.caption || "";
        resultText = `[Imagem com legenda: ${caption} - URL: ${r2Url}]\n[Texto extraído da imagem: ${formattedText}]`;
      } else {
        resultText = message.caption
          ? `[Imagem com legenda: ${message.caption}]\n[Dados da Imagem]:\n${formattedText}`
          : `[Dados da Imagem]:\n${formattedText}`;
      }
    }
  } catch (error) {
    console.error('[Media] Falha no processamento de OCR de imagem:', error);
    resultText = message.caption || '[Imagem recebida - falha no OCR]';
  }

  await updateLastEmptyMessage(env.DB, conversation.id, resultText);
  return resultText;
}

/**
 * Processa áudio: baixa, transcreve com fallback e retorna texto
 */
async function processAudioWithFallback(ctx: AutomationContext): Promise<string> {
  const { message, automation, env, conversation, contact, state } = ctx;

  let resultText = "";
  try {
    const media = await downloadMedia(env.DB, automation.whatsapp_api_id, message.mediaId!, env.KV);
    if (!media || !media.base64Data) {
      resultText = '[Áudio recebido]';
    } else {
      let r2Url = "";
      try {
        if (env.STORAGE) {
          const binaryString = atob(media.base64Data);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const mediaBuffer = bytes.buffer;

          let ext = "ogg";
          if (media.mimetype) {
            if (media.mimetype.includes("mp3")) ext = "mp3";
            else if (media.mimetype.includes("wav")) ext = "wav";
            else if (media.mimetype.includes("m4a")) ext = "m4a";
          }
          const assetId = crypto.randomUUID();
          const r2Key = `media/incoming/${contact.phone}/${assetId}.${ext}`;

          await env.STORAGE.put(r2Key, mediaBuffer, {
            httpMetadata: { contentType: media.mimetype || "audio/ogg" }
          });

          const hostUrl = ctx.baseUrl || "";
          r2Url = `${hostUrl}/api/media/${r2Key}`;
        }
      } catch (r2Err) {
        console.error('[Media] Erro ao salvar áudio no R2:', r2Err);
      }

      const configs = await getTranscriptionConfigsWithFallback(env.DB, automation.id, automation.transcription_service_id, env.KV);
      let transcription = "";
      let lastError = null;

      for (let i = 0; i < configs.length; i++) {
        const config = configs[i];
        try {
          console.log(`[Media] Tentando Transcrição de áudio com chave: ...${config.apiKey.slice(-5)} e endpoint: ${config.endpoint || 'padrão'}`);
          transcription = await transcribeAudio({
            apiKey: config.apiKey,
            audioBase64: media.base64Data,
            mimeType: media.mimetype || 'audio/ogg',
            endpoint: config.endpoint,
          });
          if (transcription && transcription.trim() !== "") {
            break;
          }
        } catch (err: any) {
          lastError = err;
          const msg = err?.message ?? String(err);
          // Gravar fallback de Transcrição se houver outro a tentar
          if (configs.length > 1 && i < configs.length - 1) {
            try {
              const nextConfig = configs[i + 1];
              await env.DB.prepare(`
                INSERT INTO fallback_logs (automation_id, lead_phone, lead_name, product_name, fallback_type, details)
                VALUES (?, ?, ?, ?, 'transcription', ?)
              `).bind(
                automation.id,
                contact.phone,
                contact.name || state.client_name || 'unknown',
                automation.product_name || 'Desconhecido',
                `Falhou serviço de áudio ${i + 1} (...${config.apiKey.slice(-5)}). Erro: ${msg.substring(0, 150)}. Assumindo próximo serviço (...${nextConfig.apiKey.slice(-5)})`
              ).run();
            } catch (logErr) {
              console.error(`[Transcription Fallback Log] Erro:`, logErr);
            }
          }
        }
      }

      if (!transcription && lastError) {
        throw lastError;
      }

      if (r2Url) {
        resultText = `[Áudio enviado: ${r2Url}]\n[Transcrição do áudio: ${transcription}]`;
      } else {
        resultText = `[Transcrição do áudio: ${transcription}]`;
      }
    }
  } catch (error) {
    console.error('[Media] Falha na transcrição de áudio:', error);
    resultText = '[Áudio recebido - falha na transcrição]';
  }

  await updateLastEmptyMessage(env.DB, conversation.id, resultText);
  return resultText;
}

/**
 * Processa documento (PDF): baixa, executa OCR PDF com fallback e retorna texto
 */
async function processDocumentWithFallback(ctx: AutomationContext): Promise<string> {
  const { message, automation, env, conversation, contact, state } = ctx;

  let resultText = "";
  try {
    const media = await downloadMedia(env.DB, automation.whatsapp_api_id, message.mediaId!, env.KV);
    if (!media || !media.base64Data) {
      resultText = message.caption || '[Documento recebido]';
    } else {
      const keys = await getOcrApiKeysWithFallback(env.DB, automation.id, automation.ocr_service_id, env.KV);
      let ocrText = "";
      let lastError = null;

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        try {
          console.log(`[Media] Tentando OCR PDF com chave: ...${key.slice(-5)}`);
          ocrText = await ocrPdf({
            apiKey: key,
            pdfBase64: media.base64Data,
            mimeType: media.mimetype || 'application/pdf',
          });
          if (ocrText && ocrText.trim() !== "") {
            break;
          }
        } catch (err: any) {
          lastError = err;
          const msg = err?.message ?? String(err);
          // Gravar fallback de OCR PDF se houver outro a tentar
          if (keys.length > 1 && i < keys.length - 1) {
            try {
              const nextKey = keys[i + 1];
              await env.DB.prepare(`
                INSERT INTO fallback_logs (automation_id, lead_phone, lead_name, product_name, fallback_type, details)
                VALUES (?, ?, ?, ?, 'ocr', ?)
              `).bind(
                automation.id,
                contact.phone,
                contact.name || state.client_name || 'unknown',
                automation.product_name || 'Desconhecido',
                `Falhou chave OCR PDF ${i + 1} (...${key.slice(-5)}). Erro: ${msg.substring(0, 150)}. Assumindo próxima chave (...${nextKey.slice(-5)})`
              ).run();
            } catch (logErr) {
              console.error(`[OCR PDF Fallback Log] Erro:`, logErr);
            }
          }
        }
      }

      if (!ocrText && lastError) {
        throw lastError;
      }

      const formattedText = formatReceiptOcrTextWithRegex(ocrText);
      resultText = `[Dados do PDF]:\n${formattedText}`;
    }
  } catch (error) {
    console.error('[Media] Falha no processamento de OCR de PDF:', error);
    resultText = message.caption || '[Documento recebido - falha no OCR]';
  }

  await updateLastEmptyMessage(env.DB, conversation.id, resultText);
  return resultText;
}





/**
 * Envia resposta particionando se exceder limites normais
 */
async function sendResponse(ctx: AutomationContext, text: string): Promise<void> {
  const { env, automation, contact, conversation } = ctx;
  const db = env.DB;

  const isLongOffer = text.length > 1000 && text.includes('Kit Completo');

  if (isLongOffer) {
    await sendText(db, automation.whatsapp_api_id, contact.phone, text, env.KV);
  } else {
    const parts = partitionMessage(text);
    for (let i = 0; i < parts.length; i++) {
      await sendText(db, automation.whatsapp_api_id, contact.phone, parts[i], env.KV);
      if (i < parts.length - 1) {
        await sleep(calculateDelay(DELAYS.betweenParts.min, DELAYS.betweenParts.max));
      }
    }
  }

  await db.prepare(
    'INSERT INTO messages (id, conversation_id, content, role, llm_used) VALUES (?, ?, ?, \'assistant\', ?)'
  ).bind(crypto.randomUUID(), conversation.id, text, 'auto').run();
}

async function runCRMAgent(ctx: AutomationContext, messageText: string): Promise<string> {
  const { state, env, automation, contact, conversation, history } = ctx;
  const db = env.DB;

  const clientName = contact.name || state.client_name || 'amiga';
  const lead = await db.prepare(
    'SELECT id, cliente_codigo FROM automation_leads WHERE phone = ? AND automation_id = ?'
  ).bind(contact.phone, automation.id).first<{ id: string; cliente_codigo: number | null }>();
  const leadId = lead?.cliente_codigo ? String(lead.cliente_codigo) : (lead?.id || 'unknown');

  const attendantName = (automation as any).attendant_name || 'Julia';
  const systemPrompt = getCRMAgentPrompt(state, leadId, clientName, history, attendantName);

  const llmMessages = history.map((m) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
  }));
  llmMessages.push({ role: 'user', content: messageText });

  const availableTools = [
    {
      name: 'pagamento',
      description: 'Registra o pagamento do cliente (R$ 10 pelas receitas básicas ou R$ 12 pelo Kit Completo). Use IMEDIATAMENTE ao receber o comprovante Pix Cora para R G FEITOSA.',
      parameters: {
        type: 'object',
        properties: {
          valor_pagamento: {
            type: 'number',
            description: 'Valor total pago (use 12 para Kit Completo ou 10 para apenas as receitas)',
          },
          pago: {
            type: 'boolean',
            description: 'Sempre true',
          },
          data_comprovante: {
            type: 'string',
            description: 'Data do pagamento conforme comprovante.',
          },
        },
        required: ['valor_pagamento', 'pago'],
      },
    },
    {
      name: 'sistema',
      description: 'Registra o acesso do cliente no sistema para o Kit Completo (Opção A). Use após o pagamento de R$ 12 confirmado e cliente fornecer nome e email.',
      parameters: {
        type: 'object',
        properties: {
          nome: {
            type: 'string',
            description: 'Nome completo do cliente (nunca invente)',
          },
          email: {
            type: 'string',
            description: 'Email do cliente sem espaços (nunca invente)',
          },
          codigo_produto: {
            type: 'string',
            description: 'Código do produto (use PROD-R1I27D para Confeitaria/Kit Completo, ou PROD-H3GQBU para Máquina de Vendas)',
          },
        },
        required: ['nome', 'email', 'codigo_produto'],
      },
    },
    {
      name: 'entregar_pdf_crm',
      description: 'Envia APENAS os 5 PDFs de receitas ao cliente, sem ofertas ou áudios extras. Use quando o cliente pagar R$ 10 pelas receitas básicas (Opção B).',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    }
  ];


  const response = await callLLM({
    db,
    automationId: automation.id,
    systemPrompt,
    messages: llmMessages,
    tools: availableTools,
    kv: env.KV,
    leadPhone: contact.phone,
    leadName: contact.name || state.client_name || '',
  });

  let toolOutputs = "";
  if (response.toolCalls && response.toolCalls.length > 0) {
    for (const toolCall of response.toolCalls) {
      console.log(`[CRM Agent] Executando tool: ${toolCall.name} com bypassDirectSend`);
      const result = await executeTool(ctx, toolCall.name, toolCall.arguments);
      console.log(`[CRM Agent] Ferramenta ${toolCall.name} executada com sucesso? ${result.success}`);

      if (result.success) {
        // Recarregar estados locais do banco de dados D1
        const updatedState = await db.prepare(
          'SELECT * FROM conversation_state WHERE conversation_id = ?'
        ).bind(conversation.id).first();
        if (updatedState) {
          Object.assign(state, updatedState);
        }
        if (result.result) {
          toolOutputs += (toolOutputs ? "\n\n" : "") + result.result;
        }
      } else if (result.error) {
        toolOutputs += (toolOutputs ? "\n\n" : "") + `Erro ao executar ${toolCall.name}: ${result.error}`;
      }
    }
  }

  let agentOutput = response.content || "";
  let hasDirectSendTool = false;
  if (response.toolCalls && response.toolCalls.length > 0) {
    hasDirectSendTool = response.toolCalls.some(tc => ['seq1', 'seq2', 'pagamento', 'sistema', 'entregar_pdf_crm'].includes(tc.name));
  }

  if (hasDirectSendTool) {
    agentOutput = ""; // Suppress conversational response to avoid duplicate messages
  }

  if (toolOutputs) {
    agentOutput += (agentOutput ? "\n\n" : "") + "[Resultado Técnico das Ações]:\n" + toolOutputs;
  }
  return agentOutput;
}


