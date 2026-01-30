-- Atualizar status existentes para novos valores
UPDATE public.tb_status SET status_nome = 'Em atendimento' WHERE status_id = 2;
UPDATE public.tb_status SET status_nome = 'Concluído no prazo' WHERE status_id = 5;

-- Remover status "Excedido" (4) se existir e não estiver em uso
DELETE FROM public.tb_status WHERE status_id = 4 AND NOT EXISTS (
  SELECT 1 FROM public.tb_demanda WHERE status_id = 4
);

-- Se o status 4 estiver em uso, renomear para algo mais genérico
UPDATE public.tb_status SET status_nome = 'Pendente' WHERE status_id = 4 AND EXISTS (
  SELECT 1 FROM public.tb_demanda WHERE status_id = 4
);

-- Adicionar coluna created_at em tb_demanda para data/hora de criação real
ALTER TABLE public.tb_demanda ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Atualizar registros existentes com a data de prazo_inicio como created_at
UPDATE public.tb_demanda SET created_at = prazo_inicio WHERE created_at IS NULL;

-- Adicionar coluna concluded_at para marcar quando foi concluída
ALTER TABLE public.tb_demanda ADD COLUMN IF NOT EXISTS concluded_at TIMESTAMP WITH TIME ZONE;