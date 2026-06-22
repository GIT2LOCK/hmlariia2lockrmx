
Este é um escopo grande (itens 2 a 17). Para entregar com qualidade e sem quebrar o sistema, proponho dividir em **5 fases independentes**, cada uma testável antes da próxima. Você aprova fase por fase, ou autoriza tudo de uma vez.

---

## Fase 1 — Fundação no banco (migrations)

Criar a base de dados que sustenta tudo o que vem depois.

- Adicionar coluna `access_scope` em `usuarios` (enum: `ARIIA_ONLY`, `GRAFANA_ONLY`, `ARIIA_AND_GRAFANA`, `BLOCKED`), default `ARIIA_AND_GRAFANA`, backfill conforme `permissao` e `ativo`.
- Criar tabela `module_permissions` (perfil ou usuário → módulo → `can_view/create/update/delete/manage`).
- Criar tabela `user_sync_status` (último sync Grafana, status, erro, timestamp).
- Criar tabela `user_audit_log` (histórico de alterações de permissões/scope/role).
- Função `fn_user_module_perms(_usuario_id, _module)` retornando permissões efetivas (perfil + grupo + individual, com override individual).
- Atualizar `custom_access_token_hook` para incluir `access_scope` e `module_permissions` nas claims.
- Atualizar `grafana_effective_permissions` para retornar vazio quando `access_scope` ∉ (`GRAFANA_ONLY`, `ARIIA_AND_GRAFANA`).

## Fase 2 — RLS estrita de chamados para Cliente (item 8)

- Reescrever policies de `tickets`, `ticket_comments`, `ticket_history`, `ticket_attachments`, `ticket_notifications` para que `permissao = 'CLIENTE'` só veja registros onde `empresa_id = usuario.empresa_id`.
- Atualizar `fn_can_view_ticket`, `fn_dashboard_ticket_ids`, todas as RPCs de dashboard para filtrar por empresa do cliente.
- Garantir que contadores, relatórios e notificações respeitem isso no backend.

## Fase 3 — Sync Grafana correta (itens 2, 3, 6, 7)

Reescrever `supabase/functions/grafana-sync-user`:

1. Buscar usuário + `access_scope` + `ativo`.
2. Se `BLOCKED` / `ARIIA_ONLY` / inativo → remover de todas as orgs Grafana, retornar `ok`.
3. Calcular `desiredMap` via `grafana_effective_permissions` (direto + grupo + automações).
4. Se `desiredMap` vazio e pode acessar Grafana → adicionar fallback `orgId=1` como `Viewer`.
5. Mapeamento de roles: `CLIENTE→Viewer`, `VIEWER→Viewer`, `USER→Editor`, `ADMIN→Admin`, `SUPERADMIN→GrafanaAdmin` global.
6. Remover de orgs que não estão no `desiredMap`.
7. Bloquear criação de org pessoal/com email (já existente, validar).
8. Gravar resultado em `user_sync_status` e `grafana_sync_logs`.
9. **Retornar erro 500 com detalhes se qualquer etapa falhar** — o front não pode mais mostrar sucesso falso.

Edge functions a revisar: `grafana-sync-user`, `grafana-sync-all`, `delete-usuario`, `usuario-update`, `signup-2fa`.

## Fase 4 — Frontend: AuthContext, ProtectedRoute, menu e fallback dashboard (itens 4, 10, 11)

- `AuthContext` carrega `access_scope`, `module_permissions`, `grafana_permissions`, `sync_status` via uma única RPC `fn_user_context()`.
- Helpers: `canViewModule()`, `canCreateModule()`, etc.
- `ProtectedRoute` aceita `requirePermission="modulo.acao"` e valida via contexto.
- Menu lateral renderizado a partir de `module_permissions` reais (não hardcoded por perfil).
- Rota Grafana usuário-fallback abre `https://painel.2lock.app.br/d/ad8nmt9/2lock-home?orgId=1&from=now-6h&to=now&kiosk` quando `desiredMap` resultou só em Default.
- Toasts de sucesso só após confirmação banco + Grafana; em falha, toast destrutivo + reload dos dados reais.

## Fase 5 — Reorganização UI de Usuários (itens 12, 13)

- Modal/drawer de edição de usuário com tabs internas: **Dados**, **Empresa & Perfil**, **Escopo de acesso**, **Abas & Módulos**, **Grupos**, **Grafana (orgs + roles + sync)**, **Histórico**.
- Tela `Usuários` ganha: busca, filtros (empresa, perfil, status, acesso Ariia/Grafana, org Grafana), paginação, responsivo.
- Aba `Grafana` (global) reduz escopo para: organizações, vínculo empresa↔org, sync geral, logs, limpeza de personal orgs, diagnóstico, teste de conexão.

---

## Detalhes técnicos

**Edge Functions modificadas:** `grafana-sync-user`, `grafana-sync-all`, `delete-usuario`, `usuario-update`, `signup-2fa`, `fn_user_context` (nova RPC).

**Migrations criadas:** 1 por fase 1; fase 2 cria policies novas; fase 3 não exige migration; fase 4 cria RPC `fn_user_context`; fase 5 só frontend.

**Configuração externa Grafana que você precisará aplicar manualmente:**
- Garantir que `users.allow_org_create = false` no `grafana.ini`.
- Garantir que `auth.disable_signout_menu = false` mas `auto_assign_org = true` + `auto_assign_org_id = 1` + `auto_assign_org_role = Viewer`.
- Embeds via iframe precisam de `allow_embedding = true` e `auth.anonymous` desativado.
- Dashboard `ad8nmt9/2lock-home` precisa estar publicado na org 1 com permissão Viewer.

---

## Como prosseguir

Responda uma das opções:

1. **"vai com tudo"** — executo as 5 fases em sequência, cada uma com sua migration/PR, sem parar.
2. **"só fase X"** — executo apenas a fase indicada (ex.: "só fase 2 e 3").
3. **Ajustes no plano** — me diga o que mudar antes de começar.

Sobre a regra do fallback Default quando o usuário também tem org específica: o plano atual **remove o Default quando há org específica** (fallback puro). Confirme se prefere assim, ou se quer Default **sempre presente** somado às específicas.
