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
  v_rule_applied boolean := false;
  v_auto_applied boolean := false;
  v_auto_rule record;
  v_node jsonb;
  v_action jsonb;
  v_field text;
  v_op text;
  v_val text;
  v_match boolean;
  v_org_id int;
  v_candidate_empresa_id int;
BEGIN
  SELECT email, permissao, empresa_id, COALESCE(permissao_manual, false)
    INTO u_email, u_perm, u_emp, u_manual
  FROM public.usuarios
  WHERE id = _usuario_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'user_not_found');
  END IF;

  d_domain := lower(split_part(COALESCE(u_email, ''), '@', 2));
  IF d_domain = '' THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'no_domain');
  END IF;

  SELECT * INTO rule
  FROM public.domain_rules
  WHERE lower(domain) = d_domain
    AND ativo = true
  LIMIT 1;

  IF FOUND THEN
    v_rule_applied := true;

    -- Empresa: sempre aplica se a regra tem empresa e o usuário ainda não tem.
    IF rule.empresa_id IS NOT NULL AND u_emp IS NULL THEN
      UPDATE public.usuarios
         SET empresa_id = rule.empresa_id,
             atualizado_em = now()
       WHERE id = _usuario_id;
      u_emp := rule.empresa_id;
    END IF;

    -- Permissão: respeita override manual e nunca rebaixa perfis internos/admin.
    IF NOT u_manual AND u_perm NOT IN ('SUPERADMIN','ADMIN','USER') THEN
      UPDATE public.usuarios
         SET permissao = rule.default_permissao,
             atualizado_em = now()
       WHERE id = _usuario_id;
      u_perm := rule.default_permissao;
    END IF;
  END IF;

  -- Fallback genérico: se não houver empresa ainda, usa qualquer automação ativa
  -- do Grafana que tenha uma condição de domínio de e-mail compatível. Isso cobre
  -- todos os domínios automatizados (GoodStorage, PetCare, WCTECH, etc.) sem hardcode.
  IF u_emp IS NULL THEN
    FOR v_auto_rule IN
      SELECT id, graph
      FROM public.grafana_automation_rules
      WHERE active = true
      ORDER BY priority ASC, id ASC
    LOOP
      v_match := false;

      FOR v_node IN SELECT * FROM jsonb_array_elements(COALESCE(v_auto_rule.graph->'nodes', '[]'::jsonb)) LOOP
        IF v_node->>'type' = 'condition' THEN
          v_field := v_node->'data'->>'field';
          v_op := v_node->'data'->>'operator';
          v_val := lower(COALESCE(v_node->'data'->>'value', ''));

          IF v_field = 'email_domain' THEN
            v_match := CASE v_op
              WHEN 'equals' THEN d_domain = v_val
              WHEN 'not_equals' THEN d_domain <> v_val
              WHEN 'contains' THEN position(v_val in d_domain) > 0
              WHEN 'not_contains' THEN position(v_val in d_domain) = 0
              WHEN 'starts_with' THEN d_domain LIKE v_val || '%'
              WHEN 'ends_with' THEN d_domain LIKE '%' || v_val
              WHEN 'regex' THEN d_domain ~ COALESCE(v_node->'data'->>'value', '')
              WHEN 'in_list' THEN d_domain = ANY (string_to_array(replace(v_val, ' ', ''), ','))
              ELSE false
            END;

            EXIT WHEN v_match;
          END IF;
        END IF;
      END LOOP;

      IF NOT v_match THEN
        CONTINUE;
      END IF;

      FOR v_action IN SELECT * FROM jsonb_array_elements(COALESCE(v_auto_rule.graph->'nodes', '[]'::jsonb)) LOOP
        IF v_action->>'type' = 'action'
           AND v_action->'data'->>'action_type' = 'add_to_org'
           AND COALESCE(v_action->'data'->>'grafana_organization_id', '') ~ '^\d+$' THEN
          v_org_id := (v_action->'data'->>'grafana_organization_id')::int;
          v_candidate_empresa_id := NULL;

          SELECT e.id
            INTO v_candidate_empresa_id
          FROM public.empresas e
          WHERE e.grafana_organization_id = v_org_id
          ORDER BY e.id
          LIMIT 1;

          IF v_candidate_empresa_id IS NOT NULL THEN
            UPDATE public.usuarios
               SET empresa_id = v_candidate_empresa_id,
                   atualizado_em = now()
             WHERE id = _usuario_id;
            u_emp := v_candidate_empresa_id;
            v_auto_applied := true;
            EXIT;
          END IF;
        END IF;
      END LOOP;

      EXIT WHEN v_auto_applied;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'applied', (v_rule_applied OR v_auto_applied),
    'source', CASE
      WHEN v_rule_applied AND v_auto_applied THEN 'domain_rule+grafana_automation'
      WHEN v_rule_applied THEN 'domain_rule'
      WHEN v_auto_applied THEN 'grafana_automation'
      ELSE 'none'
    END,
    'reason', CASE WHEN (v_rule_applied OR v_auto_applied) THEN NULL ELSE 'no_rule_or_linked_automation' END,
    'permissao', u_perm,
    'empresa_id', u_emp,
    'domain', d_domain
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_domain_rule(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_domain_rule(integer) TO authenticated, service_role;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.usuarios WHERE ativo = true LOOP
    PERFORM public.apply_domain_rule(r.id);
  END LOOP;
END $$;