import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  UserPlus2, UserCog, Users, ArrowUpCircle, ArrowDownCircle, PauseCircle,
  PlayCircle, MoveRight, Layers, AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import {
  atribuirResponsavel, alterarResponsavel, transferirTecnico, transferirGrupo,
  alterarNivel, marcarAguardandoCliente, retomarAtendimento, moverFila,
  TicketNivel, ActionUser,
  MOTIVOS_ALTERAR_RESPONSAVEL, MOTIVOS_TRANSFERENCIA, MOTIVOS_ESCALONAMENTO,
  MOTIVOS_AGUARDANDO_CLIENTE,
} from "@/lib/ticketWorkflow";
import {
  canPerform, nivelAcima, nivelAbaixo, UserGroupMembership,
} from "@/lib/ticketPermissions";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  ticket: any;
  onChanged: () => void;
}

const NIVEL_COLORS: Record<TicketNivel, string> = {
  N1: "bg-blue-500 text-white",
  N2: "bg-amber-500 text-white",
  N3: "bg-destructive text-destructive-foreground",
};

const fmt = (d?: string | null) =>
  d ? format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—";

type ModalKind =
  | null
  | "assumir"
  | "atribuir"
  | "alterar"
  | "transferir_tec"
  | "transferir_grp"
  | "escalonar"
  | "rebaixar"
  | "aguardando"
  | "mover_fila";

