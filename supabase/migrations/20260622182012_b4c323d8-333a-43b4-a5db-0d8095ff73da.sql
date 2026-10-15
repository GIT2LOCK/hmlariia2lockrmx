
-- ============================================================
-- FASE 1: Fundação para access_scope, module permissions, sync status e audit
-- ============================================================

-- 1) Enum access_scope
DO $$ BEGIN
  CREATE TYPE public.access_scope AS ENUM ('ARIIA_ONLY','GRAFANA_ONLY','ARIIA_AND_GRAFANA','BLOCKED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Coluna access_scope em usuarios
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS access_scope public.access_scope NOT NULL DEFAULT 'ARIIA_AND_GRAFANA';

-- Backfill: usuário inativo => BLOCKED; CLIENTE => ARIIA_ONLY; demais => ARIIA_AND_GRAFANA
UPDATE public.usuarios SET access_scope = 'BLOCKED' WHERE ativo = false;
UPDATE public.usuarios SET access_scope = 'ARIIA_ONLY'
  WHERE ativo = true AND permissao = 'CLIENTE' AND access_scope = 'ARIIA_AND_GRAFANA';

-- ============================================================
-- 3) module_permissions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.module_permissions (
  id BIGSERIAL PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('role','user')),
  target_key TEXT NOT NULL,                  -- role: 'SUPERADMIN'|'ADMIN'|'USER'|'CLIENTE'|'VIEWER' ; user: usuario.id::text
  module_key TEXT NOT NULL,                  -- 'dashboard','chamados','usuarios','empresas','unidades','operadoras','grafana','permissoes','base_conhecimento','relatorios','equipes','zabbix','pessoas','responsaveis','admin'
  can_view BOOLEAN NOT NULL DEFAULT false,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_update BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  can_manage BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (target_type, target_key, module_key)
);

GRANT SELECT ON public.module_permissions TO authenticated;
GRANT ALL ON public.module_permissions TO service_role;

ALTER TABLE public.module_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "module_perms_admin_all" ON public.module_permissions
  FOR ALL TO authenticated
  USING (public.is_ariia_admin())
  WITH CHECK (public.is_ariia_admin());

CREATE POLICY "module_perms_user_read_own" ON public.module_permissions
  FOR SELECT TO authenticated
  USING (
    target_type = 'user'
    AND target_key = (SELECT id::text FROM public.fn_current_usuario())
  );

CREATE OR REPLACE FUNCTION public.fn_module_perms_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_module_perms_touch ON public.module_permissions;
CREATE TRIGGER trg_module_perms_touch BEFORE UPDATE ON public.module_permissions
  FOR EACH ROW EXECUTE FUNCTION public.fn_module_perms_touch();

-- Seeds default por perfil
INSERT INTO public.module_permissions (target_type, target_key, module_key, can_view, can_create, can_update, can_delete, can_manage)
VALUES
  -- SUPERADMIN: tudo
  ('role','SUPERADMIN','dashboard',true,true,true,true,true),
  ('role','SUPERADMIN','chamados',true,true,true,true,true),
  ('role','SUPERADMIN','usuarios',true,true,true,true,true),
  ('role','SUPERADMIN','empresas',true,true,true,true,true),
  ('role','SUPERADMIN','unidades',true,true,true,true,true),
  ('role','SUPERADMIN','operadoras',true,true,true,true,true),
  ('role','SUPERADMIN','grafana',true,true,true,true,true),
  ('role','SUPERADMIN','permissoes',true,true,true,true,true),
  ('role','SUPERADMIN','base_conhecimento',true,true,true,true,true),
  ('role','SUPERADMIN','relatorios',true,true,true,true,true),
  ('role','SUPERADMIN','equipes',true,true,true,true,true),
  ('role','SUPERADMIN','zabbix',true,true,true,true,true),
  ('role','SUPERADMIN','pessoas',true,true,true,true,true),
  ('role','SUPERADMIN','responsaveis',true,true,true,true,true),
  ('role','SUPERADMIN','admin',true,true,true,true,true),
  -- ADMIN: tudo exceto admin master
  ('role','ADMIN','dashboard',true,true,true,true,true),
  ('role','ADMIN','chamados',true,true,true,true,true),
  ('role','ADMIN','usuarios',true,true,true,true,false),
  ('role','ADMIN','empresas',true,true,true,true,false),
  ('role','ADMIN','unidades',true,true,true,true,false),
  ('role','ADMIN','operadoras',true,true,true,true,false),
  ('role','ADMIN','grafana',true,true,true,false,false),
  ('role','ADMIN','permissoes',true,false,true,false,false),
  ('role','ADMIN','base_conhecimento',true,true,true,true,false),
  ('role','ADMIN','relatorios',true,false,false,false,false),
  ('role','ADMIN','equipes',true,true,true,true,false),
  ('role','ADMIN','zabbix',true,false,false,false,false),
  ('role','ADMIN','pessoas',true,true,true,true,false),
  ('role','ADMIN','responsaveis',true,true,true,true,false),
  -- USER (técnico): operacional
  ('role','USER','dashboard',true,false,false,false,false),
  ('role','USER','chamados',true,true,true,false,false),
  ('role','USER','base_conhecimento',true,false,false,false,false),
  ('role','USER','relatorios',true,false,false,false,false),
  -- CLIENTE: só chamados
  ('role','CLIENTE','chamados',true,true,false,false,false),
  -- VIEWER: só visualização
  ('role','VIEWER','dashboard',true,false,false,false,false),
  ('role','VIEWER','chamados',true,false,false,false,false)
