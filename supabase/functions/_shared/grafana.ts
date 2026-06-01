// Shared Grafana API client + Ariia admin verification

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

export const GRAFANA_URL = (Deno.env.get("GRAFANA_URL") || "").replace(/\/+$/, "");
export const GRAFANA_ADMIN_USER = Deno.env.get("GRAFANA_ADMIN_USER")!;
export const GRAFANA_ADMIN_PASSWORD = Deno.env.get("GRAFANA_ADMIN_PASSWORD")!;

export function serviceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Verifies the caller's Supabase JWT and returns the linked Ariia usuario. */
export async function getCallerUsuario(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) throw new Error("missing_auth");

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userRes, error } = await userClient.auth.getUser();
  if (error || !userRes?.user) throw new Error("invalid_auth");

  const svc = serviceClient();
  const { data: u, error: e2 } = await svc
    .from("usuarios")
    .select("id, nome, email, permissao, ativo, auth_user_id")
    .eq("auth_user_id", userRes.user.id)
    .maybeSingle();

  if (e2 || !u) throw new Error("usuario_not_found");
  if (!u.ativo) throw new Error("usuario_inativo");
  return u;
}

export async function assertAdmin(req: Request) {
  const u = await getCallerUsuario(req);
  if (!["SUPERADMIN", "ADMIN"].includes(u.permissao)) {
    throw new Error("forbidden");
  }
  return u;
}

// ---------- Grafana HTTP client ----------

function grafanaAuthHeader() {
  return "Basic " + btoa(`${GRAFANA_ADMIN_USER}:${GRAFANA_ADMIN_PASSWORD}`);
}

export interface GrafanaRequestInit extends RequestInit {
  orgId?: number;
}

export async function grafanaFetch(path: string, init: GrafanaRequestInit = {}) {
  if (!GRAFANA_URL) throw new Error("GRAFANA_URL not configured");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", grafanaAuthHeader());
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  if (init.orgId) headers.set("X-Grafana-Org-Id", String(init.orgId));

  const res = await fetch(`${GRAFANA_URL}${path}`, { ...init, headers });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
}

export async function logSync(opts: {
  usuario_id?: number | null;
  actor_usuario_id?: number | null;
  action: string;
  status: "success" | "error" | "skipped";
  request_payload?: any;
  response_payload?: any;
  error_message?: string;
}) {
  try {
    const svc = serviceClient();
    await svc.from("grafana_sync_logs").insert({
      usuario_id: opts.usuario_id ?? null,
      actor_usuario_id: opts.actor_usuario_id ?? null,
      action: opts.action,
      status: opts.status,
      request_payload: opts.request_payload ?? null,
      response_payload: opts.response_payload ?? null,
      error_message: opts.error_message ?? null,
    });
  } catch (e) {
    console.error("logSync failed", e);
  }
}

// ---------- Core user sync logic (shared by sync-user and sync-all) ----------

