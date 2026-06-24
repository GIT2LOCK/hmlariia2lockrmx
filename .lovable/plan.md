# Plano de correção — Chamados + Sincronização Grafana

Vou tratar tudo em blocos coordenados. Backend (RLS, RPCs, edge functions) primeiro — é a causa-raiz da maioria dos erros — depois frontend (UX de updates, anexos, preview, seleção de técnico).

---

## Bloco 1 — RLS da tabela `tickets` (corrige erros do Cliente e do Admin)

**Causa provável:** as policies atuais usam `WITH CHECK` muito restritivo e/ou um único `FOR ALL` que mistura INSERT/UPDATE — Admin cai no mesmo bloqueio do Cliente porque o `WITH CHECK` exige `empresa_id = usuario.empresa_id`, e Admin não tem `empresa_id`.

Migration que vou rodar:

1. **DROP** das policies atuais de `tickets`.
2. Criar policies separadas por operação usando `fn_current_usuario()` + `is_ariia_admin()`:
   - `tickets_select`: Admin/Superadmin vê tudo; Técnico vê o que `fn_can_view_ticket` permite; Cliente vê apenas `empresa_id = sua empresa`.
   - `tickets_insert`:
     - Admin/Superadmin: livre.
     - Técnico (USER): livre dentro das filas/grupos dele.
     - Cliente: `WITH CHECK (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid()) AND empresa_id IS NOT NULL)`.
   - `tickets_update`:
     - Admin/Superadmin: `USING (true) WITH CHECK (true)`.
     - Técnico: pode atualizar tickets atribuídos a ele ou ao grupo dele.
     - Cliente: pode atualizar apenas campos não-técnicos (já existe trigger `fn_block_cliente_internal_ticket_updates` — mantenho).
3. Garantir GRANTs corretos (`authenticated`, `service_role`).
4. Trigger novo `fn_validate_tecnico_responsavel`: bloqueia salvar `tecnico_id` apontando para usuário com `permissao = 'CLIENTE'` ou `access_scope = 'GRAFANA_ONLY'/'BLOCKED'`. Mensagem: `tecnico_invalido_cliente_nao_permitido`.

## Bloco 2 — Vínculo automático Cliente↔Empresa antes de abrir chamado

- Em `supabase/functions/signup/index.ts`: depois de criar o usuário, chamar `apply_domain_rule` (já existe) e **só então** retornar sucesso. Hoje o domínio só seta `permissao`; vou ajustar `apply_domain_rule` para também setar `empresa_id` quando a regra tem `empresa_id` mesmo se o usuário já tinha um (priorizando a regra de domínio ativa, exceto se `permissao_manual=true`).
- No frontend `ClienteAbrirChamadoModal.tsx`: antes de submeter, ler `usuarios.empresa_id` do usuário logado. Se nulo, exibir: *"Não foi possível abrir o chamado porque sua conta ainda não está vinculada a uma empresa. Tente novamente em alguns segundos ou contate o suporte."* e bloquear submit.
- Forçar `empresa_id` no payload sempre = `empresa_id` do usuário (ignorar qualquer valor vindo do form).

## Bloco 3 — Updates/mensagens com anti-duplo-clique e anexos

Arquivos: `src/pages/ChamadoDetalhe.tsx` e/ou componentes da timeline.

- Estado `isSending` no botão de enviar mensagem. Desabilita imediatamente, mostra spinner, reabilita só após `await`.
- Guard adicional com `useRef` para ignorar segundo clique enquanto a promise está pendente.
- Limpar campo de texto + anexos após sucesso; toast `"Mensagem adicionada ao chamado."` / erro `"Não foi possível adicionar a mensagem. Tente novamente."`.
- Recarregar a timeline (refetch) após sucesso.
- **Anexos no update:** adicionar input file ao formulário de mensagem. Reusar bucket `ticket-attachments` (ou o já existente) + `ticket_attachments.comment_id` (nova coluna FK para `ticket_comments.id`, nullable — mantém compatibilidade com anexos da abertura).

Migration:
```sql
ALTER TABLE public.ticket_attachments
  ADD COLUMN IF NOT EXISTS comment_id integer
  REFERENCES public.ticket_comments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_comment_id
  ON public.ticket_attachments(comment_id);
```

Validações: limite 5MB por arquivo, tipos permitidos (png/jpg/jpeg/webp/pdf/doc/docx/xls/xlsx/txt). Erro de upload exibido sem duplicar a mensagem.

## Bloco 4 — Preview de imagens e listagem de anexos na timeline

- Componente novo `TicketAttachmentList` reusável:
  - Para imagens (`image/*`): renderiza `<img>` miniatura (max 160px) + botão "Visualizar" abrindo modal/lightbox (Dialog do shadcn) com a imagem em tamanho real.
  - Para PDFs: ícone + "Abrir em nova aba" + "Baixar".
  - Demais tipos: ícone + nome + tamanho + "Baixar".
