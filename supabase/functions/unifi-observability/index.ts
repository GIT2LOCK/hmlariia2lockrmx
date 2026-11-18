import { getCallerUsuario } from "../_shared/authz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const BASE = "https://api.ui.com/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const u = await getCallerUsuario(req);
    if (!["SUPERADMIN", "ADMIN", "USER"].includes(u.permissao)) return json({ error: "forbidden" }, 403);
  } catch (e) {
    return json({ error: (e as Error).message || "unauthorized" }, 401);
  }
  const key = Deno.env.get("UNIFI_API_KEY");
  if (!key) return json({ error: "unifi_not_configured" }, 500);

  let duration = "7d";
  try { const b = await req.json(); if (["24h", "7d", "30d"].includes(b?.duration)) duration = b.duration; } catch { /* default */ }
  const metric = duration === "24h" ? "5m" : "1h";

  const get = async (path: string) => {
    const out: any[] = [];
    let next: string | undefined;
    for (let i = 0; i < 20; i++) {
      const url = `${BASE}/${path}${next ? (path.includes("?") ? "&" : "?") + "nextToken=" + encodeURIComponent(next) : ""}`;
      const r = await fetch(url, { headers: { "X-API-KEY": key, Accept: "application/json" } });
      if (!r.ok) throw new Error(`unifi_${r.status}`);
      const j = await r.json();
      out.push(...(j.data ?? []));
      next = j.nextToken;
      if (!next) break;
    }
    return out;
  };

  try {
    const [sites, hosts, metrics] = await Promise.all([
      get("sites"), get("hosts"), get(`isp-metrics/${metric}?duration=${duration === "30d" ? "30d" : duration}`),
    ]);
    const hostById = new Map(hosts.map((h: any) => [h.id, h]));
    const metricsBySite = new Map<string, any[]>();
    for (const m of metrics) metricsBySite.set(m.siteId, m.periods ?? []);

    const rows = sites.map((s: any) => {
      const h: any = hostById.get(s.hostId);
      const rs = h?.reportedState ?? {};
      const st = s.statistics ?? {};
      const periods = metricsBySite.get(s.siteId) ?? [];
      const wanKeys: Array<["WAN" | "WAN2", "wan" | "wan2"]> = [["WAN", "wan"], ["WAN2", "wan2"]];
      const wans = wanKeys.map(([k, mk]) => {
        const w = st.wans?.[k];
        const pts = periods.map((p: any) => p.data?.[mk]).filter(Boolean);
        if (!w && !pts.length) return null;
        const avg = (f: string) => pts.length ? pts.reduce((a: number, p: any) => a + (Number(p[f]) || 0), 0) / pts.length : null;
        const max = (f: string) => pts.length ? Math.max(...pts.map((p: any) => Number(p[f]) || 0)) : null;
        return {
          wan: k === "WAN" ? "WAN 1" : "WAN 2",
          provedor: w?.ispInfo?.name || pts.find((p: any) => p.ispName)?.ispName || null,
          ip: w?.externalIp ?? null,
          portaAtiva: w?.portUp ?? null,
          prioridade: w?.failoverPriority ?? null,
          problemasAtuais: Array.isArray(w?.wanIssues) ? w.wanIssues.length : 0,
          periodosComFalha: pts.filter((p: any) => Number(p.downtime) > 0 || Number(p.uptime) < 100).length,
          downtimeSeg: pts.reduce((a: number, p: any) => a + (Number(p.downtime) || 0), 0),
          disponibilidade: avg("uptime"),
          latenciaMedia: avg("avgLatency"),
          latenciaMax: max("maxLatency"),
          perdaMedia: avg("packetLoss"),
          downloadMaxKbps: max("download_kbps"),
          uploadMaxKbps: max("upload_kbps"),
        };
      }).filter(Boolean);
      const c = st.counts ?? {};
      return {
        siteId: s.siteId,
        unidade: String(rs.hostname || rs.name || s.meta?.desc || s.siteId).replace(/^GS[-_ ]?UDM[-_ ]?/i, "").replace(/[-_]+/g, " ").toUpperCase(),
        hostname: rs.hostname ?? null,
        gateway: st.gateway?.shortname ?? null,
        online: rs.state ? rs.state === "connected" : null,
        firmware: rs.version ?? null,
        clientesWifi: c.wifiClient ?? 0,
        clientesCabo: c.wiredClient ?? 0,
        dispositivos: c.totalDevice ?? 0,
        dispositivosOffline: c.offlineDevice ?? 0,
        atualizacoesPendentes: c.pendingUpdateDevice ?? 0,
        notificacoesCriticas: c.criticalNotification ?? 0,
        problemasInternet: Array.isArray(st.internetIssues) ? st.internetIssues.length : 0,
        txRetry: st.percentages?.txRetry ?? null,
        balanceamento: st.wanLoadBalancingMode ?? null,
        wans,
      };
    }).sort((a: any, b: any) => a.unidade.localeCompare(b.unidade));
    return json({ duration, geradoEm: new Date().toISOString(), rows });
  } catch (e) {
    return json({ error: (e as Error).message || "unifi_failed" }, 502);
  }
});
