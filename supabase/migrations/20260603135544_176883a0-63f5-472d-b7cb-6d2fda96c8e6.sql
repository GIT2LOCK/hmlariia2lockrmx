-- Enums
DO $$ BEGIN
  CREATE TYPE public.ticket_nivel AS ENUM ('N1','N2','N3');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.support_group_role AS ENUM ('MEMBRO','COORDENADOR','GESTOR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- tickets: novas colunas
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS assigned_group_id integer,
  ADD COLUMN IF NOT EXISTS assigned_by integer,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS nivel_escalonamento public.ticket_nivel NOT NULL DEFAULT 'N1',
  ADD COLUMN IF NOT EXISTS aguardando_cliente_motivo text,
  ADD COLUMN IF NOT EXISTS aguardando_cliente_desde timestamptz;

-- support_groups
CREATE TABLE IF NOT EXISTS public.support_groups (
  id serial PRIMARY KEY,
  nome varchar NOT NULL UNIQUE,
  descricao text,
  nivel public.ticket_nivel,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.support_groups TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_groups TO authenticated;
GRANT ALL ON public.support_groups TO service_role;
ALTER TABLE public.support_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anon full access support_groups" ON public.support_groups;
CREATE POLICY "Anon full access support_groups" ON public.support_groups FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated full access support_groups" ON public.support_groups;
CREATE POLICY "Authenticated full access support_groups" ON public.support_groups FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- support_group_members
CREATE TABLE IF NOT EXISTS public.support_group_members (
  id serial PRIMARY KEY,
  group_id integer NOT NULL,
  usuario_id integer NOT NULL,
  role_in_group public.support_group_role NOT NULL DEFAULT 'MEMBRO',
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, usuario_id)
);
GRANT SELECT ON public.support_group_members TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_group_members TO authenticated;
GRANT ALL ON public.support_group_members TO service_role;
ALTER TABLE public.support_group_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anon full access support_group_members" ON public.support_group_members;
CREATE POLICY "Anon full access support_group_members" ON public.support_group_members FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated full access support_group_members" ON public.support_group_members;
CREATE POLICY "Authenticated full access support_group_members" ON public.support_group_members FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ticket_notifications
CREATE TABLE IF NOT EXISTS public.ticket_notifications (
  id serial PRIMARY KEY,
  ticket_id integer NOT NULL,
  usuario_id integer NOT NULL,
  tipo varchar NOT NULL,
  mensagem text NOT NULL,
  lida boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ticket_notifications_usuario_idx ON public.ticket_notifications(usuario_id, lida, criado_em DESC);
GRANT SELECT ON public.ticket_notifications TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_notifications TO authenticated;
GRANT ALL ON public.ticket_notifications TO service_role;
ALTER TABLE public.ticket_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anon full access ticket_notifications" ON public.ticket_notifications;
CREATE POLICY "Anon full access ticket_notifications" ON public.ticket_notifications FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated full access ticket_notifications" ON public.ticket_notifications;
CREATE POLICY "Authenticated full access ticket_notifications" ON public.ticket_notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed operational queues (idempotent)
INSERT INTO public.ticket_filas (nome, descricao, ativo)
SELECT v.nome, v.descricao, true
FROM (VALUES
  ('Novos', 'Chamados recém-criados ou ainda não assumidos'),
  ('Em atendimento', 'Chamados em atendimento ativo'),
  ('Aguardando cliente', 'Chamados aguardando retorno do cliente'),
  ('Escalados', 'Chamados escalados para nível ou equipe superior')
) AS v(nome, descricao)
WHERE NOT EXISTS (SELECT 1 FROM public.ticket_filas f WHERE lower(f.nome) = lower(v.nome));