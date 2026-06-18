import { corsHeaders, assertAdmin, grafanaFetch, serviceClient, logSync } from "../_shared/grafana.ts";

function isPersonalOrganizationName(name: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name.trim());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const actor = await assertAdmin(req);
    const svc = serviceClient();

    let createdOrg: any = null;
    let cleanupResult: any = null;
    let cleanupPersonal = false;
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      cleanupPersonal = !!body?.cleanup_personal_orgs;
      if (body?.create_name) {
        if (isPersonalOrganizationName(body.create_name)) {
          throw new Error("invalid_org_name: cannot create org with email-like name");
        }
        const r = await grafanaFetch("/api/orgs", { method: "POST", body: JSON.stringify({ name: body.create_name }) });
        if (!r.ok) throw new Error(`create_org_failed: ${JSON.stringify(r.body)}`);
        createdOrg = r.body;
      }
    }

    const list = await grafanaFetch("/api/orgs");
    if (!list.ok) throw new Error(`list_orgs_failed: ${list.status}`);
    const orgs = list.body as Array<{ id: number; name: string }>;

    const realOrgs = orgs.filter((o) => !isPersonalOrganizationName(o.name));
    const skippedOrgs = orgs.filter((o) => isPersonalOrganizationName(o.name));

    const now = new Date().toISOString();
    for (const o of realOrgs) {
      await svc.from("grafana_organizations").upsert({
        grafana_org_id: o.id, name: o.name, active: true, synced_at: now, atualizado_em: now,
      }, { onConflict: "grafana_org_id" });
    }

    const activeGrafanaIds = realOrgs.map((o) => o.id);
    let deactivateQuery = svc.from("grafana_organizations").update({ active: false, synced_at: now, atualizado_em: now });
    if (activeGrafanaIds.length > 0) {
      deactivateQuery = deactivateQuery.not("grafana_org_id", "in", `(${activeGrafanaIds.join(",")})`);
    }
    await deactivateQuery;

    // Optional: limpar personal orgs órfãs (0 ou 1 membro) no Grafana
    if (cleanupPersonal && skippedOrgs.length) {
      const deleted: any[] = [];
      for (const o of skippedOrgs) {
        const membersRes = await grafanaFetch(`/api/orgs/${o.id}/users`);
        const members = Array.isArray(membersRes.body) ? membersRes.body : [];
        if (members.length <= 1) {
          // remover membros antes (se houver) e apagar a org
          for (const m of members) {
            await grafanaFetch(`/api/orgs/${o.id}/users/${m.userId}`, { method: "DELETE" });
          }
          const delRes = await grafanaFetch(`/api/orgs/${o.id}`, { method: "DELETE" });
          deleted.push({ id: o.id, name: o.name, ok: delRes.ok });
        } else {
          deleted.push({ id: o.id, name: o.name, skipped: true, members: members.length });
        }
      }
      cleanupResult = { processed: skippedOrgs.length, deleted };
    }

    await logSync({
      actor_usuario_id: actor.id,
      action: "sync_organizations",
      status: "success",
      response_payload: { count: realOrgs.length, skipped_personal_orgs: skippedOrgs.map((o) => ({ id: o.id, name: o.name })), cleanupResult },
    });

    return new Response(JSON.stringify({ ok: true, count: realOrgs.length, organizations: realOrgs, skipped: skippedOrgs, created: createdOrg, cleanup: cleanupResult }), {
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
