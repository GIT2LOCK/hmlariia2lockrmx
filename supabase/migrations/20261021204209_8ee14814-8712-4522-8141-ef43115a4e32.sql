CREATE TABLE public.ariiatalk_assinaturas (
 usuario_id integer PRIMARY KEY REFERENCES public.usuarios(id) ON DELETE CASCADE,
 assinatura text NOT NULL DEFAULT '',
 criado_em timestamptz NOT NULL DEFAULT now(),
 atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ariiatalk_assinaturas TO service_role;
ALTER TABLE public.ariiatalk_assinaturas ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER ariiatalk_assinaturas_touch BEFORE UPDATE ON public.ariiatalk_assinaturas FOR EACH ROW EXECUTE FUNCTION public.atualizar_timestamp();
ALTER TABLE public.ariiatalk_mensagens ADD COLUMN autor_nome text, ADD COLUMN assinatura text, ADD COLUMN texto_whatsapp text;
COMMENT ON COLUMN public.ariiatalk_mensagens.autor_nome IS 'Snapshot of authenticated sender profile name; never the conversation assignee.';
COMMENT ON COLUMN public.ariiatalk_mensagens.texto_whatsapp IS 'Exact signed outbound text used to reconcile Evolution echoes without replacing clean conteudo.';