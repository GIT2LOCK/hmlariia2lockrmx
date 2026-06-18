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
  const trace: any = { usuario_id, steps: [] };
  const step = (name: string, data: any = {}) => {
    trace.steps.push({ name, ts: new Date().toISOString(), ...data });
    console.log(`[grafana-sync] step=${name}`, JSON.stringify(data));
  };

  try {
    // 1) Apply domain rule first (may set empresa_id + permissao for non-manual users)
    try {
      const { data: dr } = await svc.rpc("apply_domain_rule", { _usuario_id: usuario_id });
      step("apply_domain_rule", { result: dr });
    } catch (e) {
      step("apply_domain_rule_error", { error: (e as Error).message });
    }

    const { data: u, error: ue } = await svc
      .from("usuarios")
      .select("id, nome, email, permissao, ativo, empresa_id")
      .eq("id", usuario_id)
      .maybeSingle();
    if (ue || !u) throw new Error("usuario_not_found");

    const domain = (u.email || "").toLowerCase().split("@")[1] || "";
    step("user_loaded", {
      email: u.email, domain, permissao: u.permissao,
      empresa_id: u.empresa_id, ativo: u.ativo,
    });

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
          if (inserts.length) await svc.from("grafana_user_org_permissions").insert(inserts);

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
            if (groupInserts.length) await svc.from("grafana_access_group_members").insert(groupInserts);
          }
          step("automations_applied", { count: actions.length });
        }
      } catch (e) {
        step("automations_error", { error: (e as Error).message });
      }
    }

    // 3) Lookup or create Grafana user
    let grafanaUserId: number | null = existingLink?.grafana_user_id ?? null;
    let grafanaLogin: string = existingLink?.grafana_login ?? u.email;

    const lookup = await grafanaFetch(`/api/users/lookup?loginOrEmail=${encodeURIComponent(u.email)}`);
    if (lookup.ok && lookup.body?.id) {
      grafanaUserId = lookup.body.id;
      grafanaLogin = lookup.body.login || u.email;
      step("grafana_user_found", { grafanaUserId, grafanaLogin });
    } else if (lookup.status === 404) {
      const randPwd = crypto.randomUUID() + crypto.randomUUID();
      const created = await grafanaFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ name: u.nome, email: u.email, login: u.email, password: randPwd }),
      });
      if (!created.ok) throw new Error(`create_user_failed: ${JSON.stringify(created.body)}`);
      grafanaUserId = created.body?.id;
      grafanaLogin = u.email;
      step("grafana_user_created", { grafanaUserId });
    } else {
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

    // 3.5) Clean up "personal organizations" auto-created by Grafana on first OAuth login
    //      (Grafana cria uma org com nome = email quando o usuário não é auto-atribuído.)
    const isPersonalOrgName = (name: string) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((name || "").trim());
    try {
      const myOrgsRes = await grafanaFetch(`/api/users/${grafanaUserId}/orgs`);
      const myOrgs = Array.isArray(myOrgsRes.body) ? myOrgsRes.body : [];
      const personalOrgs = myOrgs.filter((o: any) => isPersonalOrgName(o.name));
      const cleanupResults: any[] = [];
      for (const o of personalOrgs) {
        const leaveRes = await grafanaFetch(`/api/orgs/${o.orgId}/users/${grafanaUserId}`, { method: "DELETE" });
        const membersRes = await grafanaFetch(`/api/orgs/${o.orgId}/users`);
        const remaining = Array.isArray(membersRes.body) ? membersRes.body : [];
        let orgDeleted = false;
        if (remaining.length === 0) {
          const delRes = await grafanaFetch(`/api/orgs/${o.orgId}`, { method: "DELETE" });
          orgDeleted = delRes.ok;
        }
        cleanupResults.push({ orgId: o.orgId, name: o.name, left: leaveRes.ok, orgDeleted, remaining: remaining.length });
      }
      if (personalOrgs.length) step("personal_orgs_cleanup", { cleanupResults });
    } catch (e) {
      step("personal_orgs_cleanup_error", { error: (e as Error).message });
    }

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
      step("disabled", {});
      await logSync({ usuario_id, actor_usuario_id: actor_id, action: "sync_user_disabled", status: "success", response_payload: trace });
      return { is_grafana_admin: false, orgs: [] };
    }

    // 5) Determinar permissões desejadas
    //    Mescla (a) org da empresa vinculada como Viewer mínimo
    //           (b) permissões individuais + grupos via grafana_effective_permissions
    //           (c) SUPERADMIN vira Admin em todas as orgs (já feito pela RPC)
    let isGrafanaAdmin = false;
    const desiredMap = new Map<number, "Viewer" | "Editor" | "Admin">();
    const rank: Record<string, number> = { Viewer: 1, Editor: 2, Admin: 3 };
    const setMax = (orgId: number, role: "Viewer" | "Editor" | "Admin") => {
      const cur = desiredMap.get(orgId);
      if (!cur || rank[role] > rank[cur]) desiredMap.set(orgId, role);
    };

    if (u.empresa_id) {
      const { data: emp } = await svc
        .from("empresas")
        .select("id, nome_fantasia, grafana_organization_id")
        .eq("id", u.empresa_id)
        .maybeSingle();
      step("empresa_lookup", { empresa: emp });
      if (emp?.grafana_organization_id) {
        const { data: org } = await svc
          .from("grafana_organizations")
          .select("grafana_org_id, name, active")
          .eq("id", emp.grafana_organization_id)
          .maybeSingle();
        step("grafana_org_lookup", { org });
        if (org?.grafana_org_id && org.active) {
          setMax(org.grafana_org_id, "Viewer");
        } else {
          step("warning", { msg: "empresa.grafana_organization_id inválida ou inativa" });
        }
      } else {
        step("warning", { msg: "empresa sem grafana_organization_id vinculada" });
      }
    } else if (u.permissao === "CLIENTE") {
      step("warning", { msg: "CLIENTE sem empresa_id — nenhuma org Grafana atribuída" });
    }

    const { data: permsRaw, error: pe } = await svc.rpc("grafana_effective_permissions", { _usuario_id: usuario_id });
    if (pe) throw new Error(`perms_failed: ${pe.message}`);
    const perms = permsRaw as { is_grafana_admin: boolean; orgs: Array<{ grafana_org_id: number; role: string }> };
    isGrafanaAdmin = !!perms.is_grafana_admin;
    for (const o of (perms.orgs || [])) {
      if (o.grafana_org_id) setMax(o.grafana_org_id, mapAriiaToGrafanaRole(o.role));
    }
    step("effective_perms", { isGrafanaAdmin, orgs: perms.orgs });

    const desired = Array.from(desiredMap.entries()).map(([grafana_org_id, role]) => ({ grafana_org_id, role }));
    step("desired_state", { isGrafanaAdmin, desired });

    // 6) Set isGrafanaAdmin
    await grafanaFetch(`/api/admin/users/${grafanaUserId}/permissions`, {
      method: "PUT",
      body: JSON.stringify({ isGrafanaAdmin }),
    });

    // 7) Reconcile orgs — união(orgs ativas no banco, desejadas, orgs atuais no Grafana, Main Org)
    const knownIds = new Set<number>();
    knownIds.add(1);
    for (const id of desiredMap.keys()) knownIds.add(id);
    const { data: allOrgs } = await svc.from("grafana_organizations").select("grafana_org_id").eq("active", true);
    for (const o of allOrgs || []) knownIds.add((o as any).grafana_org_id);
    const currentOrgsRes = await grafanaFetch(`/api/users/${grafanaUserId}/orgs`);
    const currentOrgs = Array.isArray(currentOrgsRes.body) ? currentOrgsRes.body : [];
    for (const o of currentOrgs) knownIds.add(o.orgId);

    const reconcileResults: any[] = [];
    for (const orgId of knownIds) {
      const wanted = desiredMap.get(orgId);
      const orgUsers = await grafanaFetch(`/api/orgs/${orgId}/users`);
      const currentMember = Array.isArray(orgUsers.body)
        ? orgUsers.body.find((m: any) => m.userId === grafanaUserId)
        : null;

      let action = "noop";
      if (wanted) {
        if (!currentMember) {
          const r = await grafanaFetch(`/api/orgs/${orgId}/users`, {
            method: "POST",
            body: JSON.stringify({ loginOrEmail: grafanaLogin, role: wanted }),
          });
          action = r.ok ? "added" : `add_failed:${r.status}`;
        } else if (currentMember.role !== wanted) {
          const r = await grafanaFetch(`/api/orgs/${orgId}/users/${grafanaUserId}`, {
            method: "PATCH",
            body: JSON.stringify({ role: wanted }),
          });
          action = r.ok ? "role_updated" : `patch_failed:${r.status}`;
        }
      } else if (currentMember) {
        const r = await grafanaFetch(`/api/orgs/${orgId}/users/${grafanaUserId}`, { method: "DELETE" });
        action = r.ok ? "removed" : `remove_failed:${r.status}`;
      }
      reconcileResults.push({ orgId, wanted: wanted || null, current: currentMember?.role || null, action });
    }
    step("reconciled", { reconcileResults });

    await logSync({
      usuario_id, actor_usuario_id: actor_id, action: "sync_user", status: "success",
      response_payload: { ...trace, permissao: u.permissao, is_grafana_admin: isGrafanaAdmin, orgs: desired },
    });

    return { is_grafana_admin: isGrafanaAdmin, orgs: desired, trace };
  } catch (err) {
    step("fatal_error", { error: (err as Error).message });
    await logSync({
      usuario_id, actor_usuario_id: actor_id, action: "sync_user", status: "error",
      error_message: (err as Error).message, response_payload: trace,
    });
    throw err;
  }
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ariia-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};
