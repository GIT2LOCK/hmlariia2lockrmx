import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import AriiaTalk from "@/pages/AriiaTalk";

const conversation = { id: "a1234567-1234-4234-8234-123456789012", instancia_id: "inst", remote_jid: "5511999999999@s.whatsapp.net", nome_contato: "Contato de teste", foto_url: null, contato_id: null, status: "open", nao_lidas: 1, responsavel_id: null };
const state = vi.hoisted(() => ({ sent: null as FormData | null, textSent: null as string | null, failed: false }));
vi.mock("@/contexts/UserContext", () => ({ useUser: () => ({ user: { id: 7, nome: "Técnico" } }) }));
vi.mock("@/components/ariiatalk/ContactAvatar", () => ({ default: () => null }));
vi.mock("@/components/ariiatalk/OpenTicketDialog", () => ({ default: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel; }, removeChannel: vi.fn(),
  functions: { invoke: async (name: string, options: { body?: FormData | { action?: string; texto?: string } }) => {
    if (options.body instanceof FormData) {
      state.sent = options.body;
      return state.failed ? { data: { error: "attachment_upload_failed" } } : { data: { success: true } };
    }
    if (name.startsWith("ariiatalk-conversas") && !options.body) return { data: { conversations: [conversation, { ...conversation, id: "second-conversation", nome_contato: "Segundo contato" }] } };
    if (options.body?.action === "history") return { data: { messages: [] } };
    if (options.body?.action === "send") { state.textSent = options.body.texto ?? ""; return { data: { success: true } }; }
    return { data: { instances: [], contacts: [], staff: [], empresas: [], unidades: [], folders: [] } };
  } },
} }));

beforeEach(() => { state.sent = null; state.textSent = null; state.failed = false; window.HTMLElement.prototype.scrollIntoView = vi.fn(); });

it("envia arquivo sem legenda e limpa seleção após sucesso", async () => {
  render(<AriiaTalk />);
  fireEvent.click(await screen.findByText("Contato de teste"));
  const file = new File(["conteudo"], "relatorio.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText("Selecionar anexo"), { target: { files: [file] } });
  await screen.findByText("relatorio.pdf");
  fireEvent.click(screen.getByLabelText("Enviar mensagem"));
  await waitFor(() => expect(state.sent?.get("arquivo")).toBe(file));
  expect(state.sent?.get("conversa_id")).toBe(conversation.id);
  expect(state.sent?.get("texto")).toBe("");
  await waitFor(() => expect(screen.queryByLabelText("Remover anexo")).not.toBeInTheDocument());
});

it("mantém arquivo e legenda disponíveis ao falhar", async () => {
  state.failed = true;
  render(<AriiaTalk />);
  fireEvent.click(await screen.findByText("Contato de teste"));
  fireEvent.change(screen.getByLabelText("Selecionar anexo"), { target: { files: [new File(["x"], "foto.png", { type: "image/png" })] } });
  await screen.findByLabelText("Remover anexo");
  fireEvent.change(screen.getByLabelText("Mensagem"), { target: { value: "Problema relatado" } });
  fireEvent.click(screen.getByLabelText("Enviar mensagem"));
  await waitFor(() => expect(screen.getByLabelText("Mensagem")).toHaveValue("Problema relatado"));
  expect(screen.getByLabelText("Remover anexo")).toBeInTheDocument();
  expect(state.sent?.get("texto")).toBe("Problema relatado");
});

it("Enter envia o texto completo e Shift+Enter não envia", async () => {
  render(<AriiaTalk />);
  fireEvent.click(await screen.findByText("Contato de teste"));
  const composer = screen.getByLabelText("Mensagem");
  fireEvent.change(composer, { target: { value: "Linha 1\nLinha 2" } });
  fireEvent.keyDown(composer, { key: "Enter", shiftKey: true });
  expect(state.textSent).toBeNull();
  fireEvent.keyDown(composer, { key: "Enter" });
  await waitFor(() => expect(state.textSent).toBe("Linha 1\nLinha 2"));
  expect(composer).toHaveValue("");
});

it("não envia Enter durante composição de texto", async () => {
  render(<AriiaTalk />);
  fireEvent.click(await screen.findByText("Contato de teste"));
  const composer = screen.getByLabelText("Mensagem");
  fireEvent.change(composer, { target: { value: "Texto em composição" } });
  fireEvent.keyDown(composer, { key: "Enter", isComposing: true });
  expect(state.textSent).toBeNull();
  expect(composer).toHaveValue("Texto em composição");
});

it("mantém o texto ao alternar conversas pela lista", async () => {
  render(<AriiaTalk />);
  fireEvent.click(await screen.findByText("Contato de teste"));
  fireEvent.change(screen.getByLabelText("Mensagem"), { target: { value: "Resumo ainda não enviado" } });
  fireEvent.click(screen.getByText("Segundo contato"));
  expect(screen.getByLabelText("Mensagem")).toHaveValue("");
  fireEvent.click(screen.getByText("Contato de teste"));
  expect(screen.getByLabelText("Mensagem")).toHaveValue("Resumo ainda não enviado");
});

it("permite voltar ao fim após rolar o histórico", async () => {
  render(<AriiaTalk />);
  fireEvent.click(await screen.findByText("Contato de teste"));
  const empty = await screen.findByText("Nenhuma mensagem registrada");
  const container = empty.parentElement?.parentElement;
  if (!container) throw new Error("Histórico não encontrado");
  Object.defineProperties(container, { scrollHeight: { value: 1000, configurable: true }, clientHeight: { value: 200, configurable: true } });
  container.scrollTop = 100;
  fireEvent.scroll(container);
  fireEvent.click(screen.getByLabelText("Ir para últimas mensagens"));
  expect(container.scrollTop).toBe(1000);
  expect(screen.queryByLabelText("Ir para últimas mensagens")).not.toBeInTheDocument();
});