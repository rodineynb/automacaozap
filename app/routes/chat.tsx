import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useAuth, useApi } from "../contexts/auth-context";
import { AppLayout } from "../components/layout";

interface Conversation {
  id: string; status: string; ai_active: number; contact_name: string;
  phone: string; automation_name: string; automation_id: string;
  last_message: string; message_count: number; updated_at: string;
}

interface AutomationOption {
  id: string; name: string; status: string;
}

interface Message {
  id: string; content: string; role: string; llm_used: string; created_at: string;
}

interface ConversationDetail {
  id: string; status: string; ai_active: number;
  phone: string; contact_name: string; automation_name: string;
  messages: Message[];
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [automations, setAutomations] = useState<AutomationOption[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedAutomation, setSelectedAutomation] = useState("");
  
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileLeadInfo, setShowMobileLeadInfo] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  
  // Date Filters
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "yesterday" | "custom">("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Detail panel states
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState("");

  // Panel resizing
  const [listWidth, setListWidth] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("chat-list-width");
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (parsed >= 280 && parsed <= 600) return parsed;
      }
    }
    return 360; // default width
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { id } = useParams(); // Selected conversation ID from URL
  const [searchParams, setSearchParams] = useSearchParams();

  const [autoScroll, setAutoScroll] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(0);
  const loadedIdRef = useRef<string | undefined>(undefined);
  const { user, token, isLoading: authLoading } = useAuth();
  const { apiFetch } = useApi();
  const navigate = useNavigate();

  // Refs to avoid stale closures in WebSocket event listeners
  const currentIdRef = useRef(id);
  const loadConversationsRef = useRef(loadConversations);

  useEffect(() => {
    currentIdRef.current = id;
  }, [id]);

  useEffect(() => {
    loadConversationsRef.current = loadConversations;
  });

  // Request browser notification permission on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
  }, []);

  // Realtime WebSocket integration with exponential backoff
  useEffect(() => {
    if (!user || !token) return;

    let isMounted = true;
    let ws: WebSocket | null = null;
    let reconnectTimeout: number | null = null;
    let reconnectDelay = 1000;

    function connectWs() {
      if (ws) {
        ws.close();
      }

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/api/chat/websocket?token=${token}`;
      
      console.log("[WebSocket] Connecting to", wsUrl);
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("[WebSocket] Connected successfully");
        reconnectDelay = 1000; // Reset delay on success
      };

      ws.onmessage = (event) => {
        if (!isMounted) return;
        try {
          const payload = JSON.parse(event.data);
          console.log("[WebSocket] Received event:", payload);
          
          if (payload.type === "new_message") {
            const activeId = currentIdRef.current;
            const isCurrentChat = payload.conversation_id === activeId;
            
            // Append to current chat message list if open
            if (isCurrentChat) {
              setConversation(prev => {
                if (!prev || prev.id !== payload.conversation_id) return prev;
                const exists = prev.messages.some(m => m.id === payload.message.id);
                if (exists) return prev;
                return {
                  ...prev,
                  messages: [...prev.messages, payload.message]
                };
              });
            }

            // Update left panel list
            setConversations(prev => {
              const index = prev.findIndex(c => c.id === payload.conversation_id);
              if (index !== -1) {
                const conv = { ...prev[index] };
                conv.last_message = payload.message.content;
                conv.updated_at = payload.message.created_at;
                conv.message_count = (conv.message_count || 0) + 1;
                
                const newList = [...prev];
                newList.splice(index, 1);
                newList.unshift(conv);
                return newList;
              } else {
                // If not in current list (maybe because of filters), reload
                if (loadConversationsRef.current) {
                  loadConversationsRef.current();
                }
                return prev;
              }
            });

            // Trigger notification/toast if role is user
            if (payload.message.role === "user") {
              const shouldAlert = !isCurrentChat || document.hidden;
              if (shouldAlert) {
                setConversations(currentConversations => {
                  const existingConv = currentConversations.find(c => c.id === payload.conversation_id);
                  const displayName = existingConv ? (existingConv.contact_name || existingConv.phone) : "Novo Lead";
                  
                  const title = `Nova mensagem de ${displayName}`;
                  const options = {
                    body: payload.message.content,
                    icon: "/favicon.ico"
                  };

                  if (Notification.permission === "granted") {
                    try {
                      new Notification(title, options);
                    } catch (e) {
                      console.error("Failed to trigger Desktop notification:", e);
                    }
                  }

                  showToast(`💬 ${title}: "${payload.message.content.substring(0, 40)}${payload.message.content.length > 40 ? '...' : ''}"`);
                  return currentConversations;
                });
              }
            }
          } else if (payload.type === "conversation_updated") {
            const activeId = currentIdRef.current;
            // Update detail pane if open
            if (payload.conversation_id === activeId) {
              setConversation(prev => {
                if (!prev || prev.id !== payload.conversation_id) return prev;
                return {
                  ...prev,
                  ...payload.updates
                };
              });
            }

            // Update left panel list
            setConversations(prev => {
              return prev.map(c => {
                if (c.id === payload.conversation_id) {
                  return {
                    ...c,
                    ...payload.updates
                  };
                }
                return c;
              });
            });
          }
        } catch (err) {
          console.error("[WebSocket] Error parsing event data:", err);
        }
      };

      ws.onclose = (e) => {
        if (!isMounted) return;
        console.log(`[WebSocket] Closed (code: ${e.code}, reason: ${e.reason}). Reconnecting...`);
        scheduleReconnect();
      };

      ws.onerror = (err) => {
        console.error("[WebSocket] Error occurred:", err);
      };
    }

    function scheduleReconnect() {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      
      const delay = reconnectDelay;
      // Exponential backoff up to 30 seconds
      reconnectDelay = Math.min(30000, delay * 2);
      
      console.log(`[WebSocket] Reconnecting in ${delay}ms`);
      reconnectTimeout = window.setTimeout(() => {
        if (isMounted) connectWs();
      }, delay);
    }

    connectWs();

    return () => {
      isMounted = false;
      if (ws) {
        ws.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [user, token]);

  // Initialize automation from query params if present
  useEffect(() => {
    const paramAutomation = searchParams.get("automation_id");
    if (paramAutomation) {
      setSelectedAutomation(paramAutomation);
    }
  }, []);

  useEffect(() => { if (user) loadAutomations(); }, [user]);
  
  // Reload conversations when any filter changes
  useEffect(() => {
    if (user) {
      loadConversations();
    }
  }, [user, statusFilter, selectedAutomation, dateFilter, customStartDate, customEndDate, searchQuery]);

  // Load conversation details when selection ID changes
  useEffect(() => {
    if (user && id) {
      loadConversation(false); // full loading indicator for fresh selections
    } else {
      setConversation(null);
    }
  }, [user, id]);

  // Background polling for active conversation to feel real-time (fallback / lower frequency)
  useEffect(() => {
    if (!user || !id) return;
    const interval = setInterval(() => {
      loadConversation(true); // silent background load
    }, 20000);
    return () => clearInterval(interval);
  }, [user, id]);

  // Reset scroll lock and length tracker when switching leads
  useEffect(() => {
    setAutoScroll(true);
    setUnreadCount(0);
    prevMessagesLengthRef.current = 0;
  }, [id]);

  // Smart Auto-scroll messages based on user action
  useEffect(() => {
    const messages = conversation?.messages || [];
    const prevLength = prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;

    // Check if the conversation is loaded and it is the first time we render its messages
    if (conversation && conversation.id === id && loadedIdRef.current !== id) {
      loadedIdRef.current = id;
      setAutoScroll(true);
      setUnreadCount(0);
      // Wait for DOM to paint completely
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "instant" as any });
      }, 50);
      return;
    }

    // When new messages arrive via polling/manual sending
    if (conversation && conversation.id === id && messages.length > prevLength && prevLength > 0) {
      const diff = messages.length - prevLength;
      
      const lastMessage = messages[messages.length - 1];
      const isOutgoing = lastMessage?.role === 'manual' || lastMessage?.role === 'assistant';
      
      if (autoScroll || isOutgoing) {
        setAutoScroll(true);
        setUnreadCount(0);
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      } else {
        // Increment unread count for floating badge
        setUnreadCount(prev => prev + diff);
      }
    }
  }, [conversation?.messages, conversation?.id, id, autoScroll]);

  const handleScroll = () => {
    const container = chatContainerRef.current;
    if (!container) return;

    const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight;

    if (scrollBottom < 40) {
      setAutoScroll(true);
      setUnreadCount(0);
    } else {
      setAutoScroll(false);
    }
  };

  async function loadAutomations() {
    try {
      const res = await apiFetch("/automations");
      if (res.ok) {
        const data = await res.json() as { data: AutomationOption[] };
        setAutomations(data.data);
      }
    } catch (err) { console.error(err); }
  }

  // Timezone-safe UTC Date calculation matching SQLite format
  function getUtcBoundaries() {
    let start = new Date();
    let end = new Date();

    if (dateFilter === "today") {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (dateFilter === "yesterday") {
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
    } else if (dateFilter === "custom" && customStartDate) {
      const [y, m, d] = customStartDate.split("-").map(Number);
      start = new Date(y, m - 1, d, 0, 0, 0, 0);
      if (customEndDate) {
        const [ey, em, ed] = customEndDate.split("-").map(Number);
        end = new Date(ey, em - 1, ed, 23, 59, 59, 999);
      } else {
        end = new Date(y, m - 1, d, 23, 59, 59, 999);
      }
    } else {
      return { start_date: "", end_date: "" };
    }

    const toUtcSqlString = (d: Date) => {
      const pad = (n: number) => n.toString().padStart(2, "0");
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    };

    return {
      start_date: toUtcSqlString(start),
      end_date: toUtcSqlString(end)
    };
  }

  async function loadConversations() {
    setLoadingList(true);
    try {
      let url = "/chat/conversations?limit=100";
      if (statusFilter) url += `&status=${statusFilter}`;
      if (selectedAutomation) url += `&automation_id=${selectedAutomation}`;
      if (searchQuery.trim()) url += `&search=${encodeURIComponent(searchQuery)}`;
      
      const { start_date, end_date } = getUtcBoundaries();
      if (start_date) url += `&start_date=${encodeURIComponent(start_date)}`;
      if (end_date) url += `&end_date=${encodeURIComponent(end_date)}`;

      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json() as { data: Conversation[] };
        setConversations(data.data);
      }
    } catch (err) { console.error(err); }
    setLoadingList(false);
  }

  async function loadConversation(silent = false) {
    if (!silent) setLoadingDetail(true);
    try {
      const res = await apiFetch(`/chat/conversations/${id}`);
      if (res.ok) {
        const data = await res.json() as { data: ConversationDetail };
        setConversation(data.data);
      }
    } catch (err) { console.error(err); }
    if (!silent) setLoadingDetail(false);
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || !id) return;
    setSending(true);
    try {
      const res = await apiFetch(`/chat/conversations/${id}/messages`, {
        method: "POST", body: JSON.stringify({ content: newMessage })
      });
      if (res.ok) {
        setNewMessage("");
        loadConversation(true);
        loadConversations(); // refresh snippet in left list
      } else {
        showToast("Erro ao enviar mensagem");
      }
    } catch { showToast("Erro ao enviar mensagem"); }
    setSending(false);
  }

  async function handleDeleteMessage(messageId: string) {
    if (!confirm("Tem certeza que deseja excluir esta mensagem do histórico local? Esta ação não afetará o WhatsApp do cliente, apenas a visualização no sistema.")) {
      return;
    }
    
    try {
      const res = await apiFetch(`/chat/messages/${messageId}`, {
        method: "DELETE"
      });
      
      if (res.ok) {
        showToast("Mensagem excluída!");
        loadConversation(true);
        loadConversations();
      } else {
        const data = await res.json() as { error: string };
        showToast(data.error || "Erro ao excluir mensagem");
      }
    } catch {
      showToast("Erro de conexão");
    }
  }

  async function handleTriggerTool(toolName: string, args: Record<string, any> = {}) {
    if (!id) return;
    setSending(true);
    try {
      const res = await apiFetch(`/chat/conversations/${id}/trigger-tool`, {
        method: "POST", body: JSON.stringify({ toolName, args })
      });
      if (res.ok) {
        const data = await res.json() as { success: boolean; error?: string; result?: any };
        if (data.success) {
          showToast(`Disparado: ${toolName.toUpperCase()}`);
          loadConversation(true);
          loadConversations();
        } else {
          showToast(`Falha: ${data.error || (data.result?.error) || "Erro no processamento"}`);
        }
      } else {
        showToast("Erro ao disparar");
      }
    } catch {
      showToast("Erro de conexão");
    }
    setSending(false);
  }

  async function handleTriggerFollowup(type: string) {
    if (!id) return;
    setSending(true);
    try {
      const res = await apiFetch(`/chat/conversations/${id}/trigger-followup`, {
        method: "POST", body: JSON.stringify({ type })
      });
      if (res.ok) {
        const data = await res.json() as { success: boolean; error?: string; message?: string };
        if (data.success) {
          showToast(`Disparado: ${type.replace("followup_", "").toUpperCase()}`);
          loadConversation(true);
          loadConversations();
        } else {
          showToast(`Falha: ${data.error || "Erro no processamento"}`);
        }
      } else {
        showToast("Erro ao disparar");
      }
    } catch {
      showToast("Erro de conexão");
    }
    setSending(false);
  }

  async function toggleAi() {
    if (!conversation || !id) return;
    const nextState = !conversation.ai_active;
    const res = await apiFetch(`/chat/conversations/${id}/ai`, {
      method: "PATCH", body: JSON.stringify({ ai_active: nextState })
    });
    if (res.ok) {
      setConversation(prev => prev ? { ...prev, ai_active: nextState ? 1 : 0 } : null);
      setConversations(prev => prev.map(c => c.id === id ? { ...c, ai_active: nextState ? 1 : 0 } : c));
      showToast(nextState ? "IA ativada" : "IA pausada");
    }
  }

  async function changeStatus(status: string) {
    if (!id) return;
    const res = await apiFetch(`/chat/conversations/${id}/status`, {
      method: "PATCH", body: JSON.stringify({ status })
    });
    if (res.ok) {
      setConversation(prev => prev ? { ...prev, status } : null);
      setConversations(prev => prev.map(c => c.id === id ? { ...c, status } : c));
      
      let toastLabel = "";
      if (status === "open") toastLabel = "Aberta";
      else if (status === "pending") toastLabel = "Pendente";
      else if (status === "reaberto") toastLabel = "Re-aberta";
      else if (status === "finalizado_com_sucesso") toastLabel = "Finalizado com Sucesso";
      else if (status === "finalizado_sem_sucesso") toastLabel = "Finalizado sem Sucesso";
      
      showToast(`Status: ${toastLabel}`);
    }
  }

  function handleAutomationChange(automationId: string) {
    setSelectedAutomation(automationId);
    if (automationId) {
      setSearchParams({ automation_id: automationId });
    } else {
      setSearchParams({});
    }
  }

  // Panel Drag handling
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = listWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(280, Math.min(600, startWidth + deltaX));
      setListWidth(newWidth);
      localStorage.setItem("chat-list-width", newWidth.toString());
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 3000); }

  function parseDateSafe(dateStr: string): Date {
    if (!dateStr) return new Date();
    // Normalize SQLite datetime string "YYYY-MM-DD HH:MM:SS" to ISO "YYYY-MM-DDTHH:MM:SSZ" to force UTC parsing
    let normalized = dateStr;
    if (!dateStr.includes("T") && !dateStr.includes("Z")) {
      normalized = dateStr.replace(" ", "T") + "Z";
    }
    const date = new Date(normalized);
    if (isNaN(date.getTime())) {
      // Fallback to raw parsing if normalization failed
      const rawDate = new Date(dateStr);
      return isNaN(rawDate.getTime()) ? new Date() : rawDate;
    }
    return date;
  }

  function formatTime(dateStr: string) {
    const date = parseDateSafe(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${day}/${month}/${year} às ${hours}:${minutes}`;
  }

  function timeAgo(dateStr: string) {
    const date = parseDateSafe(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return "agora";
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  }

  function formatWhatsAppMessage(content: string) {
    if (!content) return "";

    // Regular expression to capture *bold*, _italics_, and ~strikethrough~
    // Splitting by formatting tokens preserves the non-formatted strings as plain text
    const parts = content.split(/(\*[^*]+\*|_[^_]+_|~[^~]+~)/g);

    return parts.map((part, index) => {
      if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
        return <strong key={index} style={{ fontWeight: "700" }}>{part.slice(1, -1)}</strong>;
      }
      if (part.startsWith("_") && part.endsWith("_") && part.length > 2) {
        return <em key={index} style={{ fontStyle: "italic" }}>{part.slice(1, -1)}</em>;
      }
      if (part.startsWith("~") && part.endsWith("~") && part.length > 2) {
        return <span key={index} style={{ textDecoration: "line-through" }}>{part.slice(1, -1)}</span>;
      }
      return part;
    });
  }

  function cleanMediaMessageText(content: string) {
    if (!content) return "";
    const trimmed = content.trim();

    // 1. New Structured Formats
    if (trimmed.includes("[Imagem com legenda:") && trimmed.includes("[Texto extraído da imagem:")) {
      const captionMatch = trimmed.match(/\[Imagem com legenda:\s*([\s\S]*?)\s*-\s*URL/i);
      const ocrMatch = trimmed.match(/\[Texto extraído da imagem:\s*([\s\S]*?)(?:\]\s*$|\]$)/i);
      const caption = captionMatch ? captionMatch[1].trim() : "";
      const ocrText = ocrMatch ? ocrMatch[1].trim() : "";

      let text = "📸 *Imagem Recebida*\n";
      if (caption) text += `_${caption}_\n\n`;
      if (ocrText && ocrText !== "undefined" && ocrText.trim() !== "") {
        text += `_Texto da Imagem (OCR):_\n"${ocrText}"`;
      } else if (!caption) {
        text = "📸 *Imagem Recebida (Sem texto)*";
      }
      return text;
    }

    if (trimmed.includes("[Áudio enviado:") && trimmed.includes("[Transcrição do áudio:")) {
      const transMatch = trimmed.match(/\[Transcrição do áudio:\s*([\s\S]*?)(?:\]\s*$|\]$)/i);
      const text = transMatch ? transMatch[1].trim() : "";
      if (text && text !== "undefined" && text.trim() !== "") {
        return `🎤 _Áudio Transcrevido:_\n"${text}"`;
      }
      return "🎤 _Mensagem de voz recebida_";
    }
    
    // 2. Existing Legacy Formats
    if (trimmed.startsWith("[Transcrição do áudio:")) {
      const text = trimmed.replace("[Transcrição do áudio:", "").replace(/\]$/, "").trim();
      return `🎤 _Áudio Transcrevido:_\n"${text}"`;
    }
    
    if (trimmed.startsWith("[Texto extraído da imagem:")) {
      const text = trimmed.replace("[Texto extraído da imagem:", "").replace(/\]$/, "").trim();
      return `📸 _Texto da Imagem (OCR):_\n"${text}"`;
    }
    
    if (trimmed.startsWith("[Imagem com legenda:") && trimmed.includes("[Texto extraído da imagem:")) {
      const captionMatch = trimmed.match(/legenda:\s*([^\]\n]+)/i);
      const ocrMatch = trimmed.match(/imagem:\s*([^\]]+)/i);
      const caption = captionMatch ? captionMatch[1].trim() : "";
      const ocrText = ocrMatch ? ocrMatch[1].trim() : "";
      return `📸 *Imagem Enviada*\n${caption ? `_${caption}_` : ""}\n\n_Texto Extraído (OCR):_\n"${ocrText}"`;
    }

    if (trimmed === "[Áudio recebido]" || trimmed === "[Áudio recebido - falha na transcrição]") {
      return "🎤 _Mensagem de voz recebida_";
    }
    if (trimmed === "[Imagem recebida]" || trimmed === "[Imagem recebida - falha no OCR]") {
      return "📸 _Imagem recebida_";
    }
    if (trimmed === "[Documento recebido]" || trimmed === "[Documento recebido - falha no OCR]") {
      return "📄 _Documento recebido_";
    }

    if (trimmed.startsWith("[Imagem enviada com legenda:")) {
      return trimmed.replace("[Imagem enviada com legenda:", "").replace(/\]$/, "").trim();
    }
    
    if (
      trimmed.startsWith("[Áudio manual enviado:") || 
      trimmed.startsWith("[Áudio enviado:") || 
      trimmed.startsWith("[Áudio manual enviado]") ||
      trimmed.includes("[Áudio de entrega enviado]") ||
      trimmed.includes("[Áudio de oferta enviado]")
    ) {
      return ""; // Rendered as playable media
    }
    
    if (trimmed.startsWith("[Vídeo manual enviado:") || trimmed.startsWith("[Vídeo enviado:")) {
      return ""; // Rendered as playable media
    }
    
    if (
      trimmed.startsWith("[Apostila manual enviada:") || 
      trimmed.startsWith("[Documento manual enviado:") || 
      trimmed.startsWith("[PDF de receita enviado:") || 
      trimmed.startsWith("[Todos os 5 PDFs enviados manualmente]") ||
      trimmed.includes("[PDF de receita enviado:")
    ) {
      return ""; // Rendered as list of files
    }
    
    return content;
  }

  function renderMessageMedia(content: string) {
    if (!content) return null;
    const trimmed = content.trim();

    // 1. AUDIO PARSING (Manual & Automated)
    if (
      trimmed.includes("[Áudio manual enviado:") || 
      trimmed.includes("[Áudio enviado:") || 
      trimmed.includes("[Áudio manual enviado]") ||
      trimmed.includes("[Áudio de entrega enviado]") ||
      trimmed.includes("[Áudio de oferta enviado]")
    ) {
      let audioUrl = "";
      let label = "Mensagem de Voz";

      if (trimmed.includes("[Áudio de oferta enviado]")) {
        audioUrl = "https://dados.promentor21.top/Funil%20Recheios/audio1-v4.mp3";
        label = "Áudio de Apresentação (Julia)";
      } else if (trimmed.includes("[Áudio de entrega enviado]")) {
        audioUrl = "https://dados.promentor21.top/Funil%20Recheios/audio2-v3.mp3";
        label = "Áudio de Entrega / Fechamento";
      } else if (trimmed.includes("[Áudio enviado:") || trimmed.includes("[Áudio manual enviado:")) {
        const audioUrlMatch = trimmed.match(/\[Áudio(?:\s+manual)?\s+enviado:\s*([^\s\]]+)/i);
        if (audioUrlMatch) {
          audioUrl = audioUrlMatch[1].trim();
        }
      } else {
        const match = trimmed.match(/(?:enviado|enviada):\s*([^\]]+)/i);
        const fileLabel = match ? match[1].trim() : "";
        if (fileLabel.includes("Apresentação") || fileLabel.includes("Áudio 1") || fileLabel.includes("audio1")) {
          audioUrl = "https://dados.promentor21.top/Funil%20Recheios/audio1-v4.mp3";
          label = "Áudio de Apresentação (Julia)";
        } else if (fileLabel.includes("Confirmação") || fileLabel.includes("Áudio 2") || fileLabel.includes("audio2")) {
          audioUrl = "https://dados.promentor21.top/Funil%20Recheios/audio2-v3.mp3";
          label = "Áudio de Entrega / Fechamento";
        } else if (fileLabel.startsWith("http")) {
          audioUrl = fileLabel;
        }
      }

      if (audioUrl) {
        return (
          <div style={{ marginTop: "8px", background: "rgba(255,255,255,0.05)", padding: "10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ fontSize: "11px", fontWeight: "600", color: "var(--color-brand-400)", marginBottom: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
              🔊 {label}
            </div>
            <audio controls src={audioUrl} style={{ width: "100%", height: "36px" }} />
          </div>
        );
      }
    }

    // 2. VIDEO PARSING
    if (trimmed.includes("[Vídeo manual enviado:") || trimmed.includes("[Vídeo enviado:")) {
      const match = trimmed.match(/(?:enviado|enviada):\s*([^\]]+)/i);
      let videoUrl = "";
      const label = match ? match[1].trim() : "Vídeo";

      if (label.includes("video2") || label.includes("Suporte")) {
        videoUrl = "https://dados.promentor21.top/Funil%20Recheios/video2.mp4";
      } else if (label.includes("video3") || label.includes("Demonstração")) {
        videoUrl = "https://dados.promentor21.top/Funil%20Recheios/video3.mp4";
      } else if (label.startsWith("http")) {
        videoUrl = label;
      }

      if (videoUrl) {
        return (
          <div style={{ marginTop: "8px", background: "rgba(255,255,255,0.05)", padding: "10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ fontSize: "11px", fontWeight: "600", color: "var(--color-brand-400)", marginBottom: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
              🎥 {label.startsWith("http") ? "Vídeo Demonstrativo" : label}
            </div>
            <video controls src={videoUrl} style={{ width: "100%", maxHeight: "200px", borderRadius: "6px", background: "#000" }} />
          </div>
        );
      }
    }

    // 3. IMAGE PARSING (Show full image and support zoom/open)
    if (
      trimmed.includes("[Imagem enviada com legenda:") || 
      trimmed.includes("[Imagem manual enviada:") || 
      trimmed.includes("[Imagem enviada]") || 
      trimmed.includes("[Imagem com legenda:")
    ) {
      let imageUrl = "";
      let caption = "";

      if (trimmed.includes("[Imagem com legenda:") && trimmed.includes("- URL:")) {
        const urlMatch = trimmed.match(/-\s*URL:\s*([^\s\]]+)/i);
        const captionMatch = trimmed.match(/\[Imagem com legenda:\s*([\s\S]*?)\s*-\s*URL/i);
        imageUrl = urlMatch ? urlMatch[1].trim() : "";
        caption = captionMatch ? captionMatch[1].trim() : "";
      } else if (trimmed.includes("[Imagem enviada com legenda:")) {
        caption = trimmed.replace("[Imagem enviada com legenda:", "").replace(/\]$/, "").trim();
      } else if (trimmed.includes("[Imagem com legenda:")) {
        const captionMatch = trimmed.match(/legenda:\s*([^\]\n]+)/i);
        caption = captionMatch ? captionMatch[1].trim() : "";
      } else {
        const match = trimmed.match(/(?:enviada|enviado):\s*([^\]]+)/i);
        caption = match ? match[1].trim() : "";
      }

      if (!imageUrl) {
        const lowerCaption = caption.toLowerCase();
        if (lowerCaption.includes("pacote 1") || lowerCaption.includes("img2") || lowerCaption.includes("pacote 2") || lowerCaption.includes("recheios a frio")) {
          imageUrl = "https://dados.promentor21.top/Funil%20Recheios/img2.jpeg";
        } else if (lowerCaption.includes("bônus") || lowerCaption.includes("bonus") || lowerCaption.includes("massas caseiras")) {
          imageUrl = "https://dados.promentor21.top/Funil%20Recheios/img-bonus.jpeg";
        } else if (lowerCaption.includes("upsell") || lowerCaption.includes("oferta de upsell") || lowerCaption.includes("surpresa")) {
          imageUrl = "https://dados.promentor21.top/Funil%20Recheios/img_upssel.png";
        } else if (lowerCaption.includes("sequência 1") || lowerCaption.includes("seq1") || lowerCaption.includes("boas-vindas")) {
          imageUrl = "https://dados.promentor21.top/Funil%20Recheios/img_seq1.png";
        } else if (caption.startsWith("http")) {
          imageUrl = caption;
          caption = "";
        }
      }

      if (imageUrl) {
        return (
          <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <img 
              src={imageUrl} 
              alt="Mídia" 
              style={{ 
                width: "100%", 
                height: "auto",
                maxHeight: "none", // Avoid clipping
                objectFit: "contain", // Display entire image
                borderRadius: "8px", 
                border: "1px solid rgba(255,255,255,0.08)", 
                background: "rgba(0, 0, 0, 0.2)",
                cursor: "zoom-in" 
              }} 
              onClick={() => window.open(imageUrl, "_blank")} 
            />
          </div>
        );
      }
    }

    // 4. DOCUMENT / PDF PARSING (Manual & Automated)
    if (
      trimmed.includes("[Apostila manual enviada:") || 
      trimmed.includes("[Documento manual enviado:") || 
      trimmed.includes("[PDF de receita enviado:") || 
      trimmed.includes("[Todos os 5 PDFs enviados manualmente]")
    ) {
      const pdfPresets = [
        { name: 'Apostila 5. Recheios Sem Fogão (101 Receitas).pdf', url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%205.%20Recheios%20Sem%20Fog%C3%A3o%20(101%20Receitas).pdf' },
        { name: 'Apostila 1. Recheios Sem Fogão (50 Receitas).pdf', url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%201.%20Recheios%20Sem%20Fog%C3%A3o%20(50%20Receitas).pdf' },
        { name: 'Apostila 3. Recheios Sem Fogão (20 Receitas).pdf', url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%203.%20Recheios%20Sem%20Fog%C3%A3o%20(20%20Receitas).pdf' },
        { name: 'Apostila 4. Recheios Sem Fogão (23 Receitas).pdf', url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%204.%20Recheios%20Sem%20Fog%C3%A3o%20(23%20Receitas).pdf' },
        { name: 'Apostila 2. Recheios Sem Fogão (34 Receitas).pdf', url: 'https://dados.promentor21.top/Funil%20Recheios/Apostila%202.%20Recheios%20Sem%20Fog%C3%A3o%20(34%20Receitas).pdf' },
      ];

      let files: { name: string; url: string }[] = [];

      if (trimmed.includes("[Todos os 5 PDFs")) {
        files = pdfPresets;
      } else {
        // Extract from either automated [PDF de receita enviado: X] or manual log
        const match = trimmed.match(/(?:enviado|enviada|enviado:)\s*([^\]]+)/i);
        let fileName = match ? match[1].trim() : "Apostila.pdf";
        if (fileName.startsWith(":")) {
          fileName = fileName.substring(1).trim();
        }
        
        if (fileName.startsWith("http")) {
          files = [{ name: "Documento.pdf", url: fileName }];
        } else {
          const found = pdfPresets.find(p => p.name.toLowerCase().includes(fileName.toLowerCase()) || fileName.toLowerCase().includes(p.name.toLowerCase()));
          files = [found || { name: fileName, url: `https://dados.promentor21.top/Funil%20Recheios/${encodeURIComponent(fileName)}` }];
        }
      }

      return (
        <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ fontSize: "11px", fontWeight: "600", color: "var(--color-brand-400)", display: "flex", alignItems: "center", gap: "6px" }}>
            📂 {files.length > 1 ? "Apostilas Enviadas (5 arquivos)" : "Apostila Recebida"}
          </div>
          {files.map((file, idx) => (
            <a
              key={idx}
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "8px 12px",
                borderRadius: "8px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                textDecoration: "none",
                color: "white",
                fontSize: "12px",
                fontWeight: "500",
                transition: "background 0.2s"
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
            >
              <span style={{ fontSize: "16px" }}>📄</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
              <span style={{ color: "var(--color-brand-400)", fontSize: "11px", fontWeight: "600" }}>Baixar 📥</span>
            </a>
          ))}
        </div>
      );
    }

    return null;
  }



  return (
    <AppLayout title="Chat Central">
      <div style={{
        display: "flex",
        height: isMobile ? "calc(100vh - 80px)" : "calc(100vh - 120px)",
        margin: isMobile ? "-16px -16px -24px -16px" : "-16px -32px -32px -32px", // expand panel flush to main bounds
        borderTop: "1px solid rgba(255, 255, 255, 0.05)"
      }}>
        {/* Left Panel: Conversations list + Filters */}
        <div style={{
          width: isMobile ? "100%" : `${listWidth}px`,
          minWidth: isMobile ? "100%" : `${listWidth}px`,
          display: isMobile && id ? "none" : "flex",
          flexDirection: "column",
          borderRight: "1px solid rgba(255, 255, 255, 0.06)",
          background: "rgba(10, 14, 23, 0.3)",
          overflow: "hidden"
        }}>
          {/* Filters Area */}
          <div style={{
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            flexShrink: 0
          }}>
            {/* Search Box */}
            <div style={{ position: "relative" }}>
              <input
                className="input-field"
                type="text"
                placeholder="🔍 Buscar lead ou telefone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: "36px", fontSize: "13px" }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  style={{
                    position: "absolute", right: "12px", top: "50%",
                    transform: "translateY(-50%)", background: "none",
                    border: "none", cursor: "pointer", color: "var(--color-text-muted)",
                    fontSize: "14px"
                  }}
                >
                  ×
                </button>
              )}
            </div>

            {/* Automation selection pills */}
            <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "4px" }}>
              <button
                onClick={() => handleAutomationChange("")}
                style={{
                  padding: "6px 12px", borderRadius: "8px", fontSize: "11px",
                  fontWeight: selectedAutomation === "" ? "700" : "500", cursor: "pointer",
                  transition: "all 0.2s ease",
                  border: selectedAutomation === "" ? "1px solid var(--color-brand-500)" : "1px solid rgba(255,255,255,0.06)",
                  background: selectedAutomation === "" ? "rgba(12,147,242,0.12)" : "var(--color-surface-800)",
                  color: selectedAutomation === "" ? "var(--color-brand-400)" : "var(--color-text-secondary)",
                  whiteSpace: "nowrap"
                }}
              >
                🌐 Todas
              </button>
              {automations.map(a => (
                <button
                  key={a.id}
                  onClick={() => handleAutomationChange(a.id)}
                  style={{
                    padding: "6px 12px", borderRadius: "8px", fontSize: "11px",
                    fontWeight: selectedAutomation === a.id ? "700" : "500", cursor: "pointer",
                    transition: "all 0.2s ease",
                    border: selectedAutomation === a.id ? "1px solid var(--color-brand-500)" : "1px solid rgba(255,255,255,0.06)",
                    background: selectedAutomation === a.id ? "rgba(12,147,242,0.12)" : "var(--color-surface-800)",
                    color: selectedAutomation === a.id ? "var(--color-brand-400)" : "var(--color-text-secondary)",
                    whiteSpace: "nowrap"
                  }}
                >
                  {a.name}
                </button>
              ))}
            </div>

            {/* Date Filters (Hoje, Ontem, Personalizado, Todas) */}
            <div style={{ display: "flex", gap: "4px", background: "var(--color-surface-800)", padding: "3px", borderRadius: "10px" }}>
              {[
                { value: "all", label: "Tudo" },
                { value: "today", label: "Hoje" },
                { value: "yesterday", label: "Ontem" },
                { value: "custom", label: "Período" },
              ].map(f => (
                <button
                  key={f.value}
                  onClick={() => setDateFilter(f.value as any)}
                  style={{
                    flex: 1, padding: "6px 0", borderRadius: "8px", border: "none",
                    fontSize: "11px", fontWeight: "600", cursor: "pointer",
                    transition: "all 0.2s ease",
                    background: dateFilter === f.value ? "var(--color-brand-600)" : "transparent",
                    color: dateFilter === f.value ? "white" : "var(--color-text-secondary)"
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Custom Date Pickers */}
            {dateFilter === "custom" && (
              <div className="fade-in" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  style={{
                    flex: 1, background: "var(--color-surface-800)",
                    border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px",
                    padding: "6px 8px", fontSize: "11px", color: "var(--color-text-primary)",
                    colorScheme: "dark"
                  }}
                />
                <span style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>até</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  style={{
                    flex: 1, background: "var(--color-surface-800)",
                    border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px",
                    padding: "6px 8px", fontSize: "11px", color: "var(--color-text-primary)",
                    colorScheme: "dark"
                  }}
                />
              </div>
            )}

            {/* Status Tabs */}
            <div style={{ display: "flex", gap: "4px", background: "var(--color-surface-800)", padding: "3px", borderRadius: "10px", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              {[
                { value: "", label: "Todas" },
                { value: "open", label: "Abertas" },
                { value: "pending", label: "Pendentes" },
                { value: "reaberto", label: "Re-abertas" },
                { value: "finalizado_com_sucesso", label: "Sucesso" },
                { value: "finalizado_sem_sucesso", label: "Sem Sucesso" },
              ].map(f => (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  style={{
                    flex: "1 0 auto", padding: "6px 12px", borderRadius: "8px", border: "none",
                    fontSize: "11px", fontWeight: "600", cursor: "pointer",
                    transition: "all 0.2s ease",
                    background: statusFilter === f.value ? "rgba(255,255,255,0.08)" : "transparent",
                    color: statusFilter === f.value ? "white" : "var(--color-text-secondary)",
                    whiteSpace: "nowrap"
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* List Scroll Area */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
            {loadingList ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "32px" }}>
                <div className="spinner" style={{ width: "24px", height: "24px" }} />
              </div>
            ) : conversations.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 10px", opacity: 0.5 }}>
                <div style={{ fontSize: "28px", marginBottom: "8px" }}>💬</div>
                <div style={{ fontSize: "13px", fontWeight: "600" }}>Nenhuma conversa</div>
                <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "4px" }}>
                  Ajuste seus filtros de busca ou aguarde novas interações.
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {conversations.map((conv) => {
                  const isSelected = conv.id === id;
                  return (
                    <div
                      key={conv.id}
                      onClick={() => navigate(`/chat/${conv.id}`)}
                      style={{
                        padding: "12px 14px",
                        cursor: "pointer",
                        borderRadius: "10px",
                        border: isSelected ? "1px solid rgba(12,147,242,0.4)" : "1px solid rgba(255,255,255,0.03)",
                        background: isSelected ? "rgba(12,147,242,0.08)" : "rgba(21, 27, 43, 0.4)",
                        transition: "all 0.2s ease",
                        position: "relative"
                      }}
                      className={isSelected ? "" : "glass-card-hover"}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
                        <span style={{ fontWeight: "700", fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "70%" }}>
                          {conv.contact_name || conv.phone}
                        </span>
                        <span style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>
                          {timeAgo(conv.updated_at)}
                        </span>
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "6px" }}>
                        {conv.last_message || "Sem mensagens"}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "9px", color: "var(--color-text-muted)" }}>
                          {conv.automation_name}
                        </span>
                        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                          {!conv.ai_active && (
                            <span style={{ background: "rgba(245,158,11,0.15)", color: "var(--color-warning)", padding: "2px 6px", borderRadius: "10px", fontSize: "8px", fontWeight: "700" }}>
                              IA PAUSADA
                            </span>
                          )}
                          <span style={{
                            background: 
                              conv.status === 'open' ? 'rgba(59,130,246,0.12)' : 
                              conv.status === 'pending' ? 'rgba(245,158,11,0.12)' : 
                              conv.status === 'reaberto' ? 'rgba(168,85,247,0.12)' :
                              conv.status === 'finalizado_com_sucesso' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                            color: 
                              conv.status === 'open' ? 'var(--color-info)' : 
                              conv.status === 'pending' ? 'var(--color-warning)' : 
                              conv.status === 'reaberto' ? '#a855f7' :
                              conv.status === 'finalizado_com_sucesso' ? 'var(--color-success)' : 'var(--color-danger)',
                            padding: "2px 6px", borderRadius: "10px", fontSize: "8px", fontWeight: "700"
                          }}>
                            {conv.status === 'open' ? 'Aberta' : 
                             conv.status === 'pending' ? 'Pendente' : 
                             conv.status === 'reaberto' ? 'Re-aberta' :
                             conv.status === 'finalizado_com_sucesso' ? 'Finalizado (Sucesso)' : 'Finalizado (Sem Sucesso)'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Resizing Handle */}
        <div
          onMouseDown={handleMouseDown}
          style={{
            width: "6px",
            cursor: "col-resize",
            background: "rgba(255, 255, 255, 0.02)",
            borderLeft: "1px solid rgba(255,255,255,0.03)",
            borderRight: "1px solid rgba(255,255,255,0.03)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.2s ease"
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-brand-600)"}
          onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)"}
        >
          {/* Elegant Grab Handle Markings */}
          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            <div style={{ width: "2px", height: "2px", borderRadius: "50%", background: "var(--color-text-muted)" }}></div>
            <div style={{ width: "2px", height: "2px", borderRadius: "50%", background: "var(--color-text-muted)" }}></div>
            <div style={{ width: "2px", height: "2px", borderRadius: "50%", background: "var(--color-text-muted)" }}></div>
          </div>
        </div>

        {/* Right Panel: Chat Message Pane + Sidebar */}
        <div style={{
          flex: 1,
          minWidth: 0,
          background: "rgba(10, 14, 23, 0.1)",
          display: isMobile && !id ? "none" : "flex",
          flexDirection: "column",
          height: "100%"
        }}>
          {loadingDetail ? (
            <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
              <div className="spinner" style={{ width: "36px", height: "36px" }} />
            </div>
          ) : !conversation ? (
            /* Blank state panel */
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", height: "100%", opacity: 0.7, padding: "40px",
              background: "rgba(15, 20, 32, 0.2)"
            }}>
              <div style={{ fontSize: "64px", marginBottom: "16px", filter: "drop-shadow(0 0 10px rgba(12,147,242,0.15))" }}>💬</div>
              <h3 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "8px", color: "var(--color-text-primary)" }}>
                Nenhuma conversa selecionada
              </h3>
              <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", textAlign: "center", maxWidth: "340px", lineHeight: "1.6" }}>
                Selecione um lead na lista à esquerda para carregar o histórico de mensagens, detalhes do contato e iniciar o atendimento.
              </p>
            </div>
          ) : (
            /* Selected Conversation Grid Layout */
            <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 280px",
              height: "100%",
              overflow: "hidden"
            }}>


              {/* Message History & Input Pane */}
              <div style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                padding: isMobile ? "12px 14px" : "20px 24px",
                overflow: "hidden",
                borderRight: "1px solid rgba(255, 255, 255, 0.06)"
              }}>
                {/* Chat Panel Header */}
                <div style={{
                  paddingBottom: "16px",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  marginBottom: "16px",
                  flexShrink: 0
                }}>
                  {isMobile ? (
                    <>
                      {/* Top row: Voltar + AI toggle */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                        <button
                          onClick={() => navigate("/chat")}
                          style={{
                            background: "rgba(255, 255, 255, 0.04)",
                            border: "1px solid rgba(255, 255, 255, 0.08)",
                            color: "var(--color-brand-400)",
                            borderRadius: "8px",
                            padding: "6px 10px",
                            fontSize: "12px",
                            fontWeight: "600",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px"
                          }}
                        >
                          ◀ Voltar
                        </button>
                        <button onClick={toggleAi} className={conversation.ai_active ? "btn-secondary" : "btn-primary"}
                          style={{ fontSize: "12px", padding: "6px 12px", borderRadius: "8px", cursor: "pointer" }}>
                          {conversation.ai_active ? "⏸️ Pausar IA" : "▶️ Reativar IA"}
                        </button>
                      </div>
                      {/* Second row: Avatar + Name (clickable) */}
                      <div 
                        style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}
                        onClick={() => setShowMobileLeadInfo(prev => !prev)}
                      >
                        <div style={{
                          width: "36px", height: "36px", borderRadius: "8px",
                          background: "linear-gradient(135deg, var(--color-surface-500), var(--color-surface-400))",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "15px", fontWeight: "700", color: "var(--color-brand-400)",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                          flexShrink: 0
                        }}>
                          {(conversation.contact_name || conversation.phone)?.charAt(0)?.toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: "700", fontSize: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
                            {conversation.contact_name || conversation.phone}
                            <span style={{ fontSize: "10px", color: "var(--color-text-muted)", transition: "transform 0.2s", transform: showMobileLeadInfo ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
                          </div>
                          <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                            Automação: <strong>{conversation.automation_name}</strong>
                          </div>
                        </div>
                      </div>
                      {/* Expandable lead details */}
                      {showMobileLeadInfo && (
                        <div style={{
                          marginTop: "12px",
                          padding: "14px 16px",
                          background: "rgba(255, 255, 255, 0.02)",
                          border: "1px solid rgba(255, 255, 255, 0.06)",
                          borderRadius: "10px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "10px",
                          animation: "fadeIn 0.2s ease"
                        }}>
                          <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--color-brand-400)", marginBottom: "4px" }}>📋 Dados do Lead</div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                            <span style={{ color: "var(--color-text-muted)" }}>Nome</span>
                            <span style={{ fontWeight: "500" }}>{conversation.contact_name || "—"}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                            <span style={{ color: "var(--color-text-muted)" }}>WhatsApp</span>
                            <span style={{ fontFamily: "monospace", fontSize: "12px" }}>{conversation.phone}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                            <span style={{ color: "var(--color-text-muted)" }}>Automação</span>
                            <span style={{ fontWeight: "500" }}>{conversation.automation_name}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", alignItems: "center" }}>
                            <span style={{ color: "var(--color-text-muted)" }}>IA</span>
                            <span className={`badge ${conversation.ai_active ? "badge-success" : "badge-warning"}`} style={{ fontSize: "11px" }}>
                              {conversation.ai_active ? "Ativa" : "Pausada"}
                            </span>
                          </div>
                          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "10px", marginTop: "4px" }}>
                            <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "8px", fontWeight: "600" }}>Mudar Status</div>
                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                              {(["open", "pending", "reaberto", "finalizado_com_sucesso", "finalizado_sem_sucesso"] as const).map(s => {
                                const labels: Record<string, string> = { 
                                  open: "📬 Aberta", 
                                  pending: "⏳ Pendente", 
                                  reaberto: "🔄 Re-aberta",
                                  finalizado_com_sucesso: "🎉 Sucesso", 
                                  finalizado_sem_sucesso: "❌ Sem Sucesso" 
                                };
                                const isActive = conversation.status === s;
                                return (
                                  <button
                                    key={s}
                                    onClick={(e) => { e.stopPropagation(); changeStatus(s); }}
                                    style={{
                                      fontSize: "11px", padding: "4px 8px", borderRadius: "6px",
                                      border: isActive ? "1px solid var(--color-brand-400)" : "1px solid rgba(255,255,255,0.08)",
                                      background: isActive ? "rgba(12,147,242,0.15)" : "rgba(255,255,255,0.03)",
                                      color: isActive ? "var(--color-brand-400)" : "var(--color-text-secondary)",
                                      cursor: "pointer", fontWeight: "600"
                                    }}
                                  >
                                    {labels[s]}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    /* Desktop layout - keep original */
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", overflow: "hidden" }}>
                        <div style={{
                          width: "36px", height: "36px", borderRadius: "8px",
                          background: "linear-gradient(135deg, var(--color-surface-500), var(--color-surface-400))",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "15px", fontWeight: "700", color: "var(--color-brand-400)",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                          flexShrink: 0
                        }}>
                          {(conversation.contact_name || conversation.phone)?.charAt(0)?.toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: "700", fontSize: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
                            {conversation.contact_name || conversation.phone}
                          </div>
                          <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                            Automação: <strong>{conversation.automation_name}</strong>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button onClick={toggleAi} className={conversation.ai_active ? "btn-secondary" : "btn-primary"}
                          style={{ fontSize: "12px", padding: "6px 12px", borderRadius: "8px", cursor: "pointer" }}>
                          {conversation.ai_active ? "⏸️ Pausar IA" : "▶️ Reativar IA"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Messages Bubbles Container with floating badge */}
                <div style={{ flex: 1, position: "relative", minHeight: 0, display: "flex", flexDirection: "column" }}>
                  {/* Messages Bubbles list */}
                  <div
                    ref={chatContainerRef}
                    onScroll={handleScroll}
                    style={{
                      flex: 1,
                      overflowY: "auto",
                      padding: "16px",
                      background: "rgba(10,14,23,0.3)",
                      borderRadius: "12px",
                      border: "1px solid rgba(255,255,255,0.04)"
                    }}
                  >
                    {conversation.messages.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "40px", color: "var(--color-text-muted)" }}>
                        Nenhuma mensagem ainda neste canal.
                      </div>
                    ) : (
                      conversation.messages.map((msg) => {
                        const isUser = msg.role === "user";
                        return (
                          <div
                            key={msg.id}
                            style={{
                              display: "flex",
                              justifyContent: isUser ? "flex-start" : "flex-end",
                              marginBottom: "12px"
                            }}
                          >
                            <div style={{
                              maxWidth: "70%",
                              padding: "10px 14px",
                              borderRadius: isUser ? "4px 16px 16px 16px" : "16px 4px 16px 16px",
                              background: isUser
                                ? "var(--color-surface-600)"
                                : msg.role === "manual"
                                  ? "rgba(245,158,11,0.12)"
                                  : "rgba(12,147,242,0.12)",
                              border: isUser
                                ? "1px solid rgba(255,255,255,0.05)"
                                : msg.role === "manual"
                                  ? "1px solid rgba(245,158,11,0.2)"
                                  : "1px solid rgba(12,147,242,0.2)",
                              boxShadow: "0 2px 8px rgba(0,0,0,0.08)"
                            }}>
                              <div style={{
                                fontSize: "9px", fontWeight: "700", marginBottom: "4px",
                                color: isUser ? "var(--color-text-muted)" : msg.role === "manual" ? "var(--color-warning)" : "var(--color-brand-400)"
                              }}>
                                {isUser ? "Lead" : msg.role === "manual" ? "Suporte" : "IA SDR"}
                                {msg.llm_used && ` • ${msg.llm_used}`}
                              </div>
                              {(() => {
                                const cleanText = cleanMediaMessageText(msg.content);
                                const mediaElement = renderMessageMedia(msg.content);
                                return (
                                  <>
                                    {mediaElement}
                                    {cleanText && (
                                      <div style={{ fontSize: "13px", lineHeight: "1.5", wordBreak: "break-word", whiteSpace: "pre-wrap", marginTop: mediaElement ? "8px" : "0" }}>
                                        {formatWhatsAppMessage(cleanText)}
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                              <div style={{ 
                                display: "flex", 
                                justifyContent: "space-between", 
                                alignItems: "center", 
                                gap: "12px",
                                marginTop: "6px",
                                fontSize: "9px",
                                color: "var(--color-text-muted)"
                              }}>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMessage(msg.id)}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    color: "rgba(239, 68, 68, 0.6)",
                                    cursor: "pointer",
                                    fontSize: "9px",
                                    fontWeight: "600",
                                    padding: 0,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "3px",
                                    transition: "color 0.2s"
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.color = "#ef4444"}
                                  onMouseLeave={(e) => e.currentTarget.style.color = "rgba(239, 68, 68, 0.6)"}
                                >
                                  🗑️ Excluir
                                </button>
                                <span>{formatTime(msg.created_at)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Floating Notification for new messages */}
                  {unreadCount > 0 && (
                    <button
                      onClick={() => {
                        setAutoScroll(true);
                        setUnreadCount(0);
                        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
                      }}
                      style={{
                        position: "absolute",
                        bottom: "16px",
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: "linear-gradient(135deg, var(--color-brand-600), var(--color-brand-500))",
                        color: "white",
                        border: "1px solid var(--color-brand-400)",
                        borderRadius: "20px",
                        padding: "8px 16px",
                        fontSize: "12px",
                        fontWeight: "700",
                        cursor: "pointer",
                        boxShadow: "0 4px 15px rgba(12,147,242,0.4)",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        zIndex: 10,
                      }}
                      className="count-up"
                    >
                      👇 {unreadCount} nova{unreadCount > 1 ? 's' : ''} mensagem{unreadCount > 1 ? 'ns' : ''}
                    </button>
                  )}
                </div>

                {/* Manual reply editor */}
                <form onSubmit={sendMessage} style={{ display: "flex", gap: "10px", marginTop: "16px", flexShrink: 0 }}>
                  <input
                    className="input-field"
                    placeholder={conversation.ai_active === 1 ? "⚠️ IA Ativa. Pause a IA acima para responder manualmente..." : "Digite sua resposta..."}
                    value={newMessage}
                    disabled={conversation.ai_active === 1 || sending}
                    onChange={(e) => setNewMessage(e.target.value)}
                    style={{ flex: 1, fontSize: "13px" }}
                  />
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={sending || conversation.ai_active === 1 || !newMessage.trim()}
                    style={{ padding: "8px 18px", borderRadius: "10px", fontSize: "13px" }}
                  >
                    {sending ? <div className="spinner" style={{ width: "16px", height: "16px" }} /> : "Enviar"}
                  </button>
                </form>

                {/* Manual sequence trigger panel */}
                <div style={{
                  marginTop: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.04)"
                }}>
                  {/* Linha 1: Agentes Principais */}
                  <div style={{ display: "flex", gap: "8px", overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: "4px", flexWrap: "nowrap", alignItems: "center" }}>
                    <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-text-muted)", minWidth: "75px" }}>🤖 AGENTES:</span>
                    <button
                      type="button"
                      disabled={sending || conversation.ai_active === 1}
                      onClick={() => handleTriggerTool("seq1")}
                      style={{
                        padding: "5px 11px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: "600",
                        background: "rgba(59, 130, 246, 0.08)",
                        color: "#60a5fa",
                        border: "1px solid rgba(59, 130, 246, 0.2)",
                        cursor: conversation.ai_active === 1 ? "not-allowed" : "pointer",
                        opacity: conversation.ai_active === 1 ? 0.4 : 1,
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        transition: "all 0.2s"
                      }}
                      className={conversation.ai_active === 1 ? "" : "hover-bright"}
                    >
                      📢 Anunciador (Seq 1)
                    </button>
                    <button
                      type="button"
                      disabled={sending || conversation.ai_active === 1}
                      onClick={() => handleTriggerTool("seq2")}
                      style={{
                        padding: "5px 11px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: "600",
                        background: "rgba(16, 185, 129, 0.08)",
                        color: "#34d399",
                        border: "1px solid rgba(16, 185, 129, 0.2)",
                        cursor: conversation.ai_active === 1 ? "not-allowed" : "pointer",
                        opacity: conversation.ai_active === 1 ? 0.4 : 1,
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        transition: "all 0.2s"
                      }}
                      className={conversation.ai_active === 1 ? "" : "hover-bright"}
                    >
                      📚 Entregador (Seq 2)
                    </button>
                    <button
                      type="button"
                      disabled={sending || conversation.ai_active === 1}
                      onClick={() => handleTriggerTool("pagamento", { valor_pagamento: 25, pago: true })}
                      style={{
                        padding: "5px 11px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: "600",
                        background: "rgba(245, 158, 11, 0.08)",
                        color: "#fbbf24",
                        border: "1px solid rgba(245, 158, 11, 0.2)",
                        cursor: conversation.ai_active === 1 ? "not-allowed" : "pointer",
                        opacity: conversation.ai_active === 1 ? 0.4 : 1,
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        transition: "all 0.2s"
                      }}
                      className={conversation.ai_active === 1 ? "" : "hover-bright"}
                    >
                      💳 Caixa (Confirmar Pago)
                    </button>
                  </div>

                  {/* Linha 2: Cobranças & Upsells */}
                  <div style={{ display: "flex", gap: "8px", overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: "4px", flexWrap: "nowrap", alignItems: "center" }}>
                    <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-text-muted)", minWidth: "75px" }}>📈 COBRANÇA:</span>
                    <button
                      type="button"
                      disabled={sending || conversation.ai_active === 1}
                      onClick={() => handleTriggerFollowup("upsell_10min")}
                      style={{
                        padding: "5px 11px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: "600",
                        background: "rgba(139, 92, 246, 0.08)",
                        color: "#a78bfa",
                        border: "1px solid rgba(139, 92, 246, 0.2)",
                        cursor: conversation.ai_active === 1 ? "not-allowed" : "pointer",
                        opacity: conversation.ai_active === 1 ? 0.4 : 1,
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        transition: "all 0.2s"
                      }}
                      className={conversation.ai_active === 1 ? "" : "hover-bright"}
                    >
                      🚀 Upsell R$ 5
                    </button>
                    <button
                      type="button"
                      disabled={sending || conversation.ai_active === 1}
                      onClick={() => handleTriggerFollowup("followup_incentivador_1h")}
                      style={{
                        padding: "5px 11px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: "600",
                        background: "rgba(239, 68, 68, 0.08)",
                        color: "#f87171",
                        border: "1px solid rgba(239, 68, 68, 0.2)",
                        cursor: conversation.ai_active === 1 ? "not-allowed" : "pointer",
                        opacity: conversation.ai_active === 1 ? 0.4 : 1,
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        transition: "all 0.2s"
                      }}
                      className={conversation.ai_active === 1 ? "" : "hover-bright"}
                    >
                      ⏰ Incentivador (1h)
                    </button>
                    <button
                      type="button"
                      disabled={sending || conversation.ai_active === 1}
                      onClick={() => handleTriggerFollowup("followup_cobrador_amigo_10h")}
                      style={{
                        padding: "5px 11px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: "600",
                        background: "rgba(236, 72, 153, 0.08)",
                        color: "#f472b6",
                        border: "1px solid rgba(236, 72, 153, 0.2)",
                        cursor: conversation.ai_active === 1 ? "not-allowed" : "pointer",
                        opacity: conversation.ai_active === 1 ? 0.4 : 1,
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        transition: "all 0.2s"
                      }}
                      className={conversation.ai_active === 1 ? "" : "hover-bright"}
                    >
                      💬 Amigo (10h)
                    </button>
                    <button
                      type="button"
                      disabled={sending || conversation.ai_active === 1}
                      onClick={() => handleTriggerFollowup("followup_cobrador_curioso_34h")}
                      style={{
                        padding: "5px 11px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: "600",
                        background: "rgba(6, 182, 212, 0.08)",
                        color: "#22d3ee",
                        border: "1px solid rgba(6, 182, 212, 0.2)",
                        cursor: conversation.ai_active === 1 ? "not-allowed" : "pointer",
                        opacity: conversation.ai_active === 1 ? 0.4 : 1,
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        transition: "all 0.2s"
                      }}
                      className={conversation.ai_active === 1 ? "" : "hover-bright"}
                    >
                      🧐 Curioso (34h)
                    </button>
                    <button
                      type="button"
                      disabled={sending || conversation.ai_active === 1}
                      onClick={() => handleTriggerFollowup("followup_cobrador_final_58h")}
                      style={{
                        padding: "5px 11px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: "600",
                        background: "rgba(244, 63, 94, 0.08)",
                        color: "#fb7185",
                        border: "1px solid rgba(244, 63, 94, 0.2)",
                        cursor: conversation.ai_active === 1 ? "not-allowed" : "pointer",
                        opacity: conversation.ai_active === 1 ? 0.4 : 1,
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        transition: "all 0.2s"
                      }}
                      className={conversation.ai_active === 1 ? "" : "hover-bright"}
                    >
                      🚨 Cobrador Final (58h)
                    </button>
                    <button
                      type="button"
                      disabled={sending || conversation.ai_active === 1}
                      onClick={() => handleTriggerFollowup("followup_vigia_15min")}
                      style={{
                        padding: "5px 11px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: "600",
                        background: "rgba(255, 255, 255, 0.04)",
                        color: "#9ca3af",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        cursor: conversation.ai_active === 1 ? "not-allowed" : "pointer",
                        opacity: conversation.ai_active === 1 ? 0.4 : 1,
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        transition: "all 0.2s"
                      }}
                      className={conversation.ai_active === 1 ? "" : "hover-bright"}
                    >
                      👀 Vigia (15m)
                    </button>
                    <button
                      type="button"
                      disabled={sending || conversation.ai_active === 1}
                      onClick={() => handleTriggerFollowup("followup_finalizador_12h")}
                      style={{
                        padding: "5px 11px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: "600",
                        background: "rgba(255, 255, 255, 0.04)",
                        color: "#9ca3af",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        cursor: conversation.ai_active === 1 ? "not-allowed" : "pointer",
                        opacity: conversation.ai_active === 1 ? 0.4 : 1,
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        transition: "all 0.2s"
                      }}
                      className={conversation.ai_active === 1 ? "" : "hover-bright"}
                    >
                      🏁 Finalizador (12h)
                    </button>
                  </div>
                </div>
              </div>

              {/* Sidebar Panel: Info & Status Control */}
              <div style={{
                padding: "24px 20px",
                display: isMobile ? "none" : "flex",
                flexDirection: "column",
                gap: "20px",
                overflowY: "auto",
                background: "rgba(10, 14, 23, 0.2)"
              }}>


                <h3 style={{
                  fontSize: "11px", fontWeight: "700", textTransform: "uppercase",
                  letterSpacing: "0.05em", color: "var(--color-text-muted)", margin: 0
                }}>
                  Dados do Lead
                </h3>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div>
                    <div style={{ fontSize: "10px", color: "var(--color-text-muted)", marginBottom: "3px" }}>Nome</div>
                    <div style={{ fontSize: "13px", fontWeight: "600" }}>{conversation.contact_name || "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: "var(--color-text-muted)", marginBottom: "3px" }}>WhatsApp / Telefone</div>
                    <div style={{ fontSize: "13px", fontWeight: "600", fontFamily: "monospace" }}>{conversation.phone}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: "var(--color-text-muted)", marginBottom: "3px" }}>Campanha Atribuída</div>
                    <div style={{ fontSize: "13px", fontWeight: "600" }}>{conversation.automation_name}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: "var(--color-text-muted)", marginBottom: "3px" }}>Status IA</div>
                    <span className={`badge ${conversation.ai_active ? 'badge-success' : 'badge-warning'}`} style={{ padding: "3px 8px", fontSize: "10px" }}>
                      {conversation.ai_active ? "Ativa e Monitorando" : "Pausada p/ Suporte"}
                    </span>
                  </div>
                </div>

                <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.06)", margin: "4px 0" }} />

                <div>
                  <div style={{ fontSize: "10px", color: "var(--color-text-muted)", marginBottom: "8px" }}>Mudar Status do Lead</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {[
                      { status: "open", label: "📬 Aberta" },
                      { status: "pending", label: "⏳ Pendente" },
                      { status: "reaberto", label: "🔄 Re-aberta" },
                      { status: "finalizado_com_sucesso", label: "🎉 Finalizado c/ Sucesso" },
                      { status: "finalizado_sem_sucesso", label: "❌ Finalizado s/ Sucesso" }
                    ].map(item => (
                      <button
                        key={item.status}
                        onClick={() => changeStatus(item.status)}
                        className={conversation.status === item.status ? "btn-primary" : "btn-secondary"}
                        style={{
                          fontSize: "12px", padding: "8px 12px", width: "100%",
                          justifyContent: "center", borderRadius: "8px", cursor: "pointer",
                          display: "flex", alignItems: "center"
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {toast && <div className="toast toast-success">{toast}</div>}
    </AppLayout>
  );
}
