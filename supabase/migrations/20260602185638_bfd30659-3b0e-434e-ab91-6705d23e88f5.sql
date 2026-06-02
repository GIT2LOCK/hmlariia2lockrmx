ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS solucao_aplicada text,
  ADD COLUMN IF NOT EXISTS motivo_encerramento varchar(50),
  ADD COLUMN IF NOT EXISTS motivo_encerramento_outro text;