## Objetivo

Integrar Supabase Auth ao Ariia/2LOCK como camada de identidade OAuth/OIDC para permitir SSO com Grafana via Generic OAuth, **sem substituir** `public.usuarios` e mantendo RBAC, 2FA, tokens Zabbix e todas as FKs internas intactas.

A coluna `public.usuarios.auth_user_id uuid` já existe e fará a ponte entre `auth.users.id` (Supabase Auth) e `usuarios.id` (Ariia).

---

## Arquitetura final

```text
Grafana → "Sign in with 2LOCK"
   ↓
Supabase OAuth Server (/auth/v1/oauth/authorize)
   ↓
Ariia /oauth/consent?authorization_id=XYZ
   ↓ (se não logado) /login?redirect=...
   ↓ (se 2FA obrigatório) /verify-2fa?redirect=...
   ↓
approveAuthorization()
   ↓
Grafana logado (claims: ariia_usuario_id, ariia_permissao, grafana_role)
```

`public.usuarios` continua sendo a fonte da verdade do perfil/RBAC. Supabase Auth vira a camada de identidade.

---

## Etapas de implementação

### 1. Migração SQL
- Tornar `usuarios.senha_hash` nullable (a senha passa a ser do Supabase Auth; mantida só para usuários legados durante migração progressiva).
- Garantir índice único em `usuarios.auth_user_id`.
- Criar `public.custom_access_token_hook(event jsonb)` que injeta nas claims:
  - `ariia_usuario_id`, `ariia_permissao`, `grafana_role`
  - Mapeamento: SUPERADMIN→GrafanaAdmin, ADMIN→Admin, USER→Editor, VIEWER/TV_VIEW→Viewer
  - Grant EXECUTE para `supabase_auth_admin`.

### 2. Edge Functions (service role, nunca expostas no frontend)
- **`signup`** (refatorar): cria `auth.users` via `supabase.auth.admin.createUser` (email confirmado), depois faz upsert em `public.usuarios` setando `auth_user_id`, `permissao='VIEWER'`, `ativo=true`, `senha_hash='SUPABASE_AUTH'`. Mantém retorno de 2FA setup atual.
- **`migrate-legacy-login`** (nova): recebe email+senha, valida PBKDF2 antigo via `verifyPassword`, se OK cria `auth.users` com mesma senha, atualiza `auth_user_id` e `senha_hash='SUPABASE_AUTH'`. Retorna OK para o frontend continuar com `signInWithPassword`.

### 3. Frontend — fluxo de login
- `authService.login` passa a:
  1. Buscar usuário por email em `public.usuarios` (campos: `auth_user_id`, `ativo`, `senha_hash`, `totp_enabled`).
  2. Se `ativo=false` → erro.
  3. Se `auth_user_id` null → chamar edge `migrate-legacy-login`; em sucesso → seguir para passo 4.
  4. `supabase.auth.signInWithPassword({ email, password })`.
  5. Carregar perfil interno por `auth_user_id = session.user.id`.
  6. Manter fluxo 2FA atual (verify-2fa) preservando redirect.
- `authService.logout`: `supabase.auth.signOut()` + limpar chaves antigas (`auth_token`, `auth_user`, `auth_expires`) + redirect `/`.

### 4. `UserContext` (refatorar)
- Usar `supabase.auth.getSession()` + `onAuthStateChange` como fonte primária.
- Carregar `usuario` interno via `select * from usuarios where auth_user_id = session.user.id`.
- Manter Realtime na linha de `usuarios` (já funciona por `id`).
- Expor: `authUser` (Supabase), `usuario` (interno), `usuario.id`, `permissao`, `ativo`, `loading`, `signIn`, `signUp`, `signOut`.
- Manter compatibilidade com restante do app (todos os consumidores recebem `usuario` interno como hoje).

