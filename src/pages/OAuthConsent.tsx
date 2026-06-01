import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAuthToken } from "@/services/authService";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Custom Authorization UI for the Supabase Auth OAuth Server.
 *
 * Flow:
 *   1. Read authorization_id.
 *   2. If Supabase Auth session exists → validate usuario → approve.
 *   3. Else if custom Ariia session (auth_token) is valid →
 *      bridge into a Supabase Auth session via edge function +
 *      supabase.auth.verifyOtp, then approve.
 *   4. Else redirect to /?redirect=...
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

      // 1. Try existing Supabase Auth session
      let { data: { session } } = await supabase.auth.getSession();

      // 2. If none, try to bridge from custom Ariia session
      if (!session) {
        const customToken = getAuthToken();
        if (customToken) {
          setStatus("Sincronizando sessão...");
          try {
            const res = await fetch(`${SUPABASE_URL}/functions/v1/bridge-supabase-session`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: ANON_KEY,
                Authorization: `Bearer ${customToken}`,
              },
            });
            const json = await res.json().catch(() => ({}));
            if (res.ok && json?.token_hash) {
              // Enforce 2FA if required
              if (json.totp_enabled && sessionStorage.getItem("twofa_validated") !== "1") {
                navigate(`/?redirect=${encodeURIComponent(currentUrl)}`, { replace: true });
                return;
              }
              const { data: verifyData, error: verifyErr } = await supabase.auth.verifyOtp({
                token_hash: json.token_hash,
                type: "magiclink",
              });
              if (verifyErr || !verifyData?.session) {
                console.error("[oauth-consent] verifyOtp failed", verifyErr);
              } else {
                session = verifyData.session;
              }
            } else {
              console.warn("[oauth-consent] bridge failed", json);
            }
          } catch (e) {
            console.error("[oauth-consent] bridge exception", e);
          }
        }
      }

      // 3. Still no session → login
      if (!session) {
        navigate(`/?redirect=${encodeURIComponent(currentUrl)}`, { replace: true });
        return;
      }

      // 4. Load internal usuario
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

      if (usuario.totp_enabled && sessionStorage.getItem("twofa_validated") !== "1") {
        navigate(`/?redirect=${encodeURIComponent(currentUrl)}`, { replace: true });
        return;
      }

      // 5. Approve OAuth authorization using official supabase-js methods
      setStatus("Autorizando acesso...");
      try {
        const oauthApi: any = (supabase.auth as any).oauth;
        if (!oauthApi?.getAuthorizationDetails || !oauthApi?.approveAuthorization) {
          setError("Cliente Supabase não suporta OAuth Server. Atualize @supabase/supabase-js.");
          return;
        }

        const { data: details, error: detailsError } =
          await oauthApi.getAuthorizationDetails(authorizationId);
        if (detailsError) {
          console.error("[oauth-consent] getAuthorizationDetails error", detailsError);
          setError(detailsError.message || "Falha ao obter detalhes da autorização.");
          return;
        }

        // If already approved, Supabase returns a redirect_url directly
        if (details && !("authorization_id" in details) && (details as any).redirect_url) {
          window.location.href = (details as any).redirect_url;
          return;
        }

        const { data: approved, error: approveError } =
          await oauthApi.approveAuthorization(authorizationId);
        if (approveError) {
          console.error("[oauth-consent] approveAuthorization error", approveError);
          setError(approveError.message || "Falha ao aprovar autorização.");
          return;
        }
        if (!approved?.redirect_url) {
          setError("Resposta inválida do servidor OAuth (sem redirect_url).");
          return;
        }
        window.location.href = approved.redirect_url;
      } catch (e: any) {
        console.error("[oauth-consent] approve exception", e);
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
