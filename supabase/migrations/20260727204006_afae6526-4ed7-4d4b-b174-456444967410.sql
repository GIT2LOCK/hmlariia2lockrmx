CREATE OR REPLACE FUNCTION public.fn_user_module_perms(_usuario_id integer)
RETURNS TABLE(module_key text, can_view boolean, can_create boolean, can_update boolean, can_delete boolean, can_manage boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_perm TEXT;
BEGIN
  SELECT u.permissao INTO v_perm
  FROM public.usuarios u
  WHERE u.id = _usuario_id;

  IF v_perm IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH role_perms AS (
    SELECT mp.module_key, mp.can_view, mp.can_create, mp.can_update, mp.can_delete, mp.can_manage
    FROM public.module_permissions mp
    WHERE mp.target_type = 'role' AND mp.target_key = v_perm
  ),
  user_perms AS (
    SELECT mp.module_key, mp.can_view, mp.can_create, mp.can_update, mp.can_delete, mp.can_manage
    FROM public.module_permissions mp
    WHERE mp.target_type = 'user' AND mp.target_key = _usuario_id::text
  ),
  merged AS (
    SELECT up.module_key, up.can_view, up.can_create, up.can_update, up.can_delete, up.can_manage
    FROM user_perms up
    UNION ALL
    SELECT rp.module_key, rp.can_view, rp.can_create, rp.can_update, rp.can_delete, rp.can_manage
    FROM role_perms rp
    WHERE rp.module_key NOT IN (SELECT up.module_key FROM user_perms up)
  )
  SELECT m.module_key, m.can_view, m.can_create, m.can_update, m.can_delete, m.can_manage
  FROM merged m;
END
$function$;

CREATE OR REPLACE FUNCTION public.fn_user_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid INT;
  v_user RECORD;
  v_modules JSONB;
  v_grafana JSONB;
  v_sync RECORD;
  v_groups JSONB;
BEGIN
  SELECT f.id INTO v_uid FROM public.fn_current_usuario() f;
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('authenticated', false);
  END IF;

  SELECT u.id, u.nome, u.email, u.permissao, u.empresa_id, u.access_scope, u.ativo, u.avatar_url
    INTO v_user
  FROM public.usuarios u
  WHERE u.id = v_uid;

  SELECT COALESCE(jsonb_object_agg(p.module_key, jsonb_build_object(
    'view', p.can_view,
    'create', p.can_create,
    'update', p.can_update,
    'delete', p.can_delete,
    'manage', p.can_manage
  )), '{}'::jsonb)
  INTO v_modules
  FROM public.fn_user_module_perms(v_uid) p;

  v_grafana := public.grafana_effective_permissions(v_uid);

  SELECT uss.* INTO v_sync
  FROM public.user_sync_status uss
  WHERE uss.usuario_id = v_uid;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name)), '[]'::jsonb)
  INTO v_groups
  FROM public.grafana_access_groups g
  JOIN public.grafana_access_group_members m ON m.group_id = g.id
  WHERE m.usuario_id = v_uid AND g.active = true;

  RETURN jsonb_build_object(
    'authenticated', true,
    'user', jsonb_build_object(
      'id', v_user.id,
      'nome', v_user.nome,
      'email', v_user.email,
      'permissao', v_user.permissao,
      'empresa_id', v_user.empresa_id,
      'access_scope', v_user.access_scope,
      'ativo', v_user.ativo,
      'avatar_url', v_user.avatar_url
    ),
    'module_permissions', v_modules,
    'grafana_permissions', v_grafana,
    'grafana_groups', v_groups,
    'sync_status', CASE WHEN v_sync.usuario_id IS NULL THEN NULL ELSE jsonb_build_object(
      'last_at', v_sync.last_grafana_sync_at,
      'status', v_sync.last_grafana_sync_status,
      'error', v_sync.last_grafana_sync_error
    ) END
  );
END
$function$;