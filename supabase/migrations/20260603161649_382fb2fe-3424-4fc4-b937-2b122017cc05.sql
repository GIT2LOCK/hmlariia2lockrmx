
-- =====================================================================
-- FASE 1: SLA - Schema, Tabelas, Triggers
-- =====================================================================

-- 1) Novas colunas em tickets (reaproveitando campos existentes onde possível)
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS first_response_due_at      timestamptz,
  ADD COLUMN IF NOT EXISTS first_response_by          integer,
  ADD COLUMN IF NOT EXISTS first_response_sla_status  text DEFAULT 'pending'
    CHECK (first_response_sla_status IN ('pending','in_progress','paused','met','breached')),
  ADD COLUMN IF NOT EXISTS resolution_due_at          timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by                integer,
  ADD COLUMN IF NOT EXISTS resolution_sla_status      text DEFAULT 'pending'
    CHECK (resolution_sla_status IN ('pending','in_progress','paused','met','breached')),
  ADD COLUMN IF NOT EXISTS sla_pause_reason           text,
  ADD COLUMN IF NOT EXISTS sla_policy_id              integer,
  ADD COLUMN IF NOT EXISTS first_response_alert_50_sent  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS first_response_alert_75_sent  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS first_response_alert_90_sent  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS first_response_breach_alert_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolution_alert_50_sent  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolution_alert_75_sent  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolution_alert_90_sent  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolution_breach_alert_sent boolean DEFAULT false;

-- 2) Flag pausa_sla em ticket_filas
ALTER TABLE public.ticket_filas
  ADD COLUMN IF NOT EXISTS pausa_sla boolean NOT NULL DEFAULT false;

-- =====================================================================
-- 3) Tabela: ticket_sla_policies
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.ticket_sla_policies (
  id                      SERIAL PRIMARY KEY,
  nome                    varchar(120) NOT NULL,
  descricao               text,
  prioridade              text,
  tipo_chamado            char(1),
  categoria_id            integer REFERENCES public.ticket_categorias(id) ON DELETE SET NULL,
  empresa_id              integer REFERENCES public.empresas(id) ON DELETE SET NULL,
  unidade_id              integer REFERENCES public.unidades(id) ON DELETE SET NULL,
  support_group_id        integer REFERENCES public.support_groups(id) ON DELETE SET NULL,
  first_response_minutes  integer NOT NULL,
  resolution_minutes      integer NOT NULL,
  business_hours_only     boolean NOT NULL DEFAULT true,
  prioridade_ordem        integer NOT NULL DEFAULT 100,
  ativo                   boolean NOT NULL DEFAULT true,
  criado_em               timestamptz NOT NULL DEFAULT now(),
  atualizado_em           timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_sla_policies TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.ticket_sla_policies_id_seq TO authenticated;
GRANT ALL ON public.ticket_sla_policies TO service_role;
GRANT ALL ON SEQUENCE public.ticket_sla_policies_id_seq TO service_role;

ALTER TABLE public.ticket_sla_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view sla policies"
  ON public.ticket_sla_policies FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage sla policies"
  ON public.ticket_sla_policies FOR ALL TO authenticated
  USING (public.is_ariia_admin()) WITH CHECK (public.is_ariia_admin());

CREATE TRIGGER trg_sla_policies_updated
  BEFORE UPDATE ON public.ticket_sla_policies
  FOR EACH ROW EXECUTE FUNCTION public.atualizar_timestamp();

-- FK back-ref
ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_sla_policy_fk
  FOREIGN KEY (sla_policy_id) REFERENCES public.ticket_sla_policies(id) ON DELETE SET NULL;

-- =====================================================================
-- 4) Tabela: ticket_sla_business_hours
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.ticket_sla_business_hours (
  id              SERIAL PRIMARY KEY,
  nome            varchar(120) NOT NULL DEFAULT 'Padrão',
  timezone        text NOT NULL DEFAULT 'America/Sao_Paulo',
  dias_uteis      integer[] NOT NULL DEFAULT '{1,2,3,4,5}', -- 0=Dom..6=Sab
  hora_inicio     time NOT NULL DEFAULT '08:00',
  hora_fim        time NOT NULL DEFAULT '18:00',
  feriados        jsonb NOT NULL DEFAULT '[]'::jsonb,
  padrao          boolean NOT NULL DEFAULT true,
  ativo           boolean NOT NULL DEFAULT true,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_sla_business_hours TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.ticket_sla_business_hours_id_seq TO authenticated;
GRANT ALL ON public.ticket_sla_business_hours TO service_role;
GRANT ALL ON SEQUENCE public.ticket_sla_business_hours_id_seq TO service_role;

ALTER TABLE public.ticket_sla_business_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view business hours"
  ON public.ticket_sla_business_hours FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage business hours"
  ON public.ticket_sla_business_hours FOR ALL TO authenticated
  USING (public.is_ariia_admin()) WITH CHECK (public.is_ariia_admin());

CREATE TRIGGER trg_sla_bh_updated
  BEFORE UPDATE ON public.ticket_sla_business_hours
  FOR EACH ROW EXECUTE FUNCTION public.atualizar_timestamp();

-- =====================================================================
-- 5) Tabela: ticket_sla_pauses
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.ticket_sla_pauses (
  id              SERIAL PRIMARY KEY,
  ticket_id       integer NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  sla_type        text NOT NULL CHECK (sla_type IN ('first_response','resolution','both')),
  motivo          text,
  status_pausa    text,
  fila_id         integer REFERENCES public.ticket_filas(id) ON DELETE SET NULL,
  paused_by       integer,
  paused_at       timestamptz NOT NULL DEFAULT now(),
  resumed_by      integer,
  resumed_at      timestamptz,
  duration_minutes integer,
  observacao      text,
  criado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sla_pauses_ticket ON public.ticket_sla_pauses(ticket_id);

GRANT SELECT ON public.ticket_sla_pauses TO authenticated;
GRANT ALL ON public.ticket_sla_pauses TO service_role;
GRANT ALL ON SEQUENCE public.ticket_sla_pauses_id_seq TO service_role;

ALTER TABLE public.ticket_sla_pauses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view sla pauses"
  ON public.ticket_sla_pauses FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage sla pauses"
  ON public.ticket_sla_pauses FOR ALL TO authenticated
  USING (public.is_ariia_admin()) WITH CHECK (public.is_ariia_admin());

-- =====================================================================
-- 6) Tabela: ticket_sla_alerts (com UNIQUE para idempotência)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.ticket_sla_alerts (
  id              SERIAL PRIMARY KEY,
  ticket_id       integer NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  sla_type        text NOT NULL CHECK (sla_type IN ('first_response','resolution')),
  threshold       text NOT NULL CHECK (threshold IN ('50','75','90','breached')),
  sent_at         timestamptz NOT NULL DEFAULT now(),
  sent_to_user_id integer,
  sent_to_group_id integer,
  notification_id integer,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticket_id, sla_type, threshold)
);

