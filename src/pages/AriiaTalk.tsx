import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MessageCircle,
  Search,
  Send,
  Paperclip,
  RefreshCw,
  UserRound,
  AlertCircle,
  Plus,
  Smartphone,
  Trash2,
  QrCode,
  X,
  Wifi,
  WifiOff,
  CheckCircle2,
  LoaderCircle,
  ArrowLeft,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";

type Instance = {
  id: string;
  nome: string;
  evolution_instance_name: string;
  telefone: string | null;
  status: string;
  criado_em?: string;
  atualizado_em?: string;
};

type Conversation = {
  id: string;
  instancia_id: string;
  remote_jid: string;
  contato_id: number | null;
  nome_contato: string | null;
  foto_url: string | null;
  ultima_mensagem: string | null;
  ultima_mensagem_em: string | null;
  nao_lidas: number;
  status: "open" | "closed";
  responsavel_id: number | null;
  ariiatalk_instancias?: {
    id: string;
    nome: string;
    telefone: string | null;
    status: string;
  } | null;
};

type AriiaContact = {
  id: number;
  nome: string;
  telefone: string | null;
  email: string | null;
  tipo: string;
  empresa_id: number | null;
  unidade_id: number | null;
  empresas?: { nome_fantasia: string } | { nome_fantasia: string }[] | null;
};

type ChatMessage = {
  id: string;
  conversa_id: string;
  evolution_message_id: string | null;
  direcao: "entrada" | "saida";
  tipo: string;
  conteudo: string | null;
  media_url: string | null;
  status: string;
  enviado_por: number | null;
  enviada_em: string | null;
  criado_em: string;
};

type View = "conversas" | "instancias";
type ConversationTab = "minhas" | "nao_atribuidas" | "todos";

function statusLabel(status: string) {
  switch (status.toLowerCase()) {
    case "connected":
    case "open":
      return "Conectada";
    case "connecting":
      return "Conectando";
    case "disconnected":
    case "closed":
      return "Desconectada";
    case "error":
      return "Erro";
    default:
      return status || "Desconhecido";
  }
}

function statusClass(status: string) {
  switch (status.toLowerCase()) {
    case "connected":
    case "open":
      return "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400";
    case "connecting":
      return "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400";
    case "error":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "border-muted bg-muted text-muted-foreground";
  }
}

function qrImageSource(value: string) {
  if (value.startsWith("data:image/")) return value;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `data:image/png;base64,${value}`;
}

