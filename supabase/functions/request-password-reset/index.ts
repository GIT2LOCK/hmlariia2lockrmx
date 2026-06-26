import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_WEBHOOK_URL = "https://webwork.2lock.app.br/webhook/reset-password";
const WEBHOOK_URL = Deno.env.get("RESET_WEBHOOK_URL") || DEFAULT_WEBHOOK_URL;
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "https://ariia.2lock.com.br";
const LOGO_URL = "https://zptbkovdogbxkqzvmffj.supabase.co/storage/v1/object/public/2locks3/2lockLogoFHD.png";
const LOGO_WHITE_URL = Deno.env.get("LOGO_WHITE_URL") || LOGO_URL;
const TOKEN_TTL_MINUTES = 30;

function genericResponse() {
  return new Response(
    JSON.stringify({
      ok: true,
      message: "Se este e-mail estiver cadastrado, enviaremos as instruções para redefinição de senha.",
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
  );
}

function randomTokenHex(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildResetEmailText(p: { nome: string; email: string; resetUrl: string; expiresInMinutes: number }) {
  return [
    `Olá, ${p.nome}.`,
    ``,
    `Recebemos uma solicitação para redefinir a senha da conta vinculada a ${p.email}.`,
    `Acesse o link abaixo para criar uma nova senha. Este link expira em ${p.expiresInMinutes} minutos e só pode ser utilizado uma vez.`,
    ``,
    p.resetUrl,
    ``,
    `Se você não solicitou esta redefinição, ignore este e-mail — sua senha atual continua válida.`,
    ``,
    `Ariia 2lock — Plataforma de Gestão Técnica`,
  ].join("\n");
}

function buildResetEmailHtml(p: { nome: string; email: string; resetUrl: string; expiresInMinutes: number }) {
  const nome = escapeHtml(p.nome);
  const email = escapeHtml(p.email);
  const url = escapeHtml(p.resetUrl);
  const mins = p.expiresInMinutes;
  // Cores da marca: Navy #00205B, Light Blue #5B9BF0
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Redefinição de senha — Ariia 2lock</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f5fa;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a2138;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f5fa;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,32,91,0.08);">
          <tr>
            <td style="background-color:#00205B;padding:24px 32px;" align="center">
              <img src="${LOGO_WHITE_URL}" alt="Ariia 2lock" height="56" style="display:block;height:56px;width:auto;border:0;outline:none;text-decoration:none;background:transparent;" />
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px 0;font-size:22px;color:#00205B;font-weight:600;">Redefinição de senha</h1>
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;">Olá, <strong>${nome}</strong>.</p>
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;">
                Recebemos uma solicitação para redefinir a senha da conta vinculada a
                <strong style="color:#00205B;">${email}</strong>.
              </p>
              <p style="margin:0 0 24px 0;font-size:15px;line-height:1.55;">
                Clique no botão abaixo para criar uma nova senha. Por segurança, este link
                <strong>expira em ${mins} minutos</strong> e só pode ser utilizado <strong>uma única vez</strong>.
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 28px 0;">
                <tr>
                  <td align="center" bgcolor="#00205B" style="border-radius:8px;">
                    <a href="${url}"
                       style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;background-color:#00205B;">
                      Redefinir minha senha
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px 0;font-size:13px;color:#5a627a;">Se o botão não funcionar, copie e cole este link no navegador:</p>
              <p style="margin:0 0 24px 0;font-size:13px;word-break:break-all;">
                <a href="${url}" style="color:#5B9BF0;text-decoration:underline;">${url}</a>
              </p>

              <div style="border-top:1px solid #e5e9f2;margin:8px 0 20px 0;"></div>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-size:13px;color:#5a627a;line-height:1.5;">
                    <strong style="color:#00205B;">Conta:</strong> ${email}<br/>
                    <strong style="color:#00205B;">Validade do link:</strong> ${mins} minutos<br/>
                    <strong style="color:#00205B;">Uso:</strong> único
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0 0;font-size:13px;color:#5a627a;line-height:1.55;">
                Se você não solicitou esta redefinição, ignore este e-mail — sua senha atual permanece válida.
                Recomendamos verificar o acesso à sua conta caso receba várias mensagens como esta.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f7f9fc;padding:18px 32px;font-size:12px;color:#7a8299;" align="center">
              © Ariia 2lock — Plataforma de Gestão Técnica. Mensagem automática, não responda este e-mail.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "")
      .trim()
      .toLowerCase();
    console.log("[request-password-reset] received request for email:", email);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.warn("[request-password-reset] invalid email format");
      return new Response(JSON.stringify({ error: "invalid_email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Rate limit: max 3 solicitações por e-mail nos últimos 15 minutos
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count: recentCount } = await supabase
      .from("password_reset_tokens")
      .select("id", { count: "exact", head: true })
      .ilike("email", email)
      .gte("created_at", since);

    console.log("[request-password-reset] recent token count (15m):", recentCount);
    if ((recentCount ?? 0) >= 20) {
      console.warn("[request-password-reset] rate-limit hit for", email);
      return genericResponse();
    }

    const { data: user, error: userErr } = await supabase
      .from("usuarios")
      .select("id, nome, email, ativo, auth_user_id")
      .ilike("email", email)
      .maybeSingle();

    if (userErr) console.error("[request-password-reset] user lookup error", userErr);
    console.log("[request-password-reset] user found?", !!user, "ativo?", user?.ativo);

    if (!user || !user.ativo) {
      return genericResponse();
    }

    // Invalidar tokens pendentes anteriores
    await supabase
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("usuario_id", user.id)
      .is("used_at", null);

    const token = randomTokenHex(32);
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000).toISOString();
    const requestedAt = new Date().toISOString();

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const ua = req.headers.get("user-agent") || null;

    const { error: insErr } = await supabase.from("password_reset_tokens").insert({
      usuario_id: user.id,
      auth_user_id: user.auth_user_id,
      email: user.email,
      token_hash: tokenHash,
      expires_at: expiresAt,
      request_ip: ip,
      user_agent: ua,
    });
    if (insErr) {
      console.error("[request-password-reset] insert error", insErr);
      return genericResponse();
    }

    const resetUrl = `${APP_BASE_URL}/redefinir-senha?token=${token}`;
    const expiresInMinutes = TOKEN_TTL_MINUTES;
    const subject = "Redefinição de senha — Ariia 2lock";
    const htmlBody = buildResetEmailHtml({
      nome: user.nome || user.email,
      email: user.email,
      resetUrl,
      expiresInMinutes,
    });
    const textBody = buildResetEmailText({
      nome: user.nome || user.email,
      email: user.email,
      resetUrl,
      expiresInMinutes,
    });

    // Webhook (não bloqueia a resposta em caso de falha)
    console.log("[request-password-reset] dispatching webhook to:", WEBHOOK_URL);
    try {
      const whRes = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "password_reset_requested",
          to: user.email,
          email: user.email,
          nome: user.nome,
          usuario_id: user.id,
          reset_url: resetUrl,
          expires_at: expiresAt,
          expires_in_minutes: expiresInMinutes,
          requested_at: requestedAt,
          subject,
          html: htmlBody,
          text: textBody,
        }),
      });
      const whText = await whRes.text().catch(() => "");
      console.log("[request-password-reset] webhook response status:", whRes.status, "body:", whText.slice(0, 500));
      if (!whRes.ok && whRes.status === 404) {
        console.error(
          "[request-password-reset] webhook 404 — provavelmente é uma URL 'webhook-test' do n8n que não está em modo 'Listen for test event' ou já consumiu o disparo único. Use a URL de produção (webhook/<id>) e configure-a no secret RESET_WEBHOOK_URL.",
        );
      }
    } catch (e) {
      console.error("[request-password-reset] webhook fetch error", e);
    }

    return genericResponse();
  } catch (err) {
    console.error("[request-password-reset] fatal", err);
    return genericResponse();
  }
});
