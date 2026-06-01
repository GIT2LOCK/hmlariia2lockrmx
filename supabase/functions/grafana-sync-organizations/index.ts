import { corsHeaders, assertAdmin, grafanaFetch, serviceClient, logSync } from "../_shared/grafana.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const actor = await assertAdmin(req);
    const svc = serviceClient();

    let createdOrg: any = null;
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body?.create_name) {
        const r = await grafanaFetch("/api/orgs", { method: "POST", body: JSON.stringify({ name: body.create_name }) });
        if (!r.ok) throw new Error(`create_org_failed: ${JSON.stringify(r.body)}`);
        createdOrg = r.body;
      }
    }

    const list = await grafanaFetch("/api/orgs");
    if (!list.ok) throw new Error(`list_orgs_failed: ${list.status}`);
    const orgs = list.body as Array<{ id: number; name: string }>;

    const now = new Date().toISOString();
    for (const o of orgs) {
      await svc.from("grafana_organizations").upsert({
        grafana_org_id: o.id, name: o.name, active: true, synced_at: now, atualizado_em: now,
      }, { onConflict: "grafana_org_id" });
    }

    await logSync({ actor_usuario_id: actor.id, action: "sync_organizations", status: "success", response_payload: { count: orgs.length } });

    return new Response(JSON.stringify({ ok: true, count: orgs.length, organizations: orgs, created: createdOrg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = (e as Error).message;
    await logSync({ action: "sync_organizations", status: "error", error_message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: msg === "forbidden" ? 403 : 500,
    });
  }
});
