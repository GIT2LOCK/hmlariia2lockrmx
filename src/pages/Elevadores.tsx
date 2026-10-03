import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { FileSpreadsheet, ArrowUpDown, Search, Play, Pause, CheckCircle2, RotateCcw, LayoutGrid, Columns3, Plus, CalendarDays, ClipboardList } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import CronogramaConstrutor from "@/components/elevadores/CronogramaConstrutor";
import CronogramaKanban from "@/components/elevadores/CronogramaKanban";
import CadastrosView from "@/components/elevadores/CadastrosView";
import ElevadorDetalhe, { SituacaoBadges } from "@/components/elevadores/ElevadorDetalhe";
import {
  Elevador, Facial, Situacao, Status, STATUS_LABEL, SIT_LABEL, VALID_LABEL, FSIT_LABEL, INST_LABEL, PRES_LABEL, situacao, traduzErro,
} from "@/components/elevadores/elevModel";

interface Loja { unidade_id: number; ano_migracao: string | null; lote: string | null; data_prevista: string | null; estoque_leitoras: number; observacoes: string | null; unidades?: { nome_unidade: string } }

const STATUS_VARIANT: Record<Status, "outline" | "secondary" | "default" | "destructive"> = { PENDENTE: "outline", EM_ANDAMENTO: "secondary", PAUSADO: "destructive", INSTALADO: "default" };
const db = supabase as any;
const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");

const FASES: [string, string, string, string, number, string][] = [
  ["Levantamento e mapeamento de elevadores elegíveis", "Facilities", "2026-10-05", "2026-10-05", 0, "Concluído"],
  ["Kickoff — alinhamento do projeto", "Facilities / WCTECH", "2026-10-05", "2026-10-11", 1, "Não iniciado"],
  ["Alinhamento técnico com 2lock", "Facilities / Gois", "2026-10-05", "2026-10-11", 1, "Não iniciado"],
  ["Análise técnica de rede", "2lock", "2026-10-12", "2026-10-25", 2, "Não iniciado"],
  ["Kickoff geral do projeto", "Facilities / Crel / 2lock / WCTECH", "2026-10-26", "2026-11-01", 1, "Não iniciado"],
  ["Especificação técnica e orçamento (CAPEX)", "Facilities / Compras", "2026-11-02", "2026-11-15", 2, "Não iniciado"],
  ["Análise e aquisição de equipamentos", "Compras / WCTECH", "2026-11-16", "2026-12-06", 3, "Não iniciado"],
  ["Instalação 2026 - Lote 1 (9 lojas)", "WCTECH", "2026-12-07", "2026-12-27", 3, "Não iniciado"],
  ["Instalação 2026 - Lote 2 (9 lojas)", "WCTECH", "2026-12-28", "2027-01-17", 3, "Não iniciado"],
  ["Instalação 2026 - Lote 3 (9 lojas)", "WCTECH", "2027-01-18", "2027-02-07", 3, "Não iniciado"],
  ["Testes e homologação 2026 (contínuo por lote)", "Facilities / WCTECH", "2026-12-07", "2027-02-07", 9, "Não iniciado"],
  ["Treinamento das equipes locais (2026)", "Facilities / WCTECH", "2026-12-21", "2027-01-31", 6, "Não iniciado"],
  ["Encerramento e aceite 2026", "Facilities", "2027-02-08", "2027-02-14", 1, "Não iniciado"],
  ["Instalação 2027 - Lote único (9 lojas)", "WCTECH", "2027-01-04", "2027-01-31", 4, "Não iniciado"],
  ["Testes e homologação 2027", "Facilities / WCTECH", "2027-02-01", "2027-02-14", 2, "Não iniciado"],
  ["Encerramento e aceite final 2027", "Facilities", "2027-02-15", "2027-02-21", 1, "Não iniciado"],
];
const dBR = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

