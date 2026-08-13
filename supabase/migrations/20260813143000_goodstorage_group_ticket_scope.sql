-- Members of the GoodStorage support group can see every ticket from GoodStorage units.

CREATE OR REPLACE FUNCTION public.fn_user_in_support_group(_usuario_id integer, _group_name text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.support_group_members m
    JOIN public.support_groups g ON g.id = m.group_id
    WHERE m.usuario_id = _usuario_id
      AND m.ativo = true
      AND g.ativo = true
      AND g.nome ILIKE ('%' || _group_name || '%')
  );
$function$;

CREATE OR REPLACE FUNCTION public.fn_ticket_belongs_to_company(
  _empresa_id integer,
  _unidade_id integer,
  _company_name text
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.empresas e
    WHERE e.id = _empresa_id
      AND (
        e.nome_fantasia ILIKE ('%' || _company_name || '%')
        OR e.razao_social ILIKE ('%' || _company_name || '%')
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.unidades u
    JOIN public.empresas e ON e.id = u.empresa_id
    WHERE u.id = _unidade_id
      AND (
        e.nome_fantasia ILIKE ('%' || _company_name || '%')
        OR e.razao_social ILIKE ('%' || _company_name || '%')
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.fn_can_view_ticket(_ticket_id integer)
 RETURNS boolean
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid int; v_perm text; v_emp int; v_scope public.access_scope;
  v_t record;
  v_goodstorage boolean := false;
BEGIN
  SELECT u.id, u.permissao, u.empresa_id, u.access_scope
    INTO v_uid, v_perm, v_emp, v_scope
  FROM public.usuarios u
  WHERE u.auth_user_id = auth.uid() AND u.ativo = true
  LIMIT 1;

  IF v_uid IS NULL THEN RETURN false; END IF;
  IF v_scope = 'BLOCKED' OR v_scope = 'GRAFANA_ONLY' THEN RETURN false; END IF;
  IF v_perm IN ('SUPERADMIN','ADMIN') THEN RETURN true; END IF;

  SELECT empresa_id, unidade_id, tecnico_id, criado_por, assigned_by, assigned_group_id
    INTO v_t FROM public.tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN RETURN false; END IF;

  v_goodstorage := public.fn_user_in_support_group(v_uid, 'GoodStorage');
  IF v_goodstorage AND public.fn_ticket_belongs_to_company(v_t.empresa_id, v_t.unidade_id, 'GoodStorage') THEN
    RETURN true;
  END IF;

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

CREATE OR REPLACE FUNCTION public.fn_dashboard_ticket_ids()
 RETURNS TABLE(ticket_id integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid int; v_perm text; v_emp int; v_scope public.access_scope;
  v_goodstorage boolean := false;
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
  END IF;

  v_goodstorage := public.fn_user_in_support_group(v_uid, 'GoodStorage');

  IF v_perm = 'CLIENTE' THEN
    RETURN QUERY
      SELECT DISTINCT t.id FROM public.tickets t
      WHERE (v_emp IS NOT NULL AND t.empresa_id = v_emp)
         OR (v_goodstorage AND public.fn_ticket_belongs_to_company(t.empresa_id, t.unidade_id, 'GoodStorage'));
  ELSE
    RETURN QUERY
      SELECT DISTINCT t.id FROM public.tickets t
      WHERE t.tecnico_id = v_uid
         OR t.criado_por = v_uid
         OR t.assigned_by = v_uid
         OR t.assigned_group_id IN (
              SELECT m.group_id FROM public.support_group_members m
              WHERE m.usuario_id = v_uid AND m.ativo = true
         )
         OR (v_goodstorage AND public.fn_ticket_belongs_to_company(t.empresa_id, t.unidade_id, 'GoodStorage'));
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_user_in_support_group(integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_ticket_belongs_to_company(integer, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_can_view_ticket(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_dashboard_ticket_ids() TO authenticated, service_role;
