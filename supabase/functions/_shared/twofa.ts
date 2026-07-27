// Short-lived, signed 2FA challenge tokens.
// Used so that verify-2fa never trusts a raw `userId` coming from the client.

const KEY_MATERIAL = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TTL_SECONDS = 5 * 60;

async function hmac(payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(KEY_MATERIAL),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Issued by `login` after the password was validated, consumed by `verify-2fa`. */
export async function signChallengeToken(userId: number): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = `${userId}.${exp}`;
  return `${payload}.${await hmac(payload)}`;
}

/** Returns the userId when the token is valid and not expired, otherwise null. */
export async function verifyChallengeToken(token: unknown): Promise<number | null> {
  if (typeof token !== "string" || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [uidStr, expStr, sig] = parts;
  const uid = Number(uidStr);
  const exp = Number(expStr);
  if (!Number.isFinite(uid) || !Number.isFinite(exp)) return null;
  if (exp * 1000 < Date.now()) return null;
  const expected = await hmac(`${uidStr}.${expStr}`);
  if (!timingSafeEqual(expected, sig)) return null;
  return uid;
}
