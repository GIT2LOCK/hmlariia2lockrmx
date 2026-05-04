-- Enums
CREATE TYPE public.ticket_priority AS ENUM ('CRITICO','ALTO','MEDIO','BAIXO');
CREATE TYPE public.ticket_status AS ENUM ('NOVO','TRIAGEM','EM_ATENDIMENTO','AGUARDANDO_CLIENTE','AGUARDANDO_OPERADORA','AGUARDANDO_TERCEIRO','AGENDADO','RESOLVIDO','FECHADO','CANCELADO');
CREATE TYPE public.ticket_comment_type AS ENUM ('INTERNO','CLIENTE','AUTOMATICO');
CREATE TYPE public.ticket_origem AS ENUM ('MANUAL','EMAIL','TELEFONE','CHAT','MONITORAMENTO','API','N8N');

-- Filas
CREATE TABLE public.ticket_filas (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(120) NOT NULL UNIQUE,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Categorias (com subcategoria via parent_id)
CREATE TABLE public.ticket_categorias (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  parent_id INTEGER REFERENCES public.ticket_categorias(id) ON DELETE CASCADE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (nome, parent_id)
);
CREATE INDEX idx_ticket_categorias_parent ON public.ticket_categorias(parent_id);

-- Tickets
CREATE TABLE public.tickets (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(20) NOT NULL UNIQUE,
  -- vínculos
  empresa_id INTEGER REFERENCES public.empresas(id) ON DELETE SET NULL,
  unidade_id INTEGER REFERENCES public.unidades(id) ON DELETE SET NULL,
  link_id INTEGER REFERENCES public.links_internet(id) ON DELETE SET NULL,
  operadora_id INTEGER REFERENCES public.operadoras(id) ON DELETE SET NULL,
  solicitante_nome VARCHAR(160),
  solicitante_email VARCHAR(160),
  solicitante_telefone VARCHAR(40),
  tecnico_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
  fila_id INTEGER REFERENCES public.ticket_filas(id) ON DELETE SET NULL,
  categoria_id INTEGER REFERENCES public.ticket_categorias(id) ON DELETE SET NULL,
  subcategoria_id INTEGER REFERENCES public.ticket_categorias(id) ON DELETE SET NULL,
  ativo VARCHAR(160), -- ativo/equipamento livre
  -- conteúdo
  titulo VARCHAR(200) NOT NULL,
  descricao TEXT,
  prioridade public.ticket_priority NOT NULL DEFAULT 'MEDIO',
  status public.ticket_status NOT NULL DEFAULT 'NOVO',
  origem public.ticket_origem NOT NULL DEFAULT 'MANUAL',
  -- datas
  data_abertura TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_primeiro_atendimento TIMESTAMPTZ,
  data_solucao TIMESTAMPTZ,
  data_fechamento TIMESTAMPTZ,
  -- SLA
  sla_atendimento_minutos INTEGER NOT NULL,  -- prazo em minutos a partir da abertura
  sla_solucao_minutos INTEGER NOT NULL,
  sla_pausa_inicio TIMESTAMPTZ,              -- quando entrou em status que pausa
  sla_pausa_total_segundos INTEGER NOT NULL DEFAULT 0,
  -- meta
  criado_por INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tickets_status ON public.tickets(status);
CREATE INDEX idx_tickets_prioridade ON public.tickets(prioridade);
CREATE INDEX idx_tickets_tecnico ON public.tickets(tecnico_id);
CREATE INDEX idx_tickets_empresa ON public.tickets(empresa_id);
CREATE INDEX idx_tickets_unidade ON public.tickets(unidade_id);
CREATE INDEX idx_tickets_data_abertura ON public.tickets(data_abertura DESC);

-- Comentários
CREATE TABLE public.ticket_comments (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  autor_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
  autor_nome VARCHAR(160),
  tipo public.ticket_comment_type NOT NULL DEFAULT 'INTERNO',
  conteudo TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ticket_comments_ticket ON public.ticket_comments(ticket_id);

-- Histórico
CREATE TABLE public.ticket_history (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  autor_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
  autor_nome VARCHAR(160),
  campo VARCHAR(60) NOT NULL,            -- ex: 'status','tecnico_id','prioridade'
  valor_anterior TEXT,
  valor_novo TEXT,
  observacao TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ticket_history_ticket ON public.ticket_history(ticket_id);

-- Anexos
CREATE TABLE public.ticket_attachments (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  autor_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
  autor_nome VARCHAR(160),
  storage_path TEXT NOT NULL,            -- caminho no bucket ticket-attachments
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120),
  tamanho_bytes BIGINT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ticket_attachments_ticket ON public.ticket_attachments(ticket_id);

-- Triggers de atualizado_em
CREATE TRIGGER trg_ticket_filas_updated BEFORE UPDATE ON public.ticket_filas
  FOR EACH ROW EXECUTE FUNCTION public.atualizar_timestamp();
CREATE TRIGGER trg_ticket_categorias_updated BEFORE UPDATE ON public.ticket_categorias
  FOR EACH ROW EXECUTE FUNCTION public.atualizar_timestamp();
CREATE TRIGGER trg_tickets_updated BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.atualizar_timestamp();

-- Geração automática do código TKT-000001
CREATE SEQUENCE IF NOT EXISTS public.ticket_codigo_seq START 1;
CREATE OR REPLACE FUNCTION public.gerar_codigo_ticket()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.codigo IS NULL OR NEW.codigo = '' THEN
    NEW.codigo := 'TKT-' || LPAD(nextval('public.ticket_codigo_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_tickets_codigo BEFORE INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.gerar_codigo_ticket();

-- RLS
ALTER TABLE public.ticket_filas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['ticket_filas','ticket_categorias','tickets','ticket_comments','ticket_history','ticket_attachments']) LOOP
    EXECUTE format('CREATE POLICY "Anon full access %1$s" ON public.%1$I FOR ALL TO anon USING (true) WITH CHECK (true);', t);
    EXECUTE format('CREATE POLICY "Authenticated full access %1$s" ON public.%1$I FOR ALL TO authenticated USING (true) WITH CHECK (true);', t);
  END LOOP;
END $$;

-- Bucket de anexos (privado)
INSERT INTO storage.buckets (id, name, public) VALUES ('ticket-attachments','ticket-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Auth read ticket attachments" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ticket-attachments');
CREATE POLICY "Auth upload ticket attachments" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ticket-attachments');
CREATE POLICY "Auth update ticket attachments" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'ticket-attachments');
CREATE POLICY "Auth delete ticket attachments" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ticket-attachments');

-- Seeds básicos
INSERT INTO public.ticket_filas (nome, descricao) VALUES
  ('NOC','Network Operations Center'),
  ('Suporte N1','Atendimento de primeiro nível'),
  ('Suporte N2','Atendimento de segundo nível'),
  ('Field','Atendimento em campo')
ON CONFLICT DO NOTHING;

INSERT INTO public.ticket_categorias (nome) VALUES
  ('Link de Internet'),
  ('Hardware'),
  ('Acesso/Usuário'),
  ('Software'),
  ('Outros')
ON CONFLICT DO NOTHING;