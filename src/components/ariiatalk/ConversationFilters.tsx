import { Filter, Folder, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Filters = { status: string; responsavel: string; instancia: string; empresa: string; categoria: string; pasta: string; naoLidas: boolean };
type FolderRecord = { id: string; nome: string };
type Props = {
  open: boolean; onOpenChange: (open: boolean) => void; filters: Filters; onChange: (filters: Filters) => void; onReset: () => void;
  staff: { id: number; nome: string }[]; empresas: { id: number; nome_fantasia: string }[]; instances: { id: string; nome: string }[]; categorias: string[];
  folders: FolderRecord[]; folderCounts: Record<string, number>; newFolder: string; onNewFolder: (name: string) => void; onCreate: () => void; onDelete: (folder: FolderRecord) => void;
};
function Field({ label, value, empty, options, onChange }: { label: string; value: string; empty: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <div className="min-w-0 space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{label}</span>
    <Select value={value || "__all"} onValueChange={v => onChange(v === "__all" ? "" : v)}>
      <SelectTrigger aria-label={label} className="h-10 min-w-0 [&>span]:truncate"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="__all">{empty}</SelectItem>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
    </Select>
  </div>;
}
export default function ConversationFilters(p: Props) {
  const count = Object.values(p.filters).filter(Boolean).length;
  const change = (key: keyof Filters, value: string | boolean) => p.onChange({ ...p.filters, [key]: value });
  return <Popover open={p.open} onOpenChange={p.onOpenChange}>
    <PopoverTrigger asChild><Button variant={count ? "secondary" : "outline"} size="icon" className="relative h-9 w-9 shrink-0" aria-label="Filtros" title="Filtros"><Filter className="h-4 w-4" />{count > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">{count}</span>}</Button></PopoverTrigger>
    <PopoverContent align="start" sideOffset={10} className="w-[420px] max-w-[calc(100vw-24px)] overflow-hidden p-0">
      <div className="flex items-center justify-between border-b px-5 py-4"><div className="flex items-center gap-2"><Filter className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Filtros de conversas</h3>{count > 0 && <span className="text-xs text-muted-foreground">({count})</span>}</div><Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Fechar filtros" onClick={() => p.onOpenChange(false)}><X className="h-4 w-4" /></Button></div>
      <div className="max-h-[min(650px,70dvh)] space-y-5 overflow-y-auto p-5">
        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
          <Field label="Status" value={p.filters.status} empty="Abertas" options={[{ value: "closed", label: "Encerradas" }]} onChange={v => change("status", v)} />
          <Field label="Responsável" value={p.filters.responsavel} empty="Qualquer responsável" options={[{ value: "none", label: "Sem responsável" }, ...p.staff.map(s => ({ value: String(s.id), label: s.nome }))]} onChange={v => change("responsavel", v)} />
          <Field label="Empresa" value={p.filters.empresa} empty="Todas as empresas" options={p.empresas.map(e => ({ value: String(e.id), label: e.nome_fantasia }))} onChange={v => change("empresa", v)} />
          <Field label="Instância" value={p.filters.instancia} empty="Todas as instâncias" options={p.instances.map(i => ({ value: i.id, label: i.nome }))} onChange={v => change("instancia", v)} />
          <Field label="Categoria" value={p.filters.categoria} empty="Todas as categorias" options={p.categorias.map(c => ({ value: c, label: c }))} onChange={v => change("categoria", v)} />
          <Field label="Pasta" value={p.filters.pasta} empty="Todas as minhas pastas" options={p.folders.map(f => ({ value: f.id, label: f.nome }))} onChange={v => change("pasta", v)} />
        </div>
        <div className="flex items-center justify-between gap-3 border-y py-3"><label htmlFor="only-unread" className="text-sm font-medium">Somente não lidas</label><Switch id="only-unread" checked={p.filters.naoLidas} onCheckedChange={v => change("naoLidas", v)} /></div>
        <div className="space-y-3"><h4 className="flex items-center gap-2 text-sm font-semibold"><Folder className="h-4 w-4 text-primary" />Minhas pastas</h4>
          <div className="space-y-1">{p.folders.length === 0 ? <p className="py-2 text-sm text-muted-foreground">Nenhuma pasta criada.</p> : p.folders.map(f => <div key={f.id} className="flex min-w-0 items-center gap-1"><Button variant={p.filters.pasta === f.id ? "secondary" : "ghost"} className="h-9 min-w-0 flex-1 justify-start px-2" onClick={() => change("pasta", p.filters.pasta === f.id ? "" : f.id)}><Folder className="h-4 w-4 shrink-0" /><span className="truncate">{f.nome}</span><span className="ml-auto text-xs text-muted-foreground">{p.folderCounts[f.id] ?? 0}</span></Button><Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Excluir pasta ${f.nome}`} title={`Excluir pasta ${f.nome}`} onClick={() => p.onDelete(f)}><Trash2 className="h-3.5 w-3.5" /></Button></div>)}</div>
          <form onSubmit={e => { e.preventDefault(); p.onCreate(); }} className="flex gap-2"><Input aria-label="Nome da nova pasta" placeholder="Nova pasta..." maxLength={60} value={p.newFolder} onChange={e => p.onNewFolder(e.target.value)} className="min-w-0" /><Button type="submit" size="icon" disabled={!p.newFolder.trim()} aria-label="Criar pasta" title="Criar pasta" className="shrink-0"><Plus className="h-4 w-4" /></Button></form>
        </div>
      </div>
      <div className="flex items-center justify-between border-t bg-muted/30 px-5 py-3"><Button variant="ghost" size="sm" disabled={!count} onClick={p.onReset}><RotateCcw className="h-3.5 w-3.5" />Limpar filtros</Button><Button size="sm" onClick={() => p.onOpenChange(false)}>Concluir</Button></div>
    </PopoverContent>
  </Popover>;
}