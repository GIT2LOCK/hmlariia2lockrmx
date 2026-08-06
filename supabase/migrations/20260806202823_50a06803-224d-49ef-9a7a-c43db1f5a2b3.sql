CREATE OR REPLACE FUNCTION public.fn_user_allowed_tabs(_usuario_id integer DEFAULT NULL::integer)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid int;
  v_perm text;
  v_all CONSTANT text[] := ARRAY[
    'dashboard','chamados','atendimento','usuarios','empresas','unidades',
    'operadoras','grafana','permissoes','base_conhecimento','relatorios',
    'equipes','zabbix','pessoas','responsaveis','linkai'
  ];
  v_result text[];
BEGIN
  IF _usuario_id IS NULL THEN
    SELECT id, permissao INTO v_uid, v_perm FROM public.fn_current_usuario();
  ELSE
    SELECT id, permissao INTO v_uid, v_perm FROM public.usuarios WHERE id = _usuario_id;
  END IF;

  IF v_uid IS NULL THEN RETURN ARRAY[]::text[]; END IF;
  IF v_perm IN ('SUPERADMIN','ADMIN') THEN RETURN v_all; END IF;

  SELECT COALESCE(array_agg(tab_key ORDER BY tab_key), ARRAY[]::text[])
    INTO v_result
  FROM public.user_tab_permissions
  WHERE usuario_id = v_uid AND allowed = true;

  -- Se não há configuração, aplicar default por cargo
  IF array_length(v_result, 1) IS NULL THEN
    IF v_perm = 'CLIENTE' THEN
      v_result := ARRAY['chamados'];
    ELSE
      v_result := v_all;
    END IF;
  END IF;
  RETURN v_result;
END $function$;