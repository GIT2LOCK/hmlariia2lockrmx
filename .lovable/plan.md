# Controle Grafana no Ariia

Transformar o Ariia no painel central de controle de acesso do Grafana. O Ariia define organizações, grupos, usuários e permissões; o Grafana apenas reflete via API. OAuth continua como hoje (scopes `profile email`, sem `openid`).

## 1. Secrets (Lovable Cloud)

Adicionar (via `add_secret`) antes de qualquer Edge Function:
- `GRAFANA_URL`
- `GRAFANA_ADMIN_USER`
- `GRAFANA_ADMIN_PASSWORD`

Basic Auth obrigatório (Server Admin), pois service accounts são por organização.

## 2. Schema Supabase (migration)

Novas tabelas em `public` (com `GRANT` + RLS — leitura/escrita apenas via edge functions com service_role; frontend lê via select com policy restrita a SUPERADMIN/ADMIN do Ariia):

- `grafana_organizations` (grafana_org_id int unique, name, slug, active, synced_at)
- `grafana_user_links` (usuario_id unique → usuarios.id, grafana_user_id, grafana_login, grafana_email, last_synced_at)
- `grafana_access_groups` (name, description, active)
- `grafana_access_group_members` (group_id, usuario_id, unique(group_id, usuario_id))
- `grafana_group_org_permissions` (group_id, grafana_organization_id, role enum)
- `grafana_user_org_permissions` (usuario_id, grafana_organization_id, role enum, enabled)
- `grafana_sync_logs` (usuario_id nullable, action, status, request_payload jsonb, response_payload jsonb, error_message, created_at)

Enum `grafana_role`: `None | Viewer | Editor | Admin`.

Função SQL `public.grafana_effective_permissions(_usuario_id int)` retorna `{ is_grafana_admin, orgs: [{org_id, grafana_org_id, role}] }`:
- Se `usuarios.permissao` ∈ {SUPERADMIN, ADMIN} e `ativo=true` → `is_grafana_admin=true`, `Admin` em todas as orgs ativas.
- Senão, merge de `grafana_user_org_permissions` (enabled=true) com `grafana_group_org_permissions` via membership; maior role vence (Admin > Editor > Viewer > None); direta sobrescreve grupo quando definida.
- Inativo → vazio.

Policies de leitura: usar função `has_role`-equivalente baseada em `usuarios.permissao` via `auth_user_id = auth.uid()`.

## 3. Edge Functions

Todas com CORS, validam JWT do chamador via `SUPABASE_JWKS`, e exigem que `usuarios.permissao` do chamador seja SUPERADMIN/ADMIN (exceto `grafana-effective-permissions` que pode rodar para o próprio usuário):

- `grafana-test-connection` — GET `/api/admin/settings` com Basic Auth; valida 200.
- `grafana-sync-organizations` — GET `/api/orgs`, upsert em `grafana_organizations`. POST opcional para criar org.
- `grafana-sync-user` — input `{ usuario_id }`:
  1. Resolve email do usuário.
  2. Lookup `/api/users/lookup?loginOrEmail=`. Se 404, cria via `/api/admin/users` com senha random (login = email).
  3. Atualiza `grafana_user_links`.
  4. Calcula permissões efetivas.
  5. PUT `/api/admin/users/{id}/permissions` `{ isGrafanaAdmin }`.
  6. Para cada org desejada: `POST /api/orgs/{orgId}/users` (add) ou `PATCH` (update role). Para orgs não desejadas onde está presente: `DELETE /api/orgs/{orgId}/users/{userId}`.
  7. Se inativo no Ariia: desabilita (`PUT /api/admin/users/{id}/disable`) e remove de todas as orgs.
  8. Loga tudo em `grafana_sync_logs`.
- `grafana-sync-all` — itera `usuarios` ativos e chama lógica acima.
- `grafana-effective-permissions` — retorna a saída da função SQL para um usuário.

## 4. OAuth Consent — gating

Em `src/pages/OAuthConsent.tsx`, antes de `approveAuthorization`:
1. Carrega `usuarios` por `auth_user_id`.
2. Bloqueia se `ativo=false` ou 2FA pendente (já existe).
3. Chama `grafana-effective-permissions`:
   - SUPERADMIN/ADMIN → dispara `grafana-sync-user` (fire-and-forget com await curto) → aprova.
   - USER/VIEWER/TV_VIEW com `orgs.length === 0` → mostra mensagem amigável: "Você ainda não possui acesso liberado ao Grafana. Solicite acesso ao administrador." e botão "Voltar". NÃO aprova.
   - Caso contrário → sincroniza → aprova.