ON CONFLICT (target_type, target_key, module_key) DO NOTHING;

-- ============================================================
-- 4) user_sync_status
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_sync_status (
  usuario_id INTEGER PRIMARY KEY REFERENCES public.usuarios(id) ON DELETE CASCADE,
  last_grafana_sync_at TIMESTAMPTZ,
  last_grafana_sync_status TEXT,             -- 'success'|'error'|'skipped'
  last_grafana_sync_error TEXT,
  last_grafana_sync_payload JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_sync_status TO authenticated;
GRANT ALL ON public.user_sync_status TO service_role;

ALTER TABLE public.user_sync_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_status_admin_all" ON public.user_sync_status
  FOR ALL TO authenticated
  USING (public.is_ariia_admin())
  WITH CHECK (public.is_ariia_admin());

CREATE POLICY "sync_status_user_read_own" ON public.user_sync_status
  FOR SELECT TO authenticated
  USING (usuario_id = (SELECT id FROM public.fn_current_usuario()));

-- ============================================================
-- 5) user_audit_log
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_audit_log (
  id BIGSERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  actor_usuario_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
  acao TEXT NOT NULL,                        -- 'access_scope_changed','permissao_changed','module_perm_changed','grafana_role_changed','grafana_org_added','grafana_org_removed','sync_executed','user_blocked','user_unblocked'
  detalhe JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_audit_log_usuario ON public.user_audit_log(usuario_id, created_at DESC);

GRANT SELECT ON public.user_audit_log TO authenticated;
GRANT ALL ON public.user_audit_log TO service_role;

ALTER TABLE public.user_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_admin_all" ON public.user_audit_log
  FOR ALL TO authenticated
  USING (public.is_ariia_admin())
  WITH CHECK (public.is_ariia_admin());

CREATE POLICY "audit_log_user_read_own" ON public.user_audit_log
  FOR SELECT TO authenticated
  USING (usuario_id = (SELECT id FROM public.fn_current_usuario()));

-- ============================================================
-- 6) fn_user_module_perms
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_user_module_perms(_usuario_id INTEGER)
RETURNS TABLE (
  module_key TEXT,
  can_view BOOLEAN,
  can_create BOOLEAN,
  can_update BOOLEAN,
  can_delete BOOLEAN,
  can_manage BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_perm TEXT;
BEGIN
  SELECT permissao INTO v_perm FROM public.usuarios WHERE id = _usuario_id;
  IF v_perm IS NULL THEN RETURN; END IF;

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
    SELECT * FROM user_perms
    UNION ALL
    SELECT * FROM role_perms WHERE module_key NOT IN (SELECT module_key FROM user_perms)
  )
  SELECT * FROM merged;
END $$;

