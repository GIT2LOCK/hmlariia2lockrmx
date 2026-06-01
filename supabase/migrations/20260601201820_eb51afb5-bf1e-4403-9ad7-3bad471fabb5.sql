UPDATE public.grafana_organizations
SET active = false,
    atualizado_em = now(),
    synced_at = now()
WHERE name ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';

CREATE OR REPLACE FUNCTION public.grafana_effective_permissions(_usuario_id integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  u_perm text;
  u_ativo boolean;
  result jsonb;
  rank_of CONSTANT jsonb := '{"None":0,"Viewer":1,"Editor":2,"Admin":3}'::jsonb;
BEGIN
  SELECT permissao, ativo INTO u_perm, u_ativo FROM public.usuarios WHERE id = _usuario_id;
  IF NOT FOUND OR COALESCE(u_ativo, false) = false THEN
    RETURN jsonb_build_object('is_grafana_admin', false, 'orgs', '[]'::jsonb);
  END IF;

  IF u_perm IN ('SUPERADMIN','ADMIN') THEN
    SELECT jsonb_build_object(
      'is_grafana_admin', true,
      'orgs', COALESCE(jsonb_agg(jsonb_build_object('org_id', o.id, 'grafana_org_id', o.grafana_org_id, 'name', o.name, 'role', 'Admin')), '[]'::jsonb)
    ) INTO result
    FROM public.grafana_organizations o
    WHERE o.active = true
      AND o.name !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
    RETURN result;
  END IF;

  WITH group_perms AS (
    SELECT gop.grafana_organization_id AS org_id, gop.role::text AS role
    FROM public.grafana_group_org_permissions gop
    JOIN public.grafana_access_groups g ON g.id = gop.group_id AND g.active = true
    JOIN public.grafana_access_group_members m ON m.group_id = g.id AND m.usuario_id = _usuario_id
  ),
  direct_perms AS (
    SELECT grafana_organization_id AS org_id, role::text AS role
    FROM public.grafana_user_org_permissions
    WHERE usuario_id = _usuario_id AND enabled = true
  ),
  merged AS (
    SELECT org_id, role FROM direct_perms
    UNION ALL
    SELECT org_id, role FROM group_perms WHERE org_id NOT IN (SELECT org_id FROM direct_perms)
  ),
  best AS (
    SELECT org_id, role,
      ROW_NUMBER() OVER (PARTITION BY org_id ORDER BY (rank_of->>role)::int DESC) rn
    FROM merged
  )
  SELECT jsonb_build_object(
    'is_grafana_admin', false,
    'orgs', COALESCE(jsonb_agg(jsonb_build_object(
      'org_id', b.org_id,
      'grafana_org_id', o.grafana_org_id,
      'name', o.name,
      'role', b.role
    )), '[]'::jsonb)
  ) INTO result
  FROM best b
  JOIN public.grafana_organizations o ON o.id = b.org_id
  WHERE b.rn = 1
    AND b.role <> 'None'
    AND o.active = true
    AND o.name !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';

  RETURN COALESCE(result, jsonb_build_object('is_grafana_admin', false, 'orgs', '[]'::jsonb));
END;
$function$;