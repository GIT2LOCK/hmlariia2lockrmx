import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { FileText, Loader2, Wifi } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import {
  availabilityPct, fmtHours, fmtPct, isLinkOutage, matchLink, mergedDowntime, monthWindows, simultaneousIntervals,
  type LinkRef, type OutageEvent,
} from "@/lib/linkAvailability";
import { OPERADORA_ABREVIACOES } from "@/lib/operadoras";

interface LinkRow { id: number; unidade_id: number; finalidade: string | null; operadoras: { nome: string } | null }

interface Empresa { id: number; nome_fantasia: string }
interface Unidade { id: number; empresa_id: number; nome_unidade: string; hostname: string | null; abreviacao: string | null }

const PERIODS = [
  { value: "1", label: "Último mês" },
  { value: "3", label: "Últimos 3 meses" },
  { value: "6", label: "Últimos 6 meses" },
  { value: "12", label: "Últimos 12 meses" },
];

export default function RelatorioDisponibilidadeLinks() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [linksByUnit, setLinksByUnit] = useState<Map<number, LinkRef[]>>(new Map());
  const [empresaId, setEmpresaId] = useState("all");
  const [months, setMonths] = useState("6");
  const [events, setEvents] = useState<OutageEvent[] | null>(null);
  const [range, setRange] = useState<{ from: number; till: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("empresas").select("id, nome_fantasia").order("nome_fantasia")
      .then(({ data }) => setEmpresas(((data as Empresa[]) || []).filter((e) => e.nome_fantasia)));
    Promise.all([
      supabase.from("unidades").select("id, empresa_id, nome_unidade, hostname, abreviacao"),
      supabase.from("links_internet").select("id, unidade_id, finalidade, operadoras(nome)").order("id"),
    ]).then(([u, l]) => {
      const rows = (l.data as unknown as LinkRow[]) || [];
      const map = new Map<number, LinkRef[]>();
      for (const r of rows) {
        const list = map.get(r.unidade_id) || [];
        const operadora = r.operadoras?.nome || "Operadora não informada";
        list.push({ id: r.id, abrev: OPERADORA_ABREVIACOES[operadora] || "", index: list.length + 1, operadora });
        map.set(r.unidade_id, list);
      }
      setLinksByUnit(map);
      const withLink = new Set(map.keys());
      setUnidades(((u.data as Unidade[]) || []).filter((x) => withLink.has(x.id)));
    });
  }, []);

  const scoped = useMemo(
    () => unidades.filter((u) => empresaId === "all" || String(u.empresa_id) === empresaId),
    [unidades, empresaId],
  );

  const generate = async () => {
    const till = Math.floor(Date.now() / 1000);
    const d = new Date();
    d.setMonth(d.getMonth() - Number(months));
    const from = Math.floor(d.getTime() / 1000);
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("zabbix-dashboard", {
        body: { action: "events_history", source: "z2", time_from: from, time_till: till, severities: [0, 1, 2, 3, 4, 5] },
      });
      if (error) throw error;
      setEvents(((data?.events as OutageEvent[]) || []).filter((e) => isLinkOutage(e.name)));
      setRange({ from, till });
      if (data?.truncated) toast.warning("O Zabbix limitou o volume de eventos; reduza o período para maior precisão.");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao consultar o monitoramento");
    } finally {
      setLoading(false);
    }
  };

  const report = useMemo(() => {
    if (!events || !range) return null;
    const index = scoped.map((u) => ({
      u,
      tokens: [u.hostname, u.abreviacao, u.nome_unidade]
        .filter((v): v is string => !!v && v.trim().length >= 2)
        .map((v) => v.trim().toLowerCase())
        .sort((a, b) => b.length - a.length),
    })).sort((a, b) => (b.tokens[0]?.length || 0) - (a.tokens[0]?.length || 0));

    // events per unit, split by link; unidentified events = whole unit offline
    const byLink = new Map<number, Array<[number, number]>>();
    const unitWide = new Map<number, Array<[number, number]>>();
    for (const e of events) {
      const hs = `${e.hostname || ""} ${e.host_visible || ""} ${(e.groups || []).join(" ")}`.toLowerCase();
      const hit = index.find((x) => x.tokens.some((t) => hs.includes(t)));
      if (!hit) continue;
      const iv: [number, number] = [e.clock, e.clock + e.duration_sec];
      const links = linksByUnit.get(hit.u.id) || [];
      const link = links.length === 1 ? links[0] : matchLink(e, links);
      const target = link ? byLink : unitWide;
      const key = link ? link.id : hit.u.id;
      target.set(key, [...(target.get(key) || []), iv]);
    }
    const unitDown = (uid: number, from: number, till: number) => {
      const links = linksByUnit.get(uid) || [];
      const wide = unitWide.get(uid) || [];
      return mergedDowntime([...wide, ...simultaneousIntervals(links.map((l) => byLink.get(l.id) || []), from, till)], from, till);
    };

    const rows = scoped.map((u) => {
      const links = (linksByUnit.get(u.id) || []).map((l) => {
        const iv = [...(byLink.get(l.id) || []), ...(unitWide.get(u.id) || [])];
        const down = mergedDowntime(iv, range.from, range.till);
        const quedas = iv.length;
        return { id: l.id, operadora: l.operadora, down, quedas, mttr: quedas ? down / quedas : 0, pct: availabilityPct(down, range.from, range.till) };
      }).sort((a, b) => a.pct - b.pct);
      const down = unitDown(u.id, range.from, range.till);
      return { nome: u.nome_unidade.toUpperCase(), down, links, pct: availabilityPct(down, range.from, range.till) };
    }).sort((a, b) => (a.links[0]?.pct ?? 100) - (b.links[0]?.pct ?? 100) || a.nome.localeCompare(b.nome));

    const avg = (vals: number[]) => (vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 100);
    const geral = avg(rows.map((r) => r.pct));
    const mensal = monthWindows(range.from, range.till).map((m) => ({
      mes: m.label,
      pct: Number(avg(scoped.map((u) => availabilityPct(unitDown(u.id, m.from, m.till), m.from, m.till))).toFixed(2)),
    }));
    return { rows, geral, mensal, semQueda: rows.filter((r) => r.links.every((l) => l.down === 0)).length };
  }, [events, range, scoped, linksByUnit]);

  const empresaNome = empresaId === "all" ? "Todas as empresas" : empresas.find((e) => String(e.id) === empresaId)?.nome_fantasia || "";
  const periodo = range ? `${format(range.from * 1000, "dd/MM/yyyy")} a ${format(range.till * 1000, "dd/MM/yyyy")}` : "";

  const exportPdf = () => {
    if (!report) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    doc.setFillColor(0, 10, 92);
    doc.rect(0, 0, W, 70, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16).text("Relatório de Disponibilidade de Links", 40, 32);
    doc.setFontSize(10).text(`${empresaNome}  •  ${periodo}`, 40, 52);
    doc.setTextColor(0, 10, 92);
    doc.setFontSize(40).text(fmtPct(report.geral), W / 2, 130, { align: "center" });
    doc.setTextColor(90, 90, 90);
    doc.setFontSize(10).text("Disponibilidade geral dos links de internet", W / 2, 150, { align: "center" });
    doc.text(`${report.rows.length} unidades  •  ${report.semQueda} sem nenhuma queda`, W / 2, 166, { align: "center" });
    autoTable(doc, {
      startY: 190,
      head: [report.mensal.map((m) => m.mes)],
      body: [report.mensal.map((m) => fmtPct(m.pct))],
      headStyles: { fillColor: [0, 10, 92], halign: "center" },
      bodyStyles: { halign: "center" },
      styles: { fontSize: 9 },
    });
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [["Unidade / Operadora", "Quedas", "Tempo fora", "Tempo médio p/ retorno", "Disponibilidade"]],
      body: report.rows.flatMap((r) => [
        [{ content: `${r.nome}  (unidade toda fora: ${r.down ? fmtHours(r.down) : "nunca"})`, styles: { fontStyle: "bold", fillColor: [235, 240, 250] } },
          { content: "", styles: { fillColor: [235, 240, 250] } }, { content: "", styles: { fillColor: [235, 240, 250] } },
          { content: "", styles: { fillColor: [235, 240, 250] } }, { content: fmtPct(r.pct), styles: { fontStyle: "bold", fillColor: [235, 240, 250] } }],
        ...r.links.map((l) => ["    " + l.operadora, String(l.quedas), l.down ? fmtHours(l.down) : "—", l.quedas ? fmtHours(l.mttr) : "—", fmtPct(l.pct)]),
      ]) as any,
      headStyles: { fillColor: [0, 10, 92] },
      columnStyles: { 1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "center" }, 4: { halign: "right" } },
      styles: { fontSize: 9 },
    });
    doc.save(`disponibilidade-links-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Wifi className="h-6 w-6 text-primary" />Disponibilidade de Links</h1>
          <p className="text-sm text-muted-foreground">Resumo executivo da disponibilidade dos links de internet das unidades.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={empresaId} onValueChange={setEmpresaId}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as empresas</SelectItem>
              {empresas.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.nome_fantasia}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={months} onValueChange={setMonths}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={generate} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}Gerar relatório
          </Button>
          <Button variant="outline" onClick={exportPdf} disabled={!report}><FileText className="h-4 w-4" />Exportar PDF</Button>
        </div>
      </div>

      {!report ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">
          {loading ? "Consultando o monitoramento… isso pode levar alguns segundos." : "Escolha a empresa e o período e clique em Gerar relatório."}
        </CardContent></Card>
      ) : (
        <>
          <Card>
            <CardContent className="py-8 text-center space-y-1">
              <p className="text-5xl font-bold text-primary">{fmtPct(report.geral)}</p>
              <p className="text-muted-foreground">Disponibilidade geral dos links — {empresaNome}</p>
              <p className="text-sm text-muted-foreground">{periodo} • {report.rows.length} unidades • {report.semQueda} sem nenhuma queda</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Mês a mês</CardTitle></CardHeader>
            <CardContent className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.mensal}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="mes" />
                  <YAxis domain={[(min: number) => Math.max(0, Math.floor(min - 1)), 100]} />
                  <Tooltip formatter={(v: number) => fmtPct(v)} />
                  <Bar dataKey="pct" name="Disponibilidade" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Por unidade e link</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Unidade / Operadora</TableHead><TableHead className="text-center">Quedas</TableHead>
                  <TableHead className="text-center">Tempo fora</TableHead><TableHead className="text-center">Tempo médio p/ retorno</TableHead>
                  <TableHead className="text-right">Disponibilidade</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {report.rows.map((r) => (
                    <Fragment key={r.nome}>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableCell className="font-semibold">{r.nome}</TableCell>
                        <TableCell colSpan={3} className="text-center text-xs text-muted-foreground">
                          Unidade totalmente fora: {r.down ? fmtHours(r.down) : "nunca"}
                        </TableCell>
                        <TableCell className="text-right font-semibold">{fmtPct(r.pct)}</TableCell>
                      </TableRow>
                      {r.links.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="pl-8">{l.operadora}</TableCell>
                          <TableCell className="text-center">{l.quedas}</TableCell>
                          <TableCell className="text-center">{l.down ? fmtHours(l.down) : "—"}</TableCell>
                          <TableCell className="text-center">{l.quedas ? fmtHours(l.mttr) : "—"}</TableCell>
                          <TableCell className={`text-right font-medium ${l.pct < 99 ? "text-destructive" : ""}`}>{fmtPct(l.pct)}</TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
