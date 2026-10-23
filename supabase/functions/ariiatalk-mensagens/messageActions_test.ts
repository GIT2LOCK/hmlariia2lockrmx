import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { canEditMessage, buildQuoted } from "../_shared/ariiatalkMessageActions.ts";
import { annotateMessage } from "./messageActions.ts";
const message = { id: "m", conversa_id: "c", evolution_message_id: "e", direcao: "saida", tipo: "text", conteudo: "Olá", enviado_por: 9, status: "enviada" };
Deno.test("editar somente mensagem própria enviada", () => {
  assertEquals(canEditMessage(message, 9), true);
  assertEquals(canEditMessage(message, 10), false);
  assertEquals(canEditMessage({ ...message, direcao: "entrada" }, 9), false);
});
Deno.test("citação não aceita outra conversa", () => {
  assertThrows(() => buildQuoted(message, "outra", "jid"), Error, "invalid_reply_target");
});
Deno.test("anotação ignora autor injetado e não altera mensagem WhatsApp", async () => {
  const writes: any[] = [];
  const id = "a1234567-1234-4234-8234-123456789012";
  const db: any = { from: (table: string) => {
    if (table === "ariiatalk_mensagens") return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id }, error: null }) }) }) }) };
    assertEquals(table, "ariiatalk_mensagem_anotacoes");
    return { upsert: (row: any) => { writes.push(row); return { select: () => ({ single: async () => ({ data: row, error: null }) }) }; } };
  } };
  const result = await annotateMessage(db, { conversa_id: id, mensagem_id: id, usuario_id: 999, sinalizada: true, nota: "Só equipe", marcacao: "Retorno" }, 9);
  assertEquals(result.status, 200);
  assertEquals(writes, [{ mensagem_id: id, usuario_id: 9, sinalizada: true, nota: "Só equipe", marcacao: "Retorno" }]);
});