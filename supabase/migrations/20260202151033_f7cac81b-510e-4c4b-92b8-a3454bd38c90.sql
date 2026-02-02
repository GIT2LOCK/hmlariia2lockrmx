-- Tabela para armazenar filtros favoritos de demandas
CREATE TABLE public.tb_filtro_favorito (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.tb_usuario(user_id) ON DELETE CASCADE,
  nome VARCHAR(100) NOT NULL,
  filtros JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índice para busca por usuário
CREATE INDEX idx_filtro_favorito_user_id ON public.tb_filtro_favorito(user_id);

-- Habilitar RLS
ALTER TABLE public.tb_filtro_favorito ENABLE ROW LEVEL SECURITY;

-- Política: usuários podem ler seus próprios filtros
CREATE POLICY "Users can read own filters"
ON public.tb_filtro_favorito
FOR SELECT
USING (true);

-- Política: usuários podem inserir seus próprios filtros
CREATE POLICY "Users can insert own filters"
ON public.tb_filtro_favorito
FOR INSERT
WITH CHECK (true);

-- Política: usuários podem deletar seus próprios filtros
CREATE POLICY "Users can delete own filters"
ON public.tb_filtro_favorito
FOR DELETE
USING (true);