CREATE INDEX IF NOT EXISTS idx_sla_alerts_ticket ON public.ticket_sla_alerts(ticket_id);

GRANT SELECT ON public.ticket_sla_alerts TO authenticated;
GRANT ALL ON public.ticket_sla_alerts TO service_role;
GRANT ALL ON SEQUENCE public.ticket_sla_alerts_id_seq TO service_role;

ALTER TABLE public.ticket_sla_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view sla alerts"
  ON public.ticket_sla_alerts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage sla alerts"
  ON public.ticket_sla_alerts FOR ALL TO authenticated
  USING (public.is_ariia_admin()) WITH CHECK (public.is_ariia_admin());

-- =====================================================================
-- 7) Helper: encontrar política aplicável
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_find_sla_policy(
  _prioridade text,
  _tipo char,
  _categoria_id integer,
  _empresa_id integer,
  _unidade_id integer,
  _support_group_id integer
) RETURNS public.ticket_sla_policies
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT *
  FROM public.ticket_sla_policies p
  WHERE p.ativo = true
    AND (p.prioridade IS NULL OR p.prioridade = _prioridade)
    AND (p.tipo_chamado IS NULL OR p.tipo_chamado = _tipo)
    AND (p.categoria_id IS NULL OR p.categoria_id = _categoria_id)
    AND (p.empresa_id IS NULL OR p.empresa_id = _empresa_id)
    AND (p.unidade_id IS NULL OR p.unidade_id = _unidade_id)
    AND (p.support_group_id IS NULL OR p.support_group_id = _support_group_id)
  ORDER BY
    -- mais específica primeiro
    (CASE WHEN p.unidade_id IS NOT NULL THEN 1 ELSE 0 END) DESC,
    (CASE WHEN p.empresa_id IS NOT NULL THEN 1 ELSE 0 END) DESC,
    (CASE WHEN p.support_group_id IS NOT NULL THEN 1 ELSE 0 END) DESC,
    (CASE WHEN p.categoria_id IS NOT NULL THEN 1 ELSE 0 END) DESC,
    (CASE WHEN p.tipo_chamado IS NOT NULL THEN 1 ELSE 0 END) DESC,
    (CASE WHEN p.prioridade IS NOT NULL THEN 1 ELSE 0 END) DESC,
    p.prioridade_ordem ASC,
    p.id ASC
  LIMIT 1;
