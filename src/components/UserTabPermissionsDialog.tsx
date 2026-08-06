import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const TAB_DEFS: { key: string; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "chamados", label: "Chamados" },
  { key: "atendimento", label: "Dashboard Atendimento" },
  { key: "empresas", label: "Empresas" },
  { key: "unidades", label: "Unidades" },
  { key: "operadoras", label: "Operadoras" },
  { key: "pessoas", label: "Pessoas" },
  { key: "responsaveis", label: "Responsáveis" },
  { key: "base_conhecimento", label: "Base de Conhecimento" },
  { key: "relatorios", label: "Relatórios" },
  { key: "equipes", label: "Equipes" },
  { key: "zabbix", label: "Monitoramento Zabbix" },
  { key: "usuarios", label: "Usuários" },
  { key: "permissoes", label: "Permissões" },
  { key: "grafana", label: "Controle Grafana" },
  { key: "linkai", label: "Linkai" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  usuario: { id: number; nome: string; permissao: string } | null;
}

export function UserTabPermissionsDialog({ open, onClose, usuario }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allowed, setAllowed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !usuario) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("user_tab_permissions")
        .select("tab_key, allowed")
        .eq("usuario_id", usuario.id);
      if (cancelled) return;
      if (error) {
        toast({ title: "Erro ao carregar permissões", description: error.message, variant: "destructive" });
        setLoading(false);
        return;
      }
      const set = new Set<string>();
      (data || []).forEach((r: any) => { if (r.allowed) set.add(r.tab_key); });
      // Se não há registros ainda, aplica default por cargo
      if ((data || []).length === 0) {
        if (usuario.permissao === "CLIENTE") set.add("chamados");
        else TAB_DEFS.forEach((t) => set.add(t.key));
      }
      setAllowed(set);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, usuario?.id]);

  const toggle = (key: string) => {
    setAllowed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    if (!usuario) return;
    setSaving(true);
    try {
      // Upsert em lote: para cada tab define allowed = true/false
      const rows = TAB_DEFS.map((t) => ({
        usuario_id: usuario.id,
        tab_key: t.key,
        allowed: allowed.has(t.key),
      }));
      // Delete existing then insert (mais seguro que upsert múltiplo)
      const { error: delErr } = await supabase
        .from("user_tab_permissions")
        .delete()
        .eq("usuario_id", usuario.id);
      if (delErr) throw delErr;
      const { error: insErr } = await supabase
        .from("user_tab_permissions")
        .insert(rows);
      if (insErr) throw insErr;
      toast({ title: "Permissões de abas atualizadas" });
      onClose();
    } catch (e: any) {
      console.error("[UserTabPermissionsDialog]", e);
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const isBypass = usuario?.permissao === "SUPERADMIN" || usuario?.permissao === "ADMIN";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Permissões de abas — {usuario?.nome}</DialogTitle>
          <DialogDescription>
            Defina quais áreas do Ariia este usuário pode acessar (no menu lateral e via URL).
          </DialogDescription>
        </DialogHeader>

        {isBypass ? (
          <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            Usuários <strong>{usuario?.permissao}</strong> sempre têm acesso a todas as abas. Para
            restringir, primeiro mude o cargo para USER, VIEWER ou CLIENTE.
          </div>
        ) : loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <div className="grid grid-cols-2 gap-3 py-2 max-h-[50vh] overflow-y-auto">
            {TAB_DEFS.map((t) => (
              <label
                key={t.key}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-muted/40"
              >
                <Checkbox
                  checked={allowed.has(t.key)}
                  onCheckedChange={() => toggle(t.key)}
                />
                <span className="text-sm">{t.label}</span>
              </label>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          {!isBypass && (
            <Button onClick={handleSave} disabled={saving || loading} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
