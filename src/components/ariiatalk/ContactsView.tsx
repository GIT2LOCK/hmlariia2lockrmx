import { useMemo, useState } from "react";
import { LoaderCircle, MessageCircle, Pencil, Search, Trash2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import ContactAvatar from "./ContactAvatar";
import { contactCategoria } from "@/lib/ariiatalkTags";
import { EMPTY_CONTACT_FILTERS, filterContacts, type ContactRecord } from "@/lib/ariiatalkContacts";

type Props<T extends ContactRecord> = {
  contacts: T[]; loading: boolean; error: string | null; startingId: number | null;
  empresas: { id: number; nome_fantasia: string }[];
  unidades: { id: number; nome_unidade: string; empresa_id: number | null }[];
  onStart: (contact: T) => void; onCreate: () => void; onRetry: () => void; onEdit: (contact: T) => void; onDelete: (contact: T) => void;
};
export default function ContactsView<T extends ContactRecord>({ contacts, loading, error, startingId, empresas, unidades, onStart, onCreate, onRetry, onEdit, onDelete }: Props<T>) {
  const [filters, setFilters] = useState(EMPTY_CONTACT_FILTERS);
  const rows = useMemo(() => filterContacts(contacts, filters), [contacts, filters]);
  const categorias = [...new Set(contacts.map(contactCategoria).filter((c): c is string => !!c))].sort();
  const selectClass = "h-9 min-w-0 rounded-md border bg-background px-2 text-sm";
  return <main className="flex min-h-0 flex-1 flex-col">
    <div className="space-y-3 border-b p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Contatos <span className="text-sm font-normal text-muted-foreground">{rows.length} / {contacts.length}</span></h2>
        <Button size="sm" onClick={onCreate}><UserPlus />Adicionar contato</Button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex min-w-0 items-center gap-2 rounded-md border px-3 sm:col-span-2"><Search className="h-4 w-4 shrink-0 text-muted-foreground" /><input aria-label="Buscar contatos" placeholder="Buscar nome, telefone ou e-mail..." value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
        <select aria-label="Empresa dos contatos" className={selectClass} value={filters.empresa} onChange={e => setFilters({ ...filters, empresa: e.target.value, unidade: "" })}><option value="">Todas as empresas</option>{empresas.map(e => <option key={e.id} value={e.id}>{e.nome_fantasia}</option>)}</select>
        <select aria-label="Unidade dos contatos" className={selectClass} value={filters.unidade} onChange={e => setFilters({ ...filters, unidade: e.target.value })}><option value="">Todas as unidades</option>{unidades.filter(u => !filters.empresa || String(u.empresa_id) === filters.empresa).map(u => <option key={u.id} value={u.id}>{u.nome_unidade}</option>)}</select>
        <select aria-label="Categoria dos contatos" className={selectClass} value={filters.categoria} onChange={e => setFilters({ ...filters, categoria: e.target.value })}><option value="">Todas as categorias</option>{categorias.map(c => <option key={c} value={c}>{c}</option>)}</select>
        <select aria-label="Tipo de contato" className={selectClass} value={filters.tipo} onChange={e => setFilters({ ...filters, tipo: e.target.value })}><option value="">Todos os tipos</option><option value="responsavel">Responsável</option><option value="pessoa">Pessoa</option><option value="contato">Contato</option></select>
        <select aria-label="Telefone dos contatos" className={selectClass} value={filters.telefone} onChange={e => setFilters({ ...filters, telefone: e.target.value })}><option value="">Com ou sem telefone</option><option value="com">Com telefone</option><option value="sem">Sem telefone</option></select>
        <Button variant="ghost" size="sm" disabled={!Object.values(filters).some(Boolean)} onClick={() => setFilters(EMPTY_CONTACT_FILTERS)}><X />Limpar filtros</Button>
      </div>
    </div>
    <div className="min-h-0 flex-1 overflow-auto">
      {loading ? <p className="flex items-center justify-center gap-2 p-8 text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />Carregando contatos...</p>
        : error ? <div className="p-8 text-center"><p className="text-destructive">{error}</p><Button variant="outline" className="mt-3" onClick={onRetry}>Tentar novamente</Button></div>
        : rows.length === 0 ? <p className="p-8 text-center text-muted-foreground">Nenhum contato encontrado.</p>
        : <table className="w-full text-left text-sm"><thead className="sticky top-0 z-10 bg-background"><tr className="border-b">{["Nome", "Telefone / E-mail", "Empresa / Unidade", "Categoria", ""].map((label, i) => <th key={i} className="px-4 py-3 font-medium text-muted-foreground">{label}</th>)}</tr></thead><tbody>{rows.map(c => <tr key={c.id} className="border-b hover:bg-muted/30">
          <td className="px-4 py-3 font-medium"><span className="flex items-center gap-3"><ContactAvatar name={c.nome} contactId={c.telefone ? c.id : null} photoUrl={c.foto_whatsapp_url} /><span className="min-w-0 break-words">{c.nome}</span></span></td><td className="px-4 py-3"><span className="block whitespace-nowrap">{c.telefone || "Sem telefone"}</span><span className="break-all text-xs text-muted-foreground">{c.email}</span></td>
          <td className="px-4 py-3"><span className="block">{empresas.find(e => e.id === c.empresa_id)?.nome_fantasia || "—"}</span><span className="text-xs text-muted-foreground">{unidades.find(u => u.id === c.unidade_id)?.nome_unidade}</span></td>
          <td className="px-4 py-3">{contactCategoria(c) || "—"}</td><td className="px-4 py-3"><span className="flex items-center justify-end gap-2"><Button variant="ghost" size="icon" title="Editar contato" aria-label={`Editar contato ${c.nome}`} onClick={() => onEdit(c)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" title="Excluir contato" aria-label={`Excluir contato ${c.nome}`} className="text-destructive hover:text-destructive" onClick={() => onDelete(c)}><Trash2 className="h-4 w-4" /></Button><Button variant="outline" size="sm" disabled={startingId !== null || !c.telefone} onClick={() => onStart(c)}>{startingId === c.id ? <LoaderCircle className="animate-spin" /> : <MessageCircle />}Abrir conversa</Button></span></td>
        </tr>)}</tbody></table>}
    </div>
  </main>;
}