### 5. Rota `/oauth/consent`
- Nova página `src/pages/OAuthConsent.tsx` + rota pública (fora do `ProtectedRoute`).
- Lógica:
  1. Ler `authorization_id` da query.
  2. `getSession()`. Sem sessão → `navigate('/login?redirect=' + encodeURIComponent(currentUrl))`.
  3. Carregar perfil interno; se inexistente ou `ativo=false` → signOut + erro.
  4. Se `totp_enabled` e flag de sessão `twofa_validated` ausente → `/verify-2fa?redirect=...`.
  5. Chamar `supabase.auth.oauthServer.approveAuthorization({ authorization_id })` (ou endpoint REST equivalente do OAuth server).
  6. Redirecionar para `redirect_url` retornada.
- Tela mínima com loader + tratamento de erro.

### 6. Preservar `redirect` em login/cadastro/2FA
- `Index.tsx` (login), `signup`, `TwoFactorModal`/verify-2fa: ler `?redirect=` e após sucesso `navigate(redirect || '/dashboard')`.
- Setar `sessionStorage.setItem('twofa_validated','1')` após verify-2fa OK; limpar no logout.

### 7. Documentação Grafana
- Criar `/mnt/documents/grafana-oauth-2lock.md` com bloco `[auth.generic_oauth]` completo (PKCE, scopes, role_attribute_path=grafana_role, allow_assign_grafana_admin=true).

---

## Detalhes técnicos

### Migração SQL
```sql
ALTER TABLE public.usuarios ALTER COLUMN senha_hash DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_auth_user_id_key 
  ON public.usuarios(auth_user_id) WHERE auth_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  u record; claims jsonb; grafana_role text;
BEGIN
  claims := event->'claims';
  SELECT id, permissao, ativo INTO u
  FROM public.usuarios WHERE auth_user_id = (event->>'user_id')::uuid;

  IF u.id IS NOT NULL AND u.ativo THEN
    grafana_role := CASE u.permissao
      WHEN 'SUPERADMIN' THEN 'GrafanaAdmin'
      WHEN 'ADMIN' THEN 'Admin'
      WHEN 'USER' THEN 'Editor'
      ELSE 'Viewer' END;
    claims := claims 
      || jsonb_build_object('ariia_usuario_id', u.id)
      || jsonb_build_object('ariia_permissao', u.permissao)
      || jsonb_build_object('grafana_role', grafana_role);
    event := jsonb_set(event, '{claims}', claims);
  END IF;
  RETURN event;
END; $$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
```

### Edge Functions afetadas
- `supabase/functions/signup/index.ts` — refatorar para criar auth.users primeiro.
- `supabase/functions/migrate-legacy-login/index.ts` — novo, valida PBKDF2 e provisiona auth.users.
- `supabase/functions/login/index.ts` — mantido temporariamente para fluxos legados/2FA, mas frontend passa a usar `signInWithPassword` direto após migração.

### Arquivos frontend afetados
- `src/services/authService.ts` — novo fluxo de login com migração progressiva.
- `src/contexts/UserContext.tsx` — refatorar para Supabase Auth como fonte.
- `src/pages/OAuthConsent.tsx` — nova.
- `src/App.tsx` — rota `/oauth/consent` pública; rotas `/login`, `/cadastro`, `/verify-2fa` (se ainda não existirem como rotas reais; hoje login está em `Index.tsx`).
- `src/pages/Index.tsx` e fluxo 2FA — preservar `redirect`.

### Itens manuais (documentar ao usuário no final)
1. Habilitar **Custom Access Token Hook** em Authentication → Hooks apontando para `public.custom_access_token_hook`.
2. No OAuth Server do Supabase (Auth → OAuth Applications), registrar o Grafana como client e copiar `client_id`/`client_secret`.
3. Setar **Authorization UI URL** para `https://ariia.2lock.com.br/oauth/consent`.
4. Colar config no `grafana.ini`.

---

## O que NÃO será alterado
- `public.usuarios.id` e todas as FKs internas.
- Tabela `sessions` (mantida para legado).
- Lógica PBKDF2 (mantida durante migração progressiva).
- 2FA/TOTP customizado.
- RBAC e permissões existentes.

Aprovar para implementar nesta ordem.