- Renderizar abaixo de cada mensagem na timeline, agrupando os anexos pelo `comment_id` correspondente. Anexos da abertura (sem `comment_id`) aparecem no cabeçalho do chamado, como hoje.

## Bloco 5 — Técnico responsável não pode ser Cliente

- Trigger SQL (Bloco 1.4) garante o bloqueio no banco.
- Frontend: no `<Select>` de técnico (provavelmente em `TicketModal.tsx`/`ChamadoDetalhe.tsx`), filtrar o `useQuery` de usuários para `permissao IN ('SUPERADMIN','ADMIN','USER')` e `access_scope IN ('ARIIA_ONLY','ARIIA_AND_GRAFANA')` e `ativo=true`.
- Tratar o erro do trigger no `catch` exibindo: *"O responsável selecionado não possui permissão para tratar chamados."*

## Bloco 6 — Sincronização Grafana respeitando regra de domínio (WCTECH/GoodStorage)

Causa: `syncUserToGrafana` está adicionando o usuário em `orgId=1` (Default) como fallback quando `grafana_evaluate_automations` não devolve nada porque a `empresa_id` correta ainda não tinha sido aplicada quando a sync rodou no signup; e ao re-sincronizar nunca removia a Default.

Mudanças em `supabase/functions/_shared/grafana.ts` (e/ou `grafana-sync-user`):

1. No `syncUserToGrafana`, **antes** de avaliar automações, chamar `apply_domain_rule(usuario_id)`. Isso garante empresa correta.
2. Resolver org-alvo na seguinte ordem:
   a. Automações (`grafana_evaluate_automations`).
   b. Permissões diretas/grupos (`grafana_effective_permissions`).
   c. Org vinculada à `empresas.grafana_organization_id` da empresa do usuário (vou adicionar essa coluna se ainda não existir, ou usar a tabela `domain_rules` já existente que pode ter `grafana_organization_id`).
3. Se a lista resolvida **não estiver vazia** e o usuário **não for admin**: **remover** Default (orgId=1) do usuário no Grafana via `DELETE /api/orgs/1/users/:id`.
4. Nunca criar/usar org com nome = e-mail do usuário (já existe filtro regex em `grafana_effective_permissions`; replicar no provisionamento).
5. Logar em `grafana_sync_logs` com: usuário, email, domínio, empresa, org esperada, org atribuída, status, mensagem.
6. Em `signup/index.ts`: depois de criar usuário → `apply_domain_rule` → `syncUserToGrafana`. Garante que a regra está aplicada antes da sync (já é o fluxo, vou apenas ratificar a ordem).

Se faltar coluna `domain_rules.grafana_organization_id`, adicionar via migration.

## Bloco 7 — Mensagens e validações finais

- Tratar mensagens de erro no frontend traduzindo códigos retornados pelos triggers (`cliente_cannot_modify_*`, `tecnico_invalido_cliente_nao_permitido`).
- Testar fluxo de criar conta WCTECH → conferir log + org Grafana.
- Testar fluxo Cliente GoodStorage abrindo chamado.
- Testar Admin editando chamado.

---

## Arquivos a alterar/criar

**Migrations (Supabase):**
- `tickets`: drop+recreate policies, novo trigger técnico válido.
- `ticket_attachments`: coluna `comment_id`.
- `apply_domain_rule`: ajuste para popular `empresa_id` quando regra define.
- `domain_rules`: garantir coluna `grafana_organization_id` (se faltar).

**Edge functions:**
- `supabase/functions/_shared/grafana.ts` — lógica de resolução de org + remoção da Default.
- `supabase/functions/signup/index.ts` — garantir ordem `apply_domain_rule` → `syncUserToGrafana`.
- `supabase/functions/grafana-sync-user/index.ts` — mesma lógica nova.

**Frontend:**
- `src/components/ClienteAbrirChamadoModal.tsx` — validação `empresa_id`, forçar campo.
- `src/components/AbrirChamadoModal.tsx` — filtro de técnico, tratamento de erros.
- `src/pages/ChamadoDetalhe.tsx` — anti-duplo-clique, upload de anexo no update, refetch, tratamento de erros, filtro técnico.
- `src/components/tickets/TicketTimeline.tsx` — renderizar anexos por mensagem.
- `src/components/tickets/TicketAttachmentList.tsx` (novo) — preview/lightbox.

---

## Detalhes técnicos importantes

- Triggers `fn_block_cliente_internal_ticket_updates` e `fn_block_cliente_sensitive_user_updates` ficam intactos.
- Nenhuma mudança em `auth/storage/realtime`.
- Bucket de anexos: reuso do existente; sem nova bucket.
- Lightbox: usar `Dialog` do shadcn (sem nova dependência).
- Tudo idempotente — migrations usam `IF NOT EXISTS` / `DROP POLICY IF EXISTS`.

Posso prosseguir com a implementação?