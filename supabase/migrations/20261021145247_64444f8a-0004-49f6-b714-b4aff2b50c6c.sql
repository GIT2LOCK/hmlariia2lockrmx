ALTER TYPE public.tipo_contato ADD VALUE IF NOT EXISTS 'contato';

ALTER TABLE public.contatos ADD COLUMN IF NOT EXISTS categoria text;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS cor text;
ALTER TABLE public.ariiatalk_conversas
  ADD COLUMN IF NOT EXISTS atribuido_por integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS atribuido_em timestamptz,
  ADD COLUMN IF NOT EXISTS encerrado_em timestamptz,
  ADD COLUMN IF NOT EXISTS encerrado_por integer REFERENCES public.usuarios(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.ariiatalk_leituras (
  conversa_id uuid NOT NULL REFERENCES public.ariiatalk_conversas(id) ON DELETE CASCADE,
  usuario_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  lido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversa_id, usuario_id)
);
GRANT ALL ON public.ariiatalk_leituras TO service_role;
ALTER TABLE public.ariiatalk_leituras ENABLE ROW LEVEL SECURITY;
-- Sem políticas para anon/authenticated: acesso somente pelas Edge Functions do AriiaTalk.

CREATE INDEX IF NOT EXISTS ariiatalk_mensagens_conversa_entrada_idx
  ON public.ariiatalk_mensagens (conversa_id, criado_em) WHERE direcao = 'entrada';
CREATE INDEX IF NOT EXISTS contatos_telefone_idx ON public.contatos (telefone);

CREATE OR REPLACE FUNCTION public.fn_ariiatalk_nao_lidas(_usuario_id integer)
RETURNS TABLE(conversa_id uuid, nao_lidas bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.conversa_id, count(*)::bigint
  FROM public.ariiatalk_mensagens m
  LEFT JOIN public.ariiatalk_leituras l
    ON l.conversa_id = m.conversa_id AND l.usuario_id = _usuario_id
  WHERE m.direcao = 'entrada'
    AND (l.lido_em IS NULL OR m.criado_em > l.lido_em)
  GROUP BY m.conversa_id;
$$;
REVOKE ALL ON FUNCTION public.fn_ariiatalk_nao_lidas(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ariiatalk_nao_lidas(integer) TO service_role;

-- Estado inicial: considera lidas as mensagens já existentes para quem já é responsável, sem afetar os demais.
INSERT INTO public.ariiatalk_leituras (conversa_id, usuario_id, lido_em)
SELECT id, responsavel_id, now() FROM public.ariiatalk_conversas
WHERE responsavel_id IS NOT NULL AND nao_lidas = 0
ON CONFLICT DO NOTHING;