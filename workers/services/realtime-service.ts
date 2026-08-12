// Servico para notificacoes em tempo real (realtime) via Durable Object ChatRoom

export interface RealtimeMessage {
  id: string;
  conversation_id: string;
  content: string;
  role: 'user' | 'assistant' | 'manual';
  llm_used?: string | null;
  created_at: string;
}

export interface RealtimeConversationUpdate {
  status?: string;
  ai_active?: number;
  updated_at?: string;
}

// Registro global de env por ID de conversa para evitar passar 'env' por todos os metodos do funil
const envRegistry = new Map<string, any>();

export function registerEnv(conversationId: string, env: any) {
  if (conversationId && env) {
    envRegistry.set(conversationId, env);
  }
}

export function unregisterEnv(conversationId: string) {
  if (conversationId) {
    envRegistry.delete(conversationId);
  }
}

export function getRegisteredEnv(conversationId: string): any {
  return envRegistry.get(conversationId);
}

export async function notifyRealtime(env: any, payload: any) {
  try {
    if (!env || !env.CHAT_ROOM) {
      // Tentar buscar do registro se nao foi passado
      return;
    }
    const id = env.CHAT_ROOM.idFromName("global");
    const room = env.CHAT_ROOM.get(id);
    
    // Chamada in-process de alta performance para o Durable Object
    await room.fetch(new Request("http://localhost/notify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }));
  } catch (err) {
    console.error("[RealtimeService] Error sending realtime notification:", err);
  }
}

/**
 * Notifica os clientes de que uma nova mensagem foi inserida.
 */
export async function notifyNewMessage(
  env: any,
  conversationId: string,
  message: {
    id: string;
    content: string;
    role: 'user' | 'assistant' | 'manual';
    llm_used?: string | null;
    created_at?: string;
  }
) {
  const activeEnv = env || getRegisteredEnv(conversationId);
  if (!activeEnv) return;

  const payload = {
    type: "new_message",
    conversation_id: conversationId,
    message: {
      id: message.id,
      content: message.content,
      role: message.role,
      llm_used: message.llm_used || null,
      created_at: message.created_at || new Date().toISOString()
    }
  };
  
  await notifyRealtime(activeEnv, payload);
}

/**
 * Notifica os clientes de que o status da conversa ou o estado da IA foi atualizado.
 */
export async function notifyConversationUpdated(
  env: any,
  conversationId: string,
  updates: RealtimeConversationUpdate
) {
  const activeEnv = env || getRegisteredEnv(conversationId);
  if (!activeEnv) return;

  const payload = {
    type: "conversation_updated",
    conversation_id: conversationId,
    updates: {
      ...updates,
      updated_at: updates.updated_at || new Date().toISOString()
    }
  };
  
  await notifyRealtime(activeEnv, payload);
}
