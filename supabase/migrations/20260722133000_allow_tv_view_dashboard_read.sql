-- Allow the TV-only Ariia account to read dashboard data without Edge Functions.
DROP POLICY IF EXISTS tickets_select_scoped ON public.tickets;

CREATE POLICY tickets_select_scoped ON public.tickets
  FOR SELECT TO authenticated
  USING (
    public.current_ariia_role() IN ('SUPERADMIN','ADMIN','TV_VIEW')
    OR public.fn_can_view_ticket(id)
  );

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

  IF v_perm IN ('SUPERADMIN','ADMIN','TV_VIEW') THEN
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

GRANT EXECUTE ON FUNCTION public.fn_dashboard_ticket_ids() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'tickets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
  END IF;
END $$;
