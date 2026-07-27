// Shared authorization helpers for Edge Functions.
// Reuses the existing caller resolution (Ariia session token OR Supabase JWT).

import { getCallerUsuario } from "./grafana.ts";

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
