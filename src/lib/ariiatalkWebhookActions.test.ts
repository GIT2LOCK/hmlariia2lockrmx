import { expect, it } from "vitest";
import { quotedContext, editedContent, cleanEditedText } from "../../supabase/functions/_shared/ariiatalkWebhookActions";
it("mantém respostas recebidas pelo WhatsApp", () => {
  expect(quotedContext({ extendedTextMessage: { contextInfo: { stanzaId: "w1", quotedMessage: { conversation: "Pedido" } } } })).toEqual({ evolutionId: "w1", snapshot: { autor_nome: "Mensagem citada", conteudo: "Pedido" } });
});
it("reconhece edição sem inserir mensagem nova nem mostrar assinatura internamente", () => {
  expect(editedContent({ protocolMessage: { key: { id: "w1" }, editedMessage: { conversation: "Analista:\n\nCorrigido" } } })).toEqual({ evolutionId: "w1", text: "Analista:\n\nCorrigido" });
  expect(cleanEditedText("Analista:\n\nCorrigido", "Analista")).toBe("Corrigido");
  expect(editedContent({ conversation: "Mensagem comum" })).toBeNull();
});