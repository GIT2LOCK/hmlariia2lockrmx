import { supabase } from "@/integrations/supabase/client";

export interface SignupData {
  nome: string;
  email: string;
  cpf: string;
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
  permissao_descricao?: string;
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
  requiresEmailVerification?: boolean;
  requires2FA?: boolean;
  requires2FASetup?: boolean;
  setupToken?: string; // Token for 2FA setup after signup
}

export interface Device {
  dispositivo_id: number;
  device_token: string;
  ip_address: string;
  location_country: string;
  location_state: string;
  location_city: string;
  device_type: string;
  browser_name: string;
  os_name: string;
  login_at: string;
  last_activity: string;
  remember_until: string | null;
  is_active: boolean;
}

const SUPABASE_URL = "https://vaszvkujzyzpoqmqpphz.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhc3p2a3Vqenl6cG9xbXFwcGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NTIzNDgsImV4cCI6MjA3ODUyODM0OH0.vZ4JbfmzfFFs-GX-P3HnV04X1ylkxNraex5jqVpTvIM";

// Generate a unique device token
export function getDeviceToken(): string {
  let token = localStorage.getItem("device_token");
  if (!token) {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    token = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem("device_token", token);
  }
  return token;
}

// Get auth token for API calls
export function getAuthToken(): string | null {
  return localStorage.getItem("auth_token");
}

// Get headers with authentication
export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "apikey": ANON_KEY,
  };
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  return headers;
}

export async function signup(data: SignupData): Promise<AuthResponse> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": ANON_KEY,
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: result.error || "Erro ao criar conta",
        error: result.error,
      };
    }

    return {
      success: true,
      message: result.message,
      user: result.user,
      requires2FASetup: result.requires2FASetup,
      setupToken: result.setupToken,
    };
  } catch (error) {
    console.error("Signup error:", error);
    return {
      success: false,
      message: "Erro de conexão. Tente novamente.",
      error: String(error),
    };
  }
}

export async function login(data: LoginData): Promise<AuthResponse> {
  try {
    const deviceToken = getDeviceToken();
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": ANON_KEY,
      },
      body: JSON.stringify({ ...data, deviceToken }),
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: result.error || "Erro ao fazer login",
        error: result.error,
      };
    }

    // Check if 2FA is required
    if (result.requires2FA) {
      return {
        success: false,
        message: result.message,
        user: result.user,
        requires2FA: true,
      };
    }

    // Store session in localStorage
    if (result.session) {
      localStorage.setItem("auth_token", result.session.token);
      localStorage.setItem("auth_expires", result.session.expires_at);
      localStorage.setItem("auth_user", JSON.stringify(result.user));
    }

    return {
      success: true,
      message: result.message,
      user: result.user,
      session: result.session,
    };
  } catch (error) {
    console.error("Login error:", error);
    return {
      success: false,
      message: "Erro de conexão. Tente novamente.",
      error: String(error),
    };
  }
}

export async function logout(logoutAll: boolean = false): Promise<void> {
  const token = getAuthToken();
  
  // Call server-side logout to invalidate session
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
  
  // Always clear local storage
  localStorage.removeItem("auth_token");
  localStorage.removeItem("auth_expires");
  localStorage.removeItem("auth_user");
}

