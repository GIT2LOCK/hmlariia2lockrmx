import { supabase } from "@/integrations/supabase/client";

export interface SignupData {
  nome: string;
  email: string;
  senha: string;
}

export interface LoginData {
  email: string;
  senha: string;
}

export interface AuthUser {
  id: number;
  nome: string;
  email?: string;
  permissao: string;
}

export interface AuthSession {
  token: string;
  expires_at: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  user?: AuthUser;
  session?: AuthSession;
  error?: string;
  requires2FA?: boolean;
  userId?: number;
  requiresSetup2FA?: boolean;
  setupToken?: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function clearAuthState(signOutSupabase: boolean = false): Promise<void> {
  localStorage.removeItem("auth_token");
  localStorage.removeItem("auth_expires");
  localStorage.removeItem("auth_user");
  sessionStorage.removeItem("twofa_validated");

  if (signOutSupabase) {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Supabase signOut error:", e);
    }
  }
}

export function getAuthToken(): string | null {
  return localStorage.getItem("auth_token");
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "apikey": ANON_KEY,
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export async function signup(data: SignupData): Promise<AuthResponse> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": ANON_KEY },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!response.ok) {
      return { success: false, message: result.error || "Erro ao criar conta", error: result.error };
    }

    // Signup now requires 2FA setup — don't auto-login
    if (result.requiresSetup2FA) {
      return {
        success: true, message: result.message,
        requiresSetup2FA: true, setupToken: result.setupToken,
        user: result.user,
      };
    }

    return { success: true, message: result.message, user: result.user, session: result.session };
  } catch (error) {
    console.error("Signup error:", error);
    return { success: false, message: "Erro de conexão. Tente novamente.", error: String(error) };
  }
}

export async function login(data: LoginData): Promise<AuthResponse> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": ANON_KEY },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!response.ok) {
      return { success: false, message: result.error || "Erro ao fazer login", error: result.error };
    }

    // If 2FA required, don't store session yet
    if (result.requires2FA) {
      return { success: true, message: result.message, requires2FA: true, userId: result.userId, challengeToken: result.challengeToken } as any;
    }


    return { success: true, message: result.message, user: result.user, session: result.session };
  } catch (error) {
    console.error("Login error:", error);
    return { success: false, message: "Erro de conexão. Tente novamente.", error: String(error) };
  }
}

export async function logout(logoutAll: boolean = false): Promise<void> {
  const token = getAuthToken();
  if (token) {
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/logout`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ logoutAll }),
      });
    } catch (error) {
      console.error("Logout error:", error);
    }
  }

  // Also sign out from Supabase Auth (used for OAuth flows like Grafana SSO)
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    await supabase.auth.signOut();
  } catch (e) {
    console.error("Supabase signOut error:", e);
  }

  await clearAuthState(false);
}

export async function renewAriiaSessionFromSupabase(): Promise<boolean> {
  const { supabase } = await import("@/integrations/supabase/client");
  const storedUser = getStoredUser();
  const ariiaToken = getAuthToken();
  if (!ariiaToken) return false;

  let { data: sessionData } = await supabase.auth.getSession();
  let accessToken = sessionData.session?.access_token;

  if (accessToken) {
    const { error: userError } = await supabase.auth.getUser(accessToken);
    if (userError) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      sessionData = refreshed;
      accessToken = refreshed.session?.access_token;
    }
  }

  if (!accessToken) return false;

  const response = await fetch(`${SUPABASE_URL}/functions/v1/renew-ariia-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ ariia_token: ariiaToken }),
  });

  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.session?.token || !result?.user) return false;

  const storedEmail = (storedUser?.email || "").trim().toLowerCase();
  const renewedEmail = (result.user.email || "").trim().toLowerCase();
  if (storedEmail && renewedEmail && storedEmail !== renewedEmail) {
    await clearAuthState(true);
    return false;
  }

  localStorage.setItem("auth_token", result.session.token);
  localStorage.setItem("auth_expires", result.session.expires_at);
  localStorage.setItem("auth_user", JSON.stringify(result.user));
  sessionStorage.setItem("twofa_validated", "1");
  return true;
}

/**
 * Establishes a Supabase Auth session in parallel with the custom session.
 * Required for OAuth flows (Grafana SSO) to reuse the same login.
 * Throws if the Supabase session cannot be created/persisted.
 */
