import { contactCategoria, normalizeKey } from "./ariiatalkTags";

export type ContactRecord = {
  id: number; nome: string; telefone: string | null; email: string | null;
  tipo: string; empresa_id: number | null; unidade_id: number | null;
  categoria?: string | null;
};
export const EMPTY_CONTACT_FILTERS = { search: "", empresa: "", unidade: "", categoria: "", tipo: "", telefone: "" };
export function filterContacts<T extends ContactRecord>(contacts: T[], filters: typeof EMPTY_CONTACT_FILTERS): T[] {
  const term = normalizeKey(filters.search);
  const digits = term.replace(/\D/g, "");
  return contacts.filter((c) => {
    if (filters.empresa && String(c.empresa_id ?? "") !== filters.empresa) return false;
    if (filters.unidade && String(c.unidade_id ?? "") !== filters.unidade) return false;
    if (filters.categoria && contactCategoria(c) !== filters.categoria) return false;
    if (filters.tipo && c.tipo !== filters.tipo) return false;
    if (filters.telefone === "com" && !c.telefone) return false;
    if (filters.telefone === "sem" && c.telefone) return false;
    return !term || normalizeKey(`${c.nome} ${c.email ?? ""}`).includes(term)
      || (!!digits && !/[a-z]/i.test(term) && (c.telefone ?? "").replace(/\D/g, "").includes(digits));
  });
}
export function isListedConversation(status: string, statusFilter = "") {
  return status === (statusFilter || "open");
}