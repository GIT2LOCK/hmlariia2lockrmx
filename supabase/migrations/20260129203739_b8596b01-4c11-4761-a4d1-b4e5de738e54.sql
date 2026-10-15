-- 1. Tabela de Prazos (SLA por tipo)
CREATE TABLE public.tb_prazo (
  id SERIAL PRIMARY KEY,
  tipo INTEGER NOT NULL UNIQUE CHECK (tipo IN (1, 2, 3)),
  descricao VARCHAR(100) NOT NULL,
  prazo_minutos INTEGER NOT NULL
);

-- Inserir os prazos padrão
INSERT INTO public.tb_prazo (tipo, descricao, prazo_minutos) VALUES
  (1, 'Tipo 1 - Urgente', 20),
  (2, 'Tipo 2 - Prioridade Média', 60),
  (3, 'Tipo 3 - Baixa Prioridade', 2880);

-- Habilitar RLS
ALTER TABLE public.tb_prazo ENABLE ROW LEVEL SECURITY;

-- Política de leitura para todos
CREATE POLICY "Allow read prazo for all" ON public.tb_prazo FOR SELECT USING (true);

-- 2. Tabela de Tipos de Demanda
CREATE TABLE public.tb_tipodemanda (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  tipo INTEGER NOT NULL CHECK (tipo IN (1, 2, 3)),
  prazo_id INTEGER NOT NULL REFERENCES public.tb_prazo(id)
);

-- Habilitar RLS
ALTER TABLE public.tb_tipodemanda ENABLE ROW LEVEL SECURITY;

-- Política de leitura para todos
CREATE POLICY "Allow read tipodemanda for all" ON public.tb_tipodemanda FOR SELECT USING (true);

-- Inserir Tipo 1 (prazo_id = 1)
INSERT INTO public.tb_tipodemanda (nome, tipo, prazo_id) VALUES
  ('Nota Fiscal', 1, 1),
  ('Assinatura digital', 1, 1),
  ('Boleto prefeitura', 1, 1),
  ('Dúvida mensalidade contábil', 1, 1),
  ('Comprovante de inscrição municipal', 1, 1),
  ('Contribuição INSS - dúvida', 1, 1),
  ('DAS / Recalculo', 1, 1),
  ('DEFIS', 1, 1),
  ('DARF', 1, 1),
  ('Documentos - certidões', 1, 1),
  ('Documentos para empréstimo', 1, 1),
  ('Documentos ajuda - contabilidade', 1, 1),
  ('Dúvida admissão ASS', 1, 1),
  ('Dúvida admissão funcionário', 1, 1),
  ('Dúvida alíquota do SN', 1, 1),
  ('Dúvida férias funcionário', 1, 1),
  ('Dúvida INSS', 1, 1),
  ('Envio contrato social', 1, 1),
  ('Imposto de Renda', 1, 1),
  ('Mudança e-mail prefeitura', 1, 1),
  ('Pendência prefeitura', 1, 1);

-- Inserir Tipo 2 (prazo_id = 2)
INSERT INTO public.tb_tipodemanda (nome, tipo, prazo_id) VALUES
  ('Aumento pro-labore', 2, 2),
  ('Boletos', 2, 2),
  ('Contrato funcionário', 2, 2),
  ('Declaração de faturamento', 2, 2),
  ('Mudança de CNAE', 2, 2),
  ('Pagamento encerramento', 2, 2),
  ('Parcelamento', 2, 2);

-- Inserir Tipo 3 (prazo_id = 3)
INSERT INTO public.tb_tipodemanda (nome, tipo, prazo_id) VALUES
  ('Alteração de Empresa', 3, 3),
  ('Balanço', 3, 3),
  ('Comprovante holerite', 3, 3),
  ('Recolhimento INSS', 3, 3),
  ('Transferência de contabilidade', 3, 3);

-- Adicionar coluna tipodemanda_id na tb_demanda
ALTER TABLE public.tb_demanda 
ADD COLUMN tipodemanda_id INTEGER REFERENCES public.tb_tipodemanda(id);