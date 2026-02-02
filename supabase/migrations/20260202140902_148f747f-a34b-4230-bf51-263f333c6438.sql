-- Adicionar coluna sla_minutos diretamente em tb_tipodemanda
ALTER TABLE public.tb_tipodemanda 
ADD COLUMN sla_minutos integer;

-- Copiar valores existentes de tb_prazo para a nova coluna
UPDATE public.tb_tipodemanda td
SET sla_minutos = p.prazo_minutos
FROM public.tb_prazo p
WHERE td.prazo_id = p.id;

-- Definir valor padrão para casos onde não há prazo definido
UPDATE public.tb_tipodemanda
SET sla_minutos = 60
WHERE sla_minutos IS NULL;