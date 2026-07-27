// Shared authentication utilities for Edge Functions

const PBKDF2_ITERATIONS = 600000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_RENEW_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", encoder.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]
  );

  const hashBuffer = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial, 256
  );

  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const saltArray = Array.from(salt);

  return (
    saltArray.map((b) => b.toString(16).padStart(2, "0")).join("") +
    ":" +
    hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}

export async function verifyPasswordPBKDF2(password: string, storedHash: string): Promise<boolean> {
  const [saltHex, hashHex] = storedHash.split(":");
  if (!saltHex || !hashHex) return false;

  const saltMatch = saltHex.match(/.{2}/g);
  if (!saltMatch) return false;

  const salt = new Uint8Array(saltMatch.map((byte) => parseInt(byte, 16)));

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", encoder.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]
  );

  const hashBuffer = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial, 256
  );

  const computedHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0")).join("");

  return computedHash === hashHex;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (storedHash.includes(":")) {
    return await verifyPasswordPBKDF2(password, storedHash);
  }
  return false;
}

// SESSION MANAGEMENT

export function generateSessionToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSession(
  supabase: any, userId: number, req: Request
): Promise<{ token: string; expires_at: string } | null> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS); // sliding 24h window

  const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") || "unknown";
  const userAgent = req.headers.get("user-agent") || "unknown";

  const { error } = await supabase.from("sessions").insert({
    token, user_id: userId,
    expires_at: expiresAt.toISOString(),
    ip_address: ipAddress, user_agent: userAgent,
  });

  if (error) { console.error("Session creation error:", error); return null; }
  return { token, expires_at: expiresAt.toISOString() };
}

export async function validateSession(req: Request, supabase: any): Promise<number> {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) throw new Error("Token de sessão não fornecido");

  const { data: session, error } = await supabase
    .from("sessions")
    .select("user_id, expires_at, last_activity, criado_em")
    .eq("token", token)
    .maybeSingle();

  if (error || !session) throw new Error("Token de sessão inválido");
  const now = new Date();
  const expiresAtMs = new Date(session.expires_at).getTime();
  const activityAtMs = new Date(session.last_activity || session.criado_em || session.expires_at).getTime();

  if (expiresAtMs < now.getTime() && activityAtMs < now.getTime() - SESSION_RENEW_GRACE_MS) {
    await supabase.from("sessions").delete().eq("token", token);
    throw new Error("Sessão expirada");
  }

  const renewedExpiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  await supabase
    .from("sessions")
    .update({ last_activity: now.toISOString(), expires_at: renewedExpiresAt })
    .eq("token", token);
  return session.user_id;
}

export async function deleteSession(token: string, supabase: any): Promise<void> {
  await supabase.from("sessions").delete().eq("token", token);
}

export async function deleteAllUserSessions(userId: number, supabase: any): Promise<void> {
  await supabase.from("sessions").delete().eq("user_id", userId);
}
