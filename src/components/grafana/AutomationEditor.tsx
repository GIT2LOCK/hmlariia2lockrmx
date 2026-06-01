import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  Handle,
  Position,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Plus, Play, Trash2, Zap, GitBranch, SlidersHorizontal, Target } from "lucide-react";
import type { AutomationRule } from "./AutomationsTab";

type Role = "Viewer" | "Editor" | "Admin";

interface Props {
  rule: AutomationRule;
  onClose: () => void;
}

// ---------- Node renderers ----------
function NodeShell({ icon, title, color, children, selected }: any) {
  return (
    <div
      className={`rounded-lg border-2 bg-card shadow-md min-w-[200px] transition-all ${
        selected ? "border-primary" : "border-border"
      }`}
    >
      <div className={`flex items-center gap-2 px-3 py-2 rounded-t-md text-white text-xs font-semibold ${color}`}>
        {icon}
        {title}
      </div>
      <div className="p-3 text-xs space-y-1">{children}</div>
    </div>
  );
}

function TriggerNode({ data, selected }: any) {
  return (
    <NodeShell icon={<Zap className="h-3 w-3" />} title="TRIGGER" color="bg-primary" selected={selected}>
      <div className="font-medium">{data.label || "Novo usuário sincronizado"}</div>
      <Handle type="source" position={Position.Right} />
    </NodeShell>
  );
}

function ConditionNode({ data, selected }: any) {
  const FIELD: Record<string, string> = {
    email: "Email", email_domain: "Domínio email", nome: "Nome", permissao_ariia: "Permissão Ariia",
  };
  const OP: Record<string, string> = {
    equals: "=", not_equals: "≠", contains: "contém", not_contains: "não contém",
    starts_with: "começa com", ends_with: "termina com", regex: "regex", in_list: "está em (csv)",
  };
  return (
    <NodeShell icon={<SlidersHorizontal className="h-3 w-3" />} title="CONDIÇÃO" color="bg-blue-600" selected={selected}>
      <Handle type="target" position={Position.Left} />
      <div className="font-medium">{FIELD[data.field] || "?"} <span className="text-muted-foreground">{OP[data.operator] || "?"}</span></div>
      <div className="font-mono text-[10px] truncate bg-muted px-1 rounded">{data.value || "(vazio)"}</div>
      <div className="flex justify-between mt-2">
        <Badge variant="outline" className="text-[9px] px-1 py-0">FALSE</Badge>
        <Badge variant="outline" className="text-[9px] px-1 py-0 bg-primary/10 text-primary">TRUE</Badge>
      </div>
      <Handle type="source" position={Position.Right} id="true" style={{ top: "75%", background: "hsl(var(--primary))" }} />
      <Handle type="source" position={Position.Right} id="false" style={{ top: "55%", background: "hsl(var(--muted-foreground))" }} />
    </NodeShell>
  );
}

function LogicNode({ data, selected }: any) {
  return (
    <NodeShell icon={<GitBranch className="h-3 w-3" />} title="LÓGICA" color="bg-purple-600" selected={selected}>
      <Handle type="target" position={Position.Left} />
      <div className="text-center font-bold text-base">{data.op || "AND"}</div>
      <Handle type="source" position={Position.Right} />
    </NodeShell>
  );
}

function ActionNode({ data, selected, orgs }: any) {
  const orgName = orgs?.find((o: any) => o.id === Number(data.grafana_organization_id))?.name;
  return (
    <NodeShell icon={<Target className="h-3 w-3" />} title="AÇÃO" color="bg-emerald-600" selected={selected}>
      <Handle type="target" position={Position.Left} />
      <div className="font-medium">Adicionar à organização</div>
      <div className="truncate">{orgName || <span className="text-muted-foreground italic">selecione…</span>}</div>
      <Badge variant="secondary" className="text-[10px]">{data.role || "Viewer"}</Badge>
    </NodeShell>
  );
}

