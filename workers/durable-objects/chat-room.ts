// Durable Object para Chat Realtime
// Gerencia conexões WebSocket para atualizações em tempo real

export class ChatRoom {
  private state: DurableObjectState;
  private sessions: Map<string, WebSocket>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.sessions = new Map();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/websocket") {
      // Upgrade para WebSocket
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];

      const sessionId = crypto.randomUUID();
      
      server.accept();
      this.sessions.set(sessionId, server);

      server.addEventListener("message", (event) => {
        // Broadcast para todos os clientes conectados
        try {
          const data = JSON.parse(event.data as string);
          this.broadcast(JSON.stringify(data), sessionId);
        } catch {
          // Ignorar mensagens inválidas
        }
      });

      server.addEventListener("close", () => {
        this.sessions.delete(sessionId);
      });

      server.addEventListener("error", () => {
        this.sessions.delete(sessionId);
      });

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    // Endpoint para enviar notificação via POST (usado pelo worker principal)
    if (request.method === "POST" && url.pathname === "/notify") {
      const body = await request.json();
      this.broadcast(JSON.stringify(body));
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  }

  private broadcast(message: string, excludeSessionId?: string) {
    for (const [id, socket] of this.sessions) {
      if (id === excludeSessionId) continue;
      try {
        socket.send(message);
      } catch {
        this.sessions.delete(id);
      }
    }
  }
}
