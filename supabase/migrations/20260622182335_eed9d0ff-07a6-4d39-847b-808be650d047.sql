
-- ============================================================
-- FASE 2: Reforço RLS chamados para CLIENTE/BLOCKED
-- ============================================================

-- fn_can_view_ticket — bloqueia BLOCKED, exige empresa para CLIENTE
CREATE OR REPLACE FUNCTION public.fn_can_view_ticket(_ticket_id integer)
 RETURNS boolean
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid int; v_perm text; v_emp int; v_scope public.access_scope;
  v_t record;
BEGIN
  SELECT u.id, u.permissao, u.empresa_id, u.access_scope
    INTO v_uid, v_perm, v_emp, v_scope
  FROM public.usuarios u
  WHERE u.auth_user_id = auth.uid() AND u.ativo = true
  LIMIT 1;

  IF v_uid IS NULL THEN RETURN false; END IF;
  IF v_scope = 'BLOCKED' OR v_scope = 'GRAFANA_ONLY' THEN RETURN false; END IF;
  IF v_perm IN ('SUPERADMIN','ADMIN') THEN RETURN true; END IF;

  SELECT empresa_id, tecnico_id, criado_por, assigned_by, assigned_group_id
    INTO v_t FROM public.tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_perm = 'CLIENTE' THEN
    IF v_emp IS NULL THEN RETURN false; END IF;
    RETURN v_t.empresa_id = v_emp;
  END IF;

  RETURN v_t.tecnico_id = v_uid
      OR v_t.criado_por = v_uid
      OR v_t.assigned_by = v_uid
      OR EXISTS (
        SELECT 1 FROM public.support_group_members m
        WHERE m.usuario_id = v_uid AND m.ativo = true AND m.group_id = v_t.assigned_group_id
      );
END;
$function$;

-- fn_dashboard_ticket_ids — idem
CREATE OR REPLACE FUNCTION public.fn_dashboard_ticket_ids()
 RETURNS TABLE(ticket_id integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid int; v_perm text; v_emp int; v_scope public.access_scope;
BEGIN
  SELECT u.id, u.permissao, u.empresa_id, u.access_scope
    INTO v_uid, v_perm, v_emp, v_scope
  FROM public.usuarios u
  WHERE u.auth_user_id = auth.uid() AND u.ativo = true
  LIMIT 1;

  IF v_uid IS NULL THEN RETURN; END IF;
  IF v_scope = 'BLOCKED' OR v_scope = 'GRAFANA_ONLY' THEN RETURN; END IF;

  IF v_perm IN ('SUPERADMIN','ADMIN') THEN
    RETURN QUERY SELECT t.id FROM public.tickets t;
  ELSIF v_perm = 'CLIENTE' THEN
    IF v_emp IS NULL THEN RETURN; END IF;
    RETURN QUERY SELECT t.id FROM public.tickets t WHERE t.empresa_id = v_emp;
  ELSE
    RETURN QUERY
      SELECT DISTINCT t.id FROM public.tickets t
      WHERE t.tecnico_id = v_uid
         OR t.criado_por = v_uid
         OR t.assigned_by = v_uid
         OR t.assigned_group_id IN (
              SELECT m.group_id FROM public.support_group_members m
              WHERE m.usuario_id = v_uid AND m.ativo = true
         );
  END IF;
END;
$function$;

-- Endurecer insert em tickets: CLIENTE só insere na própria empresa, e nunca BLOCKED/GRAFANA_ONLY
DROP POLICY IF EXISTS tickets_insert_scoped ON public.tickets;
CREATE POLICY tickets_insert_scoped ON public.tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid()
        AND u.ativo = true
        AND u.access_scope NOT IN ('BLOCKED','GRAFANA_ONLY')
        AND (
          u.permissao IN ('SUPERADMIN','ADMIN','USER')
          OR (u.permissao = 'CLIENTE' AND u.empresa_id IS NOT NULL AND tickets.empresa_id = u.empresa_id)
        )
    )
  );

-- ticket_notifications: SELECT/UPDATE só se o ticket relacionado for visível ao usuário
DROP POLICY IF EXISTS ticket_notifications_select_own ON public.ticket_notifications;
CREATE POLICY ticket_notifications_select_own ON public.ticket_notifications
  FOR SELECT TO authenticated
  USING (
    public.is_ariia_admin()
    OR (
      usuario_id IN (SELECT id FROM public.fn_current_usuario())
      AND (ticket_id IS NULL OR public.fn_can_view_ticket(ticket_id))
    )
  );

DROP POLICY IF EXISTS ticket_notifications_update_own ON public.ticket_notifications;
CREATE POLICY ticket_notifications_update_own ON public.ticket_notifications
  FOR UPDATE TO authenticated
  USING (
    usuario_id IN (SELECT id FROM public.fn_current_usuario())
    AND (ticket_id IS NULL OR public.fn_can_view_ticket(ticket_id))
  )
  WITH CHECK (
    usuario_id IN (SELECT id FROM public.fn_current_usuario())
  );
