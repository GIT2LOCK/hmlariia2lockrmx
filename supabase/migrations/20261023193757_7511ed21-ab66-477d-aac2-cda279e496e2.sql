ALTER TABLE public.contatos ADD COLUMN IF NOT EXISTS whatsapp_grupo_jid text;
CREATE UNIQUE INDEX IF NOT EXISTS contatos_whatsapp_grupo_jid_key ON public.contatos (whatsapp_grupo_jid) WHERE whatsapp_grupo_jid IS NOT NULL;

INSERT INTO public.contatos (nome, tipo, whatsapp_grupo_jid, categoria)
SELECT DISTINCT ON (c.remote_jid) COALESCE(NULLIF(trim(c.nome_contato), ''), 'Grupo'), 'contato', c.remote_jid, 'Grupo'
FROM public.ariiatalk_conversas c
WHERE c.is_grupo AND c.remote_jid LIKE '%@g.us'
ORDER BY c.remote_jid, c.ultima_mensagem_em DESC NULLS LAST
ON CONFLICT DO NOTHING;

UPDATE public.ariiatalk_conversas c SET contato_id = ct.id
FROM public.contatos ct
WHERE c.is_grupo AND c.contato_id IS NULL AND ct.whatsapp_grupo_jid = c.remote_jid;