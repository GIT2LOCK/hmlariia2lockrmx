## Controle de Permissões — Chamados Ariia

### Mapeamento de perfis

Hoje o Ariia usa: `SUPERADMIN`, `ADMIN`, `USER`, `VIEWER`, `TV_VIEW`.
Os 4 perfis solicitados serão mapeados sem quebrar o que já existe:

| Perfil solicitado | Implementação                                                                  |
| ----------------- | ------------------------------------------------------------------------------ |
| Administrador     | `SUPERADMIN` + `ADMIN` (já existem)                                            |
| Supervisor        | `USER` com papel `COORDENADOR` ou `GESTOR` em uma `support_group` (já existe)  |
| Técnico           | `USER` com papel `MEMBRO` em uma `support_group` (já existe)                   |
| Cliente           | **Novo perfil `CLIENTE`** vinculado a uma `empresa_id` na tabela `usuarios`    |

VIEWER e TV_VIEW continuam intocados (somente leitura / dashboards de TV).

### Backend (migration única)

1. **`usuarios`**
   - Adicionar coluna `empresa_id INTEGER REFERENCES empresas(id)` (nullable, usada só por CLIENTE).
   - Ampliar valores aceitos em `permissao` para incluir `CLIENTE`.

2. **Helpers SECURITY DEFINER** (centralizam toda a lógica):
   - `fn_current_usuario()` → `(id, permissao, empresa_id)` do `auth.uid()`.
   - `fn_is_admin()` → true para SUPERADMIN/ADMIN.
   - `fn_is_supervisor_of(group_id)` → COORDENADOR/GESTOR em alguma group.
   - `fn_can_view_ticket(ticket_id)` → centraliza toda regra:
     - ADMIN: tudo
     - CLIENTE: somente tickets da `empresa_id` ou onde `criado_por = self`
     - Supervisor: tickets de groups onde é COORDENADOR/GESTOR
     - Técnico: tickets onde `tecnico_id = self` ou `criado_por = self`
   - `fn_can_edit_ticket(ticket_id)` — mesma matriz para escrita.

3. **RLS de `tickets` reescrita** com `fn_can_view_ticket` / `fn_can_edit_ticket`. Aplicar regra equivalente em `ticket_comments`, `ticket_attachments`, `ticket_history`, `ticket_notifications` (CLIENTE vê só do próprio ticket; comentários internos ficam ocultos para CLIENTE via flag `interno`).
   - Adicionar coluna `interno BOOLEAN DEFAULT false` em `ticket_comments` se ainda não existir, e filtrar na RLS para CLIENTE.

4. **Atualizar `fn_dashboard_ticket_ids()`** para incluir o caso CLIENTE (filtro por `empresa_id`).

### Frontend

1. **`src/lib/permissions.ts` (novo — matriz central)**
   - Exporta `Permission` enum: `tickets.view_own`, `tickets.view_team`, `tickets.view_all`, `tickets.create`, `tickets.assign`, `tickets.transfer`, `tickets.close`, `users.manage`, `users.manage_permissions`, `system.configure`, `dashboard.admin`, `dashboard.team`.
   - `PERMISSION_MATRIX: Record<Role, Permission[]>`.
   - `can(user, permission, ctx?)` único ponto de verificação.
   - Mensagens amigáveis: `PERMISSION_DENIED_MESSAGES`.

2. **`UserContext`** — adicionar `empresa_id`, `role` agora pode ser `CLIENTE`, e helpers `can()`, `isCliente`, `isTecnico`, `isSupervisor`, `isAdmin`.

3. **`AppSidebar`** — esconder itens conforme `can()`:
   - CLIENTE vê apenas: Meus Chamados, Abrir Chamado, Meu Perfil.
   - Técnico: Chamados (filtrado), Dashboard Atendimento (próprio recorte), Base de Conhecimento.
   - Supervisor: + Equipes, Relatórios da equipe.
   - Admin: tudo.

4. **`ProtectedRoute`** — aceita `requirePermission` e redireciona com toast amigável quando negado.

5. **Páginas de chamados (`Chamados.tsx`, `ChamadoDetalhe.tsx`, `AbrirChamadoModal`)**:
   - Ocultar/condicionar botões (Atribuir, Transferir, Alterar SLA, Mudar prioridade, Comentário interno) via `can()`.
   - Para CLIENTE: esconder fluxo operacional, técnico responsável (mostrar só "Equipe responsável"), comentários internos.
   - Tela de "acesso negado" amigável quando o ticket existe mas a RLS retorna vazio.

6. **Nova página `/admin/permissoes` (`Permissoes.tsx`)** — substitui/expande a aba atual de `Usuarios.tsx`:
   - Tabela: Nome, E-mail, Perfil, Equipe(s), Empresa (se CLIENTE), Status, Ações.
   - Filtros: perfil, equipe, empresa, status. Busca por nome/e-mail.
   - Modal de edição:
     - Alterar `permissao` (Admin/Supervisor/Técnico/Cliente/Viewer).
     - Vincular a uma ou mais `support_groups` com papel (membro/coordenador/gestor).
     - Vincular a uma `empresa` (visível apenas se perfil = CLIENTE).
     - Ativar/desativar.
     - Bloquear edição do próprio usuário (exceto SUPERADMIN editando outro SUPERADMIN com confirmação).
   - Acesso restrito por `can('users.manage_permissions')`.

7. **Sidebar/Header** — link "Permissões" só para Admin.

### Entrega incremental

1. Migration: coluna `empresa_id`, helpers, RLS, dashboard ids.
2. `permissions.ts` + UserContext atualizado.
3. Sidebar + ProtectedRoute aplicando matriz.
4. Ajustes em `Chamados.tsx` / `ChamadoDetalhe.tsx` (CLIENTE-safe).
5. Nova tela `/admin/permissoes` com edição completa.
6. Mensagens de erro amigáveis (toast utilitário `denyToast(permission)`).

### Pontos a confirmar antes de implementar

1. **Perfil "Cliente" é novo** — o sistema hoje não tem usuários CLIENTE. Confirma criar o perfil e vincular via `empresa_id` em `usuarios`?
2. **Comentários internos x cliente** — adicionar flag `interno` em `ticket_comments` para esconder do CLIENTE? (recomendado)
3. **Supervisor = papel na equipe** (já existe COORDENADOR/GESTOR) — manter assim ou criar um perfil `SUPERVISOR` separado em `permissao`?
4. **CLIENTE pode ver técnico responsável?** — proponho mostrar apenas "Equipe" e não o nome do técnico.