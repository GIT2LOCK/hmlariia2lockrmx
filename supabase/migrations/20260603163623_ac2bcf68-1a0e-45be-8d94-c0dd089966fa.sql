
-- ===== Helper: usuario logado =====
CREATE OR REPLACE FUNCTION public.fn_dashboard_current_usuario()
RETURNS TABLE(id integer, permissao text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.permissao
  FROM public.usuarios u
  WHERE u.auth_user_id = auth.uid() AND u.ativo = true
  LIMIT 1;
$$;

-- ===== Escopo de tickets visíveis =====
CREATE OR REPLACE FUNCTION public.fn_dashboard_ticket_ids()
RETURNS TABLE(ticket_id integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid int;
  v_perm text;
BEGIN
  SELECT id, permissao INTO v_uid, v_perm FROM public.fn_dashboard_current_usuario();
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  IF v_perm IN ('SUPERADMIN','ADMIN') THEN
    RETURN QUERY SELECT t.id FROM public.tickets t;
  ELSE
    RETURN QUERY
      SELECT DISTINCT t.id
      FROM public.tickets t
      WHERE t.tecnico_id = v_uid
         OR t.criado_por = v_uid
         OR t.assigned_by = v_uid
         OR t.assigned_group_id IN (
              SELECT m.group_id FROM public.support_group_members m
              WHERE m.usuario_id = v_uid AND m.ativo = true
         );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_dashboard_current_usuario() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_dashboard_ticket_ids() TO authenticated;

-- ===== KPIs principais =====
CREATE OR REPLACE FUNCTION public.fn_dashboard_kpis(_from timestamptz, _to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_open_statuses text[] := ARRAY['NOVO','TRIAGEM','EM_ATENDIMENTO','AGUARDANDO_CLIENTE','AGUARDANDO_OPERADORA','AGUARDANDO_TERCEIRO','AGENDADO'];
  v_final_statuses text[] := ARRAY['RESOLVIDO','FECHADO','CANCELADO'];
  v_tz constant text := 'America/Sao_Paulo';
  v_today_start timestamptz := date_trunc('day', now() AT TIME ZONE v_tz) AT TIME ZONE v_tz;
  v_today_end   timestamptz := v_today_start + interval '1 day';
  v_prev_from timestamptz := _from - (_to - _from);
  v_prev_to   timestamptz := _from;
  v_result jsonb;
BEGIN
  WITH scope AS (SELECT ticket_id FROM public.fn_dashboard_ticket_ids()),
  t AS (
    SELECT * FROM public.tickets WHERE id IN (SELECT ticket_id FROM scope)
  ),
  per AS ( -- chamados criados no período
    SELECT * FROM t WHERE data_abertura >= _from AND data_abertura < _to
  ),
  prev AS (
    SELECT * FROM t WHERE data_abertura >= v_prev_from AND data_abertura < v_prev_to
  ),
  fechados_hoje AS (
    SELECT * FROM t
    WHERE (COALESCE(data_fechamento, data_solucao) >= v_today_start
       AND COALESCE(data_fechamento, data_solucao) <  v_today_end)
  )
  SELECT jsonb_build_object(
    'abertos', (SELECT count(*) FROM t WHERE status::text = ANY(v_open_statuses)),
    'em_atendimento', (SELECT count(*) FROM t WHERE status::text = 'EM_ATENDIMENTO'),
    'aguardando_cliente', (SELECT count(*) FROM t WHERE status::text = 'AGUARDANDO_CLIENTE'),
    'fechados_hoje', (SELECT count(*) FROM fechados_hoje),
    'fechados_hoje_sla_ok', (SELECT count(*) FROM fechados_hoje WHERE resolution_sla_status = 'met'),
    'fechados_hoje_sla_violado', (SELECT count(*) FROM fechados_hoje WHERE resolution_sla_status = 'breached'),
    'tma_minutos_fechados_hoje', (
      SELECT COALESCE(avg(EXTRACT(EPOCH FROM (data_primeiro_atendimento - data_abertura))/60), 0)::int
      FROM fechados_hoje WHERE data_primeiro_atendimento IS NOT NULL
    ),
    'tms_minutos_fechados_hoje', (
      SELECT COALESCE(avg(EXTRACT(EPOCH FROM (COALESCE(data_fechamento,data_solucao) - data_abertura))/60
        - COALESCE(sla_pausa_total_segundos,0)/60.0), 0)::int
      FROM fechados_hoje WHERE data_solucao IS NOT NULL
    ),
    'sla_cumprido', (SELECT count(*) FROM per WHERE resolution_sla_status = 'met' OR first_response_sla_status = 'met'),
    'sla_violado',  (SELECT count(*) FROM per WHERE resolution_sla_status = 'breached' OR first_response_sla_status = 'breached'),
    'sla_first_met', (SELECT count(*) FROM per WHERE first_response_sla_status='met'),
    'sla_first_breached', (SELECT count(*) FROM per WHERE first_response_sla_status='breached'),
    'sla_res_met', (SELECT count(*) FROM per WHERE resolution_sla_status='met'),
    'sla_res_breached', (SELECT count(*) FROM per WHERE resolution_sla_status='breached'),
    'total_periodo', (SELECT count(*) FROM per),
    'total_periodo_anterior', (SELECT count(*) FROM prev),
    'abertos_anterior', (SELECT count(*) FROM prev WHERE status::text = ANY(v_open_statuses)),
    'sla_violado_anterior', (SELECT count(*) FROM prev WHERE resolution_sla_status='breached' OR first_response_sla_status='breached'),
    'tma_minutos', (
      SELECT COALESCE(avg(EXTRACT(EPOCH FROM (data_primeiro_atendimento - data_abertura))/60), 0)::int
      FROM per WHERE data_primeiro_atendimento IS NOT NULL
    ),
    'tms_minutos', (
      SELECT COALESCE(avg(EXTRACT(EPOCH FROM (COALESCE(data_fechamento,data_solucao) - data_abertura))/60
        - COALESCE(sla_pausa_total_segundos,0)/60.0), 0)::int
      FROM per WHERE data_solucao IS NOT NULL
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_dashboard_kpis(timestamptz, timestamptz) TO authenticated;

-- ===== Distribuição por status =====
CREATE OR REPLACE FUNCTION public.fn_dashboard_by_status()
RETURNS TABLE(status text, total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.status::text, count(*)
  FROM public.tickets t
  WHERE t.id IN (SELECT ticket_id FROM public.fn_dashboard_ticket_ids())
  GROUP BY t.status::text
  ORDER BY count(*) DESC;
$$;
GRANT EXECUTE ON FUNCTION public.fn_dashboard_by_status() TO authenticated;

-- ===== Distribuição por fila =====
CREATE OR REPLACE FUNCTION public.fn_dashboard_by_fila()
RETURNS TABLE(fila_id integer, fila_nome text, total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.fila_id, COALESCE(f.nome, 'Sem fila'), count(*)
  FROM public.tickets t
  LEFT JOIN public.ticket_filas f ON f.id = t.fila_id
  WHERE t.id IN (SELECT ticket_id FROM public.fn_dashboard_ticket_ids())
    AND t.status::text NOT IN ('RESOLVIDO','FECHADO','CANCELADO')
  GROUP BY t.fila_id, f.nome
  ORDER BY count(*) DESC;
$$;
GRANT EXECUTE ON FUNCTION public.fn_dashboard_by_fila() TO authenticated;

-- ===== Desempenho por técnico =====
CREATE OR REPLACE FUNCTION public.fn_dashboard_tecnicos(_from timestamptz, _to timestamptz)
RETURNS TABLE(
  tecnico_id integer,
  tecnico_nome text,
  avatar_url text,
  abertos bigint,
  em_atendimento bigint,
  aguardando_cliente bigint,
  fechados_periodo bigint,
  sla_cumprido bigint,
  sla_violado bigint,
  tma_minutos integer,
  tms_minutos integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH scope AS (SELECT ticket_id FROM public.fn_dashboard_ticket_ids()),
  t AS (SELECT * FROM public.tickets WHERE id IN (SELECT ticket_id FROM scope) AND tecnico_id IS NOT NULL)
  SELECT
    t.tecnico_id,
    u.nome,
    u.avatar_url,
    count(*) FILTER (WHERE t.status::text NOT IN ('RESOLVIDO','FECHADO','CANCELADO')),
    count(*) FILTER (WHERE t.status::text = 'EM_ATENDIMENTO'),
    count(*) FILTER (WHERE t.status::text = 'AGUARDANDO_CLIENTE'),
    count(*) FILTER (WHERE COALESCE(t.data_fechamento, t.data_solucao) BETWEEN _from AND _to),
    count(*) FILTER (WHERE (t.resolution_sla_status='met' OR t.first_response_sla_status='met') AND t.data_abertura BETWEEN _from AND _to),
    count(*) FILTER (WHERE (t.resolution_sla_status='breached' OR t.first_response_sla_status='breached') AND t.data_abertura BETWEEN _from AND _to),
    COALESCE(avg(EXTRACT(EPOCH FROM (t.data_primeiro_atendimento - t.data_abertura))/60)
      FILTER (WHERE t.data_primeiro_atendimento IS NOT NULL AND t.data_abertura BETWEEN _from AND _to), 0)::int,
    COALESCE(avg(EXTRACT(EPOCH FROM (COALESCE(t.data_fechamento,t.data_solucao) - t.data_abertura))/60
      - COALESCE(t.sla_pausa_total_segundos,0)/60.0)
      FILTER (WHERE t.data_solucao IS NOT NULL AND COALESCE(t.data_fechamento, t.data_solucao) BETWEEN _from AND _to), 0)::int
  FROM t
  LEFT JOIN public.usuarios u ON u.id = t.tecnico_id
  GROUP BY t.tecnico_id, u.nome, u.avatar_url
  ORDER BY count(*) DESC;
$$;
GRANT EXECUTE ON FUNCTION public.fn_dashboard_tecnicos(timestamptz, timestamptz) TO authenticated;

-- ===== Série diária abertos x fechados =====
CREATE OR REPLACE FUNCTION public.fn_dashboard_serie_diaria(_from timestamptz, _to timestamptz)
RETURNS TABLE(dia date, abertos bigint, fechados bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH scope AS (SELECT ticket_id FROM public.fn_dashboard_ticket_ids()),
  dias AS (
    SELECT generate_series(date_trunc('day', _from), date_trunc('day', _to), interval '1 day')::date AS d
  ),
  ab AS (
    SELECT date_trunc('day', data_abertura AT TIME ZONE 'America/Sao_Paulo')::date AS d, count(*) c
    FROM public.tickets WHERE id IN (SELECT ticket_id FROM scope)
      AND data_abertura BETWEEN _from AND _to
    GROUP BY 1
  ),
  fc AS (
    SELECT date_trunc('day', COALESCE(data_fechamento,data_solucao) AT TIME ZONE 'America/Sao_Paulo')::date AS d, count(*) c
    FROM public.tickets WHERE id IN (SELECT ticket_id FROM scope)
      AND COALESCE(data_fechamento,data_solucao) BETWEEN _from AND _to
    GROUP BY 1
  )
  SELECT dias.d, COALESCE(ab.c, 0), COALESCE(fc.c, 0)
  FROM dias
  LEFT JOIN ab ON ab.d = dias.d
  LEFT JOIN fc ON fc.d = dias.d
  ORDER BY dias.d;
$$;
GRANT EXECUTE ON FUNCTION public.fn_dashboard_serie_diaria(timestamptz, timestamptz) TO authenticated;

-- ===== Pontos de atenção =====
CREATE OR REPLACE FUNCTION public.fn_dashboard_pontos_atencao()
RETURNS TABLE(
  id integer,
  codigo text,
  titulo text,
  status text,
  prioridade text,
  tecnico_nome text,
  motivo text,
  data_abertura timestamptz,
  resolution_due_at timestamptz,
  resolution_sla_status text,
  pct_sla numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH scope AS (SELECT ticket_id FROM public.fn_dashboard_ticket_ids()),
  base AS (
    SELECT t.*, u.nome AS tecnico_nome,
      CASE WHEN t.resolution_due_at IS NOT NULL AND t.sla_solucao_minutos > 0
           THEN LEAST(100, GREATEST(0, 100.0 *
             EXTRACT(EPOCH FROM (now() - t.data_abertura))/60.0
             / NULLIF(t.sla_solucao_minutos,0)))
           ELSE NULL END AS pct
    FROM public.tickets t
    LEFT JOIN public.usuarios u ON u.id = t.tecnico_id
    WHERE t.id IN (SELECT ticket_id FROM scope)
      AND t.status::text NOT IN ('RESOLVIDO','FECHADO','CANCELADO')
  )
  SELECT b.id, b.codigo::text, b.titulo::text, b.status::text, b.prioridade::text, b.tecnico_nome,
    CASE
      WHEN b.resolution_sla_status='breached' THEN 'SLA violado'
      WHEN b.pct >= 90 THEN 'SLA acima de 90%'
      WHEN b.tecnico_id IS NULL THEN 'Sem responsável'
      WHEN b.prioridade::text = 'CRITICO' THEN 'Chamado crítico'
      WHEN b.status::text = 'AGUARDANDO_CLIENTE' AND b.aguardando_cliente_desde < now() - interval '7 days' THEN 'Aguardando cliente há +7 dias'
      WHEN b.atualizado_em < now() - interval '3 days' THEN 'Parado há +3 dias'
      ELSE NULL
    END,
    b.data_abertura, b.resolution_due_at, b.resolution_sla_status, b.pct
  FROM base b
  WHERE b.resolution_sla_status='breached'
     OR b.pct >= 90
     OR b.tecnico_id IS NULL
     OR (b.prioridade::text='CRITICO')
     OR (b.status::text='AGUARDANDO_CLIENTE' AND b.aguardando_cliente_desde < now() - interval '7 days')
     OR b.atualizado_em < now() - interval '3 days'
  ORDER BY
    (b.resolution_sla_status='breached')::int DESC,
    COALESCE(b.pct,0) DESC,
    b.data_abertura ASC
  LIMIT 50;
$$;
GRANT EXECUTE ON FUNCTION public.fn_dashboard_pontos_atencao() TO authenticated;
