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
}

const SUPABASE_URL = "https://vaszvkujzyzpoqmqpphz.supabase.co";

export async function signup(data: SignupData): Promise<AuthResponse> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhc3p2a3Vqenl6cG9xbXFwcGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NTIzNDgsImV4cCI6MjA3ODUyODM0OH0.vZ4JbfmzfFFs-GX-P3HnV04X1ylkxNraex5jqVpTvIM",
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
    const response = await fetch(`${SUPABASE_URL}/functions/v1/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhc3p2a3Vqenl6cG9xbXFwcGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NTIzNDgsImV4cCI6MjA3ODUyODM0OH0.vZ4JbfmzfFFs-GX-P3HnV04X1ylkxNraex5jqVpTvIM",
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: result.error || "Erro ao fazer login",
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
    console.error("Login error:", error);
    return {
      success: false,
      message: "Erro de conexão. Tente novamente.",
      error: String(error),
    };
  }
}

export function logout(): void {
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