export function FluxoOperacionalCard({ ticket, onChanged }: Props) {
  const { user } = useUser();
  const actionUser: ActionUser = { id: user.id, nome: `${user.nome} ${user.sobrenome}`.trim() };
  const [tecnicos, setTecnicos] = useState<{ id: number; nome: string }[]>([]);
  const [groups, setGroups] = useState<{ id: number; nome: string; nivel: TicketNivel | null }[]>([]);
  const [filas, setFilas] = useState<{ id: number; nome: string }[]>([]);
  const [memberships, setMemberships] = useState<UserGroupMembership[]>([]);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [tecnicoName, setTecnicoName] = useState<string | null>(null);
  const [atribuidoPor, setAtribuidoPor] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);

  const nivel = (ticket.nivel_escalonamento || "N1") as TicketNivel;
  const filaNome = ticket.ticket_filas?.nome || null;

  useEffect(() => {
    (async () => {
      const [t, g, f] = await Promise.all([
        supabase.from("usuarios").select("id,nome").eq("ativo", true).order("nome"),
        supabase.from("support_groups").select("id,nome,nivel").eq("ativo", true).order("nome"),
        supabase.from("ticket_filas").select("id,nome").eq("ativo", true).order("nome"),
      ]);
      setTecnicos((t.data as any) || []);
      setGroups((g.data as any) || []);
      setFilas((f.data as any) || []);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from("support_group_members")
        .select("group_id,role_in_group,support_groups:group_id(nivel)")
        .eq("usuario_id", user.id)
        .eq("ativo", true);
      setMemberships(
        ((data || []) as any[]).map((m) => ({
          group_id: m.group_id,
          role_in_group: m.role_in_group,
          nivel: m.support_groups?.nivel ?? null,
        })),
      );
    })();
  }, [user?.id]);

  useEffect(() => {
    (async () => {
      const [g, t, by] = await Promise.all([
        ticket.assigned_group_id
          ? supabase.from("support_groups").select("nome").eq("id", ticket.assigned_group_id).maybeSingle()
          : Promise.resolve({ data: null }),
        ticket.tecnico_id
          ? supabase.from("usuarios").select("nome").eq("id", ticket.tecnico_id).maybeSingle()
          : Promise.resolve({ data: null }),
        ticket.assigned_by
          ? supabase.from("usuarios").select("nome").eq("id", ticket.assigned_by).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setGroupName((g.data as any)?.nome || null);
      setTecnicoName((t.data as any)?.nome || null);
      setAtribuidoPor((by.data as any)?.nome || null);
    })();
  }, [ticket.assigned_group_id, ticket.tecnico_id, ticket.assigned_by]);

  const allow = useMemo(
    () => ({
      assumir: canPerform("assumir", { id: user.id, role: user.role }, ticket, memberships),
      atribuir: canPerform("atribuir", { id: user.id, role: user.role }, ticket, memberships),
      alterar: canPerform("alterar_responsavel", { id: user.id, role: user.role }, ticket, memberships),
      transferirTec: canPerform("transferir_tecnico", { id: user.id, role: user.role }, ticket, memberships),
      transferirGrp: canPerform("transferir_grupo", { id: user.id, role: user.role }, ticket, memberships),
      escalonar: canPerform("escalonar", { id: user.id, role: user.role }, ticket, memberships),
      rebaixar: canPerform("rebaixar", { id: user.id, role: user.role }, ticket, memberships),
      mover: canPerform("mover_fila", { id: user.id, role: user.role }, ticket, memberships),
      aguardar: canPerform("aguardando_cliente", { id: user.id, role: user.role }, ticket, memberships),
      retomar: canPerform("retomar_atendimento", { id: user.id, role: user.role }, ticket, memberships),
    }),
    [user, ticket, memberships],
  );

  const assumir = async () => {
    try {
      await atribuirResponsavel({
        ticket,
        novoTecnicoId: user.id,
        novaEquipeId: ticket.assigned_group_id ?? null,
        motivo: "Chamado assumido",
        user: actionUser,
      });
      toast({ title: "Chamado assumido" });
      onChanged();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const isAguardandoCliente = ticket.status === "AGUARDANDO_CLIENTE";
  const proximoNivel = nivelAcima(nivel);
  const nivelAnterior = nivelAbaixo(nivel);

  return (
    <Card className="border-primary/20">
      <CardContent className="pt-4 pb-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Layers className="h-4 w-4 text-primary" />
            Fluxo Operacional
          </div>
          <Badge className={NIVEL_COLORS[nivel]}>{nivel}</Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Info label="Técnico responsável" value={tecnicoName} muted={!tecnicoName ? "Sem técnico atribuído" : null} />
          <Info label="Equipe" value={groupName} muted={!groupName ? "—" : null} />
          <Info label="Fila" value={filaNome} muted={!filaNome ? "—" : null} />
          <Info label="Atribuído por / em" value={atribuidoPor ? `${atribuidoPor} · ${fmt(ticket.assigned_at)}` : null} muted="—" />
        </div>

        {isAguardandoCliente && ticket.aguardando_cliente_motivo && (
          <div className="flex items-start gap-2 text-sm rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
            <div>
              <div className="font-medium">Aguardando cliente desde {fmt(ticket.aguardando_cliente_desde)}</div>
              <div className="text-muted-foreground">{ticket.aguardando_cliente_motivo}</div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {!ticket.tecnico_id && allow.assumir && (
            <Button size="sm" variant="default" onClick={assumir}>
              <UserPlus2 className="h-4 w-4 mr-1" /> Assumir
            </Button>
          )}
          {allow.atribuir && (
            <Button size="sm" variant="outline" onClick={() => setModal("atribuir")}>
              <UserPlus2 className="h-4 w-4 mr-1" /> Atribuir
            </Button>
          )}
          {ticket.tecnico_id && allow.alterar && (
            <Button size="sm" variant="outline" onClick={() => setModal("alterar")}>
              <UserCog className="h-4 w-4 mr-1" /> Alterar responsável
            </Button>
          )}
          {ticket.tecnico_id && allow.transferirTec && (
            <Button size="sm" variant="outline" onClick={() => setModal("transferir_tec")}>
              <MoveRight className="h-4 w-4 mr-1" /> Transferir técnico
            </Button>
          )}
          {allow.transferirGrp && (
            <Button size="sm" variant="outline" onClick={() => setModal("transferir_grp")}>
              <Users className="h-4 w-4 mr-1" /> Transferir equipe
            </Button>
          )}
          {proximoNivel && allow.escalonar && (
            <Button size="sm" variant="outline" onClick={() => setModal("escalonar")}>
              <ArrowUpCircle className="h-4 w-4 mr-1" /> Escalonar ({proximoNivel})
            </Button>
          )}
          {nivelAnterior && allow.rebaixar && (
            <Button size="sm" variant="outline" onClick={() => setModal("rebaixar")}>
              <ArrowDownCircle className="h-4 w-4 mr-1" /> Rebaixar ({nivelAnterior})
            </Button>
          )}
          {allow.mover && (
            <Button size="sm" variant="ghost" onClick={() => setModal("mover_fila")}>
              <Layers className="h-4 w-4 mr-1" /> Mover fila
            </Button>
          )}
          {!isAguardandoCliente && allow.aguardar && (
            <Button size="sm" variant="ghost" onClick={() => setModal("aguardando")}>
              <PauseCircle className="h-4 w-4 mr-1" /> Aguardando cliente
            </Button>
          )}
          {isAguardandoCliente && allow.retomar && (
            <Button
              size="sm"
              variant="default"
              onClick={async () => {
                try {
                  await retomarAtendimento({ ticket, user: actionUser });
                  toast({ title: "Atendimento retomado" });
                  onChanged();
                } catch (e: any) {
                  toast({ title: "Erro", description: e.message, variant: "destructive" });
                }
              }}
            >
              <PlayCircle className="h-4 w-4 mr-1" /> Retomar atendimento
            </Button>
          )}
        </div>
      </CardContent>

      {/* Modais */}
      <AtribuirModal
        open={modal === "atribuir"}
        onClose={() => setModal(null)}
        ticket={ticket}
        tecnicos={tecnicos}
        groups={groups}
        user={actionUser}
        onDone={onChanged}
      />
      <AlterarResponsavelModal
        open={modal === "alterar"}
        onClose={() => setModal(null)}
        ticket={ticket}
        tecnicos={tecnicos}
        user={actionUser}
        onDone={onChanged}
      />
      <TransferirTecnicoModal
        open={modal === "transferir_tec"}
        onClose={() => setModal(null)}
        ticket={ticket}
        tecnicos={tecnicos}
        filas={filas}
        user={actionUser}
        onDone={onChanged}
      />
      <TransferirGrupoModal
        open={modal === "transferir_grp"}
        onClose={() => setModal(null)}
        ticket={ticket}
        groups={groups}
        tecnicos={tecnicos}
        filas={filas}
        user={actionUser}
        onDone={onChanged}
      />
      <NivelModal
        open={modal === "escalonar" || modal === "rebaixar"}
        onClose={() => setModal(null)}
        ticket={ticket}
        groups={groups}
        tecnicos={tecnicos}
        novoNivel={modal === "escalonar" ? proximoNivel : nivelAnterior}
        user={actionUser}
        onDone={onChanged}
      />
      <AguardandoClienteModal
        open={modal === "aguardando"}
        onClose={() => setModal(null)}
        ticket={ticket}
        user={actionUser}
        onDone={onChanged}
      />
      <MoverFilaModal
        open={modal === "mover_fila"}
        onClose={() => setModal(null)}
        ticket={ticket}
        filas={filas}
        user={actionUser}
        onDone={onChanged}
      />
    </Card>
  );
}

function Info({ label, value, muted }: { label: string; value?: string | null; muted?: string | null }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`font-medium truncate ${value ? "" : "text-muted-foreground italic"}`}>
        {value || muted || "—"}
      </div>
    </div>
  );
}

/* ───────────────────────── Modais ───────────────────────── */

function MotivoSelect({
  options, value, onChange, outroValue, onOutroChange,
}: {
  options: string[]; value: string; onChange: (v: string) => void;
  outroValue: string; onOutroChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Motivo *</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Selecione um motivo" /></SelectTrigger>
        <SelectContent>
          {options.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
        </SelectContent>
      </Select>
      {value === "Outro" && (
        <Input placeholder="Descreva o motivo" value={outroValue} onChange={(e) => onOutroChange(e.target.value)} />
      )}
    </div>
  );
}

function useGroupMembers(grpId: string) {
  const [members, setMembers] = useState<{ id: number; nome: string }[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!grpId || grpId === "0") { setMembers([]); return; }
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("support_group_members")
        .select("usuario_id,usuarios:usuario_id(nome,ativo,permissao,access_scope)")
        .eq("group_id", Number(grpId))
        .eq("ativo", true);
      const rows = ((data || []) as any[])
        .filter((m) => {
          const u = m.usuarios;
          if (!u) return true;
          if (u.ativo === false) return false;
          if (u.permissao === "CLIENTE" || u.permissao === "VIEWER" || u.permissao === "TV_VIEW") return false;
          if (u.access_scope && !["ARIIA_ONLY", "ARIIA_AND_GRAFANA"].includes(u.access_scope)) return false;
          return true;
        })
        .map((m) => ({ id: m.usuario_id, nome: m.usuarios?.nome || `#${m.usuario_id}` }));
      setMembers(rows);
      setLoading(false);
    })();
  }, [grpId]);
  return { members, loading };
}