-- ============================================================
-- 7) Atualizar grafana_effective_permissions para respeitar access_scope
-- ============================================================
CREATE OR REPLACE FUNCTION public.grafana_effective_permissions(_usuario_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  u_perm text;
  u_ativo boolean;
  u_scope public.access_scope;
  result jsonb;
  rank_of CONSTANT jsonb := '{"None":0,"Viewer":1,"Editor":2,"Admin":3}'::jsonb;
BEGIN
  SELECT permissao, ativo, access_scope INTO u_perm, u_ativo, u_scope
  FROM public.usuarios WHERE id = _usuario_id;
  IF NOT FOUND OR COALESCE(u_ativo, false) = false THEN
    RETURN jsonb_build_object('is_grafana_admin', false, 'orgs', '[]'::jsonb);
  END IF;

  -- Respeita access_scope: só GRAFANA_ONLY e ARIIA_AND_GRAFANA podem ter orgs
  IF u_scope NOT IN ('GRAFANA_ONLY','ARIIA_AND_GRAFANA') THEN
    RETURN jsonb_build_object('is_grafana_admin', false, 'orgs', '[]'::jsonb);
  END IF;

  IF u_perm = 'SUPERADMIN' THEN
    SELECT jsonb_build_object(
      'is_grafana_admin', true,
      'orgs', COALESCE(jsonb_agg(jsonb_build_object(
        'org_id', o.id, 'grafana_org_id', o.grafana_org_id, 'name', o.name, 'role', 'Admin'
      )), '[]'::jsonb)
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

-- ============================================================
-- 8) Atualizar custom_access_token_hook para incluir access_scope
-- ============================================================
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  u_id integer;
  u_permissao text;
  u_ativo boolean;
  u_scope public.access_scope;
  claims jsonb;
  grafana_role text;
  perms jsonb;
  is_admin boolean;
  allowed_orgs jsonb;
  access_summary jsonb;
BEGIN
  claims := COALESCE(event->'claims', '{}'::jsonb);

  SELECT id, permissao, ativo, access_scope INTO u_id, u_permissao, u_ativo, u_scope
  FROM public.usuarios WHERE auth_user_id = (event->>'user_id')::uuid LIMIT 1;

  IF u_id IS NOT NULL AND COALESCE(u_ativo, false) = true THEN
    perms := public.grafana_effective_permissions(u_id);
    is_admin := COALESCE((perms->>'is_grafana_admin')::boolean, false);

    SELECT COALESCE(jsonb_agg((o->>'grafana_org_id')::int), '[]'::jsonb) INTO allowed_orgs
    FROM jsonb_array_elements(perms->'orgs') o;

    SELECT COALESCE(jsonb_object_agg(o->>'grafana_org_id', o->>'role'), '{}'::jsonb) INTO access_summary
    FROM jsonb_array_elements(perms->'orgs') o;

    grafana_role := CASE
      WHEN u_scope NOT IN ('GRAFANA_ONLY','ARIIA_AND_GRAFANA') THEN 'None'
      WHEN is_admin THEN 'GrafanaAdmin'
      WHEN jsonb_array_length(perms->'orgs') > 0 THEN 'Viewer'
      ELSE 'Viewer'  -- fallback Default orgId=1 será Viewer
    END;

    claims := claims
      || jsonb_build_object('ariia_usuario_id', u_id)
      || jsonb_build_object('ariia_permissao', u_permissao)
      || jsonb_build_object('ariia_access_scope', u_scope)
      || jsonb_build_object('grafana_role', grafana_role)
      || jsonb_build_object('grafana_is_admin', is_admin)
      || jsonb_build_object('grafana_allowed_orgs', allowed_orgs)
      || jsonb_build_object('grafana_access_summary', access_summary);

    event := jsonb_set(event, '{claims}', claims);
  END IF;

  RETURN event;
END;
$function$;

-- ============================================================
-- 9) fn_user_context — payload único para o frontend
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_user_context()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid INT;
  v_user RECORD;
  v_modules JSONB;
  v_grafana JSONB;
  v_sync RECORD;
  v_groups JSONB;
BEGIN
  SELECT id INTO v_uid FROM public.fn_current_usuario();
  IF v_uid IS NULL THEN RETURN jsonb_build_object('authenticated', false); END IF;

  SELECT id, nome, email, permissao, empresa_id, access_scope, ativo, avatar_url
    INTO v_user FROM public.usuarios WHERE id = v_uid;

  SELECT COALESCE(jsonb_object_agg(module_key, jsonb_build_object(
    'view', can_view, 'create', can_create, 'update', can_update, 'delete', can_delete, 'manage', can_manage
  )), '{}'::jsonb)
  INTO v_modules
  FROM public.fn_user_module_perms(v_uid);

  v_grafana := public.grafana_effective_permissions(v_uid);

  SELECT * INTO v_sync FROM public.user_sync_status WHERE usuario_id = v_uid;

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
END $$;

GRANT EXECUTE ON FUNCTION public.fn_user_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_user_module_perms(INTEGER) TO authenticated;
