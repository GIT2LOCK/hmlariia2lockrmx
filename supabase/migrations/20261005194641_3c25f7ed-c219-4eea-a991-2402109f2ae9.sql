ALTER TABLE public.elev_cronograma_atividades
  ADD COLUMN IF NOT EXISTS data_inicio date,
  ADD COLUMN IF NOT EXISTS data_fim date,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'NAO_INICIADO',
  ADD COLUMN IF NOT EXISTS observacoes text,
  ADD COLUMN IF NOT EXISTS concluido_em timestamptz;
DROP TRIGGER IF EXISTS trg_elev_cron_atv_datas ON public.elev_cronograma_atividades;
CREATE TRIGGER trg_elev_cron_atv_datas BEFORE INSERT OR UPDATE ON public.elev_cronograma_atividades
  FOR EACH ROW EXECUTE FUNCTION public.fn_elev_cronograma_validar_datas();