export async function syncUserToGrafana(usuario_id: number, actor_id?: number | null) {
  const svc = serviceClient();

  const { data: u, error: ue } = await svc
    .from("usuarios")
    .select("id, nome, email, permissao, ativo")
    .eq("id", usuario_id)
    .maybeSingle();
  if (ue || !u) throw new Error("usuario_not_found");

  // Load existing Grafana link
  const { data: existingLink } = await svc
    .from("grafana_user_links")
    .select("*")
    .eq("usuario_id", usuario_id)
    .maybeSingle();

  // Lookup or create Grafana user
  let grafanaUserId: number | null = existingLink?.grafana_user_id ?? null;
  let grafanaLogin: string = existingLink?.grafana_login ?? u.email;

  const lookup = await grafanaFetch(
    `/api/users/lookup?loginOrEmail=${encodeURIComponent(u.email)}`
  );

  if (lookup.ok && lookup.body?.id) {
    grafanaUserId = lookup.body.id;
    grafanaLogin = lookup.body.login || u.email;
  } else if (lookup.status === 404) {
    // Create user
    const randPwd = crypto.randomUUID() + crypto.randomUUID();
    const created = await grafanaFetch("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        name: u.nome, email: u.email, login: u.email, password: randPwd,
      }),
    });
    if (!created.ok) throw new Error(`create_user_failed: ${JSON.stringify(created.body)}`);
    grafanaUserId = created.body?.id;
    grafanaLogin = u.email;
  } else if (!lookup.ok) {
    throw new Error(`lookup_failed: ${lookup.status} ${JSON.stringify(lookup.body)}`);
  }

  if (!grafanaUserId) throw new Error("no_grafana_user_id");

  // Upsert link
  await svc.from("grafana_user_links").upsert({
    usuario_id,
    grafana_user_id: grafanaUserId,
    grafana_login: grafanaLogin,
    grafana_email: u.email,
    last_synced_at: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  }, { onConflict: "usuario_id" });

  // If inactive, disable + remove from all orgs
  if (!u.ativo) {
    await grafanaFetch(`/api/admin/users/${grafanaUserId}/disable`, { method: "POST" });
    await grafanaFetch(`/api/admin/users/${grafanaUserId}/permissions`, {
      method: "PUT", body: JSON.stringify({ isGrafanaAdmin: false }),
    });
    const { data: orgs } = await svc.from("grafana_organizations").select("grafana_org_id");
    for (const o of orgs || []) {
      await grafanaFetch(`/api/orgs/${o.grafana_org_id}/users/${grafanaUserId}`, { method: "DELETE" });
    }
    await logSync({ usuario_id, actor_usuario_id: actor_id, action: "sync_user_disabled", status: "success" });
    return { is_grafana_admin: false, orgs: [] };
  }

  // Effective permissions
  const { data: permsRaw, error: pe } = await svc.rpc("grafana_effective_permissions", { _usuario_id: usuario_id });
  if (pe) throw new Error(`perms_failed: ${pe.message}`);
  const perms = permsRaw as { is_grafana_admin: boolean; orgs: Array<{ grafana_org_id: number; role: string }> };

  // Set/unset GrafanaAdmin
  await grafanaFetch(`/api/admin/users/${grafanaUserId}/permissions`, {
    method: "PUT",
    body: JSON.stringify({ isGrafanaAdmin: !!perms.is_grafana_admin }),
  });

  // Reconcile orgs
  const desiredByOrg = new Map<number, string>();
  for (const o of perms.orgs || []) desiredByOrg.set(o.grafana_org_id, o.role);

  const { data: allOrgs } = await svc.from("grafana_organizations").select("grafana_org_id, active");

  for (const o of allOrgs || []) {
    const orgId = o.grafana_org_id;
    const desired = desiredByOrg.get(orgId);

    // Check current membership
    const orgUsers = await grafanaFetch(`/api/orgs/${orgId}/users`);
    const currentMember = Array.isArray(orgUsers.body)
      ? orgUsers.body.find((m: any) => m.userId === grafanaUserId)
      : null;

    if (desired) {
      if (!currentMember) {
        await grafanaFetch(`/api/orgs/${orgId}/users`, {
          method: "POST",
          body: JSON.stringify({ loginOrEmail: grafanaLogin, role: desired }),
        });
      } else if (currentMember.role !== desired) {
        await grafanaFetch(`/api/orgs/${orgId}/users/${grafanaUserId}`, {
          method: "PATCH",
          body: JSON.stringify({ role: desired }),
        });
      }
    } else if (currentMember) {
      await grafanaFetch(`/api/orgs/${orgId}/users/${grafanaUserId}`, { method: "DELETE" });
    }
  }

  await logSync({
    usuario_id, actor_usuario_id: actor_id, action: "sync_user", status: "success",
    response_payload: perms,
  });

  return perms;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};
