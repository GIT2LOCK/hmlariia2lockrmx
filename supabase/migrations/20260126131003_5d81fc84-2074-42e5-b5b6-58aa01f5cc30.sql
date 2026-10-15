-- Inserir níveis de prioridade
INSERT INTO public.tb_prioridade (prioridade_nome, prioridade_nivel) VALUES
  ('Baixa', 1),
  ('Média', 2),
  ('Alta', 3),
  ('Urgente', 4)
ON CONFLICT DO NOTHING;