export default function AriiaTalk() {
  const { user } = useUser();
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const previousMessageCountRef = useRef(0);
  const shouldAutoScrollRef = useRef(true);
  const [view, setView] = useState<View>("conversas");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [conversationTab, setConversationTab] = useState<ConversationTab>("todos");
  const [loading, setLoading] = useState(true);
  const [loadingInstances, setLoadingInstances] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [instanceError, setInstanceError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [qrTitle, setQrTitle] = useState("");
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [qrText, setQrText] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [messageError, setMessageError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<AriiaContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [savingContact, setSavingContact] = useState(false);

  const loadConversations = useCallback(async () => {
    setError(null);

    const { data, error: invokeError } =
      await supabase.functions.invoke("ariiatalk-conversas", {
        method: "GET",
      });

    if (invokeError) {
      console.error("[AriiaTalk] Erro ao carregar conversas:", invokeError);
      setError("Não foi possível carregar as conversas. Verifique sua sessão e a função publicada.");
      setLoading(false);
      return;
    }

    const rows = Array.isArray(data?.conversations)
      ? (data.conversations as Conversation[])
      : [];

    setConversations(rows);
    setSelectedId((current) =>
      current && rows.some((row) => row.id === current) ? current : null,
    );
    setLoading(false);
  }, []);

  const loadContacts = useCallback(async () => {
    setLoadingContacts(true);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "ariiatalk-conversas",
        {
          method: "POST",
          body: { action: "list_contacts" },
        },
      );

      if (invokeError || data?.error) {
        console.error("[AriiaTalk] Erro ao carregar contatos:", invokeError ?? data?.error);
        setNotice("N?o foi poss?vel carregar os contatos cadastrados.");
        return;
      }

      setContacts(Array.isArray(data?.contacts) ? data.contacts as AriiaContact[] : []);
    } catch (err) {
      console.error("[AriiaTalk] Erro ao carregar contatos:", err);
      setNotice("N?o foi poss?vel carregar os contatos cadastrados.");
    } finally {
      setLoadingContacts(false);
    }
  }, []);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  const handleContactChange = useCallback(async (value: string) => {
    if (!selectedId || savingContact) return;

    const contactId = value ? Number(value) : null;
    const previousConversation = conversations.find((item) => item.id === selectedId);

    if (!previousConversation || previousConversation.contato_id === contactId) return;

    setSavingContact(true);
    setNotice(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "ariiatalk-conversas",
        {
          method: "POST",
          body: {
            action: "link_contact",
            conversation_id: selectedId,
            contact_id: contactId,
          },
        },
      );

      if (invokeError || data?.error || data?.success !== true) {
        console.error("[AriiaTalk] Erro ao associar contato:", invokeError ?? data?.error);
        setNotice("N?o foi poss?vel salvar a associa??o do contato.");
        return;
      }

      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === selectedId
            ? { ...conversation, contato_id: contactId }
            : conversation,
        ),
      );

      setNotice(contactId === null
        ? "Contato desvinculado da conversa."
        : "Contato associado à conversa.");
    } catch (err) {
      console.error("[AriiaTalk] Erro ao associar contato:", err);
      setNotice("N?o foi poss?vel salvar a associa??o do contato.");
    } finally {
      setSavingContact(false);
    }
  }, [selectedId, conversations, savingContact]);

  const loadMessages = useCallback(async (conversationId: string, silent = false) => {
    if (!silent) setLoadingMessages(true);
    setMessageError(null);

    const { data, error: invokeError } = await supabase.functions.invoke(
      "ariiatalk-mensagens",
      {
        method: "POST",
        body: { action: "history", conversa_id: conversationId },
      },
    );

    if (invokeError || data?.error) {
      console.error("[AriiaTalk] Erro ao carregar histórico:", invokeError, data);
      setMessageError(
        data?.error
          ? `Não foi possível carregar as mensagens: ${data.error}`
          : invokeError?.message || "Não foi possível carregar o histórico.",
      );
      if (!silent) setLoadingMessages(false);
      return;
    }

    const container = messagesContainerRef.current;
    const previousScrollTop = container?.scrollTop ?? 0;
    const wasNearBottom = container
      ? container.scrollHeight - container.scrollTop - container.clientHeight < 100
      : true;

    setMessages(Array.isArray(data?.messages) ? data.messages : []);

    requestAnimationFrame(() => {
      const current = messagesContainerRef.current;
      if (!current) return;
      current.scrollTop = wasNearBottom
        ? current.scrollHeight
        : previousScrollTop;
    });
    if (!silent) setLoadingMessages(false);
    void loadConversations();
  }, [loadConversations]);

  const sendMessage = useCallback(async () => {
    const text = messageText.trim();
    if (!selectedId || !text || sendingMessage) return;

    const conversationId = selectedId;
    const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const now = new Date().toISOString();

    const optimisticMessage: ChatMessage = {
      id: optimisticId,
      conversa_id: conversationId,
      evolution_message_id: null,
      direcao: "saida",
      tipo: "texto",
      conteudo: text,
      media_url: null,
      status: "enviando",
      enviado_por: null,
      enviada_em: now,
      criado_em: now,
    };

    setMessages((current) => [...current, optimisticMessage]);
    setMessageText("");
    setSendingMessage(true);
    setMessageError(null);

    requestAnimationFrame(() => {
      const container = messagesContainerRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    });

    try {
      const { data, error: invokeError } =
        await supabase.functions.invoke("ariiatalk-mensagens", {
          method: "POST",
          body: {
            action: "send",
            conversa_id: conversationId,
            texto: text,
          },
        });

      if (invokeError || data?.error) {
        const details = data?.details?.message || data?.details?.error || "";
        const errorText =
          data?.error === "evolution_send_failed"
            ? `A Evolution API recusou o envio.${details ? ` ${details}` : ""}`
            : data?.error
              ? `N?o foi poss?vel enviar a mensagem: ${data.error}`
              : invokeError?.message || "N?o foi poss?vel enviar a mensagem.";

        setMessages((current) =>
          current.map((message) =>
            message.id === optimisticId
              ? { ...message, status: "erro" }
              : message,
          ),
        );
        setMessageError(errorText);
        setMessageText(text);
        return;
      }

      void loadMessages(conversationId, true);
    } catch (error) {
      console.error("[AriiaTalk] Erro ao enviar mensagem:", error);

      setMessages((current) =>
        current.map((message) =>
          message.id === optimisticId
            ? { ...message, status: "erro" }
            : message,
        ),
      );
      setMessageError("Falha de comunica??o ao enviar a mensagem.");
      setMessageText(text);
    } finally {
      setSendingMessage(false);
    }
  }, [messageText, selectedId, sendingMessage, loadMessages]);

  const loadInstances = useCallback(async () => {
    setLoadingInstances(true);
    setInstanceError(null);

    const { data, error: invokeError } =
      await supabase.functions.invoke("ariiatalk-instancias", {
        method: "GET",
      });

    if (invokeError) {
      console.error("[AriiaTalk] Erro ao carregar instâncias:", invokeError);
      setInstanceError("Não foi possível carregar as instâncias. Confira a sessão e os logs da Edge Function.");
      setLoadingInstances(false);
      return;
    }

    if (data?.error) {
      setInstanceError(
        data.error === "evolution_secrets_not_configured"
          ? "Os Secrets da Evolution API não foram encontrados pela função."
          : `Falha ao carregar instâncias: ${data.error}`,
      );
      setLoadingInstances(false);
      return;
    }

    setInstances(Array.isArray(data?.instances) ? data.instances : []);
    setLoadingInstances(false);
  }, []);


  useEffect(() => {
    void loadConversations();
    void loadInstances();

    const channel = supabase
      .channel("ariiatalk-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ariiatalk_conversas",
        },
        () => {
          void loadConversations();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ariiatalk_mensagens",
        },
        () => {
          if (selectedId && view === "conversas") {
            void loadMessages(selectedId, true);
          }
          void loadConversations();
        },
      )
      .subscribe((status) => {
        console.info("[AriiaTalk] Realtime:", status);
      });

    // Consulta de segurança caso o Realtime não entregue eventos.
    const interval = window.setInterval(() => {
      void loadConversations();

      if (view === "instancias") {
        void loadInstances();
      }

      if (selectedId && view === "conversas") {
        void loadMessages(selectedId, true);
      }
    }, 10000);

    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [loadConversations, loadInstances, loadMessages, selectedId, view]);


  useEffect(() => {
    if (selectedId && view === "conversas") {
      void loadMessages(selectedId, true);
    } else {
      setMessages([]);
      setMessageError(null);
    }
  }, [selectedId, view, loadMessages]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const previousCount = previousMessageCountRef.current;
    const hasNewMessages = messages.length > previousCount;

    if (hasNewMessages && shouldAutoScrollRef.current) {
      requestAnimationFrame(() => {
        const current = messagesContainerRef.current;
        if (current) current.scrollTop = current.scrollHeight;
      });
    }

    previousMessageCountRef.current = messages.length;
  }, [messages]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const updateScrollIntent = () => {
      shouldAutoScrollRef.current =
        container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    };

    container.addEventListener("scroll", updateScrollIntent, { passive: true });
    updateScrollIntent();

    return () => container.removeEventListener("scroll", updateScrollIntent);
  }, [selectedId, view, loadingMessages]);

  const filteredConversations = useMemo(() => {
  const term = search.trim().toLocaleLowerCase("pt-BR");

  return conversations.filter((conversation) => {
    if (
      conversationTab === "minhas" &&
      !(conversation.status === "open" && conversation.responsavel_id === user?.id)
    ) {
      return false;
    }

    if (
      conversationTab === "nao_atribuidas" &&
      conversation.responsavel_id !== null
    ) {
      return false;
    }

    if (!term) return true;

    return [
      conversation.nome_contato,
      conversation.remote_jid,
      conversation.ultima_mensagem,
      conversation.ariiatalk_instancias?.nome
    ].filter(Boolean).some((value) =>
      String(value).toLocaleLowerCase("pt-BR").includes(term)
    );
  });
}, [conversations, search, conversationTab, user?.id]);

  const selectedConversation =
    conversations.find((conversation) => conversation.id === selectedId) ?? null;

  function formatDate(value: string | null) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }

  async function createInstance(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nome = newName.trim();
    if (!nome) return;

    setCreating(true);
    setInstanceError(null);
    setNotice(null);

    const { data, error: invokeError } =
      await supabase.functions.invoke("ariiatalk-instancias", {
        method: "POST",
        body: { action: "create", nome },
      });

    setCreating(false);

    if (invokeError || data?.error) {
      console.error("[AriiaTalk] Erro ao criar instância:", invokeError, data);
      const code = data?.error;
      const messages: Record<string, string> = {
        evolution_secrets_not_configured: "Os Secrets da Evolution API não estão configurados corretamente.",
        instance_already_exists: "Já existe uma instância com esse nome.",
        invalid_instance_name: "Informe um nome válido para a instância.",
        evolution_instance_creation_failed: "A Evolution API não conseguiu criar a instância. Confira os logs da função.",
        instance_created_but_database_save_failed: "A instância foi criada na Evolution, mas falhou ao salvar no banco. Não tente recriar antes de verificar o servidor.",
        forbidden: "Seu usuário não tem permissão para gerenciar o AriiaTalk.",
      };
      setInstanceError(messages[code] || code || invokeError?.message || "Não foi possível criar a instância.");
      return;
    }

    setNewName("");
    setNotice("Instância criada.");
    await loadInstances();

    const qr = data?.qrcode;
    if (typeof qr === "string" && qr.length > 0) {
      setQrTitle(data?.instance?.nome || nome);
      setQrValue(qr);
      setQrText(null);
    } else {
      setQrTitle(data?.instance?.nome || nome);
      setQrValue(null);
      setQrText("Instância criada. Se o QR Code não foi retornado, clique em “Conectar / QR Code” na lista.");
    }
  }

  async function instanceAction(instance: Instance, action: "connect" | "status" | "delete") {
    if (action === "delete") {
      const confirmed = window.confirm(
        `Excluir a instância "${instance.nome}" da Evolution API e do AriiaTalk? Esta ação não pode ser desfeita.`,
      );
      if (!confirmed) return;
    }

    setBusyId(instance.id);
    setInstanceError(null);
    setNotice(null);

    const { data, error: invokeError } =
      await supabase.functions.invoke("ariiatalk-instancias", {
        method: "POST",
        body: { action, id: instance.id },
      });

    setBusyId(null);

    if (invokeError || data?.error) {
      console.error(`[AriiaTalk] Ação ${action} falhou:`, invokeError, data);
      const messages: Record<string, string> = {
        evolution_instance_deletion_failed: "Não foi possível excluir a instância na Evolution API.",
        instance_deleted_from_evolution_but_database_delete_failed: "A instância foi excluída na Evolution, mas não foi removida do banco. Verifique os logs.",
        evolution_connect_failed: "Não foi possível solicitar o QR Code à Evolution API.",
        evolution_status_failed: "Não foi possível consultar o estado da conexão.",
        forbidden: "Seu usuário não tem permissão para gerenciar o AriiaTalk.",
      };
      setInstanceError(messages[data?.error] || data?.error || invokeError?.message || "A operação falhou.");
      return;
    }

    if (action === "delete") {
      setNotice("Instância excluída.");
      await loadInstances();
      return;
    }

    if (action === "status") {
      const status = data?.status;
      setNotice(status ? `Status atualizado: ${statusLabel(status)}.` : "Status consultado.");
      await loadInstances();
      return;
    }

    const qr =
      data?.qrcode ??
      data?.result?.base64 ??
      data?.result?.qrcode?.base64 ??
      data?.result?.code ??
      null;

    setQrTitle(instance.nome);
    setQrValue(typeof qr === "string" && qr.length > 0 ? qr : null);
    setQrText(
      typeof qr === "string" && qr.length > 0
        ? null
        : "A Evolution API não retornou um QR Code nesta resposta. Atualize o status e tente novamente.",
    );
    await loadInstances();
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[560px] flex-col overflow-hidden rounded-xl border bg-background">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h1 className="text-xl font-semibold">AriiaTalk</h1>
          <p className="text-sm text-muted-foreground">
            Central de conversas do WhatsApp
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setView("conversas");
              setNotice(null);
            }}
            className={`rounded-md px-3 py-2 text-sm ${view === "conversas" ? "bg-primary text-primary-foreground" : "border hover:bg-muted"}`}
          >
            <MessageCircle className="mr-2 inline h-4 w-4" />
            Conversas
          </button>
          <button
            type="button"
            onClick={() => {
              setView("instancias");
              setNotice(null);
              void loadInstances();
            }}
            className={`rounded-md px-3 py-2 text-sm ${view === "instancias" ? "bg-primary text-primary-foreground" : "border hover:bg-muted"}`}
          >
            <Smartphone className="mr-2 inline h-4 w-4" />
            Instâncias
          </button>
          <button
            type="button"
            onClick={() => {
              if (view === "instancias") void loadInstances();
              else void loadConversations();
            }}
            disabled={loading || loadingInstances}
            className="rounded-md border p-2 hover:bg-muted disabled:opacity-50"
            aria-label="Atualizar"
            title="Atualizar"
          >
            <RefreshCw className={`h-4 w-4 ${(loading || loadingInstances) ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {(instanceError || notice) && (
        <div className={`flex items-start gap-2 border-b px-5 py-3 text-sm ${instanceError ? "bg-destructive/5 text-destructive" : "bg-muted/50"}`}>
          {instanceError ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="min-w-0 flex-1">{instanceError || notice}</span>
          <button
            type="button"
            onClick={() => {
              setInstanceError(null);
              setNotice(null);
            }}
            aria-label="Fechar aviso"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {view === "instancias" ? (
        <main className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mx-auto max-w-5xl space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Instâncias do WhatsApp</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Gerencie as conexões do AriiaTalk com a Evolution API.
              </p>
            </div>

            <form onSubmit={createInstance} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label htmlFor="ariiatalk-instance-name" className="mb-2 block text-sm font-medium">
                  Nome da nova instância
                </label>
                <input
                  id="ariiatalk-instance-name"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="Ex.: Atendimento"
                  maxLength={80}
                  required
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Use um nome simples para identificar o WhatsApp.
                </p>
              </div>
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {creating ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                {creating ? "Criando..." : "Criar instância"}
              </button>
            </form>

            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium">Instâncias cadastradas</h3>
              <span className="text-xs text-muted-foreground">{instances.length} no total</span>
            </div>

            {loadingInstances && instances.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Carregando instâncias...
              </div>
            ) : instanceError && instances.length === 0 ? (
              <div className="rounded-xl border border-destructive/30 p-6 text-center">
                <AlertCircle className="mx-auto mb-2 h-7 w-7 text-destructive" />
                <p className="text-sm">Não foi possível carregar as instâncias.</p>
                <button type="button" onClick={() => void loadInstances()} className="mt-3 text-sm font-medium text-primary hover:underline">
                  Tentar novamente
                </button>
              </div>
            ) : instances.length === 0 ? (
              <div className="rounded-xl border border-dashed p-10 text-center">
                <Smartphone className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                <p className="font-medium">Nenhuma instância cadastrada</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Crie uma instância acima para começar a conectar um WhatsApp.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {instances.map((instance) => (
                  <article key={instance.id} className="rounded-xl border p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Smartphone className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate font-semibold">{instance.nome}</h4>
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                          {instance.evolution_instance_name}
                        </p>
                        {instance.telefone && (
                          <p className="mt-1 text-sm text-muted-foreground">{instance.telefone}</p>
                        )}
                        <span className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${statusClass(instance.status)}`}>
                          {instance.status === "connected" ? <Wifi className="h-3.5 w-3.5" /> : instance.status === "connecting" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <WifiOff className="h-3.5 w-3.5" />}
                          {statusLabel(instance.status)}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                      <button
                        type="button"
                        disabled={busyId === instance.id}
                        onClick={() => void instanceAction(instance, "connect")}
                        className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                      >
                        {busyId === instance.id ? <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <QrCode className="mr-1.5 h-3.5 w-3.5" />}
                        Conectar / QR Code
                      </button>
                      <button
                        type="button"
                        disabled={busyId === instance.id}
                        onClick={() => void instanceAction(instance, "status")}
                        className="inline-flex items-center rounded-md border px-3 py-2 text-xs hover:bg-muted disabled:opacity-50"
                      >
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                        Atualizar status
                      </button>
                      <button
                        type="button"
                        disabled={busyId === instance.id}
                        onClick={() => void instanceAction(instance, "delete")}
                        className="inline-flex items-center rounded-md border border-destructive/30 px-3 py-2 text-xs text-destructive hover:bg-destructive/5 disabled:opacity-50"
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Excluir
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </main>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_260px]">
          <aside className="flex min-h-0 flex-col border-r">
            <div className="border-b p-3">
              <div className="flex items-center gap-2 rounded-md border px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  aria-label="Buscar conversas"
                  placeholder="Buscar conversas..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </div>
            </div>

            <div
    className="grid grid-cols-3 gap-1 border-b p-2"
    aria-label="Filtrar conversas"
  >
    {([
      { id: "minhas", label: "Minhas" },
      { id: "nao_atribuidas", label: "N?o atribu?das" },
      { id: "todos", label: "Todas" },
    ] as const).map((tab) => (
      <button
        key={tab.id}
        type="button"
        onClick={() => setConversationTab(tab.id)}
        className={`rounded-md px-1 py-2 text-[11px] font-medium whitespace-nowrap transition-colors ${
          conversationTab === tab.id
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
        aria-pressed={conversationTab === tab.id}
      >
        {tab.label}
      </button>
    ))}
  </div>
  <div className="min-h-0 flex-1 overflow-y-auto">
              {loading && conversations.length === 0 ? (
                <p className="p-5 text-center text-sm text-muted-foreground">Carregando conversas...</p>
              ) : error ? (
                <div className="p-5 text-center">
                  <AlertCircle className="mx-auto mb-2 h-6 w-6 text-destructive" />
                  <p className="text-sm">{error}</p>
                  <button type="button" onClick={() => void loadConversations()} className="mt-3 text-sm font-medium text-primary hover:underline">
                    Tentar novamente
                  </button>
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                  <MessageCircle className="mb-3 h-9 w-9 text-muted-foreground" />
                  <p className="text-sm font-medium">{search ? "Nenhum resultado" : "Nenhuma conversa"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {search ? "Tente outro nome ou número." : "As conversas aparecerão aqui quando forem recebidas."}
                  </p>
                </div>
              ) : (
                filteredConversations.map((conversation) => (
                  <button
                    type="button"
                    key={conversation.id}
                    onClick={() => setSelectedId(conversation.id)}
                    className={`flex w-full items-start gap-3 border-b p-3 text-left transition-colors hover:bg-muted/60 ${selectedId === conversation.id ? "bg-muted" : ""}`}
                  >
                    {conversation.foto_url ? (
                      <img src={conversation.foto_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                        <UserRound className="h-5 w-5 text-muted-foreground" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{conversation.nome_contato || conversation.remote_jid}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatDate(conversation.ultima_mensagem_em)}</span>
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">{conversation.ultima_mensagem || "Nenhuma mensagem"}</span>
                    </span>
                    {conversation.nao_lidas > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-xs text-primary-foreground">
                        {conversation.nao_lidas}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col">
            {selectedConversation ? (
              <>
                <header className="flex items-center gap-3 border-b px-4 py-3">
                  <UserRound className="h-8 w-8 text-muted-foreground" />
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold">{selectedConversation.nome_contato || selectedConversation.remote_jid}</h2>
                    <p className="text-xs text-muted-foreground">{selectedConversation.ariiatalk_instancias?.nome || "Instância WhatsApp"}</p>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!selectedConversation || !user?.id) return;
                        const assignToMe = selectedConversation.responsavel_id !== user.id;
                        const { error: assignmentError } = await supabase.functions.invoke("ariiatalk-conversas", {
                          method: "POST",
                          body: {
                            action: "assign_conversation",
                            conversation_id: selectedConversation.id,
                            assign_to_me: assignToMe,
                          },
                        });
                        if (assignmentError) {
                          console.error("Erro ao alterar respons?vel:", assignmentError);
                          setError("N?o foi poss?vel alterar o respons?vel pela conversa.");
                          return;
                        }
                        setNotice(assignToMe ? "Conversa atribu?da a voc?." : "Conversa desatribu?da.");
                        await loadConversations();
                      }}
                      className="mt-2 whitespace-nowrap rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted"
                    >
                      {selectedConversation.responsavel_id === user?.id ? "Desatribuir de mim" : "Atribuir a mim"}
                    </button>
                  </div>
                </header>
                <div ref={messagesContainerRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-muted/20 p-4">
                  {loadingMessages ? (
                    <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Carregando mensagens...
                    </div>
                  ) : messageError && messages.length === 0 ? (
                    <div className="m-auto max-w-md text-center">
                      <AlertCircle className="mx-auto mb-2 h-7 w-7 text-destructive" />
                      <p className="text-sm">{messageError}</p>
                      <button
                        type="button"
                        onClick={() => void loadMessages(selectedConversation.id)}
                        className="mt-3 text-sm font-medium text-primary hover:underline"
                      >
                        Tentar novamente
                      </button>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="m-auto text-center">
                      <MessageCircle className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
                      <p className="font-medium">Nenhuma mensagem registrada</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        As mensagens recebidas aparecerão aqui quando o webhook as registrar.
                      </p>
                    </div>
                  ) : (
                    messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.direcao === "saida" ? "justify-end" : "justify-start"}`}
                      >
                        <div className={`max-w-[85%] rounded-2xl px-3 py-2 shadow-sm sm:max-w-[75%] ${
                          message.direcao === "saida"
                            ? "rounded-br-sm bg-primary text-primary-foreground"
                            : "rounded-bl-sm border bg-background"
                        }`}>
                          {message.conteudo && (
                            <p className="whitespace-pre-wrap break-words text-sm">{message.conteudo}</p>
                          )}
                          {message.media_url && (
                            <a
                              href={message.media_url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 block text-xs underline"
                            >
                              Abrir mídia
                            </a>
                          )}
                          {!message.conteudo && !message.media_url && (
                            <p className="text-sm italic opacity-80">Mensagem do tipo {message.tipo}</p>
                          )}
                          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70">
                            <span>
                              {new Date(message.enviada_em || message.criado_em).toLocaleTimeString("pt-BR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {message.direcao === "saida" && (
                              <span title={message.status}>
                                {message.status === "erro" ? "!" : ["entregue", "lida"].includes(message.status) ? "✓✓" : "✓"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {messageError && messages.length > 0 && (
                  <div className="border-t border-destructive/20 bg-destructive/5 px-4 py-2 text-xs text-destructive">
                    {messageError}
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
                <MessageCircle className="mb-4 h-12 w-12 text-muted-foreground" />
                <h2 className="text-lg font-medium">Bem-vindo ao AriiaTalk</h2>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">Selecione uma conversa para visualizar o histórico de mensagens.</p>
              </div>
            )}

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void sendMessage();
              }}
              className="flex items-center gap-2 border-t p-3"
            >
              <button
                type="button"
                disabled
                aria-label="Anexar arquivo"
                title="Anexos ainda não habilitados"
                className="rounded-md p-2 text-muted-foreground opacity-50"
              >
                <Paperclip className="h-5 w-5" />
              </button>
              <input
                aria-label="Mensagem"
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                placeholder={selectedConversation ? "Digite uma mensagem..." : "Selecione uma conversa"}
                disabled={!selectedConversation || sendingMessage}
                maxLength={4000}
                className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!selectedConversation || !messageText.trim() || sendingMessage}
                aria-label="Enviar mensagem"
                title="Enviar mensagem"
                className="rounded-md bg-primary p-2 text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {sendingMessage
                  ? <LoaderCircle className="h-5 w-5 animate-spin" />
                  : <Send className="h-5 w-5" />}
              </button>
            </form>
          </section>

          <aside className="hidden border-l p-4 xl:block">
            <h2 className="text-sm font-semibold">Dados do contato</h2>
            {selectedConversation ? (
              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Nome</p>
                  <p className="break-words">{selectedConversation.nome_contato || "Não informado"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">WhatsApp</p>
                  <p className="break-words">{selectedConversation.remote_jid}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p>{statusLabel(selectedConversation.status)}</p>
                </div>
                <div className="space-y-2">
                  <label htmlFor="ariiatalk-contact" className="text-xs text-muted-foreground">
                    Contato cadastrado
                  </label>
                  <select
                    id="ariiatalk-contact"
                    value={selectedConversation.contato_id?.toString() ?? ""}
                    onChange={(event) => void handleContactChange(event.target.value)}
                    disabled={loadingContacts || savingContact}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">
                      {loadingContacts ? "Carregando contatos..." : "Sem contato vinculado"}
                    </option>
                    {contacts.map((contact) => {
                      const empresa = Array.isArray(contact.empresas)
                        ? contact.empresas[0]?.nome_fantasia
                        : contact.empresas?.nome_fantasia;

                      return (
                        <option key={contact.id} value={String(contact.id)}>
                          {contact.nome}{empresa ? ` ? ${empresa}` : ""}
                        </option>
                      );
                    })}
                  </select>
                  {savingContact && (
                    <p className="text-xs text-muted-foreground">Salvando associa??o...</p>
                  )}
                  {!loadingContacts && contacts.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Nenhum contato cadastrado foi encontrado.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Selecione uma conversa para visualizar os dados do contato.</p>
            )}
          </aside>
        </div>
      )}

      {qrTitle && (qrValue || qrText) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Conectar WhatsApp">
          <div className="w-full max-w-sm rounded-xl border bg-background p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Conectar WhatsApp</h2>
                <p className="mt-1 text-sm text-muted-foreground">{qrTitle}</p>
              </div>
              <button type="button" onClick={() => { setQrTitle(""); setQrValue(null); setQrText(null); }} className="rounded-md p-2 hover:bg-muted" aria-label="Fechar QR Code">
                <X className="h-4 w-4" />
              </button>
            </div>
            {qrValue ? (
              <div className="mt-5 flex flex-col items-center">
                <img
                  src={qrImageSource(qrValue)}
                  alt="QR Code para conectar o WhatsApp"
                  className="h-64 w-64 rounded-lg border bg-white object-contain p-2"
                  onError={() => {
                    setQrText("A resposta da Evolution API não contém uma imagem QR válida. Verifique os logs da função para conferir o formato retornado.");
                    setQrValue(null);
                  }}
                />
                <p className="mt-4 text-center text-sm text-muted-foreground">
                  No WhatsApp, abra Dispositivos conectados, escolha Conectar dispositivo e escaneie este código.
                </p>
              </div>
            ) : (
              <div className="mt-5 rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">{qrText}</div>
            )}
            <button
              type="button"
              onClick={() => { setQrTitle(""); setQrValue(null); setQrText(null); }}
              className="mt-5 w-full rounded-md border px-4 py-2 text-sm hover:bg-muted"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );

}





