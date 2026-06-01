import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Pencil, Trash2, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AutomationEditor } from "./AutomationEditor";

export interface AutomationRule {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
  priority: number;
  graph: { nodes: any[]; edges: any[] };
  atualizado_em: string;
}

export function AutomationsTab() {
  const { toast } = useToast();
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<AutomationRule | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("grafana_automation_rules" as any)
      .select("*")
      .order("priority", { ascending: true })
      .order("id", { ascending: true });
    if (error) toast({ title: "Erro ao carregar regras", description: error.message, variant: "destructive" });
    setRules((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const createNew = async () => {
    const { data, error } = await supabase
      .from("grafana_automation_rules" as any)
      .insert({
        name: "Nova regra",
        active: false,
        priority: 100,
        graph: {
          nodes: [
            { id: "trigger", type: "trigger", position: { x: 40, y: 200 }, data: { label: "Novo usuário sincronizado" } },
          ],
          edges: [],
        },
      })
      .select()
      .single();
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    setEditing(data as any);
    load();
  };

  const toggleActive = async (rule: AutomationRule, active: boolean) => {
    const { error } = await supabase.from("grafana_automation_rules" as any).update({ active }).eq("id", rule.id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    load();
  };

  const remove = async (rule: AutomationRule) => {
    if (!confirm(`Excluir regra "${rule.name}"?`)) return;
    const { error } = await supabase.from("grafana_automation_rules" as any).delete().eq("id", rule.id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    load();
  };

  if (editing) {
    return (
      <AutomationEditor
        rule={editing}
        onClose={() => { setEditing(null); load(); }}
      />
    );
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2"><Zap className="h-5 w-5 text-primary" /> Automações</h2>
            <p className="text-sm text-muted-foreground">
              Regras aplicadas automaticamente em novos usuários. Permissões manuais sempre prevalecem.
            </p>
          </div>
          <Button onClick={createNew}><Plus className="h-4 w-4" /> Nova regra</Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : rules.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            Nenhuma regra criada. Clique em "Nova regra" para começar.
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className="flex items-center gap-4 border rounded-md p-3 hover:bg-accent/30">
                <Switch checked={r.active} onCheckedChange={(v) => toggleActive(r, v)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{r.name}</span>
                    <Badge variant="outline">prioridade {r.priority}</Badge>
                    <Badge variant="secondary">{r.graph?.nodes?.length || 0} nós</Badge>
                  </div>
                  {r.description && <p className="text-xs text-muted-foreground truncate">{r.description}</p>}
                </div>
                <Button variant="outline" size="sm" onClick={() => setEditing(r)}>
                  <Pencil className="h-4 w-4" /> Editar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove(r)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