export async function ensureSupabaseAuthSession(email: string, password: string): Promise<void> {
  const { supabase } = await import("@/integrations/supabase/client");
  const expectedEmail = email.trim().toLowerCase();

  // Evita reaproveitar uma sessão Supabase antiga no browser. Se a sessão antiga
  // ficar ativa, o PostgREST executa o RLS como outro usuário e operações como
  // abertura de chamado caem em "violates row-level security policy".
  await supabase.auth.signOut();

  const { data, error } = await supabase.auth.signInWithPassword({ email: expectedEmail, password });
  console.log("[ensureSupabaseAuthSession] signIn result:", { user: data?.user?.id, error });

  if (error) {
    console.error("[ensureSupabaseAuthSession] Falha ao criar sessão Supabase Auth:", error);
    throw new Error("Login Ariia ok, mas falhou ao criar sessão Supabase Auth: " + error.message);
  }

  const signedEmail = (data?.user?.email || "").trim().toLowerCase();
  if (signedEmail !== expectedEmail) {
    await supabase.auth.signOut();
    throw new Error("Sessão Supabase criada para um usuário diferente. Faça login novamente.");
  }

  const { data: sessionData } = await supabase.auth.getSession();
  console.log("[ensureSupabaseAuthSession] session after login:", sessionData.session?.user?.id ?? null);

  if (!sessionData.session) {
    throw new Error("Sessão Supabase Auth não foi persistida no browser.");
  }

  const sessionEmail = (sessionData.session.user.email || "").trim().toLowerCase();
  if (sessionEmail !== expectedEmail) {
    await supabase.auth.signOut();
    throw new Error("Sessão Supabase persistida para um usuário diferente. Faça login novamente.");
  }
}

/**
 * Creates a Supabase Auth session from the existing Ariia custom session token.
 * This keeps existing logged-in users working after table grants were tightened:
 * direct PostgREST reads must run as `authenticated`, never as `anon`.
 */
export async function ensureSupabaseSessionFromAriiaToken(): Promise<void> {
  let token = getAuthToken();
  let storedUser = getStoredUser();
  const storedExpires = localStorage.getItem("auth_expires");
  if (!token || !storedUser?.email) {
    await renewAriiaSessionFromSupabase();
    token = getAuthToken();
    storedUser = getStoredUser();
    if (!token || !storedUser?.email) return;
  }

  const { supabase } = await import("@/integrations/supabase/client");
  const expectedEmail = storedUser.email.trim().toLowerCase();

  const { data: current } = await supabase.auth.getSession();
  const currentEmail = (current.session?.user?.email || "").trim().toLowerCase();
  if (current.session && currentEmail !== expectedEmail) {
    await supabase.auth.signOut();
  }

  const expiresAt = storedExpires ? new Date(storedExpires).getTime() : 0;
  const renewWindowMs = 2 * 60 * 60 * 1000;
  if (current.session && currentEmail === expectedEmail && expiresAt > Date.now() + renewWindowMs) {
    return;
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/bridge-supabase-session`, {
    method: "POST",
    headers: getAuthHeaders(),
  });

  const result = await response.json().catch(() => null);

  // Sessão Ariia inválida/expirada: tenta recriar a sessão customizada a partir
  // da sessão Supabase ainda válida no browser. Só volta ao login se ambas
  // estiverem inválidas.
  if (!response.ok) {
    const renewed = await renewAriiaSessionFromSupabase();
    if (renewed) return;
    await clearAuthState(true);
    if (typeof window !== "undefined") {
      window.location.replace("/");
    }
    return;
  }

  if (result?.session?.expires_at) {
    localStorage.setItem("auth_expires", result.session.expires_at);
  }

  if (current.session && currentEmail === expectedEmail) return;

  if (!result?.token_hash) {
    throw new Error(result?.error || "Não foi possível criar sessão Supabase");
  }


  // IMPORTANTE: com token_hash, apenas token_hash + type podem ser enviados.
  const { error } = await supabase.auth.verifyOtp({
    token_hash: result.token_hash,
    type: "magiclink",
  });


  if (error) {
    throw new Error("Falha ao validar sessão Supabase: " + error.message);
  }

  const { data: verified } = await supabase.auth.getSession();
  const verifiedEmail = (verified.session?.user?.email || "").trim().toLowerCase();
  if (!verified.session || verifiedEmail !== expectedEmail) {
    await supabase.auth.signOut();
    throw new Error("Sessão Supabase criada para usuário diferente. Faça login novamente.");
  }
}

export function getStoredUser(): AuthUser | null {
  const userStr = localStorage.getItem("auth_user");
  if (!userStr) return null;
  try { return JSON.parse(userStr); } catch { return null; }
}

export function updateStoredUser(user: Partial<AuthUser>): void {
  const currentUser = getStoredUser();
  if (currentUser) {
    localStorage.setItem("auth_user", JSON.stringify({ ...currentUser, ...user }));
  }
}

export function isAuthenticated(): boolean {
  const token = localStorage.getItem("auth_token");
  const expires = localStorage.getItem("auth_expires");
  if (!token || !expires) return false;
  if (new Date(expires) < new Date()) { logout(); return false; }
  return true;
}

export async function syncUserFromDatabase(): Promise<AuthUser | null> {
  return getStoredUser();
}