function AtribuirModal({ open, onClose, ticket, tecnicos, groups, user, onDone }: any) {
  const [tecId, setTecId] = useState<string>("");
  const [grpId, setGrpId] = useState<string>("");
  const [obs, setObs] = useState("");
  const { members, loading: loadingMembers } = useGroupMembers(grpId);
  useEffect(() => {
    if (open) {
      setTecId(ticket.tecnico_id?.toString() || "");
      setGrpId(ticket.assigned_group_id?.toString() || "");
      setObs("");
    }
  }, [open]);
  const tecOptions = grpId && grpId !== "0" ? members : tecnicos;
  const submit = async () => {
    try {
      await atribuirResponsavel({
        ticket,
        novoTecnicoId: tecId && tecId !== "0" ? Number(tecId) : null,
        novaEquipeId: grpId && grpId !== "0" ? Number(grpId) : null,
        motivo: obs || "Atribuição",
        user,
      });
      toast({ title: "Atribuição salva" });
      onDone(); onClose();
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Atribuir responsável</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Equipe</Label>
            <Select value={grpId} onValueChange={(v) => { setGrpId(v); setTecId(""); }}>
              <SelectTrigger><SelectValue placeholder="Sem equipe" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">— Sem equipe —</SelectItem>
                {groups.map((g: any) => <SelectItem key={g.id} value={g.id.toString()}>{g.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Técnico {grpId && grpId !== "0" ? "(membros da equipe)" : ""}</Label>
            <Select value={tecId} onValueChange={setTecId}>
              <SelectTrigger>
                <SelectValue placeholder={loadingMembers ? "Carregando…" : "Sem técnico"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">— Sem técnico —</SelectItem>
                {tecOptions.length === 0 && !loadingMembers && (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum técnico disponível nesta equipe</div>
                )}
                {tecOptions.map((t: any) => <SelectItem key={t.id} value={t.id.toString()}>{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Observação</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AlterarResponsavelModal({ open, onClose, ticket, tecnicos, user, onDone }: any) {
  const [tecId, setTecId] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [outro, setOutro] = useState("");
  const [obs, setObs] = useState("");
  useEffect(() => { if (open) { setTecId(""); setMotivo(""); setOutro(""); setObs(""); } }, [open]);
  const submit = async () => {
    const motivoFinal = motivo === "Outro" ? outro.trim() : motivo;
    if (!motivoFinal) { toast({ title: "Informe o motivo", variant: "destructive" }); return; }
    if (!tecId) { toast({ title: "Selecione o novo técnico", variant: "destructive" }); return; }
    try {
      await alterarResponsavel({ ticket, novoTecnicoId: Number(tecId), motivo: motivoFinal, observacao: obs, user });
      toast({ title: "Responsável alterado" }); onDone(); onClose();
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Alterar responsável</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Novo técnico *</Label>
            <Select value={tecId} onValueChange={setTecId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {tecnicos.filter((t: any) => t.id !== ticket.tecnico_id).map((t: any) => (
                  <SelectItem key={t.id} value={t.id.toString()}>{t.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <MotivoSelect options={MOTIVOS_ALTERAR_RESPONSAVEL} value={motivo} onChange={setMotivo} outroValue={outro} onOutroChange={setOutro} />
          <div>
            <Label>Observação</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferirTecnicoModal({ open, onClose, ticket, tecnicos, filas, user, onDone }: any) {
  const [destinoId, setDestinoId] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [outro, setOutro] = useState("");
  const [obs, setObs] = useState("");
  const [novaFila, setNovaFila] = useState<string>("");
  const [notificar, setNotificar] = useState(true);
  useEffect(() => { if (open) { setDestinoId(""); setMotivo(""); setOutro(""); setObs(""); setNovaFila(""); setNotificar(true); } }, [open]);
  const submit = async () => {
    const motivoFinal = motivo === "Outro" ? outro.trim() : motivo;
    if (!motivoFinal || !destinoId) { toast({ title: "Campos obrigatórios faltando", variant: "destructive" }); return; }
    try {
      await transferirTecnico({
        ticket, destinoTecnicoId: Number(destinoId), motivo: motivoFinal, observacao: obs,
        notificarDestino: notificar, novaFilaId: novaFila ? Number(novaFila) : null, user,
      });
      toast({ title: "Chamado transferido" }); onDone(); onClose();
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transferir para outro técnico</DialogTitle>
          <DialogDescription>O técnico anterior permanece no histórico.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Técnico de destino *</Label>
            <Select value={destinoId} onValueChange={setDestinoId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {tecnicos.filter((t: any) => t.id !== ticket.tecnico_id).map((t: any) => (
                  <SelectItem key={t.id} value={t.id.toString()}>{t.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <MotivoSelect options={MOTIVOS_TRANSFERENCIA} value={motivo} onChange={setMotivo} outroValue={outro} onOutroChange={setOutro} />
          <div>
            <Label>Nova fila (opcional)</Label>
            <Select value={novaFila} onValueChange={setNovaFila}>
              <SelectTrigger><SelectValue placeholder="Manter fila atual" /></SelectTrigger>
              <SelectContent>
                {filas.map((f: any) => <SelectItem key={f.id} value={f.id.toString()}>{f.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Observação</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={notificar} onChange={(e) => setNotificar(e.target.checked)} />
            Notificar técnico de destino
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit}>Transferir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferirGrupoModal({ open, onClose, ticket, groups, tecnicos, filas, user, onDone }: any) {
  const [grpId, setGrpId] = useState<string>("");
  const [tecId, setTecId] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [outro, setOutro] = useState("");
  const [obs, setObs] = useState("");
  const [novaFila, setNovaFila] = useState<string>("");
  useEffect(() => { if (open) { setGrpId(""); setTecId(""); setMotivo(""); setOutro(""); setObs(""); setNovaFila(""); } }, [open]);
  const submit = async () => {
    const motivoFinal = motivo === "Outro" ? outro.trim() : motivo;
    if (!motivoFinal || !grpId) { toast({ title: "Campos obrigatórios faltando", variant: "destructive" }); return; }
    try {
      await transferirGrupo({
        ticket, destinoGrupoId: Number(grpId),
        destinoTecnicoId: tecId ? Number(tecId) : null,
        motivo: motivoFinal, observacao: obs,
        novaFilaId: novaFila ? Number(novaFila) : null, user,
      });
      toast({ title: "Chamado transferido para equipe" }); onDone(); onClose();
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transferir para outra equipe</DialogTitle>
          <DialogDescription>Opcionalmente já escolha um técnico da equipe de destino.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Equipe de destino *</Label>
            <Select value={grpId} onValueChange={setGrpId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {groups.filter((g: any) => g.id !== ticket.assigned_group_id).map((g: any) => (
                  <SelectItem key={g.id} value={g.id.toString()}>{g.nome}{g.nivel ? ` (${g.nivel})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Técnico (opcional, membros da equipe)</Label>
            <Select value={tecId} onValueChange={setTecId} disabled={!grpId}>
              <SelectTrigger>
                <SelectValue placeholder={!grpId ? "Selecione a equipe primeiro" : (loadingGrpMembers ? "Carregando…" : "Deixar sem técnico")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">— Sem técnico —</SelectItem>
                {grpMembers.length === 0 && grpId && !loadingGrpMembers && (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">Equipe sem membros</div>
                )}
                {grpMembers.map((t: any) => <SelectItem key={t.id} value={t.id.toString()}>{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <MotivoSelect options={MOTIVOS_TRANSFERENCIA} value={motivo} onChange={setMotivo} outroValue={outro} onOutroChange={setOutro} />
          <div>
            <Label>Nova fila (opcional)</Label>
            <Select value={novaFila} onValueChange={setNovaFila}>
              <SelectTrigger><SelectValue placeholder="Manter fila atual" /></SelectTrigger>
              <SelectContent>
                {filas.map((f: any) => <SelectItem key={f.id} value={f.id.toString()}>{f.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Observação</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit}>Transferir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NivelModal({ open, onClose, ticket, groups, tecnicos, novoNivel, user, onDone }: any) {
  const [grpId, setGrpId] = useState<string>("");
  const [tecId, setTecId] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [outro, setOutro] = useState("");
  const [obs, setObs] = useState("");
  const [grpMembers, setGrpMembers] = useState<{ usuario_id: number; nome: string }[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    if (open) {
      setGrpId(""); setTecId(""); setMotivo(""); setOutro(""); setObs("");
      setGrpMembers([]);
    }
  }, [open]);

  useEffect(() => {
    if (!grpId) { setGrpMembers([]); return; }
    setLoadingMembers(true);
    (async () => {
      const { data } = await supabase
        .from("support_group_members")
        .select("usuario_id,usuarios:usuario_id(nome)")
        .eq("group_id", Number(grpId))
        .eq("ativo", true);
      setGrpMembers(((data || []) as any[]).map((m) => ({ usuario_id: m.usuario_id, nome: m.usuarios?.nome || `#${m.usuario_id}` })));
      setTecId("");
      setLoadingMembers(false);
    })();
  }, [grpId]);

  if (!novoNivel) return null;
  const atual = (ticket.nivel_escalonamento || "N1") as TicketNivel;
  const isEscalonar = ["N1", "N2", "N3"].indexOf(novoNivel) > ["N1", "N2", "N3"].indexOf(atual);
  const grupoSelecionado = groups.find((g: any) => g.id === Number(grpId));
  const equipeSemMembros = !!grpId && !loadingMembers && grpMembers.length === 0;
  const nivelDivergente = grupoSelecionado?.nivel && grupoSelecionado.nivel !== novoNivel;

  const submit = async () => {
    const motivoFinal = motivo === "Outro" ? outro.trim() : motivo;
    if (!motivoFinal) { toast({ title: "Motivo obrigatório", variant: "destructive" }); return; }
    if (!grpId && !tecId) {
      toast({
        title: "Informe equipe ou técnico",
        description: "Para escalonar/rebaixar é obrigatório definir ao menos uma equipe ou um técnico de destino.",
        variant: "destructive",
      });
      return;
    }
    if (grpId && equipeSemMembros && !tecId) {
      toast({
        title: "Equipe sem membros",
        description: "A equipe selecionada não tem membros. Cadastre membros em Equipes ou escolha outra equipe/técnico.",
        variant: "destructive",
      });
      return;
    }
    try {
      await alterarNivel({
        ticket, novoNivel,
        destinoGrupoId: grpId ? Number(grpId) : undefined,
        destinoTecnicoId: tecId ? Number(tecId) : undefined,
        motivo: motivoFinal, observacao: obs, user,
      });
      toast({ title: isEscalonar ? "Chamado escalonado" : "Nível rebaixado" }); onDone(); onClose();
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  };

  // técnicos sugeridos: membros do grupo escolhido. Se nenhum grupo, mostra todos.
  const tecnicoOptions = grpId
    ? grpMembers.map((m) => ({ id: m.usuario_id, nome: m.nome }))
    : tecnicos;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEscalonar ? "Escalonar chamado" : "Rebaixar nível"}</DialogTitle>
          <DialogDescription>{atual} → {novoNivel}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <MotivoSelect options={MOTIVOS_ESCALONAMENTO} value={motivo} onChange={setMotivo} outroValue={outro} onOutroChange={setOutro} />
          <p className="text-xs text-muted-foreground">
            Informe ao menos <strong>equipe</strong> ou <strong>técnico</strong> de destino.
          </p>
          <div>
            <Label>Equipe de destino {!tecId && <span className="text-destructive">*</span>}</Label>
            <Select value={grpId} onValueChange={setGrpId}>
              <SelectTrigger><SelectValue placeholder="Manter equipe atual" /></SelectTrigger>
              <SelectContent>
                {groups.map((g: any) => <SelectItem key={g.id} value={g.id.toString()}>{g.nome}{g.nivel ? ` (${g.nivel})` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
            {nivelDivergente && (
              <p className="text-xs text-amber-600 mt-1">
                Atenção: a equipe selecionada é nível {grupoSelecionado.nivel}, diferente de {novoNivel}.
              </p>
            )}
            {equipeSemMembros && (
              <p className="text-xs text-destructive mt-1">
                Esta equipe não tem membros cadastrados. Cadastre em <strong>Equipes</strong> ou escolha outra.
              </p>
            )}
          </div>
          <div>
            <Label>
              Técnico de destino {!grpId && <span className="text-destructive">*</span>} {grpId ? "(membros da equipe)" : ""}
            </Label>
            <Select value={tecId} onValueChange={setTecId}>
              <SelectTrigger>
                <SelectValue placeholder={loadingMembers ? "Carregando…" : "Deixar sem técnico"} />
              </SelectTrigger>
              <SelectContent>
                {tecnicoOptions.length === 0 && (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum técnico disponível</div>
                )}
                {tecnicoOptions.map((t: any) => <SelectItem key={t.id} value={t.id.toString()}>{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Observação</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit}>{isEscalonar ? "Escalonar" : "Rebaixar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function AguardandoClienteModal({ open, onClose, ticket, user, onDone }: any) {
  const [motivo, setMotivo] = useState("");
  const [outro, setOutro] = useState("");
  useEffect(() => { if (open) { setMotivo(""); setOutro(""); } }, [open]);
  const submit = async () => {
    const motivoFinal = motivo === "Outro" ? outro.trim() : motivo;
    if (!motivoFinal) { toast({ title: "Motivo obrigatório", variant: "destructive" }); return; }
    try {
      await marcarAguardandoCliente({ ticket, motivo: motivoFinal, user });
      toast({ title: "Marcado como aguardando cliente" }); onDone(); onClose();
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Aguardando cliente</DialogTitle></DialogHeader>
        <MotivoSelect options={MOTIVOS_AGUARDANDO_CLIENTE} value={motivo} onChange={setMotivo} outroValue={outro} onOutroChange={setOutro} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MoverFilaModal({ open, onClose, ticket, filas, user, onDone }: any) {
  const [filaId, setFilaId] = useState<string>("");
  const [obs, setObs] = useState("");
  useEffect(() => { if (open) { setFilaId(""); setObs(""); } }, [open]);
  const submit = async () => {
    if (!filaId) { toast({ title: "Selecione uma fila", variant: "destructive" }); return; }
    try {
      await moverFila({ ticket, novaFilaId: Number(filaId), motivo: obs, user });
      toast({ title: "Fila atualizada" }); onDone(); onClose();
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Mover para outra fila</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Fila *</Label>
            <Select value={filaId} onValueChange={setFilaId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {filas.filter((f: any) => f.id !== ticket.fila_id).map((f: any) => (
                  <SelectItem key={f.id} value={f.id.toString()}>{f.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Motivo / observação</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit}>Mover</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
