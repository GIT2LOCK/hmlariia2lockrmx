import { expect, it } from "vitest";
import { sentConversationUpdate } from "../../supabase/functions/_shared/ariiatalkLifecycle";

it("reabre a mesma conversa após envio e mantém as mensagens anteriores", () => {
  const conversation = { id: "historico-original", status: "closed", encerrado_por: 42, encerrado_em: "2026-10-23T14:00:00Z", messages: ["Bom dia!"] };
  const reopened = { ...conversation, ...sentConversationUpdate("Olá novamente!", "2026-10-23T14:44:00Z") };
  expect(reopened.status).toBe("open");
  expect(reopened.id).toBe("historico-original");
  expect(reopened.messages).toEqual(["Bom dia!"]);
  expect(reopened.encerrado_por).toBeNull();
  expect(reopened.encerrado_em).toBeNull();
  expect(reopened.ultima_mensagem).toBe("Olá novamente!");
});