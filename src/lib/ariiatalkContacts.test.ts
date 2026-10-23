import { describe, expect, it } from "vitest";
import { EMPTY_CONTACT_FILTERS, filterContacts, isListedConversation } from "./ariiatalkContacts";
const contacts = [
  { id: 1, nome: "João", telefone: "5511912345678", email: "joao@empresa.com", tipo: "responsavel", empresa_id: 2, unidade_id: 10 },
  { id: 2, nome: "Maria", telefone: null, email: null, tipo: "pessoa", empresa_id: 3, unidade_id: 11, categoria: "TI" },
];
describe("contatos e conversas", () => {
  it("oculta encerradas da lista padrão sem remover seu registro", () => {
    const rows = [{ id: "anterior", status: "closed", messages: ["Bom dia!"] }, { id: "ativa", status: "open", messages: [] }];
    expect(rows.filter(c => isListedConversation(c.status)).map(c => c.id)).toEqual(["ativa"]);
    expect(rows[0].messages).toEqual(["Bom dia!"]);
    expect(isListedConversation("closed", "closed")).toBe(true);
  });
  it("combina empresa, unidade, categoria e tipo", () => {
    expect(filterContacts(contacts, { ...EMPTY_CONTACT_FILTERS, empresa: "2", unidade: "10", categoria: "Responsável", tipo: "responsavel" }).map(c => c.id)).toEqual([1]);
    expect(filterContacts(contacts, { ...EMPTY_CONTACT_FILTERS, empresa: "2", unidade: "11" })).toEqual([]);
  });
  it("pesquisa nome sem acentos, telefone formatado e email", () => {
    for (const search of ["joao", "(11) 91234-5678", "joao@empresa.com"]) {
      expect(filterContacts(contacts, { ...EMPTY_CONTACT_FILTERS, search }).map(c => c.id)).toEqual([1]);
    }
  });
  it("filtra contatos sem telefone", () => {
    expect(filterContacts(contacts, { ...EMPTY_CONTACT_FILTERS, telefone: "sem" }).map(c => c.id)).toEqual([2]);
  });
});