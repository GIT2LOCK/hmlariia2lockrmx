import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, assertAdmin, serviceClient, grafanaFetch, logSync } from "../_shared/grafana.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const caller = await assertAdmin(req);
    if (caller.permissao !== "SUPERADMIN") {
      return new Response(JSON.stringify({ error: "forbidden_superadmin_only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const usuario_id = Number(body?.usuario_id);
    if (!usuario_id) {
      return new Response(JSON.stringify({ error: "usuario_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (usuario_id === caller.id) {
      return new Response(JSON.stringify({ error: "cannot_delete_self" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const svc = serviceClient();
    const steps: Record<string, { ok: boolean; error?: string }> = {};

    // 1) Look up grafana link (before deletion clears it)
    const { data: link } = await svc
      .from("grafana_user_links")
      .select("grafana_user_id")
      .eq("usuario_id", usuario_id)
      .maybeSingle();

    // 2) Delete from Grafana
    if (link?.grafana_user_id) {
      try {
        const r = await grafanaFetch(`/api/admin/users/${link.grafana_user_id}`, { method: "DELETE" });
        // 404 = already gone in Grafana, treat as success
        steps.grafana = (r.ok || r.status === 404) ? { ok: true } : { ok: false, error: `status ${r.status}` };
      } catch (e) {
        steps.grafana = { ok: false, error: (e as Error).message };
      }
    } else {
      steps.grafana = { ok: true };
    }

    // 3) Cascade delete in Ariia DB
    let authUserId: string | null = null;
    try {
      const { data, error } = await svc.rpc("fn_delete_usuario_cascade", { _usuario_id: usuario_id });
      if (error) throw error;
      authUserId = (data as any)?.auth_user_id ?? null;
      steps.db = { ok: true };
    } catch (e) {
      steps.db = { ok: false, error: (e as Error).message };
      await logSync({
        actor_usuario_id: caller.id, usuario_id, action: "delete_user", status: "error",
        error_message: `db: ${(e as Error).message}`,
      });
      return new Response(JSON.stringify({ error: "db_delete_failed", steps }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4) Delete from auth.users
    if (authUserId) {
      try {
        const adm = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        const { error } = await adm.auth.admin.deleteUser(authUserId);
        steps.auth = error ? { ok: false, error: error.message } : { ok: true };
      } catch (e) {
        steps.auth = { ok: false, error: (e as Error).message };
      }
    } else {
      steps.auth = { ok: true };
    }

    const allOk = Object.values(steps).every((s) => s.ok);
    await logSync({
      // Do not write usuario_id after deletion: the user must leave no target-user trace in public tables.
      actor_usuario_id: caller.id, action: "delete_user",
      status: allOk ? "success" : "error",
      response_payload: steps,
    });

    return new Response(JSON.stringify({ ok: allOk, steps }), {
      status: allOk ? 200 : 207,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = (e as Error).message;
    return new Response(JSON.stringify({ error: msg }), {
      status: msg === "forbidden" ? 403 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
