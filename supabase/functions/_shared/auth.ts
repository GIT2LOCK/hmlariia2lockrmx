// Shared authentication utilities for Edge Functions

const PBKDF2_ITERATIONS = 600000; // OWASP recommendation for PBKDF2-SHA256

// ============================================================
// PASSWORD HASHING WITH PBKDF2 (per-user salt, 600k iterations)
// ============================================================

/**
 * Hash password using PBKDF2 with random per-user salt
 * Returns format: "salt:hash" where both are hex-encoded
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256 // 32 bytes
  );

  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const saltArray = Array.from(salt);

  // Store salt and hash together
  return (
    saltArray.map((b) => b.toString(16).padStart(2, "0")).join("") +
    ":" +
    hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}

/**
 * Verify password against PBKDF2 hash (new format with per-user salt)
 */
export async function verifyPasswordPBKDF2(
  password: string,
  storedHash: string
): Promise<boolean> {
  const [saltHex, hashHex] = storedHash.split(":");

  if (!saltHex || !hashHex) {
    return false;
  }

  const saltMatch = saltHex.match(/.{2}/g);
  if (!saltMatch) {
    return false;
  }

  const salt = new Uint8Array(saltMatch.map((byte) => parseInt(byte, 16)));

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const computedHash = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computedHash === hashHex;
}

/**
 * Legacy hash function for backward compatibility during migration
 * Uses single SHA-256 with global salt
 */
export async function hashPasswordLegacy(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = Deno.env.get("PASSWORD_SALT") || "webcontador_salt_2024";
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Hybrid password verification that supports both old and new formats
 * Automatically migrates old hashes to new format on successful login
 */
export async function verifyPasswordHybrid(
  password: string,
  storedHash: string,
  userId: number,
  supabase: any
): Promise<boolean> {
  // Check if new format (contains ':')
  if (storedHash.includes(":")) {
    return await verifyPasswordPBKDF2(password, storedHash);
  }

  // Old format - verify with legacy method
  const legacyHash = await hashPasswordLegacy(password);
  if (legacyHash === storedHash) {
    // Rehash with new method and update database
    const newHash = await hashPassword(password);
    await supabase
      .from("tb_usuario")
      .update({ senha: newHash })
      .eq("user_id", userId);

    console.log(`Migrated password hash for user ${userId} to PBKDF2`);
    return true;
  }

  return false;
}

// ============================================================
// SESSION MANAGEMENT
// ============================================================

/**
 * Generate a cryptographically secure session token
 */
export function generateSessionToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Create a new session in the database
 */
export async function createSession(
  supabase: any,
  userId: number,
  req: Request
): Promise<{ token: string; expires_at: string } | null> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";

  const userAgent = req.headers.get("user-agent") || "unknown";

  const { error } = await supabase.from("sessions").insert({
    token,
    user_id: userId,
    expires_at: expiresAt.toISOString(),
    ip_address: ipAddress,
    user_agent: userAgent,
  });

  if (error) {
    console.error("Session creation error:", error);
    return null;
  }

  return {
    token,
    expires_at: expiresAt.toISOString(),
  };
}

/**
 * Validate session token and return user_id
 * Throws error if invalid/expired
 */
export async function validateSession(
  req: Request,
  supabase: any
): Promise<number> {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    throw new Error("Token de sessão não fornecido");
  }

  const { data: session, error } = await supabase
    .from("sessions")
    .select("user_id, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (error || !session) {
    throw new Error("Token de sessão inválido");
  }

  if (new Date(session.expires_at) < new Date()) {
    // Clean up expired session
    await supabase.from("sessions").delete().eq("token", token);
    throw new Error("Sessão expirada");
  }

  // Update last activity
  await supabase
    .from("sessions")
    .update({ last_activity: new Date().toISOString() })
    .eq("token", token);

  return session.user_id;
}

/**
 * Delete session (logout)
 */
export async function deleteSession(
  token: string,
  supabase: any
): Promise<void> {
  await supabase.from("sessions").delete().eq("token", token);
}

/**
 * Delete all sessions for a user
 */
export async function deleteAllUserSessions(
  userId: number,
  supabase: any
): Promise<void> {
  await supabase.from("sessions").delete().eq("user_id", userId);
}
