
-- Enum
DO $$ BEGIN
  CREATE TYPE public.grafana_role AS ENUM ('None','Viewer','Editor','Admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Helper: is current Supabase auth user an Ariia admin?
CREATE OR REPLACE FUNCTION public.is_ariia_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE auth_user_id = auth.uid()
      AND ativo = true
      AND permissao IN ('SUPERADMIN','ADMIN')
  );
$$;

-- Tables
CREATE TABLE IF NOT EXISTS public.grafana_organizations (
  id SERIAL PRIMARY KEY,
  grafana_org_id integer NOT NULL UNIQUE,
  name text NOT NULL,
  slug text,
  active boolean NOT NULL DEFAULT true,
  synced_at timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.grafana_organizations TO authenticated;
GRANT ALL ON public.grafana_organizations TO service_role;
ALTER TABLE public.grafana_organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read grafana_organizations" ON public.grafana_organizations FOR SELECT TO authenticated USING (public.is_ariia_admin());

CREATE TABLE IF NOT EXISTS public.grafana_user_links (
  id SERIAL PRIMARY KEY,
  usuario_id integer NOT NULL UNIQUE REFERENCES public.usuarios(id) ON DELETE CASCADE,
  grafana_user_id integer,
  grafana_login text,
  grafana_email text,
  last_synced_at timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.grafana_user_links TO authenticated;
GRANT ALL ON public.grafana_user_links TO service_role;
ALTER TABLE public.grafana_user_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read grafana_user_links" ON public.grafana_user_links FOR SELECT TO authenticated USING (public.is_ariia_admin());

CREATE TABLE IF NOT EXISTS public.grafana_access_groups (
  id SERIAL PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text,
  active boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.grafana_access_groups TO authenticated;
GRANT ALL ON public.grafana_access_groups TO service_role;
ALTER TABLE public.grafana_access_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read grafana_access_groups" ON public.grafana_access_groups FOR SELECT TO authenticated USING (public.is_ariia_admin());

CREATE TABLE IF NOT EXISTS public.grafana_access_group_members (
  id SERIAL PRIMARY KEY,
  group_id integer NOT NULL REFERENCES public.grafana_access_groups(id) ON DELETE CASCADE,
  usuario_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, usuario_id)
);
GRANT SELECT ON public.grafana_access_group_members TO authenticated;
GRANT ALL ON public.grafana_access_group_members TO service_role;
ALTER TABLE public.grafana_access_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read group_members" ON public.grafana_access_group_members FOR SELECT TO authenticated USING (public.is_ariia_admin());

CREATE TABLE IF NOT EXISTS public.grafana_group_org_permissions (
  id SERIAL PRIMARY KEY,
  group_id integer NOT NULL REFERENCES public.grafana_access_groups(id) ON DELETE CASCADE,
  grafana_organization_id integer NOT NULL REFERENCES public.grafana_organizations(id) ON DELETE CASCADE,
  role public.grafana_role NOT NULL DEFAULT 'Viewer',
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, grafana_organization_id)
);
GRANT SELECT ON public.grafana_group_org_permissions TO authenticated;
GRANT ALL ON public.grafana_group_org_permissions TO service_role;
ALTER TABLE public.grafana_group_org_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read group_org_perms" ON public.grafana_group_org_permissions FOR SELECT TO authenticated USING (public.is_ariia_admin());

CREATE TABLE IF NOT EXISTS public.grafana_user_org_permissions (
  id SERIAL PRIMARY KEY,
  usuario_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  grafana_organization_id integer NOT NULL REFERENCES public.grafana_organizations(id) ON DELETE CASCADE,
  role public.grafana_role NOT NULL DEFAULT 'Viewer',
  enabled boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(usuario_id, grafana_organization_id)
);
GRANT SELECT ON public.grafana_user_org_permissions TO authenticated;
GRANT ALL ON public.grafana_user_org_permissions TO service_role;
ALTER TABLE public.grafana_user_org_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read user_org_perms" ON public.grafana_user_org_permissions FOR SELECT TO authenticated USING (public.is_ariia_admin());
CREATE POLICY "user reads own perms" ON public.grafana_user_org_permissions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = usuario_id AND u.auth_user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.grafana_sync_logs (
  id SERIAL PRIMARY KEY,
  usuario_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  actor_usuario_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  action text NOT NULL,
  status text NOT NULL,
  request_payload jsonb,
  response_payload jsonb,
  error_message text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.grafana_sync_logs TO authenticated;
GRANT ALL ON public.grafana_sync_logs TO service_role;
ALTER TABLE public.grafana_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read sync_logs" ON public.grafana_sync_logs FOR SELECT TO authenticated USING (public.is_ariia_admin());

-- Effective permissions function
CREATE OR REPLACE FUNCTION public.grafana_effective_permissions(_usuario_id integer)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
    ) INTO result FROM public.grafana_organizations o WHERE o.active = true;
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
  JOIN public.grafana_organizations o ON o.id = b.org_id AND o.active = true
  WHERE b.rn = 1 AND b.role <> 'None';

  RETURN COALESCE(result, jsonb_build_object('is_grafana_admin', false, 'orgs', '[]'::jsonb));
END;
$$;
GRANT EXECUTE ON FUNCTION public.grafana_effective_permissions(integer) TO authenticated, service_role;

-- Updated custom access token hook
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  u_id integer;
  u_permissao text;
  u_ativo boolean;
  claims jsonb;
  grafana_role text;
  perms jsonb;
  is_admin boolean;
  allowed_orgs jsonb;
  access_summary jsonb;
BEGIN
  claims := COALESCE(event->'claims', '{}'::jsonb);

  SELECT id, permissao, ativo INTO u_id, u_permissao, u_ativo
  FROM public.usuarios WHERE auth_user_id = (event->>'user_id')::uuid LIMIT 1;

  IF u_id IS NOT NULL AND COALESCE(u_ativo, false) = true THEN
    perms := public.grafana_effective_permissions(u_id);
    is_admin := COALESCE((perms->>'is_grafana_admin')::boolean, false);

    SELECT COALESCE(jsonb_agg((o->>'grafana_org_id')::int), '[]'::jsonb) INTO allowed_orgs
    FROM jsonb_array_elements(perms->'orgs') o;

    SELECT COALESCE(jsonb_object_agg(o->>'grafana_org_id', o->>'role'), '{}'::jsonb) INTO access_summary
    FROM jsonb_array_elements(perms->'orgs') o;

    grafana_role := CASE
      WHEN is_admin THEN 'GrafanaAdmin'
      WHEN jsonb_array_length(perms->'orgs') > 0 THEN 'Viewer'
      ELSE 'None'
    END;

    claims := claims
      || jsonb_build_object('ariia_usuario_id', u_id)
      || jsonb_build_object('ariia_permissao', u_permissao)
      || jsonb_build_object('grafana_role', grafana_role)
      || jsonb_build_object('grafana_is_admin', is_admin)
      || jsonb_build_object('grafana_allowed_orgs', allowed_orgs)
      || jsonb_build_object('grafana_access_summary', access_summary);

    event := jsonb_set(event, '{claims}', claims);
  END IF;

  RETURN event;
END;
$$;
