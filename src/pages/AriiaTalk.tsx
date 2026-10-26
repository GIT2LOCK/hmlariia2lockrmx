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
  Inbox,
  UserPlus,
  Lock,
  Unlock,
  Folder,
  StickyNote,
  Reply,
  Flag,
  Pencil,
  Users,
} from "lucide-react";
import { empresaTagColor, categoriaTagColor, contactCategoria, CATEGORIAS_SUGERIDAS, normalizeKey } from "@/lib/ariiatalkTags";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";
import ContactsView from "@/components/ariiatalk/ContactsView";
import EditContactDialog from "@/components/ariiatalk/EditContactDialog";
import { toast } from "sonner";
import { detectNotifications, playNotificationSound } from "@/lib/ariiatalkNotifications";
import DeleteContactDialog from "@/components/ariiatalk/DeleteContactDialog";
import ConversationFilters from "@/components/ariiatalk/ConversationFilters";
import ContactAvatar from "@/components/ariiatalk/ContactAvatar";
import { isListedConversation } from "@/lib/ariiatalkContacts";
import { findMessageMatches } from "@/lib/ariiatalkMessageSearch";
import { maskPhoneInput } from "@/lib/ariiatalkPhoneMask";
import MessageActions from "@/components/ariiatalk/MessageActions";
import OpenTicketDialog from "@/components/ariiatalk/OpenTicketDialog";
import ConversationAssignee from "@/components/ariiatalk/ConversationAssignee";
import { ATTACHMENT_ACCEPT, attachmentInfo } from "../../supabase/functions/_shared/ariiatalkAttachments";

import { Ticket } from "lucide-react";
import { canEditMessage, quoteSnapshot } from "../../supabase/functions/_shared/ariiatalkMessageActions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
  is_grupo?: boolean;
  responsavel_id: number | null;
  responsavel_nome?: string | null;
  contato?: AriiaContact | null;
  pasta_ids?: string[];
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
  categoria?: string | null;
  foto_whatsapp_url?: string | null;
  empresas?: EmpresaRef | EmpresaRef[] | null;
  unidades?: { nome_unidade: string } | { nome_unidade: string }[] | null;
};

type EmpresaRef = { nome_fantasia: string; cor?: string | null };
type Staff = { id: number; nome: string };
type Pasta = { id: string; nome: string; cor: string | null };
type Nota = { id: string; texto: string; criado_em: string; usuario_id: number | null; usuarios?: { nome: string } | { nome: string }[] | null };
const EMPTY_FILTERS = { status: "", responsavel: "", instancia: "", empresa: "", categoria: "", pasta: "", naoLidas: false };
type EmpresaOpt = { id: number; nome_fantasia: string; cor: string | null };
type UnidadeOpt = { id: number; nome_unidade: string; empresa_id: number | null };
type SearchConversation = { id: string; contato_id: number | null; nome_contato: string | null; remote_jid: string; status: string; responsavel_id: number | null };

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

function ContactTags({ contact }: { contact: AriiaContact | null | undefined }) {
  if (!contact) return null;
  const empresa = one(contact.empresas);
  const unidade = one(contact.unidades);
  const categoria = contactCategoria(contact);
  if (!empresa && !unidade && !categoria) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {empresa && <span className="tag-chip" data-stage-color={empresaTagColor(contact.empresa_id, empresa.cor)}>{empresa.nome_fantasia}</span>}
      {unidade && <span className="tag-chip-unit">{unidade.nome_unidade}</span>}
      {categoria && <span className="tag-chip" data-stage-color={categoriaTagColor(categoria)}>{categoria}</span>}
    </span>
  );
}

function phoneLabel(jid: string | null | undefined) {
  const d = String(jid ?? "").replace(/@.*/, "").replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return d || String(jid ?? "");
}

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
  autor_nome?: string | null;
  enviada_em: string | null;
  criado_em: string;
  resposta_mensagem_id?: string | null;
  resposta_snapshot?: { id?: string; autor_nome: string; conteudo: string } | null;
  editada_em?: string | null;
  remetente_nome?: string | null;
  remetente_jid?: string | null;
  anotacoes?: MessageAnnotation[];
};

