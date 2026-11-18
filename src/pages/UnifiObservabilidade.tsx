import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorCode } from "@/lib/edgeFunctionError";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, Loader2, RefreshCw, Router } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface Wan {
  wan: string; provedor: string | null; ip: string | null; portaAtiva: boolean | null; prioridade: number | null;
  problemasAtuais: number; periodosComFalha: number; downtimeSeg: number; disponibilidade: number | null;
  latenciaMedia: number | null; latenciaMax: number | null; perdaMedia: number | null;
  downloadMaxKbps: number | null; uploadMaxKbps: number | null;
}
interface Row {
  siteId: string; unidade: string; hostname: string | null; gateway: string | null; online: boolean | null;
  firmware: string | null; clientesWifi: number; clientesCabo: number; dispositivos: number; dispositivosOffline: number;
  atualizacoesPendentes: number; notificacoesCriticas: number; problemasInternet: number; txRetry: number | null; wans: Wan[];
}

const n = (v: number | null, d = 1, s = "") => (v == null ? "—" : `${v.toFixed(d)}${s}`);
const mbps = (k: number | null) => (k == null ? "—" : `${Math.round(k / 1000)} Mbps`);
const dur = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);

export default function UnifiObservabilidade() {
  const [duration, setDuration] = useState("7d");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const load = async () => {
    setLoading(true); setError(null);
    const res = await supabase.functions.invoke("unifi-observability", { body: { duration } });
    const code = await edgeErrorCode(res);
    if (res.error || code) {
      setError(code === "unifi_not_configured" ? "A chave do UniFi não está configurada." : "Não foi possível consultar o UniFi agora. Tente novamente em instantes.");
    } else setRows(res.data?.rows ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [duration]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toUpperCase();
    return q ? rows.filter((r) => r.unidade.includes(q) || r.wans.some((w) => w.provedor?.toUpperCase().includes(q))) : rows;
  }, [rows, busca]);

  const resumo = useMemo(() => {
    const wans = rows.flatMap((r) => r.wans.map((w) => ({ ...w, unidade: r.unidade })));
    const provedores = new Map<string, number>();
    wans.forEach((w) => w.provedor && provedores.set(w.provedor, (provedores.get(w.provedor) ?? 0) + 1));
    return {
      unidades: rows.length,
      offline: rows.filter((r) => r.online === false).length,
      clientes: rows.reduce((a, r) => a + r.clientesWifi + r.clientesCabo, 0),
      dispOff: rows.reduce((a, r) => a + r.dispositivosOffline, 0),
      falhas: wans.reduce((a, w) => a + w.periodosComFalha, 0),
      piores: [...wans].sort((a, b) => b.downtimeSeg - a.downtimeSeg).filter((w) => w.downtimeSeg > 0).slice(0, 10),
      provedores: [...provedores.entries()].sort((a, b) => b[1] - a[1]).map(([nome, qtd]) => ({ nome, qtd })),
    };
  }, [rows]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Router className="h-6 w-6 text-primary" /><h1 className="text-2xl font-semibold">UniFi</h1></div>
        <div className="flex gap-2">
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Últimas 24 horas</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Atualizar
          </Button>
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Consumo por aplicativo e por dispositivo</AlertTitle>
        <AlertDescription>
          A API oficial do UniFi não fornece quanto cada aplicativo (YouTube, Teams, 365) ou cada dispositivo consome.
          Por isso esta tela mostra WAN, provedores, falhas, latência e saúde das unidades.
        </AlertDescription>
      </Alert>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Unidades", resumo.unidades], ["Gateways offline", resumo.offline], ["Clientes conectados", resumo.clientes],
          ["Equipamentos offline", resumo.dispOff], ["Períodos com falha de WAN", resumo.falhas],
        ].map(([t, v]) => (
          <Card key={t as string}><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t}</CardTitle></CardHeader>
            <CardContent className="text-3xl font-bold">{loading && !rows.length ? "…" : v}</CardContent></Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">WANs com mais tempo fora</CardTitle></CardHeader>
          <CardContent>
            {resumo.piores.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={resumo.piores.map((w) => ({ nome: `${w.unidade} ${w.wan}`, horas: +(w.downtimeSeg / 3600).toFixed(2) }))} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" unit="h" /><YAxis type="category" dataKey="nome" width={150} tick={{ fontSize: 11 }} />
                  <Tooltip /><Bar dataKey="horas" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-muted-foreground">Nenhuma queda no período.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Provedores (quantidade de WANs)</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {resumo.provedores.map((p) => <Badge key={p.nome} variant="secondary">{p.nome}: {p.qtd}</Badge>)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">WAN 1 e WAN 2 por unidade</CardTitle>
          <Input placeholder="Buscar unidade ou provedor" className="max-w-xs" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Unidade</TableHead><TableHead>WAN</TableHead><TableHead>Provedor</TableHead><TableHead>IP público</TableHead>
              <TableHead>Disponib.</TableHead><TableHead>Falhas</TableHead><TableHead>Tempo fora</TableHead>
              <TableHead>Latência méd/máx</TableHead><TableHead>Perda</TableHead><TableHead>Pico down/up</TableHead>
              <TableHead>Clientes</TableHead><TableHead>Equip. offline</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtradas.map((r) => (
                <Fragment key={r.siteId}>
                  {(r.wans.length ? r.wans : [null]).map((w, i) => (
                    <TableRow key={i}>
                      {i === 0 && (
                        <TableCell rowSpan={Math.max(1, r.wans.length)} className="font-medium align-top">
                          {r.unidade}
                          {r.online === false && <Badge variant="destructive" className="ml-2">Offline</Badge>}
                          <div className="text-xs text-muted-foreground">{r.gateway} {r.firmware}</div>
                        </TableCell>
                      )}
                      <TableCell>{w?.wan ?? "—"}{w?.portaAtiva === false && <Badge variant="destructive" className="ml-1">Porta caída</Badge>}</TableCell>
                      <TableCell>{w?.provedor ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{w?.ip ?? "—"}</TableCell>
                      <TableCell className={w?.disponibilidade != null && w.disponibilidade < 99 ? "font-semibold text-destructive" : ""}>{n(w?.disponibilidade ?? null, 2, "%")}</TableCell>
                      <TableCell>{w ? w.periodosComFalha + w.problemasAtuais : "—"}</TableCell>
                      <TableCell>{w ? dur(w.downtimeSeg) : "—"}</TableCell>
                      <TableCell>{w ? `${n(w.latenciaMedia, 0)} / ${n(w.latenciaMax, 0)} ms` : "—"}</TableCell>
                      <TableCell>{n(w?.perdaMedia ?? null, 1, "%")}</TableCell>
                      <TableCell>{w ? `${mbps(w.downloadMaxKbps)} / ${mbps(w.uploadMaxKbps)}` : "—"}</TableCell>
                      {i === 0 && <TableCell rowSpan={Math.max(1, r.wans.length)} className="align-top">{r.clientesWifi} Wi‑Fi · {r.clientesCabo} cabo</TableCell>}
                      {i === 0 && <TableCell rowSpan={Math.max(1, r.wans.length)} className="align-top">{r.dispositivosOffline} de {r.dispositivos}</TableCell>}
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
