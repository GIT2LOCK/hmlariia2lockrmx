
CREATE TABLE IF NOT EXISTS public.grafana_automation_rules (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 100,
  graph JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  criado_por INTEGER,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grafana_automation_rules TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.grafana_automation_rules_id_seq TO authenticated;
GRANT ALL ON public.grafana_automation_rules TO service_role;
GRANT ALL ON SEQUENCE public.grafana_automation_rules_id_seq TO service_role;

ALTER TABLE public.grafana_automation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage automation rules" ON public.grafana_automation_rules;
CREATE POLICY "admins manage automation rules"
  ON public.grafana_automation_rules
  FOR ALL TO authenticated
  USING (public.is_ariia_admin())
  WITH CHECK (public.is_ariia_admin());

DROP POLICY IF EXISTS "service role full access automation rules" ON public.grafana_automation_rules;
CREATE POLICY "service role full access automation rules"
  ON public.grafana_automation_rules
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_grafana_automation_rules_updated ON public.grafana_automation_rules;
CREATE TRIGGER trg_grafana_automation_rules_updated
  BEFORE UPDATE ON public.grafana_automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.atualizar_timestamp();

CREATE OR REPLACE FUNCTION public.grafana_evaluate_automations(_usuario_id integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u_email TEXT;
  u_nome TEXT;
  u_perm TEXT;
  u_domain TEXT;
  rule RECORD;
  node JSONB;
  edge JSONB;
  node_results JSONB;
  result_actions JSONB := '[]'::jsonb;
  rank_of CONSTANT JSONB := '{"None":0,"Viewer":1,"Editor":2,"Admin":3}'::jsonb;
  agg JSONB := '{}'::jsonb;
  k TEXT;
  v JSONB;
  field TEXT; op TEXT; val TEXT; subject TEXT; matched BOOLEAN;
  logic_op TEXT; bool_true INT; bool_total INT; src TEXT; src_val BOOLEAN; logic_val BOOLEAN;
  fire BOOLEAN; any_incoming BOOLEAN;
  out_arr JSONB := '[]'::jsonb;
BEGIN
  SELECT email, nome, permissao INTO u_email, u_nome, u_perm
  FROM public.usuarios WHERE id = _usuario_id;
  IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;

  u_domain := lower(split_part(u_email, '@', 2));
  u_email := lower(u_email);
  u_nome := lower(COALESCE(u_nome,''));

  FOR rule IN
    SELECT id, graph FROM public.grafana_automation_rules
    WHERE active = true
    ORDER BY priority ASC, id ASC
  LOOP
    node_results := '{}'::jsonb;

    -- Pass 1: condition nodes
    FOR node IN SELECT * FROM jsonb_array_elements(COALESCE(rule.graph->'nodes','[]'::jsonb)) LOOP
      IF node->>'type' = 'condition' THEN
        field := node->'data'->>'field';
        op := node->'data'->>'operator';
        val := lower(COALESCE(node->'data'->>'value',''));
        subject := CASE field
          WHEN 'email' THEN u_email
          WHEN 'email_domain' THEN u_domain
          WHEN 'nome' THEN u_nome
          WHEN 'permissao_ariia' THEN lower(u_perm)
          ELSE ''
        END;
        matched := CASE op
          WHEN 'equals' THEN subject = val
          WHEN 'not_equals' THEN subject <> val
          WHEN 'contains' THEN position(val in subject) > 0
          WHEN 'not_contains' THEN position(val in subject) = 0
          WHEN 'starts_with' THEN subject LIKE val || '%'
          WHEN 'ends_with' THEN subject LIKE '%' || val
          WHEN 'regex' THEN subject ~ COALESCE(node->'data'->>'value','')
          WHEN 'in_list' THEN subject = ANY (string_to_array(val, ','))
          ELSE false
        END;
        node_results := node_results || jsonb_build_object(node->>'id', matched);
      END IF;
    END LOOP;

    -- Pass 2: logic nodes
    FOR node IN SELECT * FROM jsonb_array_elements(COALESCE(rule.graph->'nodes','[]'::jsonb)) LOOP
      IF node->>'type' = 'logic' THEN
        logic_op := node->'data'->>'op';
        bool_true := 0; bool_total := 0;
        FOR edge IN SELECT * FROM jsonb_array_elements(COALESCE(rule.graph->'edges','[]'::jsonb)) LOOP
          IF edge->>'target' = node->>'id' AND node_results ? (edge->>'source') THEN
            src_val := (node_results->>(edge->>'source'))::boolean;
            IF edge->>'sourceHandle' = 'false' THEN src_val := NOT src_val; END IF;
            bool_total := bool_total + 1;
            IF src_val THEN bool_true := bool_true + 1; END IF;
          END IF;
        END LOOP;
        logic_val := CASE logic_op
          WHEN 'AND' THEN bool_total > 0 AND bool_true = bool_total
          WHEN 'OR'  THEN bool_true > 0
          WHEN 'NOT' THEN bool_total > 0 AND bool_true = 0
          ELSE false
        END;
        node_results := node_results || jsonb_build_object(node->>'id', logic_val);
      END IF;
    END LOOP;

    -- Pass 3: action nodes
    FOR node IN SELECT * FROM jsonb_array_elements(COALESCE(rule.graph->'nodes','[]'::jsonb)) LOOP
      IF node->>'type' = 'action' THEN
        fire := true; any_incoming := false;
        FOR edge IN SELECT * FROM jsonb_array_elements(COALESCE(rule.graph->'edges','[]'::jsonb)) LOOP
          IF edge->>'target' = node->>'id' THEN
            any_incoming := true;
            IF node_results ? (edge->>'source') THEN
              src_val := (node_results->>(edge->>'source'))::boolean;
              IF edge->>'sourceHandle' = 'false' THEN src_val := NOT src_val; END IF;
              IF NOT src_val THEN fire := false; END IF;
            END IF;
          END IF;
        END LOOP;
        IF any_incoming AND fire THEN
          IF (node->'data'->>'action_type') = 'add_to_org' THEN
            result_actions := result_actions || jsonb_build_array(jsonb_build_object(
              'grafana_organization_id', (node->'data'->>'grafana_organization_id')::int,
              'role', node->'data'->>'role'
            ));
          ELSIF (node->'data'->>'action_type') = 'add_to_group' THEN
            result_actions := result_actions || jsonb_build_array(jsonb_build_object(
              'group_id', (node->'data'->>'group_id')::int,
              'kind', 'group'
            ));
          END IF;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  -- Dedup by org (keep highest role)
  FOR v IN SELECT * FROM jsonb_array_elements(result_actions) LOOP
    IF v ? 'grafana_organization_id' THEN
      k := v->>'grafana_organization_id';
      IF NOT (agg ? k) OR (rank_of->>(v->>'role'))::int > (rank_of->>(agg->k->>'role'))::int THEN
        agg := agg || jsonb_build_object(k, v);
      END IF;
    END IF;
  END LOOP;

  SELECT COALESCE(jsonb_agg(value), '[]'::jsonb) INTO out_arr FROM jsonb_each(agg);

  -- Append group actions (de-duped trivially)
  SELECT out_arr || COALESCE(jsonb_agg(DISTINCT v2), '[]'::jsonb) INTO out_arr
  FROM jsonb_array_elements(result_actions) v2
  WHERE v2 ? 'group_id';

  RETURN out_arr;
END;
$$;