$$;

-- =====================================================================
-- 8) Trigger: aplica política e calcula prazos na criação
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_ticket_apply_sla()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_policy public.ticket_sla_policies;
  v_start  timestamptz;
BEGIN
  IF NEW.sla_policy_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_policy := public.fn_find_sla_policy(
    NEW.prioridade::text,
    NEW.tipo_chamado,
    NEW.categoria_id,
    NEW.empresa_id,
    NEW.unidade_id,
    NEW.assigned_group_id
  );

  IF v_policy.id IS NULL THEN
    RETURN NEW;
  END IF;

  v_start := COALESCE(NEW.data_abertura, now());

  NEW.sla_policy_id := v_policy.id;
  NEW.sla_atendimento_minutos := v_policy.first_response_minutes;
  NEW.sla_solucao_minutos := v_policy.resolution_minutes;
  NEW.first_response_due_at := v_start + make_interval(mins => v_policy.first_response_minutes);
  NEW.resolution_due_at    := v_start + make_interval(mins => v_policy.resolution_minutes);
  NEW.first_response_sla_status := 'in_progress';
  NEW.resolution_sla_status := 'in_progress';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ticket_apply_sla ON public.tickets;
CREATE TRIGGER trg_ticket_apply_sla
  BEFORE INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.fn_ticket_apply_sla();

-- =====================================================================
-- 9) Trigger: pausa/retoma SLA, marca primeira resposta e resolução
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_ticket_sla_status_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pause_statuses text[] := ARRAY['AGUARDANDO_CLIENTE','AGUARDANDO_OPERADORA','AGUARDANDO_TERCEIRO'];
  v_resolved_statuses text[] := ARRAY['RESOLVIDO','FECHADO'];
  v_pause_dur_min integer;
BEGIN
  -- Primeira resposta: ao mover para EM_ATENDIMENTO ou ao atribuir técnico pela 1ª vez
  IF NEW.data_primeiro_atendimento IS NULL THEN
    IF (NEW.status::text = 'EM_ATENDIMENTO' AND OLD.status::text <> 'EM_ATENDIMENTO')
       OR (NEW.tecnico_id IS NOT NULL AND OLD.tecnico_id IS NULL) THEN
      NEW.data_primeiro_atendimento := now();
      NEW.first_response_by := COALESCE(NEW.tecnico_id, NEW.assigned_by);
      NEW.first_response_sla_status :=
        CASE WHEN NEW.first_response_due_at IS NOT NULL AND now() > NEW.first_response_due_at
             THEN 'breached' ELSE 'met' END;

      INSERT INTO public.ticket_history(ticket_id, autor_id, autor_nome, campo, valor_novo, observacao)
      VALUES (NEW.id, NEW.first_response_by, '', 'sla_first_response',
              NEW.first_response_sla_status,
              'Primeiro atendimento registrado');
    END IF;
  END IF;

  -- Resolução
  IF (NEW.status::text = ANY(v_resolved_statuses)) AND (OLD.status::text <> ALL(v_resolved_statuses)) THEN
    IF NEW.data_solucao IS NULL THEN NEW.data_solucao := now(); END IF;
    NEW.resolved_by := COALESCE(NEW.tecnico_id, NEW.assigned_by);
    NEW.resolution_sla_status :=
      CASE WHEN NEW.resolution_due_at IS NOT NULL AND now() > NEW.resolution_due_at
           THEN 'breached' ELSE 'met' END;

    INSERT INTO public.ticket_history(ticket_id, autor_id, autor_nome, campo, valor_novo, observacao)
    VALUES (NEW.id, NEW.resolved_by, '', 'sla_resolution',
            NEW.resolution_sla_status,
            'Chamado resolvido');
  END IF;

  -- Entrou em status de pausa
  IF (NEW.status::text = ANY(v_pause_statuses)) AND (OLD.status::text <> ALL(v_pause_statuses)) THEN
    NEW.sla_pausa_inicio := now();
    NEW.sla_pause_reason := COALESCE(NEW.aguardando_cliente_motivo, NEW.status::text);
    NEW.resolution_sla_status := 'paused';

    INSERT INTO public.ticket_sla_pauses(ticket_id, sla_type, motivo, status_pausa, fila_id, paused_by, paused_at)
    VALUES (NEW.id, 'resolution', NEW.sla_pause_reason, NEW.status::text, NEW.fila_id,
            COALESCE(NEW.tecnico_id, NEW.assigned_by), now());

    INSERT INTO public.ticket_history(ticket_id, autor_id, autor_nome, campo, valor_novo, observacao)
    VALUES (NEW.id, NEW.tecnico_id, '', 'sla_paused', NEW.status::text, NEW.sla_pause_reason);
  END IF;

  -- Saiu de status de pausa
  IF (OLD.status::text = ANY(v_pause_statuses)) AND (NEW.status::text <> ALL(v_pause_statuses)) THEN
    IF NEW.sla_pausa_inicio IS NOT NULL THEN
      v_pause_dur_min := GREATEST(0, EXTRACT(EPOCH FROM (now() - NEW.sla_pausa_inicio))/60)::int;
      NEW.sla_pausa_total_segundos := COALESCE(NEW.sla_pausa_total_segundos, 0) + v_pause_dur_min*60;

      -- estende prazo de solução
      IF NEW.resolution_due_at IS NOT NULL THEN
        NEW.resolution_due_at := NEW.resolution_due_at + make_interval(mins => v_pause_dur_min);
      END IF;

      UPDATE public.ticket_sla_pauses
        SET resumed_at = now(),
            resumed_by = COALESCE(NEW.tecnico_id, NEW.assigned_by),
            duration_minutes = v_pause_dur_min
      WHERE ticket_id = NEW.id AND resumed_at IS NULL;

      NEW.sla_pausa_inicio := NULL;
      NEW.sla_pause_reason := NULL;
    END IF;

    NEW.resolution_sla_status := CASE
      WHEN NEW.status::text IN ('RESOLVIDO','FECHADO') THEN NEW.resolution_sla_status
      WHEN NEW.resolution_due_at IS NOT NULL AND now() > NEW.resolution_due_at THEN 'breached'
      ELSE 'in_progress'
    END;

    INSERT INTO public.ticket_history(ticket_id, autor_id, autor_nome, campo, valor_novo, observacao)
    VALUES (NEW.id, NEW.tecnico_id, '', 'sla_resumed', NEW.status::text, 'SLA retomado');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ticket_sla_status_change ON public.tickets;