type MessageAnnotation = { usuario_id: number; sinalizada: boolean; nota: string; marcacao: string; usuarios?: { nome: string } | null };
type View = "conversas" | "contatos" | "instancias";
type ListMode = "inbox" | "conversas";
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
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
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
  const [attachment, setAttachment] = useState<File | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<AriiaContact[]>([]);
  const [editingContact, setEditingContact] = useState<AriiaContact | null>(null);
  const [deletingContact, setDeletingContact] = useState<AriiaContact | null>(null);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [savingContact, setSavingContact] = useState(false);
  const [listMode, setListMode] = useState<ListMode>("inbox");
  const [staff, setStaff] = useState<Staff[]>([]);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<{ contacts: AriiaContact[]; conversations: SearchConversation[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [startingContact, setStartingContact] = useState<number | null>(null);
  const [contactDialog, setContactDialog] = useState(false);
  const [empresasOpt, setEmpresasOpt] = useState<EmpresaOpt[]>([]);
  const [unidadesOpt, setUnidadesOpt] = useState<UnidadeOpt[]>([]);
  const [cForm, setCForm] = useState({ nome: "", telefone: "", empresa_id: "", unidade_id: "", categoria: "" });
  const [cError, setCError] = useState<string | null>(null);
  const [cDuplicate, setCDuplicate] = useState<AriiaContact | null>(null);
  const [cSaving, setCSaving] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [folders, setFolders] = useState<Pasta[]>([]);
  const [newFolder, setNewFolder] = useState("");
  const [folderMenu, setFolderMenu] = useState(false);
  const [notes, setNotes] = useState<Nota[]>([]);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [messageSearch, setMessageSearch] = useState("");
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editTarget, setEditTarget] = useState<ChatMessage | null>(null);
  const [editText, setEditText] = useState("");
  const [annotationTarget, setAnnotationTarget] = useState<ChatMessage | null>(null);
  const [annotationForm, setAnnotationForm] = useState({ sinalizada: false, nota: "", marcacao: "" });
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  useEffect(() => { setReplyTo(null); setEditTarget(null); setAnnotationTarget(null); setActionError(null); }, [selectedId]);

  const lastSnapshotRef = useRef<Conversation[] | null>(null);
  const selfAssignedRef = useRef<Set<string>>(new Set());
  const userIdRef = useRef<number | null>(null);
  userIdRef.current = (user?.id as number | undefined) ?? null;
  const loadConversations = useCallback(async () => {
    setError(null);

    const { data, error: invokeError } =
      await supabase.functions.invoke(selectedIdRef.current ? `ariiatalk-conversas?conversation_id=${encodeURIComponent(selectedIdRef.current)}` : "ariiatalk-conversas", {
        method: "GET",
      });

    if (invokeError && (invokeError as any).context?.status === 401) {
      setError("Sua sessão expirou. Saia e entre novamente para continuar.");
      setLoading(false);
      return;
    }

    if (invokeError) {
      console.warn("[AriiaTalk] Erro ao carregar conversas:", invokeError);
      setError("Não foi possível carregar as conversas. Verifique sua sessão e a função publicada.");
      setLoading(false);
      return;
    }

    const rows = Array.isArray(data?.conversations)
      ? (data.conversations as Conversation[])
      : [];

    const alerts = detectNotifications(lastSnapshotRef.current, rows, userIdRef.current, selfAssignedRef.current);
    lastSnapshotRef.current = rows;
    selfAssignedRef.current.clear();
    if (alerts.length) {
      playNotificationSound();
      alerts.slice(0, 3).forEach(a => toast(a.title, {
        description: a.description || undefined, position: "top-right", duration: 6000,
        action: { label: "Abrir", onClick: () => { setView("conversas"); setSelectedId(a.conversationId); } },
      }));
    }
    setConversations(rows);
    setSelectedId((current) =>
      current && rows.some((row) => row.id === current) ? current : null,
    );
    setLoading(false);
  }, []);

  const loadContacts = useCallback(async () => {
    setLoadingContacts(true);
    setContactsError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "ariiatalk-conversas",
        {
          method: "POST",
          body: { action: "list_contacts" },
        },
      );

      if (invokeError || data?.error) {
        console.warn("[AriiaTalk] Erro ao carregar contatos:", invokeError ?? data?.error);
        setContactsError("Não foi possível carregar os contatos cadastrados.");
        return;
      }

      setContacts(Array.isArray(data?.contacts) ? data.contacts as AriiaContact[] : []);
    } catch (err) {
      console.error("[AriiaTalk] Erro ao carregar contatos:", err);
      setContactsError("Não foi possível carregar os contatos cadastrados.");
    } finally {
      setLoadingContacts(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    void loadContacts();
    void (async () => {
      const [st, eu] = await Promise.all([
        supabase.functions.invoke("ariiatalk-conversas", { method: "POST", body: { action: "list_staff" } }),
        supabase.functions.invoke("ariiatalk-conversas", { method: "POST", body: { action: "list_empresas_unidades" } }),
      ]);
      if (Array.isArray(st.data?.staff)) setStaff(st.data.staff);
      if (Array.isArray(eu.data?.empresas)) setEmpresasOpt(eu.data.empresas);
      if (Array.isArray(eu.data?.unidades)) setUnidadesOpt(eu.data.unidades);
      const fo = await supabase.functions.invoke("ariiatalk-conversas", { method: "POST", body: { action: "list_folders" } });
      if (Array.isArray(fo.data?.folders)) setFolders(fo.data.folders);
    })().catch(() => undefined);
  }, [loadContacts, user?.id]);

  // Pesquisa global no servidor (contatos + conversas), independente da subaba.
  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) {
      setSearchResults(null);
      setSearchError(null);
      return;
    }
    setSearching(true);
    const handle = window.setTimeout(async () => {
      const { data, error: err } = await supabase.functions.invoke("ariiatalk-conversas", {
        method: "POST",
        body: { action: "search", term },
      });
      setSearching(false);
      if (err || data?.error) {
        setSearchError("Não foi possível pesquisar agora. Tente novamente.");
        setSearchResults(null);
        return;
      }
      setSearchError(null);
      setSearchResults({ contacts: data?.contacts ?? [], conversations: data?.conversations ?? [] });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [search]);

  const openConversation = useCallback((id: string) => {
    selectedIdRef.current = id;
    setSelectedId(id);
    setView("conversas");
    setSearch("");
    setMessages([]);
    setLoadingMessages(true);
    setMessageText("");
  }, []);

  const startConversation = useCallback(async (contact: AriiaContact) => {
    setStartingContact(contact.id);
    const { data, error: err } = await supabase.functions.invoke("ariiatalk-conversas", {
      method: "POST",
      body: { action: "start_conversation", contact_id: contact.id },
    });
    setStartingContact(null);
    if (err || data?.error || !data?.conversation_id) {
      const map: Record<string, string> = {
        no_instance: "Nenhuma instância do WhatsApp configurada.",
        contact_without_valid_phone: "Este contato não tem um telefone válido para WhatsApp.",
        group_conversation_not_found: "Ainda não há conversa registrada para este grupo.",
      };
      setNotice(map[data?.error] ?? "Não foi possível iniciar a conversa.");
      return;
    }
    selectedIdRef.current = data.conversation_id;
    await loadConversations();
    setListMode("conversas");
    setConversationTab("todos");
    openConversation(data.conversation_id);
    setNotice(data.created ? "Conversa criada. Nenhuma mensagem foi enviada ainda." : "Conversa existente aberta.");
  }, [loadConversations, openConversation]);

  const assignTo = useCallback(async (responsavelId: number | null) => {
    if (!selectedId) return;
    selfAssignedRef.current.add(selectedId);
    setAssigning(true);
    const { data, error: err } = await supabase.functions.invoke("ariiatalk-conversas", {
      method: "POST",
      body: { action: "assign_conversation", conversation_id: selectedId, responsavel_id: responsavelId },
    });
    setAssigning(false);
    if (err || data?.error) {
      setNotice("Não foi possível alterar o responsável pela conversa.");
      return;
    }
    setConversations((cur) => cur.map((c) => c.id === selectedId
      ? { ...c, responsavel_id: responsavelId, responsavel_nome: staff.find((s) => s.id === responsavelId)?.nome ?? null }
      : c));
    setNotice(responsavelId ? "Responsável atualizado." : "Atribuição removida.");
    void loadConversations();
  }, [selectedId, staff, loadConversations]);

  const setConversationStatus = useCallback(async (status: "open" | "closed") => {
    if (!selectedId) return;
    const { data, error: err } = await supabase.functions.invoke("ariiatalk-conversas", {
      method: "POST",
      body: { action: "set_status", conversation_id: selectedId, status },
    });
    if (err || data?.error) {
      setNotice("Não foi possível alterar o status da conversa.");
      return;
    }
    setConversations((cur) => cur.map((c) => c.id === selectedId ? { ...c, status } : c));
    if (status === "closed") {
      selectedIdRef.current = null;
      setSelectedId(null);
      setMessages([]);
      setMessageText("");
      setSearch("");
      setFilters(f => ({ ...f, status: "" }));
    }
    setNotice(status === "closed" ? "Conversa encerrada." : "Conversa reaberta.");
    void loadConversations();
  }, [selectedId, loadConversations]);

  const callTalk = useCallback(async (body: Record<string, unknown>) => {
    const { data, error: err } = await supabase.functions.invoke("ariiatalk-conversas", { method: "POST", body });
    let payload = data;
    if (err && (err as any).context?.json) {
      try { payload = await (err as any).context.json(); } catch { /* ignore */ }
    }
    return { ok: !err && !payload?.error, data: payload };
  }, []);

  const createFolder = useCallback(async () => {
    const nome = newFolder.trim();
    if (!nome) return;
    const r = await callTalk({ action: "create_folder", nome });
    if (!r.ok) return setNotice(r.data?.error === "folder_exists" ? "Já existe uma pasta com esse nome." : "Não foi possível criar a pasta.");
    setFolders((cur) => [...cur, r.data.folder].sort((a, b) => a.nome.localeCompare(b.nome)));
    setNewFolder("");
  }, [newFolder, callTalk]);

  const deleteFolder = useCallback(async (folder: Pasta) => {
    if (!window.confirm(`Excluir a pasta "${folder.nome}"? As conversas não serão apagadas.`)) return;
    const r = await callTalk({ action: "delete_folder", folder_id: folder.id });
    if (!r.ok) return setNotice("Não foi possível excluir a pasta.");
    setFolders((cur) => cur.filter((f) => f.id !== folder.id));
    setConversations((cur) => cur.map((c) => ({ ...c, pasta_ids: (c.pasta_ids ?? []).filter((id) => id !== folder.id) })));
    setFilters((f) => (f.pasta === folder.id ? { ...f, pasta: "" } : f));
  }, [callTalk]);

  const toggleFolder = useCallback(async (folderId: string, add: boolean) => {
    if (!selectedId) return;
    const r = await callTalk({ action: "toggle_folder", conversation_id: selectedId, folder_id: folderId, add });
    if (!r.ok) return setNotice("Não foi possível alterar a pasta da conversa.");
    setConversations((cur) => cur.map((c) => c.id === selectedId
      ? { ...c, pasta_ids: add ? [...new Set([...(c.pasta_ids ?? []), folderId])] : (c.pasta_ids ?? []).filter((id) => id !== folderId) }
      : c));
  }, [selectedId, callTalk]);

  const selectedContactId = conversations.find((c) => c.id === selectedId)?.contato_id ?? null;
  useEffect(() => {
    setNotes([]);
    setNoteText("");
    if (!selectedContactId) return;
    void callTalk({ action: "list_notes", contact_id: selectedContactId }).then((r) => {
      if (r.ok && Array.isArray(r.data?.notes)) setNotes(r.data.notes);
    });
  }, [selectedContactId, callTalk]);

  const addNote = useCallback(async () => {
    const texto = noteText.trim();
    if (!texto || !selectedContactId) return;
    setSavingNote(true);
    const r = await callTalk({ action: "add_note", contact_id: selectedContactId, texto });
    setSavingNote(false);
    if (!r.ok) return setNotice("Não foi possível salvar a observação.");
    setNotes((cur) => [r.data.note, ...cur]);
    setNoteText("");
  }, [noteText, selectedContactId, callTalk]);

  const deleteNote = useCallback(async (note: Nota) => {
    if (!window.confirm("Apagar esta observação?")) return;
    const r = await callTalk({ action: "delete_note", note_id: note.id });
    if (!r.ok) return setNotice(r.data?.error === "forbidden" ? "Só quem escreveu (ou um administrador) pode apagar." : "Não foi possível apagar a observação.");
    setNotes((cur) => cur.filter((n) => n.id !== note.id));
  }, [callTalk]);

  const saveContact = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setCError(null);
    setCDuplicate(null);
    const digits = cForm.telefone.replace(/\D/g, "");
    if (cForm.nome.trim().length < 2) return setCError("Informe o nome do contato.");
    if (digits.length < 10 || digits.length > 15) return setCError("Informe um telefone válido com DDD.");
    setCSaving(true);
    const { data, error: err } = await supabase.functions.invoke("ariiatalk-conversas", {
      method: "POST",
      body: {
        action: "create_contact",
        nome: cForm.nome,
        telefone: cForm.telefone,
        empresa_id: cForm.empresa_id ? Number(cForm.empresa_id) : null,
        unidade_id: cForm.unidade_id ? Number(cForm.unidade_id) : null,
        categoria: cForm.categoria || null,
      },
    });
    setCSaving(false);
    // invoke trata 409 como erro: o corpo vem em err.context
    let payload = data;
    if (err && (err as any).context?.json) {
      try { payload = await (err as any).context.json(); } catch { /* ignore */ }
    }
    if (payload?.error === "duplicate_phone") {
      setCDuplicate(payload.contact);
      setCError("Já existe um contato com este telefone.");
      return;
    }
    if (err || payload?.error || !payload?.contact) {
      const map: Record<string, string> = {
        invalid_phone: "Telefone inválido para WhatsApp.",
        invalid_name: "Nome inválido.",
        unidade_outside_empresa: "A unidade não pertence à empresa escolhida.",
      };
      setCError(map[payload?.error] ?? "Não foi possível salvar o contato.");
      return;
    }
    setContacts((cur) => [...cur, payload.contact].sort((a, b) => a.nome.localeCompare(b.nome)));
    setContactDialog(false);
    setCForm({ nome: "", telefone: "", empresa_id: "", unidade_id: "", categoria: "" });
    setNotice("Contato cadastrado. Nenhuma mensagem foi enviada.");
    if (search.trim().length >= 2) setSearch((s) => s + " ");
  }, [cForm, search]);

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
        setNotice("Não foi possível salvar a associação do contato.");
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
      setNotice("Não foi possível salvar a associação do contato.");
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

    if (selectedIdRef.current !== conversationId) return;
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

  async function messageAction(action: "edit" | "annotate", target: ChatMessage, values: Record<string, unknown>) {
    if (actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const { data, error } = await supabase.functions.invoke("ariiatalk-mensagens", { body: { action, conversa_id: target.conversa_id, mensagem_id: target.id, ...values } });
      if (error || data?.error || !data?.success) {
        setActionError(action === "edit" ? "Não foi possível editar no WhatsApp. A mensagem pode estar fora do prazo ou a conexão não permitir edição; o texto original foi mantido." : "Não foi possível salvar a anotação. Tente novamente.");
        return;
      }
      setEditTarget(null);
      setAnnotationTarget(null);
      await loadMessages(target.conversa_id, true);
    } catch { setActionError("Falha de conexão. Suas alterações não foram descartadas; tente novamente."); }
    finally { setActionBusy(false); }
  }

  function myAnnotation(message: ChatMessage) { return message.anotacoes?.find(a => a.usuario_id === user?.id); }
  function openAnnotation(message: ChatMessage) {
    const mine = myAnnotation(message);
    setAnnotationForm({ sinalizada: mine?.sinalizada ?? false, nota: mine?.nota ?? "", marcacao: mine?.marcacao ?? "" });
    setAnnotationTarget(message); setActionError(null);
  }

  const sendMessage = useCallback(async () => {
    const text = messageText.trim();
    if (!selectedId || (!text && !attachment) || sendingMessage) return;

    const conversationId = selectedId;
    const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const now = new Date().toISOString();

    const optimisticMessage: ChatMessage = {
      id: optimisticId,
      conversa_id: conversationId,
      evolution_message_id: null,
      direcao: "saida",
      tipo: attachment ? attachmentInfo(attachment).kind : "texto",
      conteudo: text || attachment?.name || "",
      media_url: null,
      status: "enviando",
      enviado_por: user?.id ?? null,
      autor_nome: [user?.nome, user?.sobrenome].filter(Boolean).join(" "),
      enviada_em: now,
      criado_em: now,
      resposta_mensagem_id: replyTo?.id ?? null,
      resposta_snapshot: replyTo ? quoteSnapshot(replyTo) : null,
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
      const form = attachment ? new FormData() : null;
      if (form && attachment) {
        form.append("arquivo", attachment);
        form.append("conversa_id", conversationId);
        form.append("texto", text);
        if (replyTo) form.append("resposta_mensagem_id", replyTo.id);
      }
      const { data, error: invokeError } =
        await supabase.functions.invoke("ariiatalk-mensagens", {
          method: "POST",
          body: form ?? {
            action: "send",
            conversa_id: conversationId,
            texto: text,
            resposta_mensagem_id: replyTo?.id ?? null,
          },
        });

      if (invokeError || data?.error) {
        let failure = data;
        if (invokeError && !failure && "context" in invokeError && invokeError.context instanceof Response) failure = await invokeError.context.json().catch(() => null);
        const details = failure?.message || failure?.details?.message || "";
        const errorText =
          failure?.error === "evolution_send_failed"
            ? `A Evolution API recusou o envio.${details ? ` ${details}` : ""}`
            : failure?.error
              ? (details || "Não foi possível enviar o anexo ou a mensagem. Tente novamente.")
              : invokeError?.message || "Não foi possível enviar a mensagem.";

        if (selectedIdRef.current !== conversationId) return;
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

      setConversations(cur => cur.map(c => c.id === conversationId ? { ...c, status: "open" } : c));
      if (selectedIdRef.current !== conversationId) return;
      setAttachment(null);
      setReplyTo(null);
      void loadMessages(conversationId, true);
    } catch (error) {
      console.error("[AriiaTalk] Erro ao enviar mensagem:", error);
      if (selectedIdRef.current !== conversationId) return;

      setMessages((current) =>
        current.map((message) =>
          message.id === optimisticId
            ? { ...message, status: "erro" }
            : message,
        ),
      );
      setMessageError("Falha de comunicação ao enviar a mensagem.");
      setMessageText(text);
    } finally {
      setSendingMessage(false);
    }
  }, [messageText, attachment, selectedId, sendingMessage, loadMessages, user, replyTo]);

  const loadInstances = useCallback(async () => {
    setLoadingInstances(true);
    setInstanceError(null);

    const { data, error: invokeError } =
      await supabase.functions.invoke("ariiatalk-instancias", {
        method: "GET",
      });

    if (invokeError) {
      console.warn("[AriiaTalk] Erro ao carregar instâncias:", invokeError);
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
      void loadMessages(selectedId);
    } else {
      setMessages([]);
      setMessageError(null);
    }
  }, [selectedId, view, loadMessages]);

  useEffect(() => {
    setMessageSearch("");
    setHighlightMessageId(null);
    setAttachment(null);
    setMessageText("");
    setReplyTo(null);
  }, [selectedId]);

  const messageMatches = useMemo(() => findMessageMatches(messages, messageSearch), [messages, messageSearch]);

  function jumpToMessage(id: string) {
    setHighlightMessageId(id);
    const el = messagesContainerRef.current?.querySelector(`[data-message-id="${CSS.escape(id)}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    window.setTimeout(() => setHighlightMessageId((cur) => (cur === id ? null : cur)), 2500);
  }

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
    if (!isListedConversation(conversation.status, filters.status)) return false;
    if (
      conversationTab === "minhas" &&
      !(conversation.status === "open" && conversation.responsavel_id === user?.id)
    ) {
      return false;
    }

    if (
      conversationTab === "nao_atribuidas" &&
      !(conversation.status === "open" && conversation.responsavel_id === null)
    ) {
      return false;
    }

    if (filters.status && conversation.status !== filters.status) return false;
    if (filters.responsavel === "none" && conversation.responsavel_id !== null) return false;
    if (filters.responsavel && filters.responsavel !== "none" && String(conversation.responsavel_id) !== filters.responsavel) return false;
    if (filters.instancia && conversation.instancia_id !== filters.instancia) return false;
    if (filters.empresa && String(conversation.contato?.empresa_id ?? "") !== filters.empresa) return false;
    if (filters.categoria && (contactCategoria(conversation.contato ?? {}) ?? "") !== filters.categoria) return false;
    if (filters.pasta && !(conversation.pasta_ids ?? []).includes(filters.pasta)) return false;
    if (filters.naoLidas && conversation.nao_lidas === 0) return false;

    if (!term || term.length >= 2) return true;

    return [
      conversation.nome_contato,
      conversation.remote_jid,
      conversation.ultima_mensagem,
      conversation.ariiatalk_instancias?.nome
    ].filter(Boolean).some((value) =>
      String(value).toLocaleLowerCase("pt-BR").includes(term)
    );
  });
}, [conversations, search, conversationTab, user?.id, filters]);

  const categoriasDisponiveis = useMemo(
    () => [...new Set(conversations.map((c) => contactCategoria(c.contato ?? {})).filter(Boolean) as string[])].sort(),
    [conversations],
  );

  const inboxConversations = useMemo(
    () => conversations
      .filter((c) => c.status === "open" && c.nao_lidas > 0)
      .sort((a, b) => String(b.ultima_mensagem_em ?? "").localeCompare(String(a.ultima_mensagem_em ?? ""))),
    [conversations],
  );
  const totalUnread = useMemo(() => inboxConversations.reduce((n, c) => n + c.nao_lidas, 0), [inboxConversations]);
  const listRows = listMode === "inbox" ? inboxConversations : filteredConversations;

  const selectedConversation =
    conversations.find((conversation) => conversation.id === selectedId) ?? null;

  function formatDate(value: string | null) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }
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
    <div className="-m-4 flex h-[calc(100dvh-3.5rem)] min-h-[560px] flex-col overflow-hidden bg-background md:-m-6 md:h-[100dvh]">
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
            {totalUnread > 0 && (
              <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold text-destructive-foreground">{totalUnread}</span>
            )}
          </button>
          <Button variant={view === "contatos" ? "default" : "outline"} onClick={() => { setView("contatos"); setNotice(null); void loadContacts(); }}>
            <UserRound />Contatos
          </Button>
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
              else if (view === "contatos") void loadContacts();
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

      {view === "contatos" ? (
        <>
        <ContactsView contacts={contacts} loading={loadingContacts} error={contactsError} startingId={startingContact} empresas={empresasOpt} unidades={unidadesOpt} onStart={c => void startConversation(c)} onCreate={() => { setCError(null); setCDuplicate(null); setContactDialog(true); }} onRetry={() => void loadContacts()} onEdit={setEditingContact} onDelete={setDeletingContact} />
        {deletingContact && <DeleteContactDialog key={deletingContact.id} contact={deletingContact} onClose={() => setDeletingContact(null)} onDeleted={id => {
          setContacts(current => current.filter(c => c.id !== id));
          setConversations(current => current.map(c => c.contato_id === id ? { ...c, contato_id: null, contato: null } : c));
          setSearchResults(current => current ? { ...current, contacts: current.contacts.filter(c => c.id !== id) } : null);
          setNotice("Contato excluído.");
        }} />}
        {editingContact && <EditContactDialog key={editingContact.id} contact={editingContact} onClose={() => setEditingContact(null)} onSaved={updated => {
          setContacts(current => current.map(c => c.id === updated.id ? updated : c).sort((a, b) => a.nome.localeCompare(b.nome)));
          setConversations(current => current.map(c => c.contato_id === updated.id ? { ...c, contato: updated } : c));
          setSearchResults(current => current ? { ...current, contacts: current.contacts.map(c => c.id === updated.id ? updated : c) } : null);
          setNotice("Contato atualizado.");
          void loadContacts();
        }} />}
        </>
      ) : view === "instancias" ? (
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
            <div className="space-y-2 border-b p-3">
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border px-3">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <input
                    aria-label="Buscar contatos e conversas"
                    placeholder="Buscar nome ou telefone..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none"
                  />
                  {search && (
                    <button type="button" onClick={() => setSearch("")} aria-label="Limpar busca"><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                  )}
                </div>
                <ConversationFilters
                  open={showFilters}
                  onOpenChange={open => { setShowFilters(open); if (open) setListMode("conversas"); }}
                  filters={filters} onChange={setFilters} onReset={() => setFilters(EMPTY_FILTERS)}
                  staff={staff} empresas={empresasOpt} categorias={categoriasDisponiveis}
                  instances={[...new Map(conversations.flatMap(c => c.ariiatalk_instancias ? [[c.instancia_id, { id: c.instancia_id, nome: c.ariiatalk_instancias.nome }] as const] : [])).values()]}
                  folders={folders} folderCounts={Object.fromEntries(folders.map(f => [f.id, conversations.filter(c => (c.pasta_ids ?? []).includes(f.id)).length]))}
                  newFolder={newFolder} onNewFolder={setNewFolder} onCreate={() => void createFolder()}
                  onDelete={folder => { const found = folders.find(f => f.id === folder.id); if (found) void deleteFolder(found); }}
                />
                <button
                  type="button"
                  onClick={() => { setCError(null); setCDuplicate(null); setContactDialog(true); }}
                  className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border px-2 text-xs font-medium hover:bg-muted"
                  title="Adicionar contato"
                >
                  <UserPlus className="h-4 w-4" />
                  <span className="hidden sm:inline">Contato</span>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setListMode("inbox")}
                  aria-pressed={listMode === "inbox"}
                  className={`inline-flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium ${listMode === "inbox" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                >
                  <Inbox className="h-3.5 w-3.5" /> Caixa de entrada
                  {totalUnread > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{totalUnread}</span>}
                </button>
                <button
                  type="button"
                  onClick={() => setListMode("conversas")}
                  aria-pressed={listMode === "conversas"}
                  className={`inline-flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium ${listMode === "conversas" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                >
                  <MessageCircle className="h-3.5 w-3.5" /> Conversas
                </button>
              </div>
            </div>

            {listMode === "conversas" && !searchResults && (
            <div
    className="grid grid-cols-3 gap-1 border-b p-2"
    aria-label="Filtrar conversas"
  >
    {([
      { id: "minhas", label: "Minhas" },
      { id: "nao_atribuidas", label: "Não atribuídas" },
      { id: "todos", label: "Todos" },
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
            )}
  <div className="min-h-0 flex-1 overflow-y-auto">
              {search.trim().length >= 2 ? (
                <div className="p-2">
                  {searching && !searchResults ? (
                    <p className="flex items-center justify-center gap-2 p-5 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" /> Pesquisando...</p>
                  ) : searchError ? (
                    <p className="p-5 text-center text-sm text-destructive">{searchError}</p>
                  ) : searchResults && searchResults.contacts.length === 0 && searchResults.conversations.length === 0 ? (
                    <div className="p-5 text-center text-sm">
                      <p className="font-medium">Nenhum resultado</p>
                      <button type="button" onClick={() => { setCForm((f) => ({ ...f, nome: /\d/.test(search) ? "" : search.trim(), telefone: /\d/.test(search) ? maskPhoneInput(search.trim()) : "" })); setContactDialog(true); }} className="mt-2 text-xs font-medium text-primary hover:underline">Cadastrar novo contato</button>
                    </div>
                  ) : searchResults && (
                    <>
                      {searchResults.conversations.length > 0 && <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase text-muted-foreground">Conversas</p>}
                      {searchResults.conversations.map((c) => {
                        const contact = contacts.find((x) => x.id === c.contato_id) ?? searchResults.contacts.find((x) => x.id === c.contato_id);
                        return (
                          <button key={c.id} type="button" onClick={() => openConversation(c.id)} className="flex w-full items-start gap-2 rounded-md p-2 text-left hover:bg-muted">
                            <ContactAvatar name={contact?.nome || c.nome_contato || phoneLabel(c.remote_jid)} conversationId={c.id} contactId={c.contato_id} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{contact?.nome || c.nome_contato || phoneLabel(c.remote_jid)}</span>
                              <span className="block text-xs text-muted-foreground">{phoneLabel(c.remote_jid)} · {c.status === "closed" ? "Encerrada" : "Aberta"}</span>
                              <ContactTags contact={contact} />
                            </span>
                          </button>
                        );
                      })}
                      {(() => {
                        const withConv = new Set(searchResults.conversations.map((c) => c.contato_id).filter(Boolean));
                        const free = searchResults.contacts.filter((ct) => !withConv.has(ct.id));
                        return free.length > 0 && (
                          <>
                            <p className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase text-muted-foreground">Contatos sem conversa</p>
                            {free.map((ct) => (
                              <div key={ct.id} className="flex items-start gap-2 rounded-md p-2 hover:bg-muted">
                                <ContactAvatar name={ct.nome} contactId={ct.telefone ? ct.id : null} photoUrl={ct.foto_whatsapp_url} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium">{ct.nome}</span>
                                  <span className="block text-xs text-muted-foreground">{ct.telefone ? phoneLabel(ct.telefone) : "Sem telefone"}</span>
                                  <ContactTags contact={ct} />
                                </span>
                                <button type="button" disabled={startingContact === ct.id || !ct.telefone} onClick={() => void startConversation(ct)} className="shrink-0 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-50">
                                  {startingContact === ct.id ? "Abrindo..." : "Iniciar conversa"}
                                </button>
                              </div>
                            ))}
                          </>
                        );
                      })()}
                    </>
                  )}
                </div>
              ) : loading && conversations.length === 0 ? (
                <p className="p-5 text-center text-sm text-muted-foreground">Carregando conversas...</p>
              ) : error ? (
                <div className="p-5 text-center">
                  <AlertCircle className="mx-auto mb-2 h-6 w-6 text-destructive" />
                  <p className="text-sm">{error}</p>
                  <button type="button" onClick={() => void loadConversations()} className="mt-3 text-sm font-medium text-primary hover:underline">
                    Tentar novamente
                  </button>
                </div>
              ) : listRows.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                  {listMode === "inbox" ? <Inbox className="mb-3 h-9 w-9 text-muted-foreground" /> : <MessageCircle className="mb-3 h-9 w-9 text-muted-foreground" />}
                  <p className="text-sm font-medium">{listMode === "inbox" ? "Tudo em dia" : "Nenhuma conversa"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {listMode === "inbox" ? "Não há mensagens recebidas sem visualizar." : "Nenhuma conversa nesta lista."}
                  </p>
                </div>
              ) : (
                listRows.map((conversation) => (
                  <button
                    type="button"
                    key={conversation.id}
                    onClick={() => setSelectedId(conversation.id)}
                    className={`flex w-full items-start gap-3 border-b p-3 text-left transition-colors hover:bg-muted/60 ${selectedId === conversation.id ? "bg-muted" : ""}`}
                  >
                    <ContactAvatar name={conversation.contato?.nome || conversation.nome_contato || phoneLabel(conversation.remote_jid)} conversationId={conversation.id} contactId={conversation.contato_id} photoUrl={conversation.foto_url} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className={`flex min-w-0 items-center gap-1 text-sm ${conversation.nao_lidas > 0 ? "font-bold" : "font-medium"}`}>{conversation.is_grupo && <Users className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Grupo" />}<span className="truncate">{conversation.contato?.nome || conversation.nome_contato || phoneLabel(conversation.remote_jid)}</span></span>
                        <span className={`shrink-0 text-xs ${conversation.nao_lidas > 0 ? "font-semibold text-primary" : "text-muted-foreground"}`}>{formatDate(conversation.ultima_mensagem_em)}</span>
                      </span>
                      {(conversation.contato?.nome || conversation.nome_contato) && (
                        <span className="block text-[11px] text-muted-foreground">{phoneLabel(conversation.remote_jid)}</span>
                      )}
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className={`min-w-0 flex-1 truncate text-xs ${conversation.nao_lidas > 0 ? "text-foreground" : "text-muted-foreground"}`}>{conversation.ultima_mensagem || "Nenhuma mensagem"}</span>
                        {conversation.nao_lidas > 0 && (
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground">
                            {conversation.nao_lidas}
                          </span>
                        )}
                      </span>
                      <ContactTags contact={conversation.contato} />
                      {(conversation.pasta_ids ?? []).length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {folders.filter((f) => (conversation.pasta_ids ?? []).includes(f.id)).map((f) => (
                            <span key={f.id} className="inline-flex items-center gap-0.5 text-[10.5px] text-muted-foreground"><Folder className="h-3 w-3" />{f.nome}</span>
                          ))}
                        </span>
                      )}
                      <span className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px]">
                          {conversation.status === "closed" && <span className="rounded-[3px] bg-muted px-1.5 font-semibold">Encerrada</span>}
                          <span className={`inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 font-semibold ${conversation.responsavel_id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                            <UserRound className="h-3 w-3 shrink-0" /><span className="truncate">{conversation.responsavel_nome || "Sem responsável"}{conversation.responsavel_id === user?.id ? " (você)" : ""}</span>
                          </span>
                        </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col">
            {selectedConversation ? (
              <>
                <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
                  <ContactAvatar name={selectedConversation.contato?.nome || selectedConversation.nome_contato || phoneLabel(selectedConversation.remote_jid)} conversationId={selectedConversation.id} contactId={selectedConversation.contato_id} photoUrl={selectedConversation.foto_url} />
                  <div className="min-w-0">
                    <h2 className="flex items-center gap-1.5 truncate text-sm font-semibold">{selectedConversation.is_grupo && <Users className="h-4 w-4 shrink-0 text-primary" aria-label="Grupo" />}<span className="truncate">{selectedConversation.contato?.nome || selectedConversation.nome_contato || phoneLabel(selectedConversation.remote_jid)}</span></h2>
                    <p className="text-xs text-muted-foreground">{phoneLabel(selectedConversation.remote_jid)} · {selectedConversation.ariiatalk_instancias?.nome || "Instância WhatsApp"}{selectedConversation.status === "closed" ? " · Encerrada" : ""}</p>
                    <ContactTags contact={selectedConversation.contato} />
                  </div>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <ConversationAssignee
                      staff={staff}
                      value={selectedConversation.responsavel_id}
                      valueName={selectedConversation.responsavel_nome}
                      userId={user?.id}
                      disabled={assigning}
                      onChange={(id) => void assignTo(id)}
                    />

                    <div className="relative">
                      <button type="button" onClick={() => setFolderMenu((v) => !v)} className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium hover:bg-muted" aria-expanded={folderMenu}>
                        <Folder className="h-3.5 w-3.5" /> Minhas pastas{(selectedConversation.pasta_ids ?? []).length ? ` (${selectedConversation.pasta_ids?.length})` : ""}
                      </button>
                      {folderMenu && (
                        <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border bg-popover p-2 text-xs shadow-lg">
                          {folders.length === 0 && <p className="p-1 text-muted-foreground">Crie pastas em Filtros.</p>}
                          {folders.map((f) => {
                            const on = (selectedConversation.pasta_ids ?? []).includes(f.id);
                            return (
                              <label key={f.id} className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-muted">
                                <input type="checkbox" checked={on} onChange={() => void toggleFolder(f.id, !on)} /> {f.nome}
                              </label>
                            );
                          })}
                          <form onSubmit={(e) => { e.preventDefault(); void createFolder(); }} className="mt-1 flex gap-1 border-t pt-2">
                            <input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} maxLength={60} placeholder="Nova pasta..." className="h-7 min-w-0 flex-1 rounded border bg-background px-1.5" />
                            <button type="submit" disabled={!newFolder.trim()} className="rounded bg-primary px-1.5 text-primary-foreground disabled:opacity-50"><Plus className="h-3 w-3" /></button>
                          </form>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setTicketOpen(true)}
                      className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium hover:bg-muted"
                    >
                      <Ticket className="h-3.5 w-3.5" /> Abrir chamado
                    </button>
                    <button
                      type="button"
                      onClick={() => void setConversationStatus(selectedConversation.status === "closed" ? "open" : "closed")}
                      className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium hover:bg-muted"
                    >
                      {selectedConversation.status === "closed" ? <><Unlock className="h-3.5 w-3.5" /> Reabrir</> : <><Lock className="h-3.5 w-3.5" /> Encerrar</>}
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
                        data-message-id={message.id}
                        className={`flex min-w-0 flex-col ${message.direcao === "saida" ? "items-end" : "items-start"}`}
                      >
                        {message.anotacoes?.some(a => a.sinalizada) && (
                          <span className="mb-1 flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive-foreground shadow-sm" aria-label="Sinalizada internamente" title="Sinalizada internamente">
                            <Flag className="h-3 w-3" fill="currentColor" />Sinalizada
                          </span>
                        )}
                        <div className={`group relative min-w-0 max-w-[85%] rounded-lg py-2 pl-3 pr-8 shadow-sm [overflow-wrap:anywhere] sm:max-w-[75%] ${
                          message.direcao === "saida"
                            ? "rounded-br-sm bg-primary text-primary-foreground"
                            : "rounded-bl-sm border bg-background"
                        }${message.id === highlightMessageId ? " ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}>
                          <div className="absolute right-1 top-1 z-10 flex items-center gap-1">
                            <MessageActions canReply={Boolean(message.evolution_message_id)} canEdit={canEditMessage(message, user?.id)} flagged={myAnnotation(message)?.sinalizada ?? false} disabled={actionBusy || sendingMessage || message.id.startsWith("optimistic-")}
                              onReply={() => { setReplyTo(message); document.querySelector<HTMLInputElement>('input[aria-label="Mensagem"]')?.focus(); }}
                              onEdit={() => { setEditTarget(message); setEditText(message.conteudo ?? ""); setActionError(null); }}
                              onCopy={() => { void navigator.clipboard.writeText(message.conteudo || message.media_url || "").then(() => setNotice("Mensagem copiada."), () => setNotice("Não foi possível copiar. Verifique a permissão do navegador.")); }}
                              onFlag={() => { const mine = myAnnotation(message); void messageAction("annotate", message, { sinalizada: !mine?.sinalizada, nota: mine?.nota ?? "", marcacao: mine?.marcacao ?? "" }); }}
                              onNote={() => openAnnotation(message)} />
                          </div>
                          {message.resposta_snapshot && <Button type="button" variant="ghost" className="mb-2 h-auto w-full justify-start rounded-sm border-l-2 border-current bg-background/10 px-2 py-1.5 text-left text-current" onClick={() => { if (message.resposta_mensagem_id) jumpToMessage(message.resposta_mensagem_id); }}>
                            <span className="min-w-0"><span className="block text-xs font-semibold">{message.resposta_snapshot.autor_nome}</span><span className="block max-w-full whitespace-pre-wrap break-words text-xs opacity-80">{message.resposta_snapshot.conteudo.slice(0, 200)}</span></span>
                          </Button>}
                          {message.direcao === "saida" && (
                            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
                              <UserRound className="h-3.5 w-3.5 shrink-0" />
                              <span className="break-words">{message.autor_nome || staff.find((s) => s.id === message.enviado_por)?.nome || (message.enviado_por ? "Técnico" : "WhatsApp / dispositivo")}{message.enviado_por === user?.id ? " (você)" : ""}</span>
                            </div>
                          )}
                          {message.direcao === "entrada" && selectedConversation?.is_grupo && (
                            <div className="mb-1 text-xs font-semibold text-primary break-words">{message.remetente_nome || (message.remetente_jid ? phoneLabel(message.remetente_jid) : "Participante")}</div>
                          )}
                          {message.conteudo && (
                            <p className="whitespace-pre-wrap break-words text-sm">{message.conteudo}</p>
                          )}
                          {message.media_url && (
                            <div className="mt-2 max-w-full">
                              {message.tipo === "image" && <img src={message.media_url} alt={message.conteudo || "Imagem anexada"} loading="lazy" className="max-h-64 max-w-full rounded-md object-contain" />}
                              {message.tipo === "video" && <video src={message.media_url} controls preload="metadata" className="max-h-64 max-w-full rounded-md" />}
                              {message.tipo === "audio" && <audio src={message.media_url} controls preload="metadata" className="max-w-full" />}
                            <a
                              href={message.media_url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 block text-xs underline"
                            >
                              <Paperclip className="mr-1 inline h-3 w-3" />Abrir anexo
                            </a>
                            </div>
                          )}
                          {!message.conteudo && !message.media_url && (
                            <p className="text-sm italic opacity-80">Mensagem do tipo {message.tipo}</p>
                          )}
                          {message.anotacoes?.filter(a => a.sinalizada || a.nota || a.marcacao).map(a => <div key={a.usuario_id} className="mt-2 border-t border-current/20 pt-1.5 text-xs">
                            <span className="flex items-center gap-1 font-semibold"><StickyNote className="h-3 w-3" />Interno · {a.usuarios?.nome || "Técnico"}{a.sinalizada ? " · Sinalizada" : ""}</span>
                            {a.marcacao && <span className="mt-1 block font-medium">#{a.marcacao}</span>}
                            {a.nota && <p className="mt-1 whitespace-pre-wrap break-words">{a.nota}</p>}
                          </div>)}
                          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70">
                            {message.editada_em && <span>Editada ·</span>}
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

            {selectedConversation?.status === "closed" && (
              <div className="flex items-center justify-between gap-2 border-t bg-muted/50 px-4 py-2 text-xs">
                <span className="text-muted-foreground">Conversa encerrada. Uma nova mensagem enviada ou recebida reabre este histórico.</span>
                <button type="button" onClick={() => void setConversationStatus("open")} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 font-medium text-primary-foreground"><Unlock className="h-3.5 w-3.5" /> Reabrir conversa</button>
              </div>
            )}
            {replyTo && <div className="flex items-center gap-2 border-t bg-accent/40 px-4 py-2">
              <Reply className="h-4 w-4 shrink-0 text-primary" /><div className="min-w-0 flex-1 border-l-2 border-primary pl-2"><p className="text-xs font-semibold text-primary">Respondendo a {replyTo.autor_nome || selectedConversation?.nome_contato || "Contato"}</p><p className="truncate text-xs text-muted-foreground">{replyTo.conteudo || `[${replyTo.tipo}]`}</p></div>
              <Button variant="ghost" size="icon" disabled={sendingMessage} aria-label="Cancelar resposta" onClick={() => setReplyTo(null)}><X className="h-4 w-4" /></Button>
            </div>}
            {actionError && !editTarget && !annotationTarget && <p role="alert" className="px-4 py-2 text-xs text-destructive">{actionError}</p>}
            <Dialog open={Boolean(editTarget)} onOpenChange={open => { if (!open && !actionBusy) setEditTarget(null); }}>
              <DialogContent><DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="h-4 w-4" />Editar mensagem</DialogTitle></DialogHeader>
                <Textarea aria-label="Texto da mensagem editada" value={editText} maxLength={4000} rows={5} onChange={e => setEditText(e.target.value)} disabled={actionBusy} />
                {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
                <DialogFooter><Button variant="outline" disabled={actionBusy} onClick={() => setEditTarget(null)}>Cancelar</Button><Button disabled={actionBusy || !editText.trim() || editText.trim() === editTarget?.conteudo} onClick={() => { if (editTarget) void messageAction("edit", editTarget, { texto: editText.trim() }); }}>{actionBusy ? "Salvando..." : "Salvar no WhatsApp"}</Button></DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={Boolean(annotationTarget)} onOpenChange={open => { if (!open && !actionBusy) setAnnotationTarget(null); }}>
              <DialogContent><DialogHeader><DialogTitle>Nota / marcação interna</DialogTitle></DialogHeader>
                <p className="border-l-2 border-primary pl-3 text-sm text-muted-foreground">{annotationTarget?.conteudo?.slice(0, 200)}</p>
                <label className="text-sm font-medium" htmlFor="message-mark">Marcação</label><Input id="message-mark" maxLength={60} placeholder="Ex.: Acompanhar retorno" value={annotationForm.marcacao} disabled={actionBusy} onChange={e => setAnnotationForm(f => ({ ...f, marcacao: e.target.value }))} />
                <label className="text-sm font-medium" htmlFor="message-note">Minha nota interna</label><Textarea id="message-note" maxLength={2000} rows={4} value={annotationForm.nota} disabled={actionBusy} onChange={e => setAnnotationForm(f => ({ ...f, nota: e.target.value }))} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={actionBusy} checked={annotationForm.sinalizada} onChange={e => setAnnotationForm(f => ({ ...f, sinalizada: e.target.checked }))} /><Flag className="h-4 w-4" />Sinalizada</label>
                {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
                <DialogFooter><Button variant="outline" disabled={actionBusy} onClick={() => setAnnotationTarget(null)}>Cancelar</Button><Button disabled={actionBusy} onClick={() => { if (annotationTarget) void messageAction("annotate", annotationTarget, annotationForm); }}>{actionBusy ? "Salvando..." : "Salvar anotação"}</Button></DialogFooter>
              </DialogContent>
            </Dialog>
            {attachment && <div className="flex items-center gap-2 border-t bg-muted/40 px-4 py-2">
              <Paperclip className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{attachment.name}</p><p className="text-xs text-muted-foreground">{(attachment.size / 1024 / 1024).toFixed(2)} MB</p></div>
              <Button variant="ghost" size="icon" disabled={sendingMessage} aria-label="Remover anexo" title="Remover anexo" onClick={() => setAttachment(null)}><X className="h-4 w-4" /></Button>
            </div>}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void sendMessage();
              }}
              className="flex items-center gap-2 border-t p-3"
            >
              <input ref={attachmentInputRef} type="file" accept={ATTACHMENT_ACCEPT} className="hidden" aria-label="Selecionar anexo" onChange={event => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                try { attachmentInfo(file); setAttachment(file); setMessageError(null); }
                catch (error) { toast.error(error instanceof Error ? error.message : "Arquivo inválido."); }
              }} />
              <Button
                type="button"
                variant="ghost" size="icon"
                disabled={!selectedConversation || sendingMessage}
                onClick={() => attachmentInputRef.current?.click()}
                aria-label="Anexar arquivo"
                title="Anexar arquivo"
              >
                <Paperclip className="h-5 w-5" />
              </Button>
              <input
                aria-label="Mensagem"
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                placeholder={selectedConversation ? (attachment ? "Legenda (opcional)..." : "Digite uma mensagem...") : "Selecione uma conversa"}
                disabled={!selectedConversation || sendingMessage}
                maxLength={4000}
                className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!selectedConversation || (!messageText.trim() && !attachment) || sendingMessage}
                aria-label="Enviar mensagem"
                title="Enviar mensagem"
              >
                {sendingMessage
                  ? <LoaderCircle className="h-5 w-5 animate-spin" />
                  : <Send className="h-5 w-5" />}
              </Button>
            </form>
          </section>

          <aside className="hidden min-h-0 overflow-y-auto border-l p-4 xl:block">
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
                  <p>{selectedConversation.status === "closed" ? "Encerrada" : "Aberta"}</p>
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
                          {contact.nome}{empresa ? ` — ${empresa}` : ""}
                        </option>
                      );
                    })}
                  </select>
                  {savingContact && (
                    <p className="text-xs text-muted-foreground">Salvando associação...</p>
                  )}
                  {!loadingContacts && contacts.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Nenhum contato cadastrado foi encontrado.
                    </p>
                  )}
                </div>
                <div className="space-y-2 border-t pt-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold"><StickyNote className="h-3.5 w-3.5" /> Observações do contato</p>
                  {!selectedConversation.contato_id ? (
                    <p className="text-xs text-muted-foreground">Vincule um contato cadastrado para adicionar observações.</p>
                  ) : (
                    <>
                      <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} maxLength={2000} rows={3} placeholder="Escreva uma observação interna..." className="w-full rounded-md border bg-background px-2 py-1.5 text-xs" />
                      <button type="button" disabled={!noteText.trim() || savingNote} onClick={() => void addNote()} className="w-full rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">{savingNote ? "Salvando..." : "Adicionar observação"}</button>
                      <p className="text-[10.5px] text-muted-foreground">Visível só para a equipe. Não é enviada ao contato.</p>
                      <div className="max-h-64 space-y-2 overflow-y-auto">
                        {notes.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma observação ainda.</p>}
                        {notes.map((n) => (
                          <div key={n.id} className="rounded-md border bg-muted/30 p-2 text-xs">
                            <p className="whitespace-pre-wrap break-words">{n.texto}</p>
                            <div className="mt-1 flex items-center justify-between text-[10.5px] text-muted-foreground">
                              <span>{one(n.usuarios)?.nome ?? "Equipe"} · {new Date(n.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                              <button type="button" onClick={() => void deleteNote(n)} aria-label="Apagar observação"><Trash2 className="h-3 w-3" /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div className="space-y-2 border-t pt-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold"><Search className="h-3.5 w-3.5" /> Pesquisar na conversa</p>
                  <div className="relative">
                    <input
                      value={messageSearch}
                      onChange={(e) => setMessageSearch(e.target.value)}
                      maxLength={120}
                      placeholder="Buscar nas mensagens desta conversa..."
                      aria-label="Pesquisar na conversa"
                      className="h-8 w-full rounded-md border bg-background pl-7 pr-7 text-xs outline-none focus:ring-1 focus:ring-ring"
                    />
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    {messageSearch && (
                      <button type="button" onClick={() => setMessageSearch("")} aria-label="Limpar pesquisa da conversa" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 hover:bg-muted">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  {messageSearch.trim() && (
                    <div className="max-h-64 space-y-2 overflow-y-auto">
                      <p className="text-[10.5px] text-muted-foreground">
                        {messageMatches.length === 0
                          ? "Nenhuma mensagem corresponde à pesquisa."
                          : `${messageMatches.length} resultado${messageMatches.length === 1 ? "" : "s"} — clique para ir à mensagem`}
                      </p>
                      {messageMatches.map(({ message, start, end }) => {
                        const text = message.conteudo ?? "";
                        const from = Math.max(0, start - 40);
                        const to = Math.min(text.length, end + 40);
                        return (
                          <button
                            key={message.id}
                            type="button"
                            onClick={() => jumpToMessage(message.id)}
                            className="w-full rounded-md border bg-background p-2 text-left text-xs hover:bg-muted/50"
                          >
                            <span className="block text-[10.5px] text-muted-foreground">
                              {message.direcao === "saida" ? (message.autor_nome || "Equipe") : "Contato"} · {new Date(message.enviada_em || message.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span className="block whitespace-pre-wrap break-words">
                              {from > 0 && "…"}
                              {text.slice(from, start)}
                              <mark className="rounded bg-primary/20 px-0.5">{text.slice(start, end)}</mark>
                              {text.slice(end, to)}
                              {to < text.length && "…"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {(() => {
                  const marked = messages.filter(m => m.anotacoes?.some(a => a.sinalizada || a.nota || a.marcacao));
                  return (
                    <div className="space-y-2 border-t pt-3">
                      <p className="flex items-center gap-1.5 text-xs font-semibold"><Flag className="h-3.5 w-3.5 text-destructive" /> Sinalizadas e notas ({marked.length})</p>
                      {marked.length === 0 ? (
                        <p className="text-[10.5px] text-muted-foreground">Nenhuma mensagem sinalizada ou com nota nesta conversa.</p>
                      ) : (
                        <div className="max-h-64 space-y-2 overflow-y-auto">
                          {marked.map(message => {
                            const notes = (message.anotacoes ?? []).filter(a => a.sinalizada || a.nota || a.marcacao);
                            const flagged = notes.some(a => a.sinalizada);
                            return (
                              <button key={message.id} type="button" onClick={() => jumpToMessage(message.id)} className="w-full rounded-md border bg-background p-2 text-left text-xs hover:bg-muted/50">
                                <span className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
                                  {flagged ? <Flag className="h-3 w-3 text-destructive" fill="currentColor" /> : <StickyNote className="h-3 w-3" />}
                                  {new Date(message.enviada_em || message.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                </span>
                                <span className="line-clamp-2 block break-words">{message.conteudo || "(mídia)"}</span>
                                {notes.map(a => (a.marcacao || a.nota) && (
                                  <span key={a.usuario_id} className="mt-1 block text-[10.5px] text-muted-foreground">
                                    {a.usuarios?.nome || "Técnico"}: {[a.marcacao, a.nota].filter(Boolean).join(" — ")}
                                  </span>
                                ))}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Selecione uma conversa para visualizar os dados do contato.</p>
            )}
          </aside>
        </div>
      )}

      {contactDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Adicionar contato">
          <form onSubmit={saveContact} className="w-full max-w-md space-y-3 rounded-xl border bg-background p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Adicionar contato</h2>
              <button type="button" onClick={() => setContactDialog(false)} className="rounded-md p-1 hover:bg-muted" aria-label="Fechar"><X className="h-4 w-4" /></button>
            </div>
            <label className="block text-xs font-medium">Nome *
              <input required maxLength={120} value={cForm.nome} onChange={(e) => setCForm({ ...cForm, nome: e.target.value })} className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" />
            </label>
            <label className="block text-xs font-medium">Telefone (WhatsApp) *
              <input required inputMode="tel" maxLength={19} placeholder="(11) 91234-5678 ou +55 11 91234-5678" value={cForm.telefone} onChange={(e) => setCForm({ ...cForm, telefone: maskPhoneInput(e.target.value) })} className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" />
              <span className="mt-0.5 block font-normal text-muted-foreground">Com DDD. O código do Brasil (55) é adicionado automaticamente.</span>
            </label>
            <label className="block text-xs font-medium">Empresa
              <select value={cForm.empresa_id} onChange={(e) => setCForm({ ...cForm, empresa_id: e.target.value, unidade_id: "" })} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm">
                <option value="">Sem empresa</option>
                {empresasOpt.map((em) => <option key={em.id} value={em.id}>{em.nome_fantasia}</option>)}
              </select>
            </label>
            <label className="block text-xs font-medium">Unidade
              <select value={cForm.unidade_id} onChange={(e) => {
                const un = unidadesOpt.find((u) => String(u.id) === e.target.value);
                setCForm({ ...cForm, unidade_id: e.target.value, empresa_id: un?.empresa_id ? String(un.empresa_id) : cForm.empresa_id });
              }} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm">
                <option value="">Sem unidade</option>
                {unidadesOpt.filter((u) => !cForm.empresa_id || String(u.empresa_id) === cForm.empresa_id).map((u) => <option key={u.id} value={u.id}>{u.nome_unidade}</option>)}
              </select>
            </label>
            <label className="block text-xs font-medium">Categoria
              <input list="ariiatalk-categorias" maxLength={40} placeholder="Ex.: Responsável, Recepção" value={cForm.categoria} onChange={(e) => setCForm({ ...cForm, categoria: e.target.value })} className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" />
              <datalist id="ariiatalk-categorias">{CATEGORIAS_SUGERIDAS.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            {cError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                {cError}
                {cDuplicate && (
                  <div className="mt-2 flex items-center justify-between gap-2 text-foreground">
                    <span><strong>{cDuplicate.nome}</strong> · {phoneLabel(cDuplicate.telefone)}</span>
                    <button type="button" onClick={() => { setContactDialog(false); void startConversation(cDuplicate); }} className="rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground">Abrir contato</button>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setContactDialog(false)} className="rounded-md border px-3 py-2 text-sm hover:bg-muted">Cancelar</button>
              <button type="submit" disabled={cSaving} className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                {cSaving && <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" />} Salvar contato
              </button>
            </div>
          </form>
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
      <OpenTicketDialog
        open={ticketOpen}
        onOpenChange={setTicketOpen}
        prefill={selectedConversation ? {
          nome: selectedConversation.contato?.nome || selectedConversation.nome_contato || "",
          email: selectedConversation.contato?.email || "",
          telefone: selectedConversation.is_grupo ? "" : (selectedConversation.contato?.telefone || selectedConversation.remote_jid.split("@")[0] || ""),
          empresa_id: selectedConversation.contato?.empresa_id ?? null,
          unidade_id: selectedConversation.contato?.unidade_id ?? null,
          conversa: selectedConversation.nome_contato || selectedConversation.remote_jid,
        } : null}
        empresas={empresasOpt}
        unidades={unidadesOpt}
        staff={staff}
      />
    </div>
  );

}





