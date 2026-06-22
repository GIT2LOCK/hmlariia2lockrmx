CREATE OR REPLACE FUNCTION public.fn_delete_usuario_cascade(_usuario_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller record;
  v_auth_user_id uuid;
BEGIN
  SELECT id, permissao INTO v_caller FROM public.fn_current_usuario();
  IF v_caller.id IS NOT NULL AND v_caller.permissao <> 'SUPERADMIN' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT auth_user_id INTO v_auth_user_id FROM public.usuarios WHERE id = _usuario_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('deleted', false, 'reason', 'not_found');
  END IF;

  DELETE FROM public.support_group_members WHERE usuario_id = _usuario_id;
  DELETE FROM public.grafana_user_org_permissions WHERE usuario_id = _usuario_id;
  DELETE FROM public.grafana_access_group_members WHERE usuario_id = _usuario_id;
  DELETE FROM public.grafana_user_links WHERE usuario_id = _usuario_id;
  DELETE FROM public.sessions WHERE user_id = _usuario_id;
  DELETE FROM public.ticket_notifications WHERE usuario_id = _usuario_id;
  DELETE FROM public.user_tab_permissions WHERE usuario_id = _usuario_id;

  UPDATE public.tickets SET tecnico_id = NULL WHERE tecnico_id = _usuario_id;
  UPDATE public.tickets SET assigned_by = NULL WHERE assigned_by = _usuario_id;
  UPDATE public.tickets SET criado_por = NULL WHERE criado_por = _usuario_id;
  UPDATE public.tickets SET first_response_by = NULL WHERE first_response_by = _usuario_id;
  UPDATE public.tickets SET resolved_by = NULL WHERE resolved_by = _usuario_id;
  UPDATE public.ticket_comments SET autor_id = NULL WHERE autor_id = _usuario_id;
  UPDATE public.ticket_history SET autor_id = NULL WHERE autor_id = _usuario_id;
  BEGIN
    UPDATE public.ticket_attachments SET uploaded_by = NULL WHERE uploaded_by = _usuario_id;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;
  BEGIN
    UPDATE public.ticket_sla_pauses SET paused_by = NULL WHERE paused_by = _usuario_id;
    UPDATE public.ticket_sla_pauses SET resumed_by = NULL WHERE resumed_by = _usuario_id;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;

  DELETE FROM public.usuarios WHERE id = _usuario_id;

  RETURN jsonb_build_object('deleted', true, 'auth_user_id', v_auth_user_id);
END;
$function$;