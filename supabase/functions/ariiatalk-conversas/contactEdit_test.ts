import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { contactEditSchema, editedContactValues } from "./contactEdit.ts";

Deno.test("contact edit strips phone mask before saving", () => {
  const input = contactEditSchema.parse({ contact_id: 5, nome: "Maria Silva", telefone: "(11) 99999-9999", email: "maria@example.com", categoria: "TI" });
  assertEquals(input.telefone, "11999999999");
});
Deno.test("contact edit does not change conversation or unit references", () => {
  const input = contactEditSchema.parse({ contact_id: 5, nome: "Maria Silva", telefone: "11999999999", email: "", categoria: "", empresa_id: 99, unidade_id: 99, remote_jid: "other", status: "closed" });
  assertEquals(editedContactValues(input, "11999999999"), { nome: "Maria Silva", telefone: "11999999999", email: null, categoria: null });
});
Deno.test("contact edit permits contacts without phone and clears old photo on number change", () => {
  const input = contactEditSchema.parse({ contact_id: 5, nome: "Maria Silva", telefone: "", email: "", categoria: "" });
  assertEquals(editedContactValues(input, "11999999999").foto_whatsapp_url, null);
  assertEquals(input.telefone, null);
});