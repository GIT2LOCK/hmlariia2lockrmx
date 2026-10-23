import { describe, expect, it } from "vitest";
import { buildQuoted, canEditMessage, quoteSnapshot } from "../../supabase/functions/_shared/ariiatalkMessageActions";
const m = { id: "m1", conversa_id: "c1", evolution_message_id: "w1", direcao: "saida", tipo: "text", conteudo: "Bom dia", enviado_por: 7, status: "enviada", texto_whatsapp: "Analista:\n\nBom dia" };
describe("Ações de mensagens", () => {
  it("permite editar somente o texto enviado pelo próprio técnico", () => {
    expect(canEditMessage(m, 7)).toBe(true);
    expect(canEditMessage(m, 8)).toBe(false);
    expect(canEditMessage({ ...m, direcao: "entrada" }, 7)).toBe(false);
    expect(canEditMessage({ ...m, tipo: "image" }, 7)).toBe(false);
    expect(canEditMessage({ ...m, evolution_message_id: null }, 7)).toBe(false);
  });
  it("responde ao ID WhatsApp na mesma conversa sem incluir anotações internas", () => {
    const q = buildQuoted({ ...m, payload: { message: { conversation: "Original" } }, nota: "Segredo interno" } as typeof m, "c1", "5511@s.whatsapp.net");
    expect(q).toEqual({ key: { id: "w1", remoteJid: "5511@s.whatsapp.net", fromMe: true }, message: { conversation: "Original" } });
    expect(() => buildQuoted(m, "c2", "jid")).toThrow("invalid_reply_target");
  });
  it("mantém assinatura na citação WhatsApp e texto limpo no histórico interno", () => {
    expect(buildQuoted(m, "c1", "jid").message.conversation).toBe("Analista:\n\nBom dia");
    expect(quoteSnapshot(m).conteudo).toBe("Bom dia");
  });
});