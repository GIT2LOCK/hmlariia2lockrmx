-- Habilitar RLS nas tabelas
ALTER TABLE public.tb_prioridade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_via ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_cnpj ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_cpf_cnpj ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_demanda ENABLE ROW LEVEL SECURITY;

-- Políticas de leitura para tb_prioridade (dados públicos de referência)
CREATE POLICY "Allow read prioridade for all"
ON public.tb_prioridade FOR SELECT
USING (true);

-- Políticas de leitura para tb_via (dados públicos de referência)
CREATE POLICY "Allow read via for all"
ON public.tb_via FOR SELECT
USING (true);

-- Políticas de leitura para tb_cnpj
CREATE POLICY "Allow read cnpj for all"
ON public.tb_cnpj FOR SELECT
USING (true);

-- Políticas de leitura para tb_cpf_cnpj
CREATE POLICY "Allow read cpf_cnpj for all"
ON public.tb_cpf_cnpj FOR SELECT
USING (true);

-- Políticas para tb_demanda
CREATE POLICY "Allow read demandas for all"
ON public.tb_demanda FOR SELECT
USING (true);

CREATE POLICY "Allow insert demandas"
ON public.tb_demanda FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow update demandas"
ON public.tb_demanda FOR UPDATE
USING (true);

-- Inserir dados na tabela tb_via
INSERT INTO public.tb_via (tem_email, tem_whatsapp) VALUES
  (true, false),   -- Email
  (false, true),   -- WhatsApp
  (false, false),  -- Telefone/Presencial
  (true, true)     -- Email + WhatsApp
ON CONFLICT DO NOTHING;