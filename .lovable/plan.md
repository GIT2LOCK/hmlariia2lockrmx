# Plano de Correção — Usuários, Permissões, Grafana e Recuperação de Senha

Vou dividir o trabalho em 9 frentes. Tudo será corrigido de verdade em banco + Edge Functions + frontend, sem remendo visual.

## 1. Exclusão de usuários (corrigir de verdade)

- Reescrever a função SQL `fn_delete_usuario_cascade` para limpar **todas** as dependências antes do `DELETE`:
  `support_group_members`, `grafana_user_org_permissions`, `grafana_access_group_members`, `grafana_user_links`, `sessions`, `ticket_notifications`, `contato_unidades`+`contatos`, `ticket_comments` (autor → NULL), `ticket_history` (autor → NULL), `ticket_attachments` (uploaded_by → NULL), `tickets` (`tecnico_id`, `assigned_by`, `criado_por`, `first_response_by`, `resolved_by` → NULL).
- Edge function `delete-usuario`: logar erro real (`console.error` + retorno com `details`), executar Grafana → DB cascade → `auth.admin.deleteUser` em ordem, retornando **steps detalhados**.
- Frontend `Usuarios.tsx`: já corrigi `x-ariia-token`; mostrar a mensagem de erro real vinda dos `steps`.

## 2. Cadastro recente: permitir editar permissões imediatamente

Causa: signup faz INSERT em `usuarios` mas o `auth_user_id` é gravado em uma segunda etapa async; o painel tenta editar antes.
- Tornar o signup atômico: criar `auth.users` → criar `usuarios` com `auth_user_id` na mesma transação (edge function `signup`).
- Recarregar a lista após cada salvar e devolver o registro atualizado (`select().single()` no update).

## 3. "Esqueci minha senha"

- Botão "Esqueci minha senha" na tela de login.
- Página `/reset-password` pública que detecta `type=recovery` e chama `supabase.auth.updateUser({ password })`.
- Auth email já existe via Lovable Emails (verifico status; se faltar, escalono).
- Sincronizar campo legado `senha_hash` em `usuarios` para `NULL` após reset (a auth passa a valer pelo Supabase Auth).

## 4. Separar aba "Grafana" de "Usuários"

- **Usuários** (`/dashboard/usuarios`): listar, criar, editar (nome, e-mail, cargo Ariia, empresa, ativo), excluir, abas permitidas, grupo de suporte. Nada de Grafana.
- **Grafana** (`/dashboard/grafana`): Organizações, Gerenciar Acessos (usuário × org × papel), Grupos de acesso, Automações por domínio, Logs de sincronização, Ressincronizar.
- Mover blocos Grafana hoje em `Permissoes.tsx` para `GrafanaControle.tsx`. `Permissoes.tsx` vira somente "Permissões de abas".

## 5. Permissões por aba (por usuário)

- Nova tabela `user_tab_permissions(usuario_id, tab_key, allowed)` + lista canônica de `tab_key`: `dashboard, chamados, usuarios, empresas, unidades, operadoras, grafana, permissoes, configuracoes, relatorios, base_conhecimento`.
- Função `fn_user_allowed_tabs(_uid)` usada por:
  - `AppSidebar` para esconder itens;
  - `ProtectedRoute` para bloquear rota direta (consulta via RPC).
- SUPERADMIN/ADMIN sempre ignoram (acesso total).
- UI em "Usuários → Editar → aba Acessos" com checkboxes.

## 6. Cliente vê apenas chamados da própria empresa

- Já existe `fn_can_view_ticket` e `fn_dashboard_ticket_ids` corretos. Auditar RLS de `tickets`, `ticket_comments`, `ticket_attachments`, `ticket_history`, `tickets-api` edge function para **sempre** filtrar por `empresa_id = fn_current_usuario().empresa_id` quando `permissao='CLIENTE'`.
- Bloquear no edge function (`tickets-api`) qualquer query que tente outra `empresa_id`.

## 7. Cargo Ariia separado das permissões do Grafana

- Reescrever `grafana_effective_permissions(_uid)`:
  - SUPERADMIN → `is_grafana_admin=true` + todas orgs como Admin (mantém).
  - Demais cargos (incluindo CLIENTE/USER/ADMIN Ariia): **apenas** união de `grafana_user_org_permissions` ∪ `grafana_group_org_permissions` (via grupos) ∪ regras de `domain_rules`/`grafana_automation_rules` quando aplicáveis.
  - **Nunca** derivar acesso a partir de `empresas.grafana_organization_id` automaticamente — passa a ser apenas um *default sugerido* na UI "Gerenciar Acessos".
- `custom_access_token_hook` já chama a função acima; só precisa do ajuste.
- Em `syncUserToGrafana`: remover a lógica que adiciona o usuário à org da empresa por padrão; usar exclusivamente o resultado de `grafana_effective_permissions`.

## 8. "Gerenciar Acessos" funcional

- Refazer UI dentro da aba Grafana com:
  - tabela usuários × organizações;
  - dropdown Viewer/Editor/Admin/None;
  - botão "Salvar" → upsert em `grafana_user_org_permissions` (com `enabled`) → invoca `grafana-sync-user` imediatamente → mostra status real (sucesso só se ambos OK).
- Após salvar, recarregar permissões efetivas via `grafana_effective_permissions`.
- Reconciliação em `syncUserToGrafana`: remove o usuário das orgs que **não** estão no `desired`.

## 9. Consistência geral de feedback

- Todas as ações administrativas: `await` no update + reler do banco antes de fechar modal; toast de sucesso **só** após verificar `data` retornado; toast de erro mostra `error.message`.
- `console.error` em todos os catch das edge functions com payload de contexto.

---

## Ordem de execução

1. Migração SQL única: `fn_delete_usuario_cascade` reescrita, tabela `user_tab_permissions` + GRANTs + RLS, `fn_user_allowed_tabs`, `grafana_effective_permissions` reescrita, RLS revista de tickets.
2. Edge functions: `delete-usuario`, `signup`, `grafana-sync-user`, `tickets-api`.
3. Frontend: split Usuários/Grafana, página reset-password + link no login, UI de abas permitidas, UI Gerenciar Acessos refeita, ProtectedRoute por aba.

---

## Pontos a confirmar antes de começar

1. **Abas canônicas** — está OK a lista acima (`dashboard, chamados, usuarios, empresas, unidades, operadoras, grafana, permissoes, configuracoes, relatorios, base_conhecimento`)? Quer incluir/excluir alguma?
2. **ADMIN do Ariia** deve sempre ver todas as abas (como SUPERADMIN), ou também pode ter abas restritas?
3. **Padrão para novos usuários CLIENTE/VIEWER**: nenhuma aba marcada (precisa configurar manualmente) ou já vir com `dashboard + chamados`?
4. **Email de reset de senha** — posso usar o template padrão Lovable Emails (já há domínio configurado) ou você quer um template específico?

Posso seguir com tudo acima após sua confirmação dessas 4 perguntas.
