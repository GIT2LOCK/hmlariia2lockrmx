import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Custom Authorization UI for the Supabase Auth OAuth Server.
 * Used by external clients (e.g. Grafana) to authenticate via 2LOCK.
 *
 * Flow:
 *   1. Read authorization_id from query string.
 *   2. Require a Supabase Auth session (redirect to /?redirect=...).
 *   3. Require the internal usuario (auth_user_id → public.usuarios).
 *   4. Require 2FA validation when totp_enabled.
 *   5. Approve the OAuth authorization via Supabase REST endpoint.
 *   6. Redirect to the redirect_url returned by Supabase.
 */
export default function OAuthConsent() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Verificando sessão...");

  const currentUrl = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId || "")}`;

  useEffect(() => {
    const run = async () => {
      if (!authorizationId) {
        setError("Parâmetro authorization_id ausente.");
        return;
      }

      // 1. Require Supabase Auth session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate(`/?redirect=${encodeURIComponent(currentUrl)}`, { replace: true });
        return;
      }

      // 2. Load internal usuario by auth_user_id
      setStatus("Carregando perfil...");
      const { data: usuario, error: uErr } = await supabase
        .from("usuarios")
        .select("id, nome, email, permissao, ativo, totp_enabled, auth_user_id")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (uErr || !usuario) {
        await supabase.auth.signOut();
        setError("Sua conta não está vinculada ao Ariia. Faça login novamente.");
        return;
      }

      if (!usuario.ativo) {
        await supabase.auth.signOut();
        setError("Usuário inativo. Acesso bloqueado.");
        return;
      }

      // 3. Require 2FA if enabled
      if (usuario.totp_enabled) {
        const twofaOk = sessionStorage.getItem("twofa_validated") === "1";
        if (!twofaOk) {
          navigate(`/?redirect=${encodeURIComponent(currentUrl)}`, { replace: true });
          return;
        }
      }

      // 4. Approve the OAuth authorization
      setStatus("Autorizando acesso...");
      try {
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
        const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const res = await fetch(
          `${SUPABASE_URL}/auth/v1/oauth/authorizations/${encodeURIComponent(authorizationId)}/consent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: ANON_KEY,
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ action: "approve" }),
          },
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json?.error_description || json?.error || "Falha ao aprovar autorização.");
          return;
        }
        const redirectUrl = json?.redirect_url || json?.url;
        if (!redirectUrl) {
          setError("Resposta inválida do servidor OAuth.");
          return;
        }
        window.location.replace(redirectUrl);
      } catch (e: any) {
        setError(e?.message || "Erro ao aprovar autorização.");
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorizationId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md bg-card border border-border rounded-xl p-8 text-center shadow-lg">
        {error ? (
          <>
            <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
            <h1 className="text-xl font-semibold text-foreground mb-2">Não foi possível autorizar</h1>
            <p className="text-sm text-muted-foreground mb-6">{error}</p>
            <Button onClick={() => navigate("/")}>Voltar ao login</Button>
          </>
        ) : (
          <>
            <Loader2 className="h-10 w-10 text-primary mx-auto mb-3 animate-spin" />
            <h1 className="text-xl font-semibold text-foreground mb-2">Sign in with 2LOCK</h1>
            <p className="text-sm text-muted-foreground">{status}</p>
          </>
        )}
      </div>
    </div>
  );
}
