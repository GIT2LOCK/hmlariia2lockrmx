
-- 1) empresas.grafana_organization_id
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS grafana_organization_id integer
  REFERENCES public.grafana_organizations(id) ON DELETE SET NULL;

-- Backfill by name match
UPDATE public.empresas e
SET grafana_organization_id = g.id
FROM public.grafana_organizations g
WHERE e.grafana_organization_id IS NULL
  AND lower(g.name) = lower(e.nome_fantasia);

-- 2) domain_rules
CREATE TABLE IF NOT EXISTS public.domain_rules (
  id bigserial PRIMARY KEY,
  domain text NOT NULL UNIQUE,
  empresa_id integer REFERENCES public.empresas(id) ON DELETE SET NULL,
  default_permissao text NOT NULL DEFAULT 'CLIENTE'
    CHECK (default_permissao IN ('SUPERADMIN','ADMIN','USER','CLIENTE','VIEWER','TV_VIEW')),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.domain_rules TO authenticated;
GRANT ALL ON public.domain_rules TO service_role;

ALTER TABLE public.domain_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "domain_rules read auth" ON public.domain_rules;
CREATE POLICY "domain_rules read auth" ON public.domain_rules
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "domain_rules admin write" ON public.domain_rules;
CREATE POLICY "domain_rules admin write" ON public.domain_rules
  FOR ALL TO authenticated
  USING (public.is_ariia_admin())
  WITH CHECK (public.is_ariia_admin());

-- Trigger to keep atualizado_em fresh
DROP TRIGGER IF EXISTS trg_domain_rules_upd ON public.domain_rules;
CREATE TRIGGER trg_domain_rules_upd
  BEFORE UPDATE ON public.domain_rules
  FOR EACH ROW EXECUTE FUNCTION public.atualizar_timestamp();

-- 3) apply_domain_rule(_usuario_id)
CREATE OR REPLACE FUNCTION public.apply_domain_rule(_usuario_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u_email text; u_perm text; u_emp int;
  d_domain text;
  rule public.domain_rules;
BEGIN
  SELECT email, permissao, empresa_id INTO u_email, u_perm, u_emp
  FROM public.usuarios WHERE id = _usuario_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('applied', false, 'reason', 'user_not_found'); END IF;

  -- Não sobrescreve perfis administrativos atribuídos manualmente
  IF u_perm IN ('SUPERADMIN','ADMIN','USER') THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'manual_role', 'permissao', u_perm);
  END IF;

  d_domain := lower(split_part(u_email, '@', 2));
  IF d_domain = '' THEN RETURN jsonb_build_object('applied', false, 'reason', 'no_domain'); END IF;

  SELECT * INTO rule FROM public.domain_rules
   WHERE lower(domain) = d_domain AND ativo = true LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('applied', false, 'reason', 'no_rule'); END IF;

  UPDATE public.usuarios
     SET permissao = rule.default_permissao,
         empresa_id = COALESCE(rule.empresa_id, empresa_id),
         atualizado_em = now()
   WHERE id = _usuario_id;

  RETURN jsonb_build_object(
    'applied', true,
    'permissao', rule.default_permissao,
    'empresa_id', rule.empresa_id,
    'domain', d_domain
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_domain_rule(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_domain_rule(integer) TO authenticated, service_role;

-- 4) fn_delete_usuario_cascade
CREATE OR REPLACE FUNCTION public.fn_delete_usuario_cascade(_usuario_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller record;
  v_auth_user_id uuid;
BEGIN
  SELECT id, permissao INTO v_caller FROM public.fn_current_usuario();
  -- service_role bypasses auth.uid(); allow when no caller (edge function context)
  IF v_caller.id IS NOT NULL AND v_caller.permissao <> 'SUPERADMIN' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT auth_user_id INTO v_auth_user_id FROM public.usuarios WHERE id = _usuario_id;

  DELETE FROM public.support_group_members WHERE usuario_id = _usuario_id;
  DELETE FROM public.grafana_user_org_permissions WHERE usuario_id = _usuario_id;
  DELETE FROM public.grafana_access_group_members WHERE usuario_id = _usuario_id;
  DELETE FROM public.grafana_user_links WHERE usuario_id = _usuario_id;
  DELETE FROM public.sessions WHERE user_id = _usuario_id;
  DELETE FROM public.ticket_notifications WHERE usuario_id = _usuario_id;
  DELETE FROM public.contato_unidades WHERE contato_id IN (
    SELECT id FROM public.contatos WHERE usuario_id = _usuario_id
  );
  UPDATE public.tickets SET tecnico_id = NULL WHERE tecnico_id = _usuario_id;
  UPDATE public.tickets SET assigned_by = NULL WHERE assigned_by = _usuario_id;

  DELETE FROM public.usuarios WHERE id = _usuario_id;

  RETURN jsonb_build_object('deleted', true, 'auth_user_id', v_auth_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_delete_usuario_cascade(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_delete_usuario_cascade(integer) TO authenticated, service_role;

-- 5) Seed goodstorage rule
INSERT INTO public.domain_rules (domain, empresa_id, default_permissao, ativo)
SELECT 'goodstorage.com.br', e.id, 'CLIENTE', true
FROM public.empresas e WHERE lower(e.nome_fantasia) = 'goodstorage'
ON CONFLICT (domain) DO UPDATE
  SET empresa_id = EXCLUDED.empresa_id,
      default_permissao = EXCLUDED.default_permissao,
      ativo = true;
