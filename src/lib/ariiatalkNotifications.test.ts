import { describe, expect, it } from "vitest";
import { detectNotifications, type NotifiableConversation } from "./ariiatalkNotifications";

const base: NotifiableConversation = { id: "a", nome_contato: "Ana", ultima_mensagem: "oi", ultima_mensagem_em: "1", nao_lidas: 0, status: "open", responsavel_id: null };

describe("detectNotifications", () => {
  it("does nothing on first load", () => expect(detectNotifications(null, [base], 1)).toEqual([]));
  it("alerts new message when unread grows", () => expect(detectNotifications([base], [{ ...base, nao_lidas: 1 }], 1).map(n => n.kind)).toEqual(["message"]));
  it("alerts when assigned to me", () => expect(detectNotifications([base], [{ ...base, responsavel_id: 1 }], 1).map(n => n.kind)).toEqual(["assigned"]));
  it("ignores self-assignment", () => expect(detectNotifications([base], [{ ...base, responsavel_id: 1 }], 1, new Set(["a"]))).toEqual([]));
  it("ignores assignment to others", () => expect(detectNotifications([base], [{ ...base, responsavel_id: 2 }], 1)).toEqual([]));
  it("alerts new or reopened conversation", () => {
    expect(detectNotifications([], [base], 1).map(n => n.kind)).toEqual(["opened"]);
    expect(detectNotifications([{ ...base, status: "closed" }], [base], 1).map(n => n.kind)).toEqual(["opened"]);
  });
});
