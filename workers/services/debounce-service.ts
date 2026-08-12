/**
 * Serviço de debounce para mensagens WhatsApp.
 *
 * Usa o Cloudflare KV para agrupar mensagens rápidas consecutivas
 * do mesmo usuário antes de processá-las. Isso evita que a IA
 * responda a cada mensagem individualmente quando o usuário envia
 * várias mensagens em sequência rápida.
 *
 * Fluxo:
 * 1. Mensagem chega → armazena no KV com chave `debounce:{automationId}:{phone}`
 * 2. Se já existe buffer pendente, adiciona o texto ao array
 * 3. TTL de 30 segundos — se nenhuma nova mensagem chegar, o buffer expira
 * 4. Quando o processamento é disparado, todas as mensagens são unidas
 *
 * @module debounce-service
 */

/** Estrutura armazenada no KV para cada buffer de debounce */
interface DebounceEntry {
  /** Mensagens acumuladas no buffer */
  messages: string[];
  /** Timestamp (ms) da primeira mensagem recebida */
  firstMessageAt: number;
  /** Timestamp (ms) da última mensagem recebida */
  lastMessageAt: number;
  /** Indica se o processamento já foi iniciado */
  processed: boolean;
}

/** TTL do buffer de debounce em segundos */
const DEBOUNCE_TTL_SECONDS = 30;

/**
 * Gera a chave do KV para o buffer de debounce.
 *
 * @param automationId - ID da automação
 * @param phone - Número de telefone do remetente
 * @returns Chave formatada para o KV
 */
function buildKey(automationId: string, phone: string): string {
  return `debounce:${automationId}:${phone}`;
}

/**
 * Adiciona uma mensagem ao buffer de debounce.
 *
 * Se não existir um buffer ativo para esse telefone + automação,
 * cria um novo e retorna `true` (indicando que o caller deve
 * agendar o processamento após o delay de debounce).
 *
 * Se já existir um buffer, adiciona a mensagem ao array e retorna
 * `false` (o processamento já foi agendado anteriormente).
 *
 * @param kv - Instância do Cloudflare KV Namespace
 * @param phone - Número de telefone do remetente
 * @param automationId - ID da automação que recebeu a mensagem
 * @param message - Texto da mensagem recebida
 * @returns `true` se é a primeira mensagem (deve agendar processamento),
 *          `false` se a mensagem foi adicionada a um buffer existente
 *
 * @example
 * ```typescript
 * const isFirst = await addToDebounce(env.KV, '5561999999999', 'auto-123', 'Olá');
 * if (isFirst) {
 *   // Agendar processamento após 15 segundos
 *   ctx.waitUntil(scheduleProcessing(env, phone, automationId));
 * }
 * ```
 */
export async function addToDebounce(
  kv: KVNamespace,
  phone: string,
  automationId: string,
  message: string
): Promise<boolean> {
  const key = buildKey(automationId, phone);
  const now = Date.now();

  try {
    const existing = await kv.get<DebounceEntry>(key, 'json');

    if (existing && !existing.processed) {
      // Buffer já existe e não foi processado — adicionar mensagem
      const updated: DebounceEntry = {
        ...existing,
        messages: [...existing.messages, message],
        lastMessageAt: now,
      };

      await kv.put(key, JSON.stringify(updated), {
        expirationTtl: DEBOUNCE_TTL_SECONDS,
      });

      return false;
    }

    // Não existe buffer ou já foi processado — criar novo
    const entry: DebounceEntry = {
      messages: [message],
      firstMessageAt: now,
      lastMessageAt: now,
      processed: false,
    };

    await kv.put(key, JSON.stringify(entry), {
      expirationTtl: DEBOUNCE_TTL_SECONDS,
    });

    return true;
  } catch (error) {
    // Em caso de erro no KV, tratar como primeira mensagem
    // para garantir que a mensagem não seja perdida
    console.error('[Debounce] Erro ao adicionar mensagem ao buffer:', error);

    const entry: DebounceEntry = {
      messages: [message],
      firstMessageAt: now,
      lastMessageAt: now,
      processed: false,
    };

    try {
      await kv.put(key, JSON.stringify(entry), {
        expirationTtl: DEBOUNCE_TTL_SECONDS,
      });
    } catch (putError) {
      console.error('[Debounce] Erro crítico ao salvar no KV:', putError);
    }

    return true;
  }
}