CREATE TRIGGER trg_ticket_sla_status_change
  BEFORE UPDATE OF status, tecnico_id ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.fn_ticket_sla_status_change();

-- =====================================================================
-- 10) Seed: horário comercial padrão + políticas por prioridade
-- =====================================================================
INSERT INTO public.ticket_sla_business_hours (nome, timezone, dias_uteis, hora_inicio, hora_fim, padrao)
SELECT 'Padrão', 'America/Sao_Paulo', '{1,2,3,4,5}'::int[], '08:00', '18:00', true
WHERE NOT EXISTS (SELECT 1 FROM public.ticket_sla_business_hours WHERE padrao = true);

INSERT INTO public.ticket_sla_policies (nome, prioridade, first_response_minutes, resolution_minutes, business_hours_only, prioridade_ordem)
SELECT * FROM (VALUES
  ('SLA Baixa',     'BAIXA',     8*60,  72*60, true, 40),
  ('SLA Média',     'MEDIA',     4*60,  48*60, true, 30),
  ('SLA Alta',      'ALTA',      1*60,  24*60, true, 20),
  ('SLA Crítica',   'CRITICA',     15,   4*60, true, 10)
) v(nome, prioridade, fr, res, bh, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM public.ticket_sla_policies p WHERE p.prioridade = v.prioridade
);

-- Marca filas conhecidas de pausa, se existirem
UPDATE public.ticket_filas
   SET pausa_sla = true
 WHERE upper(nome) LIKE '%AGUARDANDO CLIENTE%'
    OR upper(nome) LIKE '%AGUARDANDO FORNECEDOR%'
    OR upper(nome) LIKE '%AGUARDANDO OPERADORA%'
    OR upper(nome) LIKE '%AGUARDANDO TERCEIRO%';

-- =====================================================================
-- 11) Índices úteis
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_tickets_first_response_due ON public.tickets(first_response_due_at)
  WHERE first_response_sla_status IN ('pending','in_progress');
CREATE INDEX IF NOT EXISTS idx_tickets_resolution_due ON public.tickets(resolution_due_at)
  WHERE resolution_sla_status IN ('pending','in_progress','paused');