type KCol = { key: string; label: string; variant: "outline" | "secondary" | "default" | "destructive" };
const KCOLS: KCol[] = [
  { key: "PENDENTE", label: "Pendente", variant: "outline" },
  { key: "EM_ANDAMENTO", label: "Em andamento", variant: "secondary" },
  { key: "PAUSADO", label: "Pausado", variant: "destructive" },
  { key: "INSTALADO", label: "Concluído", variant: "default" },
];

type Acao = { id: number; to: Status; label: string };

export default function Elevadores() {
  const { toast } = useToast();
  const { isAdmin, user } = useUser();
  const isWctech = (user?.email || "").trim().toLowerCase().split("@")[1] === "wctech.com.br";
  const admin = isAdmin || user?.role === "SUPERADMIN" || user?.role === "ADMIN" || isWctech;
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [elev, setElev] = useState<Elevador[]>([]);
  const [busca, setBusca] = useState("");
  const [lote, setLote] = useState("todos");
  const [fStatus, setFStatus] = useState("todos");
  const [fSit, setFSit] = useState("todos");
  const [faciais, setFaciais] = useState<Facial[]>([]);
  const [detalheId, setDetalheId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<Acao | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [visao, setVisao] = useState<"lojas" | "cadastros" | "kanban" | "cronograma">("lojas");
  const [novoOpen, setNovoOpen] = useState(false);
  const [novo, setNovo] = useState({ unidade_id: "", tipo: "", marca: "", numero_serie: "", observacao: "" });
  const [salvando, setSalvando] = useState(false);
  const tiposExistentes = useMemo(() => Array.from(new Set(elev.map((e) => e.tipo).filter(Boolean))).sort(), [elev]);
  const marcasExistentes = useMemo(() => Array.from(new Set(elev.map((e) => e.marca).filter(Boolean) as string[])).sort(), [elev]);

  const salvarNovo = async () => {
    if (!novo.unidade_id || !novo.tipo.trim()) {
      toast({ title: "Preencha a loja e o tipo", variant: "destructive" }); return;
    }
    setSalvando(true);
    const { error } = await db.from("elev_elevadores").insert({
      unidade_id: Number(novo.unidade_id), tipo: novo.tipo.trim(),
      marca: novo.marca.trim() || null, numero_serie: novo.numero_serie.trim() || null,
      observacao: novo.observacao.trim() || null, status: "PENDENTE",
    });
    setSalvando(false);
    if (error) { toast({ title: "Não foi possível adicionar", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Elevador adicionado" });
    setNovoOpen(false); setNovo({ unidade_id: "", tipo: "", marca: "", numero_serie: "", observacao: "" });
    load();
  };

  const load = async () => {
    const [l, e, f] = await Promise.all([
      db.from("elev_lojas").select("*, unidades(nome_unidade)"),
      db.from("elev_elevadores").select("*, ini:usuarios!elev_elevadores_iniciado_por_fkey(nome), fim:usuarios!elev_elevadores_instalado_por_fkey(nome), val:usuarios!elev_elevadores_validado_por_fkey(nome)").order("id"),
      db.from("elev_faciais").select("*").order("codigo"),
    ]);
    const err = l.error || e.error || f.error;
    if (err) toast({ title: "Erro ao carregar", description: err.message, variant: "destructive" });
    setLojas(l.data || []); setElev(e.data || []); setFaciais(f.data || []); setLoading(false);
  };
  useEffect(() => {
    load();
    const ch = db.channel("elev-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "elev_elevadores" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "elev_faciais" }, () => load())
      .subscribe();
    return () => { db.removeChannel(ch); };
  }, []);

  const executar = async (a: Acao) => {
    setBusy(a.id);
    const { error } = await db.from("elev_elevadores").update({ status: a.to }).eq("id", a.id);
    setBusy(null); setConfirm(null);
    if (error) {
      const msg = error.message.includes("transicao_nao_permitida") ? "Essa ação não é permitida no estado atual (talvez alguém já tenha iniciado)." : traduzErro(error.message);
      toast({ title: "Não foi possível atualizar", description: msg, variant: "destructive" });
    } else toast({ title: `${a.label} registrado` });
    load();
  };

  const acoes = (e: Elevador): Acao[] => {
    const r: Acao[] = [];
    if (e.status === "PENDENTE") r.push({ id: e.id, to: "EM_ANDAMENTO", label: "Iniciar" });
    if (e.status === "EM_ANDAMENTO") r.push({ id: e.id, to: "PAUSADO", label: "Pausar" });
    if (e.status === "PAUSADO") r.push({ id: e.id, to: "EM_ANDAMENTO", label: "Retomar" });
    if (e.status === "EM_ANDAMENTO" || e.status === "PAUSADO" || (admin && e.status === "PENDENTE")) r.push({ id: e.id, to: "INSTALADO", label: "Encerrar" });
    if (admin && e.status !== "PENDENTE") r.push({ id: e.id, to: "PENDENTE", label: "Reiniciar" });
    return r;
  };
  const icon = (l: string) => l === "Iniciar" || l === "Retomar" ? Play : l === "Pausar" ? Pause : l === "Encerrar" ? CheckCircle2 : RotateCcw;

  const facialPorElev = useMemo(() => new Map(faciais.filter((f) => f.elevador_id).map((f) => [f.elevador_id as number, f])), [faciais]);
  const facialDe = (id: number) => facialPorElev.get(id) || null;
  const passa = (e: Elevador) => (fStatus === "todos" || e.status === fStatus) && (fSit === "todos" || situacao(e, facialDe(e.id)) === fSit);
  const filtroAtivo = fStatus !== "todos" || fSit !== "todos";

  const lotes = useMemo(() => Array.from(new Set(lojas.map((l) => l.lote || "Concluído"))).sort(), [lojas]);
  const count = (s: Status) => elev.filter((e) => e.status === s).length;
  const total = elev.length, inst = count("INSTALADO");

  const lista = lojas
    .filter((l) => lote === "todos" || (l.lote || "Concluído") === lote)
    .filter((l) => !busca || (l.unidades?.nome_unidade || "").toLowerCase().includes(busca.toLowerCase()))
    .map((l) => ({ l, es: elev.filter((e) => e.unidade_id === l.unidade_id && passa(e)) }))
    .filter((x) => !filtroAtivo || x.es.length)
    .sort((a, b) => (a.l.data_prevista || "9999").localeCompare(b.l.data_prevista || "9999") || (a.l.unidades?.nome_unidade || "").localeCompare(b.l.unidades?.nome_unidade || ""));

  const kpis = [
    { label: "Elevadores", value: total },
    { label: "Instalados", value: inst },
    { label: "Em andamento", value: count("EM_ANDAMENTO") },
    { label: "Pausados", value: count("PAUSADO") },
    { label: "Pendentes", value: count("PENDENTE") },
  ];
  const sits = elev.map((e) => situacao(e, facialDe(e.id)));
  const nSit = (s: Situacao) => sits.filter((x) => x === s).length;
  const kpis2: { label: string; value: number; sit?: Situacao }[] = [
    { label: "Validados", value: elev.filter((e) => e.validacao_status === "VALIDADO").length },
    { label: "Aguardando validação", value: nSit("AGUARDANDO_VALIDACAO"), sit: "AGUARDANDO_VALIDACAO" },
    { label: "Faciais instalados", value: faciais.filter((f) => f.instalacao === "INSTALADA").length, sit: "CONCLUIDO" },
    { label: "Faciais aguardando instalação", value: faciais.filter((f) => f.elevador_id && f.instalacao !== "INSTALADA").length, sit: "AGUARDANDO_INSTALACAO" },
    { label: "Faciais disponíveis nas unidades", value: faciais.filter((f) => f.presenca === "PRESENTE").length },
    { label: "Elevadores sem facial", value: nSit("SEM_FACIAL") + nSit("FACIAL_NAO_ENCONTRADO") + nSit("NECESSITA_COMPRA"), sit: "SEM_FACIAL" },
    { label: "Faciais sem elevador", value: faciais.filter((f) => !f.elevador_id && f.presenca === "PRESENTE").length },
    { label: "Necessidade de compra", value: nSit("NECESSITA_COMPRA"), sit: "NECESSITA_COMPRA" },
  ];

  const lojaPorId = useMemo(() => new Map(lojas.map((l) => [l.unidade_id, l])), [lojas]);
  const exportar = async () => {
    const wb = XLSX.utils.book_new();
    const hoje = new Date().toISOString().slice(0, 10);
    const [ep, eu, ef, ed] = await Promise.all([
      db.from("elev_cronograma_etapas").select("*").order("ordem"),
      db.from("elev_cronograma_etapa_unidades").select("*"),
      db.from("elev_cronograma_faciais").select("*").order("ordem"),
      db.from("elev_cronograma_dependencias").select("*"),
    ]);
    const etapas = ep.data || [], participacoes = eu.data || [], faciais = ef.data || [], dependencias = ed.data || [];
    const c = [["Cronograma de Implantação — Controle de Acesso nos Elevadores"], [],
      ["Fase / Etapa", "Responsável", "Início", "Fim", "Duração (sem.)", "Status"],
      ...(etapas.length ? etapas.map((e: any) => [e.nome, e.descricao || "", dBR(e.data_inicio), dBR(e.data_fim), e.data_inicio && e.data_fim ? Math.ceil((new Date(e.data_fim).getTime() - new Date(e.data_inicio).getTime() + 86400000) / 604800000) : "", e.status]) : FASES.map(([f, r, i, fi, d, st]) => [f, r, dBR(i), dBR(fi), d, st]))];
    const w1 = XLSX.utils.aoa_to_sheet(c);
    w1["!cols"] = [{ wch: 50 }, { wch: 34 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, w1, "Cronograma");
    const linhas = [...lojas].sort((a, b) => (a.data_prevista || "9").localeCompare(b.data_prevista || "9") || lojaNome(a.unidade_id).localeCompare(lojaNome(b.unidade_id)));
    const r = [["Resumo por Loja — Elevadores, Estoque de Leitoras e Ano de Migração"], [],
      ["Loja", "Total de elevadores", "Já instalados", "Em andamento", "Faltam instalar", "Estoque de leitoras sobrando", "Ano de migração", "Lote", "Data prevista", "Observações",
        "Validados", "Não validados", "Com facial", "Sem facial", "Faciais instalados", "Faciais aguardando instalação", "Faciais não encontrados", "Necessita compra", "Faciais sem elevador"],
      ...linhas.map((l) => {
        const es = elev.filter((e) => e.unidade_id === l.unidade_id);
        const ok = es.filter((e) => e.status === "INSTALADO").length;
        const and = es.filter((e) => e.status === "EM_ANDAMENTO" || e.status === "PAUSADO").length;
        const sits = es.map((e) => situacao(e, facialDe(e.id)));
        const fu = faciais.filter((f) => f.unidade_id === l.unidade_id);
        return [lojaNome(l.unidade_id), es.length, ok, and, es.length - ok, l.estoque_leitoras ?? 0, l.ano_migracao || "", l.lote || "", dBR(l.data_prevista), l.observacoes || "",
          es.filter((e) => e.validacao_status === "VALIDADO").length, es.filter((e) => e.validacao_status !== "VALIDADO").length,
          es.filter((e) => facialDe(e.id)).length, es.filter((e) => e.validacao_status === "VALIDADO" && !facialDe(e.id)).length,
          sits.filter((s) => s === "CONCLUIDO").length, sits.filter((s) => s === "AGUARDANDO_INSTALACAO").length,
          sits.filter((s) => s === "FACIAL_NAO_ENCONTRADO").length, sits.filter((s) => s === "NECESSITA_COMPRA").length, fu.filter((f) => !f.elevador_id).length];
      })];
    const w2 = XLSX.utils.aoa_to_sheet(r);
    w2["!cols"] = [{ wch: 26 }, { wch: 12 }, { wch: 12 }, { wch: 13 }, { wch: 13 }, { wch: 16 }, { wch: 12 }, { wch: 8 }, { wch: 13 }, { wch: 40 }, ...Array(9).fill({ wch: 14 })];
    XLSX.utils.book_append_sheet(wb, w2, "Resumo por Loja");
    const d = [["Unidade", "Elevador", "Tipo", "Marca", "Nº série", "Status", "Validação", "Validado em", "Facial", "Facial encontrado", "Status da instalação", "Data de instalação", "Iniciado em", "Iniciado por", "Responsável (encerramento)", "Pendência"],
      ...elev.map((e) => { const f = facialDe(e.id); const s = situacao(e, f); return [lojaNome(e.unidade_id), `#${e.id}`, e.tipo, e.marca || "", e.numero_serie || "", STATUS_LABEL[e.status],
        VALID_LABEL[e.validacao_status], fmt(e.validado_em), f?.codigo || "", e.validacao_status === "VALIDADO" ? (f ? "Sim" : FSIT_LABEL[e.facial_situacao]) : "Não validado",
        f ? INST_LABEL[f.instalacao] : "", fmt(f?.instalado_em || e.instalado_em), fmt(e.iniciado_em), e.ini?.nome || "", e.fim?.nome || "", s === "CONCLUIDO" ? "" : SIT_LABEL[s]]; })];
    const w3 = XLSX.utils.aoa_to_sheet(d);
    w3["!cols"] = d[0].map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, w3, "Elevadores");
    const w4 = XLSX.utils.json_to_sheet(participacoes.map((p: any) => ({ Etapa: etapas.find((e: any) => e.id === p.etapa_id)?.nome || "", Loja: lojaNome(p.unidade_id), Status: p.status, Progresso: p.progresso_manual ?? "", Observações: p.observacoes || "" })));
    w4["!cols"] = [{ wch: 44 }, { wch: 28 }, { wch: 18 }, { wch: 12 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, w4, "Etapas por Loja");
    const elevPorId = new Map(elev.map((e) => [e.id, e]));
    const fisicos = faciais.map((f) => { const e = f.elevador_id ? elevPorId.get(f.elevador_id) : null; return {
      Origem: "Cadastro físico", Etapa: "", Facial: f.codigo, Unidade: lojaNome(f.unidade_id), Elevador: e ? `${e.tipo} #${e.id}` : "Sem elevador",
      Status: INST_LABEL[f.instalacao], "Presente na unidade": f.presenca === "PRESENTE" ? "Sim" : PRES_LABEL[f.presenca], Instalado: f.instalacao === "INSTALADA" ? "Sim" : "Não",
      "Data de instalação": fmt(f.instalado_em), Descrição: [f.marca, f.modelo, f.numero_serie].filter(Boolean).join(" · "), Observações: f.observacao || "",
      Pendência: !f.elevador_id ? "Sem elevador" : f.instalacao !== "INSTALADA" ? "Falta instalar" : "" }; });
    const w5 = XLSX.utils.json_to_sheet([...fisicos, ...faciais_cr(faciais)]);
    function faciais_crono(x: any[]) { return x; }
    function faciais_cr(x: any[]) { return x.map((f: any) => { const p = participacoes.find((y: any) => y.id === f.etapa_unidade_id); return {
      Origem: "Cronograma", Etapa: etapas.find((e: any) => e.id === p?.etapa_id)?.nome || "", Facial: f.nome, Unidade: p ? lojaNome(p.unidade_id) : "", Elevador: "",
      Status: f.status, "Presente na unidade": "", Instalado: f.status === "CONCLUIDO" ? "Sim" : "Não", "Data de instalação": fmt(f.concluido_em),
      Descrição: f.descricao || "", Observações: f.observacoes || "", Pendência: f.pendencias || "" }; }); }
    w5["!cols"] = [{ wch: 16 }, { wch: 36 }, { wch: 26 }, { wch: 24 }, { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 30 }, { wch: 30 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, w5, "Faciais");
    const w6 = XLSX.utils.json_to_sheet(dependencias.map((d: any) => ({ Etapa: etapas.find((e: any) => e.id === d.etapa_id)?.nome || "", "Depende de": etapas.find((e: any) => e.id === d.depende_de_etapa_id)?.nome || "", Tipo: d.tipo })));
    w6["!cols"] = [{ wch: 45 }, { wch: 45 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, w6, "Dependências");
    XLSX.writeFile(wb, `relatorio-elevadores-${hoje}.xlsx`);
  };
  const lojaNome = (id: number) => lojaPorId.get(id)?.unidades?.nome_unidade || `Loja ${id}`;
  const lojasVisiveis = useMemo(() => new Set(lista.map((x) => x.l.unidade_id)), [lista]);
  const elevFiltrados = elev.filter((e) => lojasVisiveis.has(e.unidade_id) && passa(e));
  const detalhe = detalheId ? elev.find((e) => e.id === detalheId) || null : null;

  const renderElevador = (e: Elevador, showLoja = false) => (
    <div key={e.id} className="rounded-lg border border-border bg-card p-3 space-y-2 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <button type="button" className="min-w-0 text-left" onClick={() => setDetalheId(e.id)}>
          {showLoja && <p className="text-xs font-semibold text-primary truncate">{lojaNome(e.unidade_id)}</p>}
          <p className="font-medium text-sm text-foreground underline-offset-2 hover:underline">{e.tipo}</p>
          <p className="text-xs text-muted-foreground">{e.marca || "Marca —"} · Série {e.numero_serie || "—"}</p>
        </button>
        <Badge variant={STATUS_VARIANT[e.status]}>{STATUS_LABEL[e.status]}</Badge>
      </div>
      <SituacaoBadges e={e} f={facialDe(e.id)} />
      {(e.iniciado_em || e.instalado_em) && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {e.iniciado_em && <p>Iniciado {fmt(e.iniciado_em)}{e.ini?.nome ? ` por ${e.ini.nome}` : ""}</p>}
          {e.instalado_em && <p>Encerrado {fmt(e.instalado_em)}{e.fim?.nome ? ` por ${e.fim.nome}` : ""}</p>}
        </div>
      )}
      {acoes(e).length > 0 && (
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
          {acoes(e).map((a) => {
            const I = icon(a.label);
            return (
              <Button key={a.label} size="sm" className="h-10 sm:h-9"
                variant={a.label === "Iniciar" || a.label === "Retomar" || a.label === "Encerrar" ? "default" : "outline"}
                disabled={busy === e.id} onClick={() => setConfirm(a)}>
                <I className="h-4 w-4 mr-1" />{a.label}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <main className="space-y-4 sm:space-y-6">
      <header className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary"><ArrowUpDown className="h-6 w-6" /></div>
        <div className="flex-1">
          <h1 className="text-lg sm:text-2xl font-semibold text-foreground">Implantação — Elevadores</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">GoodStorage · controle de acesso por loja</p>
        </div>
      </header>

      <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Adicionar elevador</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Loja *</Label>
              <Select value={novo.unidade_id} onValueChange={(v) => setNovo({ ...novo, unidade_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {[...lojas].sort((a, b) => (a.unidades?.nome_unidade || "").localeCompare(b.unidades?.nome_unidade || "")).map((l) => (
                    <SelectItem key={l.unidade_id} value={String(l.unidade_id)}>{l.unidades?.nome_unidade}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tipo *</Label>
              <Input list="elev-tipos" value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value })} placeholder="Ex.: Carga, Social" />
              <datalist id="elev-tipos">{tiposExistentes.map((t) => <option key={t} value={t} />)}</datalist>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Marca</Label>
                <Input list="elev-marcas" value={novo.marca} onChange={(e) => setNovo({ ...novo, marca: e.target.value })} />
                <datalist id="elev-marcas">{marcasExistentes.map((t) => <option key={t} value={t} />)}</datalist>
              </div>
              <div className="space-y-1">
                <Label>Número de série</Label>
                <Input value={novo.numero_serie} onChange={(e) => setNovo({ ...novo, numero_serie: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Observação</Label>
              <Textarea value={novo.observacao} onChange={(e) => setNovo({ ...novo, observacao: e.target.value })} rows={3} />
            </div>
            <p className="text-xs text-muted-foreground">O elevador entra como Pendente.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoOpen(false)}>Cancelar</Button>
            <Button onClick={salvarNovo} disabled={salvando}>{salvando ? "Salvando..." : "Adicionar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3">
        {kpis.map((k) => (
          <Card key={k.label}><CardContent className="p-3 sm:p-4">
            <p className="text-[11px] sm:text-xs text-muted-foreground">{k.label}</p>
            <p className="text-xl sm:text-2xl font-semibold text-foreground">{k.value}</p>
          </CardContent></Card>
        ))}
      </section>
      <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {kpis2.map((k) => (
          <Card key={k.label} className="cursor-pointer" onClick={() => k.sit && (setFSit(k.sit), setVisao("cadastros"))}><CardContent className="p-2.5">
            <p className="text-[11px] text-muted-foreground leading-tight">{k.label}</p>
            <p className="text-lg font-semibold text-foreground">{k.value}</p>
          </CardContent></Card>
        ))}
      </section>
      <Card><CardContent className="p-3 sm:p-4 space-y-2">
        <div className="flex justify-between text-sm"><span>Progresso geral</span><span>{total ? Math.round((inst / total) * 100) : 0}%</span></div>
        <Progress value={total ? (inst / total) * 100 : 0} />
      </CardContent></Card>

      <div className="sticky top-0 z-10 -mx-1 flex flex-col sm:flex-row gap-2 bg-background/95 px-1 py-2 backdrop-blur">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar loja..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select value={lote} onValueChange={setLote}>
            <SelectTrigger className="sm:w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os lotes</SelectItem>
              {lotes.map((l) => <SelectItem key={l} value={l}>{/^\d$/.test(l) ? `Lote ${l}` : l === "2027" ? "Migração 2027" : l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger className="sm:w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {(Object.keys(STATUS_LABEL) as Status[]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fSit} onValueChange={setFSit}>
            <SelectTrigger className="sm:w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as situações</SelectItem>
              {(Object.keys(SIT_LABEL) as Situacao[]).map((s) => <SelectItem key={s} value={s}>{SIT_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" className="h-9" onClick={exportar}>
            <FileSpreadsheet className="h-4 w-4 mr-1" />Relatório
          </Button>
          <div className="col-span-2 sm:col-span-1 flex rounded-md border border-border overflow-hidden">
            <Button type="button" size="sm" variant={visao === "lojas" ? "default" : "ghost"} className="flex-1 rounded-none h-9" onClick={() => setVisao("lojas")}>
              <LayoutGrid className="h-4 w-4 mr-1" />Lojas
            </Button>
            <Button type="button" size="sm" variant={visao === "cadastros" ? "default" : "ghost"} className="flex-1 rounded-none h-9" onClick={() => setVisao("cadastros")}>
              <ClipboardList className="h-4 w-4 mr-1" />Cadastros
            </Button>
            <Button type="button" size="sm" variant={visao === "kanban" ? "default" : "ghost"} className="flex-1 rounded-none h-9" onClick={() => setVisao("kanban")}>
              <Columns3 className="h-4 w-4 mr-1" />Kanban
            </Button>
            <Button type="button" size="sm" variant={visao === "cronograma" ? "default" : "ghost"} className="flex-1 rounded-none h-9" onClick={() => setVisao("cronograma")}>
              <CalendarDays className="h-4 w-4 mr-1" />Cronograma
            </Button>
          </div>
        </div>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : visao === "cronograma" ? (
        <CronogramaConstrutor lojas={lojas} admin={admin} />
      ) : visao === "kanban" ? (
        <CronogramaKanban lojas={lojas} admin={admin} />
      ) : visao === "cadastros" ? (
        <CadastrosView elevadores={elevFiltrados} faciais={faciais.filter((f) => lojasVisiveis.has(f.unidade_id))} lojas={lojas} admin={admin} lojaNome={lojaNome}
          onOpenElevador={(e) => setDetalheId(e.id)} onNovoElevador={() => setNovoOpen(true)} onChanged={load} />
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {admin && (
            <div className="flex justify-end">
              <Button onClick={() => setNovoOpen(true)}><Plus className="h-4 w-4 mr-1" />Adicionar elevador</Button>
            </div>
          )}
          {lista.map(({ l, es }) => {
            const all = elev.filter((e) => e.unidade_id === l.unidade_id);
            const ok = all.filter((e) => e.status === "INSTALADO").length;
            const fu = faciais.filter((f) => f.unidade_id === l.unidade_id);
            const livres = fu.filter((f) => !f.elevador_id);
            const valid = all.filter((e) => e.validacao_status === "VALIDADO").length;
            const semF = all.filter((e) => e.validacao_status === "VALIDADO" && !facialDe(e.id)).length;
            return (
              <Card key={l.unidade_id}>
                <CardHeader className="p-3 sm:p-6 pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">{l.unidades?.nome_unidade}</CardTitle>
                    <Badge variant={ok === all.length && all.length ? "default" : "secondary"}>{ok}/{all.length} instalados</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <Badge variant="outline">{l.lote ? (/^\d$/.test(l.lote) ? `Lote ${l.lote}` : `Migração ${l.lote}`) : "Concluído"}</Badge>
                    {l.data_prevista && <Badge variant="outline">Previsto {new Date(l.data_prevista + "T12:00").toLocaleDateString("pt-BR")}</Badge>}
                    <Badge variant="outline">Leitoras: {l.estoque_leitoras}</Badge>
                    <Badge variant="outline">Validados {valid}/{all.length}</Badge>
                    <Badge variant="outline">Faciais {fu.length}</Badge>
                    {semF > 0 && <Badge variant="destructive">{semF} sem facial</Badge>}
                    {livres.length > 0 && <Badge variant="secondary">{livres.length} facial(is) sem elevador</Badge>}
                  </div>
                  {l.observacoes && <p className="text-xs text-muted-foreground">{l.observacoes}</p>}
                </CardHeader>
                <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0 space-y-2">
                  {es.map((e) => renderElevador(e))}
                  {livres.length > 0 && (
                    <div className="rounded-lg border border-dashed border-border p-3 text-xs space-y-1">
                      <p className="font-semibold text-foreground">Faciais disponíveis na unidade (sem elevador)</p>
                      {livres.map((f) => <p key={f.id}>{f.codigo} · {PRES_LABEL[f.presenca]}</p>)}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {!lista.length && <p className="text-sm text-muted-foreground">Nenhuma loja encontrada.</p>}
        </div>
      )}

      <ElevadorDetalhe elevador={detalhe} onClose={() => setDetalheId(null)} admin={admin} lojaNome={lojaNome}
        lojas={lojas} elevadores={elev} faciais={faciais} onChanged={load} />

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.label} instalação?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.label === "Iniciar" && "Depois de iniciado, ninguém poderá iniciar novamente — apenas pausar ou encerrar."}
              {confirm?.label === "Reiniciar" && "O elevador voltará para Pendente e as datas de início/encerramento serão apagadas."}
              {confirm?.label === "Encerrar" && "O elevador será marcado como instalado."}
              {(confirm?.label === "Pausar" || confirm?.label === "Retomar") && "A mudança ficará registrada no histórico."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && executar(confirm)}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
