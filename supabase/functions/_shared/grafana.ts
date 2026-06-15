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

function decodeJwtClaims(jwt: string): Record<string, any> | null {
  try {
    const part = jwt.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

export async function getCallerUsuario(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const ariiaToken = req.headers.get("x-ariia-token") || "";
  if (!jwt && !ariiaToken) throw new Error("missing_auth");

  const svc = serviceClient();

  async function lookupBySession(token: string) {
    const { data: session } = await svc
      .from("sessions")
      .select("user_id, expires_at")
      .eq("token", token)
      .maybeSingle();
    if (!session) return null;
    if (new Date(session.expires_at) < new Date()) throw new Error("session_expired");
    const { data: u } = await svc
      .from("usuarios")
      .select("id, nome, email, permissao, ativo, auth_user_id")
      .eq("id", session.user_id)
      .maybeSingle();
    return u || null;
  }

  // 1) Legacy Ariia token via custom header
  if (ariiaToken) {
    const u = await lookupBySession(ariiaToken);
    if (u) {
      if (!u.ativo) throw new Error("usuario_inativo");
      return u;
    }
  }

  const claims = jwt ? decodeJwtClaims(jwt) : null;

  // 2) Non-JWT bearer → try sessions table
  if (jwt && !claims) {
    const u = await lookupBySession(jwt);
    if (!u) throw new Error("invalid_auth");
    if (!u.ativo) throw new Error("usuario_inativo");
    return u;
  }

  // 3) JWT decoded
  if (claims) {
    let query = svc.from("usuarios").select("id, nome, email, permissao, ativo, auth_user_id");
    if (claims.ariia_usuario_id) {
      query = query.eq("id", claims.ariia_usuario_id);
    } else if (claims.sub && claims.role !== "anon") {
      query = query.eq("auth_user_id", claims.sub);
    } else if (claims.email) {
      query = query.eq("email", claims.email);
    } else {
      throw new Error("invalid_auth");
    }
    const { data: u, error: e2 } = await query.maybeSingle();
    if (e2 || !u) throw new Error("usuario_not_found");
    if (!u.ativo) throw new Error("usuario_inativo");
    return u;
  }

  throw new Error("invalid_auth");
}

export async function assertAdmin(req: Request) {
  const u = await getCallerUsuario(req);
  if (!["SUPERADMIN", "ADMIN"].includes(u.permissao)) {
    throw new Error("forbidden");
  }
  return u;
}

// ---------- Role mapping ----------

/** Maps an Ariia permission to a valid Grafana org role.
 *  Grafana only accepts Viewer | Editor | Admin. The role "Cliente"
 *  never goes to Grafana — it is always mapped to Viewer. */
export function mapAriiaToGrafanaRole(permissao: string): "Viewer" | "Editor" | "Admin" {
  switch (permissao) {
    case "SUPERADMIN":
    case "ADMIN":
      return "Admin";
    case "USER":
      return "Editor";
    case "CLIENTE":
    case "VIEWER":
    case "TV_VIEW":
    default:
      return "Viewer";
  }
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
  const method = (init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", grafanaAuthHeader());
  headers.set("Accept", "application/json");
  headers.set("User-Agent", "Ariia-Grafana-Sync/1.0");
  if (method !== "GET" && method !== "HEAD" && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (init.orgId) headers.set("X-Grafana-Org-Id", String(init.orgId));

  const url = `${GRAFANA_URL}${path}`;
  const res = await fetch(url, { ...init, method, headers, redirect: "follow" });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    console.error(`grafanaFetch ${method} ${url} -> ${res.status}`, typeof body === "string" ? body.slice(0, 200) : body);
  }
  return { ok: res.ok, status: res.status, body, url };
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

// ---------- Core user sync logic ----------

export async function syncUserToGrafana(usuario_id: number, actor_id?: number | null) {
  const svc = serviceClient();

  // 1) Apply domain rule first (may overwrite permissao/empresa_id for new users)
  try {
    await svc.rpc("apply_domain_rule", { _usuario_id: usuario_id });
  } catch (e) {
    console.warn("apply_domain_rule failed", e);
  }

  const { data: u, error: ue } = await svc
    .from("usuarios")
    .select("id, nome, email, permissao, ativo, empresa_id")
    .eq("id", usuario_id)
    .maybeSingle();
  if (ue || !u) throw new Error("usuario_not_found");

  const { data: existingLink } = await svc
    .from("grafana_user_links")
    .select("*")
    .eq("usuario_id", usuario_id)
    .maybeSingle();

  // 2) Apply automation actions (orgs / groups) — additive only
  if (u.ativo) {
    try {
      const { data: autoActions } = await svc.rpc("grafana_evaluate_automations", { _usuario_id: usuario_id });
      const actions = Array.isArray(autoActions) ? autoActions : [];
      if (actions.length) {
        const { data: existingPerms } = await svc
          .from("grafana_user_org_permissions")
          .select("grafana_organization_id")
          .eq("usuario_id", usuario_id);
        const existingOrgIds = new Set((existingPerms || []).map((p: any) => p.grafana_organization_id));

        const inserts = actions
          .filter((a: any) => a.grafana_organization_id && !existingOrgIds.has(a.grafana_organization_id))
          .map((a: any) => ({
            usuario_id,
            grafana_organization_id: a.grafana_organization_id,
            role: mapAriiaToGrafanaRole(a.role) || a.role,
            enabled: true,
          }));
        if (inserts.length) {
          await svc.from("grafana_user_org_permissions").insert(inserts);
        }

        const groupActions = actions.filter((a: any) => a.group_id);
        if (groupActions.length) {
          const { data: existingGroups } = await svc
            .from("grafana_access_group_members")
            .select("group_id")
            .eq("usuario_id", usuario_id);
          const existingGroupIds = new Set((existingGroups || []).map((g: any) => g.group_id));
          const groupInserts = groupActions
            .filter((a: any) => !existingGroupIds.has(a.group_id))
            .map((a: any) => ({ usuario_id, group_id: a.group_id }));
          if (groupInserts.length) {
            await svc.from("grafana_access_group_members").insert(groupInserts);
          }
        }
      }
    } catch (e) {
      await logSync({
        usuario_id, actor_usuario_id: actor_id,
        action: "automation_applied", status: "error",
        error_message: (e as Error).message,
      });
    }
  }

  // 3) Lookup or create Grafana user
  let grafanaUserId: number | null = existingLink?.grafana_user_id ?? null;
  let grafanaLogin: string = existingLink?.grafana_login ?? u.email;

  const lookup = await grafanaFetch(
    `/api/users/lookup?loginOrEmail=${encodeURIComponent(u.email)}`
  );

  if (lookup.ok && lookup.body?.id) {
    grafanaUserId = lookup.body.id;
    grafanaLogin = lookup.body.login || u.email;
  } else if (lookup.status === 404) {
    const randPwd = crypto.randomUUID() + crypto.randomUUID();
    const created = await grafanaFetch("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ name: u.nome, email: u.email, login: u.email, password: randPwd }),
    });
    if (!created.ok) throw new Error(`create_user_failed: ${JSON.stringify(created.body)}`);
    grafanaUserId = created.body?.id;
    grafanaLogin = u.email;
  } else if (!lookup.ok) {
    throw new Error(`lookup_failed: ${lookup.status} ${JSON.stringify(lookup.body)}`);
  }

  if (!grafanaUserId) throw new Error("no_grafana_user_id");

  await svc.from("grafana_user_links").upsert({
    usuario_id,
    grafana_user_id: grafanaUserId,
    grafana_login: grafanaLogin,
    grafana_email: u.email,
    last_synced_at: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  }, { onConflict: "usuario_id" });

  // 4) Inactive: disable + remove from all orgs
  if (!u.ativo) {
    await grafanaFetch(`/api/admin/users/${grafanaUserId}/disable`, { method: "POST" });
    await grafanaFetch(`/api/admin/users/${grafanaUserId}/permissions`, {
      method: "PUT", body: JSON.stringify({ isGrafanaAdmin: false }),
    });
    const { data: orgs } = await svc.from("grafana_organizations").select("grafana_org_id").eq("active", true);
    for (const o of orgs || []) {
      await grafanaFetch(`/api/orgs/${o.grafana_org_id}/users/${grafanaUserId}`, { method: "DELETE" });
    }
    await logSync({ usuario_id, actor_usuario_id: actor_id, action: "sync_user_disabled", status: "success" });
    return { is_grafana_admin: false, orgs: [] };
  }

  // 5) Determine effective desired permissions
  // CLIENTE: only the org of their empresa, as Viewer.
  let desired: Array<{ grafana_org_id: number; role: "Viewer" | "Editor" | "Admin" }> = [];
  let isGrafanaAdmin = false;

  if (u.permissao === "CLIENTE") {
    if (u.empresa_id) {
      const { data: emp } = await svc
        .from("empresas")
        .select("grafana_organization_id")
        .eq("id", u.empresa_id)
        .maybeSingle();
      if (emp?.grafana_organization_id) {
        const { data: org } = await svc
          .from("grafana_organizations")
          .select("grafana_org_id")
          .eq("id", emp.grafana_organization_id)
          .maybeSingle();
        if (org?.grafana_org_id) {
          desired = [{ grafana_org_id: org.grafana_org_id, role: "Viewer" }];
        }
      }
    }
  } else {
    const { data: permsRaw, error: pe } = await svc.rpc("grafana_effective_permissions", { _usuario_id: usuario_id });
    if (pe) throw new Error(`perms_failed: ${pe.message}`);
    const perms = permsRaw as { is_grafana_admin: boolean; orgs: Array<{ grafana_org_id: number; role: string }> };
    isGrafanaAdmin = !!perms.is_grafana_admin;
    desired = (perms.orgs || []).map((o) => ({
      grafana_org_id: o.grafana_org_id,
      role: mapAriiaToGrafanaRole(o.role) || (o.role as any),
    }));
  }

  // 6) Set isGrafanaAdmin
  await grafanaFetch(`/api/admin/users/${grafanaUserId}/permissions`, {
    method: "PUT",
    body: JSON.stringify({ isGrafanaAdmin }),
  });

  // 7) Reconcile orgs
  const desiredByOrg = new Map<number, string>();
  for (const o of desired) desiredByOrg.set(o.grafana_org_id, o.role);

  const { data: allOrgs } = await svc.from("grafana_organizations").select("grafana_org_id, active").eq("active", true);

  for (const o of allOrgs || []) {
    const orgId = o.grafana_org_id;
    const wanted = desiredByOrg.get(orgId);

    const orgUsers = await grafanaFetch(`/api/orgs/${orgId}/users`);
    const currentMember = Array.isArray(orgUsers.body)
      ? orgUsers.body.find((m: any) => m.userId === grafanaUserId)
      : null;

    if (wanted) {
      if (!currentMember) {
        await grafanaFetch(`/api/orgs/${orgId}/users`, {
          method: "POST",
          body: JSON.stringify({ loginOrEmail: grafanaLogin, role: wanted }),
        });
      } else if (currentMember.role !== wanted) {
        await grafanaFetch(`/api/orgs/${orgId}/users/${grafanaUserId}`, {
          method: "PATCH",
          body: JSON.stringify({ role: wanted }),
        });
      }
    } else if (currentMember) {
      await grafanaFetch(`/api/orgs/${orgId}/users/${grafanaUserId}`, { method: "DELETE" });
    }
  }

  await logSync({
    usuario_id, actor_usuario_id: actor_id, action: "sync_user", status: "success",
    response_payload: { permissao: u.permissao, is_grafana_admin: isGrafanaAdmin, orgs: desired },
  });

  return { is_grafana_admin: isGrafanaAdmin, orgs: desired };
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};
