// Shared authorization helpers for Edge Functions.
// Reuses the existing caller resolution (Ariia session token OR Supabase JWT).

import { getCallerUsuario } from "./grafana.ts";

export { getCallerUsuario };

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

/** True when the request carries the service_role JWT (function-to-function call). */
export function isInternalServiceCall(req: Request): boolean {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return false;
  const claims = decodeJwtClaims(jwt);
  return claims?.role === "service_role";
}

/** Any active Ariia user. Throws on missing/invalid auth. */
export async function requireCaller(req: Request) {
  return await getCallerUsuario(req);
}

/** Active Ariia user OR an internal service_role call. */
export async function requireCallerOrInternal(req: Request) {
  if (isInternalServiceCall(req)) return null;
  return await getCallerUsuario(req);
}

/** Only staff (everyone except CLIENTE). */
export async function requireStaff(req: Request) {
  const u = await getCallerUsuario(req);
  if (u.permissao === "CLIENTE") throw new Error("forbidden");
  return u;
}

export function authErrorResponse(e: unknown, corsHeaders: Record<string, string>) {
  const msg = (e as Error)?.message || "unauthorized";
  const status = msg === "forbidden" ? 403 : 401;
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export type CompanyTicketScope = {
  empresaIds: number[];
  unidadeIds: number[];
};

const uniqueNumbers = (values: unknown[]) =>
  Array.from(new Set(
    values
      .filter((v) => v !== null && v !== undefined && v !== "")
      .map((v) => Number(v))
      .filter(Number.isFinite),
  ));

export async function getCompanyTicketScopeByName(
  svc: any,
  companyName: string,
): Promise<CompanyTicketScope> {
  const { data: empresas } = await svc
    .from("empresas")
    .select("id")
    .or(`nome_fantasia.ilike.%${companyName}%,razao_social.ilike.%${companyName}%`);

  const empresaIds = uniqueNumbers((empresas ?? []).map((e: any) => e.id));
  if (empresaIds.length === 0) return { empresaIds: [], unidadeIds: [] };

  const { data: unidades } = await svc
    .from("unidades")
    .select("id")
    .in("empresa_id", empresaIds);

  return {
    empresaIds,
    unidadeIds: uniqueNumbers((unidades ?? []).map((u: any) => u.id)),
  };
}

export async function getUserCompanyGroupScope(
  svc: any,
  usuarioId: number,
  groupName: string,
): Promise<CompanyTicketScope> {
  let hasCompanyGroup = false;

  const { data: memberships } = await svc
    .from("support_group_members")
    .select("group_id")
    .eq("usuario_id", usuarioId)
    .eq("ativo", true);

  const groupIds = uniqueNumbers((memberships ?? []).map((m: any) => m.group_id));
  if (groupIds.length > 0) {
    const { data: groups } = await svc
      .from("support_groups")
      .select("id")
      .in("id", groupIds)
      .eq("ativo", true)
      .ilike("nome", `%${groupName}%`);

    hasCompanyGroup = !!groups?.length;
  }

  if (!hasCompanyGroup) {
    const { data: grafanaMemberships } = await svc
      .from("grafana_access_group_members")
      .select("group_id")
      .eq("usuario_id", usuarioId);

    const grafanaGroupIds = uniqueNumbers((grafanaMemberships ?? []).map((m: any) => m.group_id));
    if (grafanaGroupIds.length > 0) {
      const { data: grafanaGroups } = await svc
        .from("grafana_access_groups")
        .select("id")
        .in("id", grafanaGroupIds)
        .eq("active", true)
        .ilike("name", `%${groupName}%`);

      hasCompanyGroup = !!grafanaGroups?.length;
    }
  }

  if (!hasCompanyGroup) return { empresaIds: [], unidadeIds: [] };
  return getCompanyTicketScopeByName(svc, groupName);
}

export function addCompanyScopeOrClauses(orClauses: string[], scope: CompanyTicketScope) {
  if (scope.empresaIds.length > 0) orClauses.push(`empresa_id.in.(${scope.empresaIds.join(",")})`);
  if (scope.unidadeIds.length > 0) orClauses.push(`unidade_id.in.(${scope.unidadeIds.join(",")})`);
}

export function ticketMatchesCompanyScope(ticket: any, scope: CompanyTicketScope) {
  const empresaId = ticket?.empresa_id === null || ticket?.empresa_id === undefined ? NaN : Number(ticket.empresa_id);
  const unidadeId = ticket?.unidade_id === null || ticket?.unidade_id === undefined ? NaN : Number(ticket.unidade_id);
  return (Number.isFinite(empresaId) && scope.empresaIds.includes(empresaId)) ||
    (Number.isFinite(unidadeId) && scope.unidadeIds.includes(unidadeId));
}

/**
 * Verifica se o usuário Ariia informado pode visualizar o chamado.
 * Espelha a mesma lógica já usada por get-ticket-cliente / fn_can_view_ticket
 * (admin total, CLIENTE por empresa/unidade/solicitante, técnico por vínculo).
 */
export async function canUsuarioViewTicket(
  svc: any,
  usuarioId: number,
  ticketId: number,
): Promise<boolean> {
  const { data: user } = await svc
    .from("usuarios")
    .select("id, permissao, empresa_id, email, ativo, access_scope")
    .eq("id", usuarioId)
    .maybeSingle();
  if (!user || !user.ativo) return false;
  if (user.access_scope === "BLOCKED" || user.access_scope === "GRAFANA_ONLY") return false;

  const perm = user.permissao;
  if (perm === "SUPERADMIN" || perm === "ADMIN") return true;

  const { data: ticket } = await svc
    .from("tickets")
    .select("id, empresa_id, unidade_id, criado_por, tecnico_id, assigned_by, assigned_group_id, solicitante_email, solicitante_emails_extra")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) return false;

  const goodStorageScope = await getUserCompanyGroupScope(svc, usuarioId, "GoodStorage");
  if (ticketMatchesCompanyScope(ticket, goodStorageScope)) return true;

  const email = (user.email || "").toString().trim().toLowerCase();
  const extras: string[] = Array.isArray(ticket.solicitante_emails_extra) ? ticket.solicitante_emails_extra : [];
  const isSolicitante = !!email && (
    (ticket.solicitante_email || "").toString().trim().toLowerCase() === email ||
    extras.some((e) => (e || "").toString().trim().toLowerCase() === email)
  );
  if (isSolicitante) return true;

  if (perm === "CLIENTE") {
    if (!user.empresa_id) return ticket.criado_por === usuarioId;
    if (ticket.empresa_id !== user.empresa_id) return false;
    return true;
  }

  if (ticket.criado_por === usuarioId || ticket.tecnico_id === usuarioId || ticket.assigned_by === usuarioId) {
    return true;
  }
  if (ticket.assigned_group_id) {
    const { data: m } = await svc
      .from("support_group_members")
      .select("usuario_id")
      .eq("group_id", ticket.assigned_group_id)
      .eq("usuario_id", usuarioId)
      .eq("ativo", true)
      .maybeSingle();
    return !!m;
  }
  return false;
}
