ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS permissao_manual boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.apply_domain_rule(_usuario_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  u_email text;
  u_perm text;
  u_emp int;
  u_manual boolean;
  d_domain text;
  rule public.domain_rules;
BEGIN
  SELECT email, permissao, empresa_id, COALESCE(permissao_manual, false)
    INTO u_email, u_perm, u_emp, u_manual
  FROM public.usuarios
  WHERE id = _usuario_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'user_not_found');
  END IF;

  IF u_manual THEN
    RETURN jsonb_build_object(
      'applied', false,
      'reason', 'manual_override',
      'permissao', u_perm,
      'empresa_id', u_emp
    );
  END IF;

  -- Perfis administrativos nunca são sobrescritos pela automação de domínio.
  IF u_perm IN ('SUPERADMIN','ADMIN','USER') THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'manual_role', 'permissao', u_perm);
  END IF;

  d_domain := lower(split_part(u_email, '@', 2));
  IF d_domain = '' THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'no_domain');
  END IF;

  SELECT * INTO rule
  FROM public.domain_rules
  WHERE lower(domain) = d_domain
    AND ativo = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'no_rule');
  END IF;

  UPDATE public.usuarios
     SET permissao = rule.default_permissao,
         empresa_id = COALESCE(rule.empresa_id, empresa_id),
         atualizado_em = now()
   WHERE id = _usuario_id
     AND COALESCE(permissao_manual, false) = false;

  RETURN jsonb_build_object(
    'applied', true,
    'permissao', rule.default_permissao,
    'empresa_id', rule.empresa_id,
    'domain', d_domain
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_domain_rule(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_domain_rule(integer) TO authenticated, service_role;