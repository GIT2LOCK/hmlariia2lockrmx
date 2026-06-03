
-- 1) Novo campo: tipo do chamado (1 letra), default 'T'
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS tipo_chamado CHAR(1) NOT NULL DEFAULT 'T';

ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_tipo_chamado_chk;
ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_tipo_chamado_chk CHECK (tipo_chamado ~ '^[A-Z]$');

-- 2) Nova função de geração de código no formato 2L[TIPO][AA][MM][SEQ4]
CREATE OR REPLACE FUNCTION public.gerar_codigo_ticket()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_tipo  CHAR(1);
  v_yy    TEXT;
  v_mm    TEXT;
  v_prefix TEXT;
  v_next  INT;
  v_code  TEXT;
  v_tries INT := 0;
BEGIN
  IF NEW.codigo IS NOT NULL AND NEW.codigo <> '' THEN
    RETURN NEW;
  END IF;

  v_tipo := UPPER(COALESCE(NULLIF(NEW.tipo_chamado, ''), 'T'));
  IF v_tipo !~ '^[A-Z]$' THEN
    v_tipo := 'T';
  END IF;

  v_yy := to_char(COALESCE(NEW.data_abertura, now()), 'YY');
  v_mm := to_char(COALESCE(NEW.data_abertura, now()), 'MM');
  v_prefix := '2L' || v_tipo || v_yy || v_mm;

  LOOP
    SELECT COALESCE(MAX(NULLIF(regexp_replace(substring(codigo from 8 for 4), '\D', '', 'g'), '')::int), 0) + 1
      INTO v_next
      FROM public.tickets
      WHERE codigo LIKE v_prefix || '%'
        AND length(codigo) = 11;

    v_code := v_prefix || lpad(v_next::text, 4, '0');

    -- Garantir unicidade (proteção contra corrida)
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.tickets WHERE codigo = v_code);

    v_tries := v_tries + 1;
    IF v_tries > 10 THEN
      RAISE EXCEPTION 'Não foi possível gerar código único para o chamado (prefixo %)', v_prefix;
    END IF;
  END LOOP;

  NEW.codigo := v_code;
  RETURN NEW;
END;
$function$;

-- 3) Garante que o trigger existe (no-op caso já exista)
DROP TRIGGER IF EXISTS trg_tickets_codigo ON public.tickets;
CREATE TRIGGER trg_tickets_codigo
  BEFORE INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.gerar_codigo_ticket();

-- 4) Índice para acelerar busca por código (prefixo)
CREATE INDEX IF NOT EXISTS idx_tickets_codigo_prefix ON public.tickets (codigo varchar_pattern_ops);
