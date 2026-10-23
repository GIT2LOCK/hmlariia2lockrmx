ALTER TABLE public.ariiatalk_conversas ADD COLUMN IF NOT EXISTS is_grupo boolean NOT NULL DEFAULT false;
ALTER TABLE public.ariiatalk_mensagens ADD COLUMN IF NOT EXISTS remetente_nome text, ADD COLUMN IF NOT EXISTS remetente_jid text;
UPDATE public.ariiatalk_conversas SET is_grupo = true WHERE remote_jid LIKE '%@g.us';