// ---------- Main editor ----------
function EditorInner({ rule, onClose }: Props) {
  const { toast } = useToast();
  const [name, setName] = useState(rule.name);
  const [description, setDescription] = useState(rule.description || "");
  const [priority, setPriority] = useState(rule.priority);
  const [active, setActive] = useState(rule.active);
  const [orgs, setOrgs] = useState<Array<{ id: number; name: string; grafana_org_id: number }>>([]);
  const [users, setUsers] = useState<Array<{ id: number; nome: string; email: string }>>([]);
  const [testUserId, setTestUserId] = useState<string>("");
  const [testResult, setTestResult] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(rule.graph?.nodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(rule.graph?.edges || []);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("grafana_organizations").select("id, name, grafana_org_id").eq("active", true).order("name")
      .then(({ data }) => setOrgs((data as any) || []));
    supabase.from("usuarios").select("id, nome, email").eq("ativo", true).order("nome")
      .then(({ data }) => setUsers((data as any) || []));
  }, []);

  const nodeTypes = useMemo(() => ({
    trigger: TriggerNode,
    condition: ConditionNode,
    logic: LogicNode,
    action: (props: any) => <ActionNode {...props} orgs={orgs} />,
  }), [orgs]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
    [setEdges],
  );

  const addNode = (type: "condition" | "logic" | "action") => {
    const id = `${type}_${Date.now()}`;
    const defaults: Record<string, any> = {
      condition: { field: "email_domain", operator: "equals", value: "" },
      logic: { op: "AND" },
      action: { action_type: "add_to_org", grafana_organization_id: orgs[0]?.id, role: "Viewer" },
    };
    setNodes((nds) => nds.concat({
      id,
      type,
      position: { x: 300 + Math.random() * 200, y: 100 + Math.random() * 200 },
      data: defaults[type],
    }));
  };

  const updateNodeData = (id: string, patch: Record<string, any>) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
  };

  const deleteSelected = () => {
    if (!selectedId || selectedId === "trigger") return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("grafana_automation_rules" as any)
      .update({
        name, description, priority, active,
        graph: { nodes, edges },
      })
      .eq("id", rule.id);
    setSaving(false);
    if (error) return toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    toast({ title: "Regra salva" });
  };

  const runTest = async () => {
    if (!testUserId) return;
    // Save first so the SQL function sees latest graph
    await supabase.from("grafana_automation_rules" as any).update({ graph: { nodes, edges }, active: true }).eq("id", rule.id);
    const { data, error } = await supabase.rpc("grafana_evaluate_automations" as any, { _usuario_id: Number(testUserId) });
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    setTestResult(data);
  };

  const selected = nodes.find((n) => n.id === selectedId);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" onClick={onClose}><ArrowLeft className="h-4 w-4" /> Voltar</Button>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" placeholder="Nome da regra" />
        <Input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} className="w-28" placeholder="Prioridade" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Ativa
        </label>
        <div className="ml-auto flex gap-2">
          <Button onClick={save} disabled={saving}><Save className="h-4 w-4" /> Salvar</Button>
        </div>
      </div>

      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Descrição (opcional)"
        rows={1}
      />

      <div className="grid grid-cols-[1fr_320px] gap-4">
        {/* Canvas */}
        <div className="border rounded-md bg-background" style={{ height: "65vh" }}>
          <div className="flex items-center gap-2 p-2 border-b bg-muted/30">
            <span className="text-xs font-semibold mr-2">Adicionar:</span>
            <Button size="sm" variant="outline" onClick={() => addNode("condition")}>
              <Plus className="h-3 w-3" /> Condição
            </Button>
            <Button size="sm" variant="outline" onClick={() => addNode("logic")}>
              <Plus className="h-3 w-3" /> Lógica
            </Button>
            <Button size="sm" variant="outline" onClick={() => addNode("action")}>
              <Plus className="h-3 w-3" /> Ação
            </Button>
            {selectedId && selectedId !== "trigger" && (
              <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={deleteSelected}>
                <Trash2 className="h-3 w-3" /> Excluir nó
              </Button>
            )}
          </div>
          <div style={{ height: "calc(65vh - 41px)" }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onSelectionChange={({ nodes: sel }) => setSelectedId(sel[0]?.id || null)}
              nodeTypes={nodeTypes}
              fitView
              snapToGrid
              snapGrid={[16, 16]}
            >
              <Background gap={16} />
              <Controls />
              <MiniMap pannable zoomable />
            </ReactFlow>
          </div>
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          <div className="border rounded-md p-4 space-y-3">
            <h3 className="text-sm font-semibold">Propriedades</h3>
            {!selected && <p className="text-xs text-muted-foreground">Selecione um nó no canvas.</p>}
            {selected?.type === "trigger" && (
              <p className="text-xs text-muted-foreground">Trigger fixo. Roda na primeira sincronização do usuário.</p>
            )}
            {selected?.type === "condition" && (
              <>
                <div>
                  <Label className="text-xs">Campo</Label>
                  <Select value={(selected.data as any).field} onValueChange={(v) => updateNodeData(selected.id, { field: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email completo</SelectItem>
                      <SelectItem value="email_domain">Domínio do email</SelectItem>
                      <SelectItem value="nome">Nome</SelectItem>
                      <SelectItem value="permissao_ariia">Permissão Ariia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Operador</Label>
                  <Select value={(selected.data as any).operator} onValueChange={(v) => updateNodeData(selected.id, { operator: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equals">é igual a</SelectItem>
                      <SelectItem value="not_equals">é diferente de</SelectItem>
                      <SelectItem value="contains">contém</SelectItem>
                      <SelectItem value="not_contains">não contém</SelectItem>
                      <SelectItem value="starts_with">começa com</SelectItem>
                      <SelectItem value="ends_with">termina com</SelectItem>
                      <SelectItem value="regex">corresponde regex</SelectItem>
                      <SelectItem value="in_list">está na lista (separado por vírgula)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Valor</Label>
                  <Input
                    value={(selected.data as any).value || ""}
                    onChange={(e) => updateNodeData(selected.id, { value: e.target.value })}
                    placeholder="ex: goodstorage.com.br"
                  />
                </div>
              </>
            )}
            {selected?.type === "logic" && (
              <div>
                <Label className="text-xs">Operação</Label>
                <Select value={(selected.data as any).op} onValueChange={(v) => updateNodeData(selected.id, { op: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AND">AND (todas verdadeiras)</SelectItem>
                    <SelectItem value="OR">OR (qualquer verdadeira)</SelectItem>
                    <SelectItem value="NOT">NOT (todas falsas)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {selected?.type === "action" && (
              <>
                <div>
                  <Label className="text-xs">Organização</Label>
                  <Select
                    value={String((selected.data as any).grafana_organization_id || "")}
                    onValueChange={(v) => updateNodeData(selected.id, { grafana_organization_id: Number(v) })}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                    <SelectContent>
                      {orgs.map((o) => (<SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Role</Label>
                  <Select
                    value={(selected.data as any).role || "Viewer"}
                    onValueChange={(v) => updateNodeData(selected.id, { role: v as Role })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Viewer">Viewer</SelectItem>
                      <SelectItem value="Editor">Editor</SelectItem>
                      <SelectItem value="Admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          <div className="border rounded-md p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Play className="h-4 w-4" /> Testar regra</h3>
            <Select value={testUserId} onValueChange={setTestUserId}>
              <SelectTrigger><SelectValue placeholder="Escolha um usuário…" /></SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.nome} — {u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={runTest} disabled={!testUserId} className="w-full">Simular</Button>
            {testResult && (
              <div className="text-xs space-y-1">
                <div className="font-semibold">Ações que seriam aplicadas:</div>
                {Array.isArray(testResult) && testResult.length === 0 ? (
                  <div className="text-muted-foreground italic">Nenhuma ação</div>
                ) : (
                  (testResult as any[]).map((a, i) => (
                    <div key={i} className="bg-muted px-2 py-1 rounded">
                      {a.grafana_organization_id && (
                        <>Org {orgs.find((o) => o.id === a.grafana_organization_id)?.name || a.grafana_organization_id} → <Badge variant="secondary" className="text-[10px]">{a.role}</Badge></>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AutomationEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <EditorInner {...props} />
    </ReactFlowProvider>
  );
}