export function getStoredUser(): AuthUser | null {
  const userStr = localStorage.getItem("auth_user");
  if (!userStr) return null;

  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

export function updateStoredUser(user: Partial<AuthUser>): void {
  const currentUser = getStoredUser();
  if (currentUser) {
    const updatedUser = { ...currentUser, ...user };
    localStorage.setItem("auth_user", JSON.stringify(updatedUser));
  }
}

export function isAuthenticated(): boolean {
  const token = localStorage.getItem("auth_token");
  const expires = localStorage.getItem("auth_expires");

  if (!token || !expires) return false;

  // Check if session is expired
  if (new Date(expires) < new Date()) {
    logout();
    return false;
  }

  return true;
}

// Sync user data from database to localStorage
export async function syncUserFromDatabase(): Promise<AuthUser | null> {
  const storedUser = getStoredUser();
  if (!storedUser) return null;

  try {
    const { data, error } = await supabase
      .from("tb_usuario")
      .select(`
        user_id,
        nome,
        permissao_id,
        tb_permissao (nome, descricao),
        tb_email (email_principal)
      `)
      .eq("user_id", storedUser.id)
      .maybeSingle();

    if (error || !data) {
      console.error("Error syncing user from database:", error);
      return null;
    }

    const updatedUser: AuthUser = {
      id: data.user_id,
      nome: data.nome,
      email: (data.tb_email as any)?.email_principal || storedUser.email,
      permissao: (data.tb_permissao as any)?.nome || storedUser.permissao,
      permissao_descricao: (data.tb_permissao as any)?.descricao || storedUser.permissao_descricao,
    };

    // Update localStorage with fresh data
    localStorage.setItem("auth_user", JSON.stringify(updatedUser));
    
    return updatedUser;
  } catch (error) {
    console.error("Error syncing user:", error);
    return null;
  }
}

// Send email verification code
export async function sendVerificationEmail(userId: number, email: string, nome: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-verification-email`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId, email, nome }),
    });

    const result = await response.json();
    return {
      success: response.ok,
      message: result.message || result.error || "Erro desconhecido",
    };
  } catch (error) {
    console.error("Send verification email error:", error);
    return {
      success: false,
      message: "Erro de conexão. Tente novamente.",
    };
  }
}

// Verify email with code
export async function verifyEmail(userId: number, code: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/verify-email`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId, code }),
    });

    const result = await response.json();
    return {
      success: response.ok && result.success,
      message: result.message || result.error || "Erro desconhecido",
    };
  } catch (error) {
    console.error("Verify email error:", error);
    return {
      success: false,
      message: "Erro de conexão. Tente novamente.",
    };
  }
}

// Verify 2FA code and complete login
export async function verify2FA(userId: number, code: string, rememberDevice: boolean = false): Promise<AuthResponse> {
  try {
    const deviceToken = getDeviceToken();
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/verify-2fa`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": ANON_KEY,
      },
      body: JSON.stringify({ 
        userId, 
        code, 
        rememberDevice,
        deviceToken,
        userAgent: navigator.userAgent,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      return {
        success: false,
        message: result.error || "Código 2FA inválido",
        error: result.error,
      };
    }

    // Store session in localStorage
    if (result.session) {
      localStorage.setItem("auth_token", result.session.token);
      localStorage.setItem("auth_expires", result.session.expires_at);
      localStorage.setItem("auth_user", JSON.stringify(result.user));
    }

    return {
      success: true,
      message: result.message,
      user: result.user,
      session: result.session,
    };
  } catch (error) {
    console.error("Verify 2FA error:", error);
    return {
      success: false,
      message: "Erro de conexão. Tente novamente.",
      error: String(error),
    };
  }
}

// Get user devices
export async function getUserDevices(userId: number): Promise<{ success: boolean; devices: Device[]; error?: string }> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/get-devices`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      return {
        success: false,
        devices: [],
        error: result.error || "Erro ao buscar dispositivos",
      };
    }

    return {
      success: true,
      devices: result.devices,
    };
  } catch (error) {
    console.error("Get devices error:", error);
    return {
      success: false,
      devices: [],
      error: "Erro de conexão. Tente novamente.",
    };
  }
}

// Revoke device
export async function revokeDevice(userId: number, deviceId?: number, revokeAll: boolean = false): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/revoke-device`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId, deviceId, revokeAll }),
    });

    const result = await response.json();

    return {
      success: response.ok && result.success,
      message: result.message || result.error || "Erro desconhecido",
    };
  } catch (error) {
    console.error("Revoke device error:", error);
    return {
      success: false,
      message: "Erro de conexão. Tente novamente.",
    };
  }
}
