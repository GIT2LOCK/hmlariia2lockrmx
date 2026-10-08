import { createClient } from "npm:@supabase/supabase-js@2";
import { getCallerUsuario } from "../_shared/authz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Normaliza para comparar nomes do Zabbix com o cadastro de unidades (sem acento, sem pontuação).
const key = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/^GS[-_ ]?/, "").replace(/[^A-Z0-9]/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const u = await getCallerUsuario(req);
    if (!["SUPERADMIN", "ADMIN", "USER"].includes(u.permissao)) return json({ error: "forbidden" }, 403);
  } catch (e) {
    return json({ error: (e as Error).message || "unauthorized" }, 401);
  }

  let url = (Deno.env.get("ZABBIX_API_URL_2") || Deno.env.get("ZABBIX_API_URL") || "").trim().replace(/\/+$/, "");
  const token = Deno.env.get("ZABBIX_API_TOKEN_2") || Deno.env.get("ZABBIX_API_TOKEN");
  if (!url || !token) return json({ error: "Zabbix não configurado" }, 500);
  if (!/api_jsonrpc\.php$/i.test(url)) url += "/api_jsonrpc.php";

  const zbx = async (method: string, params: unknown) => {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
    });
    const j = await r.json();
    if (j.error) throw new Error(`${j.error.message} ${j.error.data ?? ""}`);
    return j.result as any[];
  };

  try {
    const getHosts = async (tag: "UAP" | "USW") => {
      const hs = await zbx("host.get", { output: ["hostid", "host", "name"], search: { host: "GS", name: tag }, searchByAny: false });
      // Somente hosts cujo hostname contém GS e a sigla (UAP ou USW).
      return hs.filter((h: any) => {
        const hn = String(h.host).toUpperCase();
        return hn.includes("GS") && hn.includes(tag);
      });
    };
    const [uap, usw] = await Promise.all([getHosts("UAP"), getHosts("USW")]);

    const models: Record<string, string> = {};
    if (uap.length) {
      const items = await zbx("item.get", {
        output: ["hostid", "name", "lastvalue"], hostids: uap.map((h: any) => h.hostid), filter: { name: "UAP Model" },
      });
      for (const it of items) models[it.hostid] = String(it.lastvalue ?? "").trim();
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: unidades, error: ue } = await admin.from("unidades").select("id, nome_unidade, codigo_unidade");
    if (ue) throw ue;
    const byKey = new Map<string, number>();
    for (const x of unidades ?? []) {
      if (x.codigo_unidade) byKey.set(key(x.codigo_unidade), x.id);
      if (!byKey.has(key(x.nome_unidade))) byKey.set(key(x.nome_unidade), x.id);
    }

    const now = new Date().toISOString();
    const rows: any[] = [];
    const semUnidade: { host: string; prefixo: string; tipo: string }[] = [];
    const push = (h: any, tipo: "ANTENA" | "SWITCH") => {
      const hn = String(h.host);
      const prefixo = hn.toUpperCase().split(tipo === "ANTENA" ? "-UAP" : "-USW")[0];
      const unidade_id = byKey.get(key(prefixo));
      if (!unidade_id) { semUnidade.push({ host: hn, prefixo, tipo }); return; }
      rows.push({
        unidade_id, tipo, origem: "ZABBIX", zabbix_hostid: String(h.hostid), host_name: hn,
        modelo: tipo === "ANTENA" ? (models[h.hostid] || "N/E") : (hn.toUpperCase().includes("CTRL") ? "USW CTRL" : "USW"),
        ctrl: tipo === "SWITCH" && hn.toUpperCase().includes("CTRL"),
        quantidade: 1, sincronizado_em: now,
      });
    };
    uap.forEach((h: any) => push(h, "ANTENA"));
    usw.forEach((h: any) => push(h, "SWITCH"));

    if (rows.length) {
      const { error } = await admin.from("inventario_itens").upsert(rows, { onConflict: "zabbix_hostid" });
      if (error) throw error;
    }
    // Remove equipamentos do Zabbix que não existem mais (não mexe nos itens manuais).
    const ids = rows.map((r) => r.zabbix_hostid);
    let del = admin.from("inventario_itens").delete().eq("origem", "ZABBIX");
    if (ids.length) del = del.not("zabbix_hostid", "in", `(${ids.join(",")})`);
    const { error: de } = await del;
    if (de) throw de;

    return json({ antenas: uap.length, switches: usw.length, associados: rows.length, sem_unidade: semUnidade });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
