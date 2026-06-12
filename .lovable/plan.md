## Objetivo
Tornar consistente e definitivo o fluxo de **cadastro, login, automação por domínio, alteração de cargo/permissão, sincronização com Grafana e exclusão de usuários** no Ariia.

---

## Diagnóstico (resumo)

1. **Automação por domínio** hoje só adiciona o usuário a uma org do Grafana. Ela **não** define `empresa_id` nem `permissao` na tabela `usuarios`. Por isso `usuario@goodstorage.com.br` entrou como `VIEWER` em vez de `CLIENTE` da GoodStorage.
2. **Mapeamento Ariia → Grafana** atual: `SUPERADMIN` vira `GrafanaAdmin`; demais perfis dependem 100% de permissões manuais/grupo. Não há regra automática "CLIENTE → Viewer na org da empresa", e nada impede o sync de tentar enviar a role `Cliente` indiretamente (causa do `User sync failed`).
3. **Alteração de cargo/permissão "não persiste"**: o `update` em `usuarios` retorna sucesso, mas o `grafana-sync-user` em seguida pode reaplicar automações de domínio e regravar `grafana_user_org_permissions`, dando a impressão de "voltou ao Cliente". Além disso, faltam logs/erros visíveis quando o sync falha.
4. **Exclusão de usuário**: a função `handleDelete` em `Usuarios.tsx` apaga registros do app, **mas não remove o usuário do `auth.users` nem do Grafana**. Como o login agora cria o usuário em `auth.users` via signup, se o registro em `auth.users` permanecer e o usuário tentar logar de novo, um trigger/fluxo pode recriar a linha em `public.usuarios`.

---

## Mudanças

### 1. Banco de dados (migration)

- **Nova tabela `domain_rules`**
  - `domain` (citext, unique), `empresa_id` (fk empresas, nullable), `default_permissao` (CHECK ∈ roles válidos), `grafana_organization_id` (fk, nullable), `grafana_role` (Viewer/Editor/Admin), `ativo`.
  - Grants + RLS: leitura authenticated, escrita só SUPERADMIN/ADMIN.
- **Função `public.apply_domain_rule(_usuario_id int)`** (SECURITY DEFINER)
  - Olha `lower(split_part(email,'@',2))`, encontra rule ativa.
  - Se `usuarios.permissao = 'VIEWER'` (padrão pós-signup) **ou** o usuário ainda não tem `empresa_id`, aplica `empresa_id` + `permissao` da regra.
  - Não sobrescreve quem já é `SUPERADMIN/ADMIN/USER` manualmente.
- **Função `public.fn_delete_usuario_cascade(_usuario_id int)`** (SECURITY DEFINER, restrita a SUPERADMIN via check interno)
  - Limpa `support_group_members`, `grafana_user_org_permissions`, `grafana_access_group_members`, `grafana_user_links`, `sessions`, `ticket_notifications`, `contato_unidades` etc., depois `delete from usuarios`. Retorna `auth_user_id` para o caller apagar em `auth.users`.
- **Seed**: criar uma row em `domain_rules` para `goodstorage.com.br` → empresa GoodStorage, `CLIENTE`, org Grafana 3 / Viewer.

### 2. Edge Functions

- **`_shared/grafana.ts`**
  - Novo helper `mapAriiaToGrafanaRole(permissao)`: `CLIENTE → Viewer`, `VIEWER → Viewer`, `USER → Editor`, `ADMIN → Admin`, `SUPERADMIN → Admin (+ isGrafanaAdmin)`.
  - Em `syncUserToGrafana`:
    - Antes de tudo, chamar `apply_domain_rule` via RPC.
    - Para `CLIENTE`, garantir que ele só tenha permissão na org Grafana vinculada à empresa dele (campo novo `empresas.grafana_organization_id` — adicionado na migration). Remove de todas as outras orgs.
    - Para `SUPERADMIN`, manter comportamento atual.
    - Nunca enviar string "Cliente" para Grafana — toda role passa pelo mapper.
  - Logs claros via `logSync` quando o mapeamento ou a sync falhar.
- **`signup/index.ts`** e **`login/index.ts`** (e bridge-supabase-session): após autenticar, chamar `apply_domain_rule(usuario.id)` e em seguida `syncUserToGrafana`.
- **Nova função `delete-usuario`** (POST `{ usuario_id }`):
  - Auth: SUPERADMIN.
  - 1) Remove no Grafana (`/api/admin/users/:id`).
  - 2) `fn_delete_usuario_cascade` no Postgres.
  - 3) `supabase.auth.admin.deleteUser(auth_user_id)`.
  - Resposta agrega status de cada etapa; em caso de falha parcial, retorna 207 com detalhes.

### 3. Frontend

- **`src/pages/Permissoes.tsx`** (`handleSave`)
  - Após `update`, faz `select` da linha atualizada e **só mostra toast de sucesso se `permissao`/`empresa_id` realmente bateram com o payload**. Caso contrário, mostra erro com a diferença.
  - Aguarda a resposta do `grafana-sync-user`; se vier erro, mostra toast destrutivo com o `error`.
- **`src/pages/Usuarios.tsx`** (`handleDelete`)
  - Substitui as chamadas diretas por `supabase.functions.invoke("delete-usuario", { body: { usuario_id } })`.
  - Mostra erros por etapa quando o backend retorna 207.
- **Adicionar página/aba "Regras de Domínio"** (simples CRUD em `Permissoes.tsx` ou nova rota `/dashboard/regras-dominio`) para gerenciar `domain_rules`. *(Mínimo viável: incluir CRUD básico.)*

### 4. Patchnote
Ao final, postar no chat um patchnote com tudo que mudou.

---

## Detalhes técnicos

```text
fluxo de signup/login
──────────────────────
auth (supabase) ──► usuarios row (VIEWER default)
                         │
                         ▼
                 apply_domain_rule(uid)
                         │
                         ▼
            empresa_id + permissao da regra
                         │
                         ▼
                syncUserToGrafana(uid)
                         │
                         ▼
       mapAriiaToGrafanaRole + org da empresa
```

Constraints/grants seguem o padrão do projeto (GRANT ... TO authenticated/service_role + RLS).

---

## Fora de escopo
- Reescrita do editor visual de automações.
- UI completa de gerenciamento de orgs Grafana (apenas o vínculo `empresas.grafana_organization_id` será exposto via select existente).
