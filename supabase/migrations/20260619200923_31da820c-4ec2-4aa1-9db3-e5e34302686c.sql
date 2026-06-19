
-- =========================================================
-- 1) Cascade delete robusto para usuários
-- =========================================================
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

  -- Vínculos diretos (delete)
  DELETE FROM public.support_group_members WHERE usuario_id = _usuario_id;
  DELETE FROM public.grafana_user_org_permissions WHERE usuario_id = _usuario_id;
  DELETE FROM public.grafana_access_group_members WHERE usuario_id = _usuario_id;
  DELETE FROM public.grafana_user_links WHERE usuario_id = _usuario_id;
  DELETE FROM public.sessions WHERE user_id = _usuario_id;
  DELETE FROM public.ticket_notifications WHERE usuario_id = _usuario_id;
  DELETE FROM public.user_tab_permissions WHERE usuario_id = _usuario_id;
  DELETE FROM public.contato_unidades
    WHERE contato_id IN (SELECT id FROM public.contatos WHERE usuario_id = _usuario_id);
  DELETE FROM public.contatos WHERE usuario_id = _usuario_id;

  -- Preservar tickets/comentários/histórico mas limpar autoria
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

-- =========================================================
-- 2) Tabela de permissões de abas por usuário
-- =========================================================
CREATE TABLE IF NOT EXISTS public.user_tab_permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  tab_key     text NOT NULL,
  allowed     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, tab_key)
);

GRANT SELECT ON public.user_tab_permissions TO authenticated;
GRANT ALL ON public.user_tab_permissions TO service_role;

ALTER TABLE public.user_tab_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tab_perms_select_self_or_admin" ON public.user_tab_permissions;
CREATE POLICY "tab_perms_select_self_or_admin" ON public.user_tab_permissions
  FOR SELECT TO authenticated
  USING (
    public.is_ariia_admin()
    OR usuario_id IN (SELECT id FROM public.fn_current_usuario())
  );

DROP POLICY IF EXISTS "tab_perms_write_admin" ON public.user_tab_permissions;
CREATE POLICY "tab_perms_write_admin" ON public.user_tab_permissions
  FOR ALL TO authenticated
  USING (public.is_ariia_admin())
  WITH CHECK (public.is_ariia_admin());

-- trigger atualizado_em
CREATE OR REPLACE FUNCTION public.fn_user_tab_perms_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_user_tab_perms_touch ON public.user_tab_permissions;
CREATE TRIGGER trg_user_tab_perms_touch BEFORE UPDATE ON public.user_tab_permissions
  FOR EACH ROW EXECUTE FUNCTION public.fn_user_tab_perms_touch();

-- =========================================================
-- 3) Função: abas permitidas para um usuário
-- =========================================================
CREATE OR REPLACE FUNCTION public.fn_user_allowed_tabs(_usuario_id integer DEFAULT NULL)
RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid int;
  v_perm text;
  v_all CONSTANT text[] := ARRAY[
    'dashboard','chamados','atendimento','usuarios','empresas','unidades',
    'operadoras','grafana','permissoes','base_conhecimento','relatorios',
    'equipes','zabbix','pessoas','responsaveis'
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
END $$;

GRANT EXECUTE ON FUNCTION public.fn_user_allowed_tabs(integer) TO authenticated;

-- Seed: aplica default para todos os usuários existentes sem registros
INSERT INTO public.user_tab_permissions (usuario_id, tab_key, allowed)
SELECT u.id, t.tab, true
FROM public.usuarios u
CROSS JOIN LATERAL (
  SELECT unnest(
    CASE
      WHEN u.permissao = 'CLIENTE' THEN ARRAY['chamados']
      ELSE ARRAY['dashboard','chamados','atendimento','usuarios','empresas','unidades',
                 'operadoras','grafana','permissoes','base_conhecimento','relatorios',
                 'equipes','zabbix','pessoas','responsaveis']
    END
  ) AS tab
) t
WHERE u.permissao NOT IN ('SUPERADMIN','ADMIN')
  AND NOT EXISTS (SELECT 1 FROM public.user_tab_permissions p WHERE p.usuario_id = u.id)
ON CONFLICT DO NOTHING;

-- =========================================================
-- 4) grafana_effective_permissions: DESACOPLA cargo Ariia do Grafana
--    SUPERADMIN -> Admin global. Demais -> SOMENTE Gerenciar Acessos + grupos.
-- =========================================================
CREATE OR REPLACE FUNCTION public.grafana_effective_permissions(_usuario_id integer)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
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

  -- Apenas SUPERADMIN é Admin global. ADMIN do Ariia NÃO recebe Grafana automaticamente.
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

-- =========================================================
-- 5) RPC helper para upsert/remover permissão Grafana com sync inline
-- =========================================================
CREATE OR REPLACE FUNCTION public.grafana_set_user_org_role(
  _usuario_id integer,
  _grafana_organization_id integer,
  _role text  -- 'Viewer' | 'Editor' | 'Admin' | 'None'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_ariia_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _role = 'None' THEN
    DELETE FROM public.grafana_user_org_permissions
      WHERE usuario_id = _usuario_id AND grafana_organization_id = _grafana_organization_id;
    RETURN jsonb_build_object('removed', true);
  END IF;
  IF _role NOT IN ('Viewer','Editor','Admin') THEN RAISE EXCEPTION 'invalid_role'; END IF;
  INSERT INTO public.grafana_user_org_permissions (usuario_id, grafana_organization_id, role, enabled)
  VALUES (_usuario_id, _grafana_organization_id, _role::grafana_role, true)
  ON CONFLICT (usuario_id, grafana_organization_id)
  DO UPDATE SET role = EXCLUDED.role, enabled = true, atualizado_em = now();
  RETURN jsonb_build_object('upserted', true, 'role', _role);
END $$;
GRANT EXECUTE ON FUNCTION public.grafana_set_user_org_role(integer,integer,text) TO authenticated;
