-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Função para atualizar prioridade de demandas com prazo excedido
CREATE OR REPLACE FUNCTION public.atualizar_prioridade_demandas_excedidas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Atualiza prioridade para 1 (Crítica) quando prazo_fim < agora
  -- E a prioridade ainda não é Crítica (prioridade_id != 1)
  UPDATE tb_demanda
  SET prioridade_id = 1
  WHERE prazo_fim < NOW()
    AND prioridade_id != 1;
END;
$$;