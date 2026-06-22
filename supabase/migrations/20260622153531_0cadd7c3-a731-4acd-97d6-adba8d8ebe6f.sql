
-- ============================================================
-- RLS: Isolate tickets and related tables by visibility rules
-- ============================================================
-- Drop legacy open policies
DROP POLICY IF EXISTS "Anon full access tickets" ON public.tickets;
DROP POLICY IF EXISTS "Authenticated full access tickets" ON public.tickets;
DROP POLICY IF EXISTS "Anon full access ticket_comments" ON public.ticket_comments;
DROP POLICY IF EXISTS "Authenticated full access ticket_comments" ON public.ticket_comments;
DROP POLICY IF EXISTS "Anon full access ticket_history" ON public.ticket_history;
DROP POLICY IF EXISTS "Authenticated full access ticket_history" ON public.ticket_history;
DROP POLICY IF EXISTS "Anon full access ticket_attachments" ON public.ticket_attachments;
DROP POLICY IF EXISTS "Authenticated full access ticket_attachments" ON public.ticket_attachments;
DROP POLICY IF EXISTS "Anon full access ticket_notifications" ON public.ticket_notifications;
DROP POLICY IF EXISTS "Authenticated full access ticket_notifications" ON public.ticket_notifications;

-- ===== TICKETS =====
CREATE POLICY "tickets_select_scoped" ON public.tickets
  FOR SELECT TO authenticated
  USING (public.fn_can_view_ticket(id));

-- Inserir: precisa ser usuário ativo. CLIENTE só pode inserir para sua empresa.
CREATE POLICY "tickets_insert_scoped" ON public.tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_ariia_admin()
    OR EXISTS (
      SELECT 1 FROM public.fn_current_usuario() c
      WHERE (c.permissao <> 'CLIENTE' OR tickets.empresa_id = c.empresa_id)
    )
  );

-- Update/Delete: somente quem pode ver. CLIENTE não pode deletar.
CREATE POLICY "tickets_update_scoped" ON public.tickets
  FOR UPDATE TO authenticated
  USING (public.fn_can_view_ticket(id))
  WITH CHECK (public.fn_can_view_ticket(id));

CREATE POLICY "tickets_delete_admin" ON public.tickets
  FOR DELETE TO authenticated
  USING (public.is_ariia_admin());

-- ===== TICKET_COMMENTS =====
CREATE POLICY "ticket_comments_select_scoped" ON public.ticket_comments
  FOR SELECT TO authenticated
  USING (public.fn_can_view_ticket(ticket_id));
CREATE POLICY "ticket_comments_insert_scoped" ON public.ticket_comments
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_can_view_ticket(ticket_id));
CREATE POLICY "ticket_comments_update_scoped" ON public.ticket_comments
  FOR UPDATE TO authenticated
  USING (public.fn_can_view_ticket(ticket_id))
  WITH CHECK (public.fn_can_view_ticket(ticket_id));
CREATE POLICY "ticket_comments_delete_admin" ON public.ticket_comments
  FOR DELETE TO authenticated
  USING (public.is_ariia_admin());

-- ===== TICKET_HISTORY =====
CREATE POLICY "ticket_history_select_scoped" ON public.ticket_history
  FOR SELECT TO authenticated
  USING (public.fn_can_view_ticket(ticket_id));
CREATE POLICY "ticket_history_insert_scoped" ON public.ticket_history
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_can_view_ticket(ticket_id));
CREATE POLICY "ticket_history_admin_write" ON public.ticket_history
  FOR ALL TO authenticated
  USING (public.is_ariia_admin())
  WITH CHECK (public.is_ariia_admin());

-- ===== TICKET_ATTACHMENTS =====
CREATE POLICY "ticket_attachments_select_scoped" ON public.ticket_attachments
  FOR SELECT TO authenticated
  USING (public.fn_can_view_ticket(ticket_id));
CREATE POLICY "ticket_attachments_insert_scoped" ON public.ticket_attachments
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_can_view_ticket(ticket_id));
CREATE POLICY "ticket_attachments_delete_scoped" ON public.ticket_attachments
  FOR DELETE TO authenticated
  USING (public.fn_can_view_ticket(ticket_id));

-- ===== TICKET_NOTIFICATIONS =====
-- Cada usuário enxerga apenas suas notificações
CREATE POLICY "ticket_notifications_select_own" ON public.ticket_notifications
  FOR SELECT TO authenticated
  USING (
    public.is_ariia_admin()
    OR usuario_id IN (SELECT id FROM public.fn_current_usuario())
  );
CREATE POLICY "ticket_notifications_update_own" ON public.ticket_notifications
  FOR UPDATE TO authenticated
  USING (usuario_id IN (SELECT id FROM public.fn_current_usuario()))
  WITH CHECK (usuario_id IN (SELECT id FROM public.fn_current_usuario()));
CREATE POLICY "ticket_notifications_admin_all" ON public.ticket_notifications
  FOR ALL TO authenticated
  USING (public.is_ariia_admin())
  WITH CHECK (public.is_ariia_admin());

-- Service role bypassa RLS, mas garantimos GRANT explícito para consistência
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tickets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_attachments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_notifications TO authenticated;
GRANT ALL ON public.tickets, public.ticket_comments, public.ticket_history,
            public.ticket_attachments, public.ticket_notifications TO service_role;
