CREATE OR REPLACE FUNCTION public.fn_delete_usuario_cascade(_usuario_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller record;
  v_auth_user_id uuid;
  v_email text;
  v_remaining integer := 0;
  v_counts jsonb := '{}'::jsonb;
  v_count integer;
BEGIN
  SELECT id, permissao INTO v_caller FROM public.fn_current_usuario();
  IF v_caller.id IS NOT NULL AND v_caller.permissao <> 'SUPERADMIN' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT auth_user_id, email INTO v_auth_user_id, v_email
  FROM public.usuarios
  WHERE id = _usuario_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('deleted', false, 'reason', 'not_found');
  END IF;

  DELETE FROM public.support_group_members WHERE usuario_id = _usuario_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('support_group_members', v_count);

  DELETE FROM public.grafana_user_org_permissions WHERE usuario_id = _usuario_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('grafana_user_org_permissions', v_count);

  DELETE FROM public.grafana_access_group_members WHERE usuario_id = _usuario_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('grafana_access_group_members', v_count);

  DELETE FROM public.grafana_user_links WHERE usuario_id = _usuario_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('grafana_user_links', v_count);

  DELETE FROM public.sessions WHERE user_id = _usuario_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('sessions', v_count);

  DELETE FROM public.ticket_notifications WHERE usuario_id = _usuario_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('ticket_notifications', v_count);

  DELETE FROM public.user_tab_permissions WHERE usuario_id = _usuario_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('user_tab_permissions', v_count);

  DELETE FROM public.nfse_app_origem WHERE usuario_id = _usuario_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('nfse_app_origem', v_count);

  DELETE FROM public.nfse_app_logs WHERE usuario_id = _usuario_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('nfse_app_logs', v_count);

  DELETE FROM public.grafana_sync_logs
  WHERE usuario_id = _usuario_id OR actor_usuario_id = _usuario_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('grafana_sync_logs', v_count);

  DELETE FROM public.ticket_sla_alerts WHERE sent_to_user_id = _usuario_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('ticket_sla_alerts', v_count);

  DELETE FROM public.ticket_comments WHERE autor_id = _usuario_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('ticket_comments', v_count);

  DELETE FROM public.ticket_history WHERE autor_id = _usuario_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('ticket_history', v_count);

  DELETE FROM public.ticket_attachments WHERE autor_id = _usuario_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('ticket_attachments', v_count);

  UPDATE public.ticket_sla_pauses
  SET paused_by = NULL
  WHERE paused_by = _usuario_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('ticket_sla_pauses_paused_by', v_count);

  UPDATE public.ticket_sla_pauses
  SET resumed_by = NULL
  WHERE resumed_by = _usuario_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('ticket_sla_pauses_resumed_by', v_count);

  UPDATE public.tickets SET tecnico_id = NULL WHERE tecnico_id = _usuario_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('tickets_tecnico_id', v_count);

  UPDATE public.tickets SET assigned_by = NULL WHERE assigned_by = _usuario_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('tickets_assigned_by', v_count);

  UPDATE public.tickets SET criado_por = NULL WHERE criado_por = _usuario_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('tickets_criado_por', v_count);

  UPDATE public.tickets SET first_response_by = NULL WHERE first_response_by = _usuario_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('tickets_first_response_by', v_count);

  UPDATE public.tickets SET resolved_by = NULL WHERE resolved_by = _usuario_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('tickets_resolved_by', v_count);

  DELETE FROM public.usuarios WHERE id = _usuario_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('usuarios', v_count);

  SELECT
    (SELECT count(*) FROM public.support_group_members WHERE usuario_id = _usuario_id) +
    (SELECT count(*) FROM public.grafana_user_org_permissions WHERE usuario_id = _usuario_id) +
    (SELECT count(*) FROM public.grafana_access_group_members WHERE usuario_id = _usuario_id) +
    (SELECT count(*) FROM public.grafana_user_links WHERE usuario_id = _usuario_id) +
    (SELECT count(*) FROM public.sessions WHERE user_id = _usuario_id) +
    (SELECT count(*) FROM public.ticket_notifications WHERE usuario_id = _usuario_id) +
    (SELECT count(*) FROM public.user_tab_permissions WHERE usuario_id = _usuario_id) +
    (SELECT count(*) FROM public.nfse_app_origem WHERE usuario_id = _usuario_id) +
    (SELECT count(*) FROM public.nfse_app_logs WHERE usuario_id = _usuario_id) +
    (SELECT count(*) FROM public.grafana_sync_logs WHERE usuario_id = _usuario_id OR actor_usuario_id = _usuario_id) +
    (SELECT count(*) FROM public.ticket_sla_alerts WHERE sent_to_user_id = _usuario_id) +
    (SELECT count(*) FROM public.ticket_comments WHERE autor_id = _usuario_id) +
    (SELECT count(*) FROM public.ticket_history WHERE autor_id = _usuario_id) +
    (SELECT count(*) FROM public.ticket_attachments WHERE autor_id = _usuario_id) +
    (SELECT count(*) FROM public.ticket_sla_pauses WHERE paused_by = _usuario_id OR resumed_by = _usuario_id) +
    (SELECT count(*) FROM public.tickets WHERE tecnico_id = _usuario_id OR assigned_by = _usuario_id OR criado_por = _usuario_id OR first_response_by = _usuario_id OR resolved_by = _usuario_id) +
    (SELECT count(*) FROM public.usuarios WHERE id = _usuario_id OR lower(email) = lower(v_email))
  INTO v_remaining;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'usuario_delete_incomplete: % remaining references', v_remaining;
  END IF;

  RETURN jsonb_build_object(
    'deleted', true,
    'auth_user_id', v_auth_user_id,
    'public_remaining_references', v_remaining,
    'counts', v_counts
  );
END;
$function$;