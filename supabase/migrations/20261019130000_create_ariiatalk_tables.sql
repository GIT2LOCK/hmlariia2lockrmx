-- AriiaTalk: estrutura inicial de conversas e mensagens.
-- O acesso será realizado pelas Edge Functions autenticadas.

CREATE TABLE IF NOT EXISTS public.ariiatalk_instancias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    evolution_instance_name TEXT NOT NULL UNIQUE,
    telefone TEXT,
    status TEXT NOT NULL DEFAULT 'disconnected'
        CHECK (status IN ('connected', 'disconnected', 'connecting', 'error')),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ariiatalk_conversas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instancia_id UUID NOT NULL
        REFERENCES public.ariiatalk_instancias(id) ON DELETE CASCADE,
    remote_jid TEXT NOT NULL,
    contato_id INTEGER
        REFERENCES public.contatos(id) ON DELETE SET NULL,
    nome_contato TEXT,
    foto_url TEXT,
    ultima_mensagem TEXT,
    ultima_mensagem_em TIMESTAMPTZ,
    nao_lidas INTEGER NOT NULL DEFAULT 0 CHECK (nao_lidas >= 0),
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'closed')),
    responsavel_id INTEGER
        REFERENCES public.usuarios(id) ON DELETE SET NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (instancia_id, remote_jid)
);

CREATE TABLE IF NOT EXISTS public.ariiatalk_mensagens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversa_id UUID NOT NULL
        REFERENCES public.ariiatalk_conversas(id) ON DELETE CASCADE,
    evolution_message_id TEXT,
    direcao TEXT NOT NULL
        CHECK (direcao IN ('entrada', 'saida')),
    tipo TEXT NOT NULL DEFAULT 'texto',
    conteudo TEXT,
    media_url TEXT,
    status TEXT NOT NULL DEFAULT 'recebida'
        CHECK (status IN (
            'pendente', 'enviando', 'enviada',
            'entregue', 'lida', 'erro', 'recebida'
        )),
    enviado_por INTEGER
        REFERENCES public.usuarios(id) ON DELETE SET NULL,
    enviada_em TIMESTAMPTZ,
    payload JSONB,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ariia_talk_mensagens_external_id_idx
ON public.ariiatalk_mensagens (evolution_message_id)
WHERE evolution_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ariia_talk_conversas_ultima_mensagem_idx
ON public.ariiatalk_conversas (ultima_mensagem_em DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS ariia_talk_mensagens_conversa_idx
ON public.ariiatalk_mensagens (conversa_id, criado_em);

CREATE INDEX IF NOT EXISTS ariia_talk_conversas_responsavel_idx
ON public.ariiatalk_conversas (responsavel_id);

-- O frontend não terá acesso direto a essas tabelas.
-- As Edge Functions validarão a sessão e as permissões antes de usar o cliente administrativo.
ALTER TABLE public.ariiatalk_instancias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ariiatalk_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ariiatalk_mensagens ENABLE ROW LEVEL SECURITY;
