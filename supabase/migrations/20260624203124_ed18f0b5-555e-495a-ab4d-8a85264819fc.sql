
-- 1) Função helper que lê role do JWT (claim ariia_permissao) ou da tabela usuarios
CREATE OR REPLACE FUNCTION public.current_ariia_role()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF((auth.jwt() ->> 'ariia_permissao'), ''),
    (SELECT u.permissao::text FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.current_ariia_empresa_id()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.empresa_id FROM public.usuarios u
   WHERE u.auth_user_id = auth.uid() AND u.ativo = true LIMIT 1;
$$;

-- 2) Reescreve policies de tickets — INSERT/UPDATE robustos para Admin
DROP POLICY IF EXISTS tickets_insert_scoped ON public.tickets;
DROP POLICY IF EXISTS tickets_update_scoped ON public.tickets;
DROP POLICY IF EXISTS tickets_select_scoped ON public.tickets;
DROP POLICY IF EXISTS tickets_delete_admin ON public.tickets;

CREATE POLICY tickets_select_scoped ON public.tickets
  FOR SELECT TO authenticated
  USING (
    public.current_ariia_role() IN ('SUPERADMIN','ADMIN')
    OR public.fn_can_view_ticket(id)
  );

CREATE POLICY tickets_insert_scoped ON public.tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_ariia_role() IN ('SUPERADMIN','ADMIN','USER')
    OR (
      public.current_ariia_role() = 'CLIENTE'
      AND empresa_id IS NOT NULL
      AND empresa_id = public.current_ariia_empresa_id()
    )
  );

CREATE POLICY tickets_update_scoped ON public.tickets
  FOR UPDATE TO authenticated
  USING (
    public.current_ariia_role() IN ('SUPERADMIN','ADMIN')
    OR public.fn_can_view_ticket(id)
  )
  WITH CHECK (
    public.current_ariia_role() IN ('SUPERADMIN','ADMIN')
    OR public.fn_can_view_ticket(id)
  );

CREATE POLICY tickets_delete_admin ON public.tickets
  FOR DELETE TO authenticated
  USING (public.current_ariia_role() IN ('SUPERADMIN','ADMIN'));

-- 3) Trigger que bloqueia atribuir CLIENTE como técnico responsável
CREATE OR REPLACE FUNCTION public.fn_validate_tecnico_responsavel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perm text;
  v_scope public.access_scope;
  v_ativo boolean;
BEGIN
  IF NEW.tecnico_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.tecnico_id IS NOT DISTINCT FROM OLD.tecnico_id THEN
    RETURN NEW;
  END IF;

  SELECT permissao::text, access_scope, ativo
    INTO v_perm, v_scope, v_ativo
  FROM public.usuarios
  WHERE id = NEW.tecnico_id;

  IF NOT FOUND OR COALESCE(v_ativo, false) = false THEN
    RAISE EXCEPTION 'tecnico_invalido_usuario_inativo';
  END IF;

  IF v_perm = 'CLIENTE' THEN
    RAISE EXCEPTION 'tecnico_invalido_cliente_nao_permitido';
  END IF;

  IF v_scope IN ('BLOCKED','GRAFANA_ONLY') THEN
    RAISE EXCEPTION 'tecnico_invalido_sem_acesso_ariia';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_tecnico_responsavel ON public.tickets;
CREATE TRIGGER trg_validate_tecnico_responsavel
  BEFORE INSERT OR UPDATE OF tecnico_id ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_tecnico_responsavel();

-- 4) Anexos vinculáveis a uma mensagem/update
ALTER TABLE public.ticket_attachments
  ADD COLUMN IF NOT EXISTS comment_id integer
  REFERENCES public.ticket_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_comment_id
  ON public.ticket_attachments(comment_id);

-- 5) apply_domain_rule agora preenche empresa_id mesmo para clientes já criados
CREATE OR REPLACE FUNCTION public.apply_domain_rule(_usuario_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  u_email text;
  u_perm text;
  u_emp int;
  u_manual boolean;
  d_domain text;
  rule public.domain_rules;
BEGIN
  SELECT email, permissao, empresa_id, COALESCE(permissao_manual, false)
    INTO u_email, u_perm, u_emp, u_manual
  FROM public.usuarios
  WHERE id = _usuario_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'user_not_found');
  END IF;

  d_domain := lower(split_part(u_email, '@', 2));
  IF d_domain = '' THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'no_domain');
  END IF;

  SELECT * INTO rule
  FROM public.domain_rules
  WHERE lower(domain) = d_domain
    AND ativo = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'no_rule', 'domain', d_domain);
  END IF;

  -- Empresa: sempre aplica se a regra tem empresa e o usuário ainda não tem
  IF rule.empresa_id IS NOT NULL AND u_emp IS NULL THEN
    UPDATE public.usuarios
       SET empresa_id = rule.empresa_id,
           atualizado_em = now()
     WHERE id = _usuario_id;
    u_emp := rule.empresa_id;
  END IF;

  -- Permissao: respeita override manual e nunca rebaixa admins
  IF NOT u_manual AND u_perm NOT IN ('SUPERADMIN','ADMIN','USER') THEN
    UPDATE public.usuarios
       SET permissao = rule.default_permissao,
           atualizado_em = now()
     WHERE id = _usuario_id;
    u_perm := rule.default_permissao;
  END IF;

  RETURN jsonb_build_object(
    'applied', true,
    'permissao', u_perm,
    'empresa_id', u_emp,
    'domain', d_domain
  );
END;
$function$;