/**
 * Recupera todas as mensagens acumuladas e marca o buffer como processado.
 *
 * Após chamar esta função, novas mensagens do mesmo remetente criarão
 * um novo buffer independente.
 *
 * @param kv - Instância do Cloudflare KV Namespace
 * @param phone - Número de telefone do remetente
 * @param automationId - ID da automação
 * @returns Texto combinado de todas as mensagens (separadas por `\n`),
 *          ou `null` se o buffer não existir ou já tiver sido processado
 *
 * @example
 * ```typescript
 * const combinedText = await getAndProcessDebounce(env.KV, '5561999999999', 'auto-123');
 * if (combinedText) {
 *   // Processar todas as mensagens do usuário de uma vez
 *   await processWithAI(combinedText);
 * }
 * ```
 */
export async function getAndProcessDebounce(
  kv: KVNamespace,
  phone: string,
  automationId: string
): Promise<string | null> {
  const key = buildKey(automationId, phone);

  try {
    const entry = await kv.get<DebounceEntry>(key, 'json');

    // Buffer não existe ou já foi processado
    if (!entry || entry.processed) {
      return null;
    }

    // Marcar como processado para evitar processamento duplicado
    const updated: DebounceEntry = {
      ...entry,
      processed: true,
    };

    await kv.put(key, JSON.stringify(updated), {
      // TTL curto — manter apenas para evitar race conditions
      expirationTtl: 60,
    });

    // Unir todas as mensagens com quebra de linha
    return entry.messages.join('\n');
  } catch (error) {
    console.error('[Debounce] Erro ao recuperar buffer:', error);
    return null;
  }
}

/**
 * Limpa o buffer de debounce para um remetente + automação.
 *
 * Útil para resetar o estado quando o atendimento é transferido
 * para modo manual ou quando a conversa é encerrada.
 *
 * @param kv - Instância do Cloudflare KV Namespace
 * @param phone - Número de telefone do remetente
 * @param automationId - ID da automação
 *
 * @example
 * ```typescript
 * // Limpar buffer ao pausar a IA para atendimento manual
 * await clearDebounce(env.KV, '5561999999999', 'auto-123');
 * ```
 */
export async function clearDebounce(
  kv: KVNamespace,
  phone: string,
  automationId: string
): Promise<void> {
  const key = buildKey(automationId, phone);

  try {
    await kv.delete(key);
  } catch (error) {
    console.error('[Debounce] Erro ao limpar buffer:', error);
  }
}

/**
 * Verifica se existe um buffer de debounce ativo (não processado)
 * para um remetente + automação.
 *
 * @param kv - Instância do Cloudflare KV Namespace
 * @param phone - Número de telefone do remetente
 * @param automationId - ID da automação
 * @returns `true` se existe buffer pendente, `false` caso contrário
 */
export async function hasActiveDebounce(
  kv: KVNamespace,
  phone: string,
  automationId: string
): Promise<boolean> {
  const key = buildKey(automationId, phone);

  try {
    const entry = await kv.get<DebounceEntry>(key, 'json');
    return entry !== null && !entry.processed;
  } catch (error) {
    console.error('[Debounce] Erro ao verificar buffer:', error);
    return false;
  }
}

/**
 * Retorna informações sobre o buffer de debounce atual
 * sem alterar seu estado (somente leitura).
 *
 * Útil para debugging e logging.
 *
 * @param kv - Instância do Cloudflare KV Namespace
 * @param phone - Número de telefone do remetente
 * @param automationId - ID da automação
 * @returns Informações do buffer ou `null` se não existir
 */
export async function getDebounceInfo(
  kv: KVNamespace,
  phone: string,
  automationId: string
): Promise<{
  messageCount: number;
  firstMessageAt: number;
  lastMessageAt: number;
  processed: boolean;
  elapsedMs: number;
} | null> {
  const key = buildKey(automationId, phone);

  try {
    const entry = await kv.get<DebounceEntry>(key, 'json');

    if (!entry) {
      return null;
    }

    return {
      messageCount: entry.messages.length,
      firstMessageAt: entry.firstMessageAt,
      lastMessageAt: entry.lastMessageAt,
      processed: entry.processed,
      elapsedMs: Date.now() - entry.firstMessageAt,
    };
  } catch (error) {
    console.error('[Debounce] Erro ao obter informações:', error);
    return null;
  }
}
