CREATE TABLE IF NOT EXISTS public.ariiatalk_contato_notas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contato_id integer NOT NULL REFERENCES public.contatos(id) ON DELETE CASCADE,
  usuario_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  texto text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ariiatalk_contato_notas TO service_role;
ALTER TABLE public.ariiatalk_contato_notas ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS ariiatalk_contato_notas_contato_idx ON public.ariiatalk_contato_notas (contato_id, criado_em DESC);

CREATE TABLE IF NOT EXISTS public.ariiatalk_pastas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cor text,
  criado_por integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ariiatalk_pastas TO service_role;
ALTER TABLE public.ariiatalk_pastas ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS ariiatalk_pastas_nome_uniq ON public.ariiatalk_pastas (lower(nome));

CREATE TABLE IF NOT EXISTS public.ariiatalk_conversa_pastas (
  conversa_id uuid NOT NULL REFERENCES public.ariiatalk_conversas(id) ON DELETE CASCADE,
  pasta_id uuid NOT NULL REFERENCES public.ariiatalk_pastas(id) ON DELETE CASCADE,
  adicionado_por integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  adicionado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversa_id, pasta_id)
);
GRANT ALL ON public.ariiatalk_conversa_pastas TO service_role;
ALTER TABLE public.ariiatalk_conversa_pastas ENABLE ROW LEVEL SECURITY;
-- Acesso somente pelas Edge Functions do AriiaTalk (restritas à equipe 2lock).