## 5. Custom Access Token Hook (SQL migration)

Atualizar `public.custom_access_token_hook` para incluir claims:
- `ariia_usuario_id`, `ariia_permissao`
- `grafana_role`: `GrafanaAdmin` (admins), `Viewer` (USER/VIEWER/TV_VIEW com ≥1 org), `None` (sem org)
- `grafana_is_admin` boolean
- `grafana_allowed_orgs`: array de `grafana_org_id`
- `grafana_access_summary`: jsonb `{org_id: role}`

Source of truth real continua sendo o sync via API; claims são apenas para `role_attribute_path` do Grafana.

## 6. UI — "Controle Grafana"

Nova rota `/dashboard/grafana` protegida por `canManageUsers` (SUPERADMIN/ADMIN apenas). Entrada no `AppSidebar` em "Conta" com ícone Activity/Shield.

Componente raiz com Tabs:

- **Dashboard**: cards (orgs sincronizadas, usuários com acesso, grupos, últimos erros), botões "Sincronizar organizações" e "Sincronizar todos".
- **Organizações**: tabela (`grafana_org_id`, nome, status, última sync), botão refresh.
- **Grupos**: CRUD de `grafana_access_groups`, membros (multi-select de usuários), permissões por org (matriz grupo×org com select de role).
- **Usuários**: lista de `usuarios` com colunas: permissão Ariia, GrafanaAdmin (badge), orgs liberadas (count), grupos, último sync. Ações: "Sincronizar", "Ver permissões efetivas" (modal).
- **Permissões diretas**: form (usuário, org, role) salva em `grafana_user_org_permissions` e dispara sync.
- **Logs**: tabela paginada de `grafana_sync_logs` com filtro por status/usuário.

## 7. Segurança

- Edge functions validam permissão do chamador.
- RLS bloqueia leitura das tabelas Grafana para não-admins.
- Credenciais Grafana só em secrets.
- Toda mutação registra autor (do JWT) em `grafana_sync_logs`.
- Trigger ou função impede remover último SUPERADMIN ativo.
- Desativar usuário no Ariia → trigger enfileira sync (ou hook no `update-profile`/`usuarios` page chama `grafana-sync-user`).

## 8. Documentação `grafana.ini`

Atualizar `.lovable/plan.md` com bloco final:

```ini
[auth.generic_oauth]
enabled = true
name = 2LOCK
allow_sign_up = true
client_id = <CLIENT_ID>
client_secret = <CLIENT_SECRET>
scopes = profile email
auth_url = https://jjemlhtyhnncqzpnskor.supabase.co/auth/v1/authorize
token_url = https://jjemlhtyhnncqzpnskor.supabase.co/auth/v1/token
api_url = https://jjemlhtyhnncqzpnskor.supabase.co/auth/v1/user
use_pkce = true
auth_style = InHeader
email_attribute_path = email
login_attribute_path = email
name_attribute_path = name
role_attribute_path = grafana_role
role_attribute_strict = true
allow_assign_grafana_admin = true
auto_assign_org = false
auto_assign_org_role = Viewer
skip_org_role_sync = true
```

`skip_org_role_sync=true` evita que Grafana sobrescreva as orgs gerenciadas via API pelo Ariia.

## 9. Ordem de execução

1. Pedir secrets Grafana (`add_secret`).
2. Migration: tabelas + enum + função SQL + atualização do hook.
3. Edge functions (test, sync-orgs, sync-user, sync-all, effective-permissions).
4. Atualizar `OAuthConsent.tsx` (gating).
5. Criar página `GrafanaControle.tsx` + subcomponentes por aba, rota em `App.tsx`, item no `AppSidebar`.
6. Smoke test: test-connection, sync-orgs, criar grupo, atribuir org, sync-user, login Grafana com usuário VIEWER sem acesso (bloqueio), com acesso (Viewer), e ADMIN (GrafanaAdmin).

## Tradeoffs

- Sync é on-demand (no consent + botões). Não há job periódico — pode ser adicionado depois.
- Criação automática de usuário no Grafana usa senha random; usuário sempre entra via OAuth.
- `role_attribute_strict=true` + `skip_org_role_sync=true` significa que o Ariia controla orgs; o claim `grafana_role` decide apenas o status global (GrafanaAdmin/Viewer/None).
