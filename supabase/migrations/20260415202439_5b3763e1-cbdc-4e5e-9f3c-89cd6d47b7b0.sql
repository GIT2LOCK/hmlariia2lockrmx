
CREATE TABLE public.zabbix_contatos (
  id serial PRIMARY KEY,
  prefixo varchar(10) NOT NULL UNIQUE,
  primeiro_contato_nome text,
  primeiro_contato_telefone text,
  responsavel_nome text,
  responsavel_telefone text,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

ALTER TABLE public.zabbix_contatos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view contacts"
ON public.zabbix_contatos FOR SELECT TO authenticated USING (true);

CREATE POLICY "All users can manage contacts"
ON public.zabbix_contatos FOR ALL USING (true) WITH CHECK (true);
