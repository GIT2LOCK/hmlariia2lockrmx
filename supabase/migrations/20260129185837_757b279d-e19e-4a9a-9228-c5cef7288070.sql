-- Inserir os status padrão usando OVERRIDING SYSTEM VALUE
INSERT INTO public.tb_status (status_id, status_nome) 
OVERRIDING SYSTEM VALUE
VALUES
(1, 'Novo'),
(2, 'Em andamento'),
(3, 'Concluído'),
(4, 'Cancelado')
ON CONFLICT (status_id) DO NOTHING;