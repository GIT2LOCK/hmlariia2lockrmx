
-- =========================================================
-- 1) Trigger: impede CLIENTE de alterar campos internos de tickets
-- =========================================================
CREATE OR REPLACE FUNCTION public.fn_block_cliente_internal_ticket_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perm TEXT;
BEGIN
  -- Bypass: chamadas via SECURITY DEFINER do próprio Postgres (sem auth.uid) ou sem usuário autenticado
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT permissao INTO v_perm
  FROM public.usuarios
  WHERE auth_user_id = auth.uid() AND ativo = true
  LIMIT 1;

  IF v_perm IS DISTINCT FROM 'CLIENTE' THEN
    RETURN NEW;
  END IF;

  -- Empresa NÃO pode mudar
  IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id THEN
    RAISE EXCEPTION 'cliente_cannot_change_empresa';
  END IF;

  -- Campos internos bloqueados para CLIENTE
  IF NEW.tecnico_id          IS DISTINCT FROM OLD.tecnico_id
  OR NEW.assigned_by         IS DISTINCT FROM OLD.assigned_by
  OR NEW.assigned_group_id   IS DISTINCT FROM OLD.assigned_group_id
  OR NEW.assigned_at         IS DISTINCT FROM OLD.assigned_at
  OR NEW.fila_id             IS DISTINCT FROM OLD.fila_id
  OR NEW.categoria_id        IS DISTINCT FROM OLD.categoria_id
  OR NEW.operadora_id        IS DISTINCT FROM OLD.operadora_id
  OR NEW.prioridade          IS DISTINCT FROM OLD.prioridade
  OR NEW.nivel_escalonamento IS DISTINCT FROM OLD.nivel_escalonamento
  OR NEW.status              IS DISTINCT FROM OLD.status
  OR NEW.tipo_chamado        IS DISTINCT FROM OLD.tipo_chamado
  OR NEW.sla_policy_id       IS DISTINCT FROM OLD.sla_policy_id
  OR NEW.sla_atendimento_minutos IS DISTINCT FROM OLD.sla_atendimento_minutos
  OR NEW.sla_solucao_minutos     IS DISTINCT FROM OLD.sla_solucao_minutos
  OR NEW.first_response_due_at   IS DISTINCT FROM OLD.first_response_due_at
  OR NEW.resolution_due_at       IS DISTINCT FROM OLD.resolution_due_at
  OR NEW.first_response_sla_status IS DISTINCT FROM OLD.first_response_sla_status
  OR NEW.resolution_sla_status     IS DISTINCT FROM OLD.resolution_sla_status
  THEN
    RAISE EXCEPTION 'cliente_cannot_modify_internal_fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_cliente_internal_ticket_updates ON public.tickets;
CREATE TRIGGER trg_block_cliente_internal_ticket_updates
BEFORE UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.fn_block_cliente_internal_ticket_updates();

-- =========================================================
-- 2) RPC: CLIENTE confirma resolução / encerra próprio chamado
-- =========================================================
CREATE OR REPLACE FUNCTION public.fn_cliente_encerrar_ticket(_ticket_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid INT;
  v_perm TEXT;
  v_emp INT;
  v_t RECORD;
BEGIN
  SELECT id, permissao, empresa_id INTO v_uid, v_perm, v_emp
  FROM public.usuarios
  WHERE auth_user_id = auth.uid() AND ativo = true
  LIMIT 1;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF v_perm <> 'CLIENTE' THEN
    RAISE EXCEPTION 'only_cliente_allowed';
  END IF;

  SELECT * INTO v_t FROM public.tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ticket_not_found'; END IF;

  IF v_t.empresa_id IS DISTINCT FROM v_emp THEN
    RAISE EXCEPTION 'ticket_not_in_your_company';
  END IF;

  IF v_t.status NOT IN ('RESOLVIDO') THEN
    RAISE EXCEPTION 'ticket_not_eligible_for_client_closure';
  END IF;

  -- Faz o UPDATE como SECURITY DEFINER (auth.uid permanece, mas o trigger bypassa o perm check via NEW=OLD nas colunas restritas)
  -- Como o trigger bloqueia mudança de status para CLIENTE, executamos com SET LOCAL para suspender momentaneamente.
  PERFORM set_config('app.bypass_cliente_check', '1', true);
  UPDATE public.tickets
     SET status = 'FECHADO',
         data_fechamento = now(),
         atualizado_em = now()
   WHERE id = _ticket_id;
  PERFORM set_config('app.bypass_cliente_check', '0', true);

  INSERT INTO public.ticket_history(ticket_id, autor_id, autor_nome, campo, valor_anterior, valor_novo, observacao)
  VALUES (_ticket_id, v_uid, NULL, 'status', v_t.status, 'FECHADO', 'Encerrado pelo cliente (confirmação de resolução)');

  RETURN jsonb_build_object('ok', true, 'status', 'FECHADO');
END;
$$;

-- Atualizar trigger para respeitar o bypass interno
CREATE OR REPLACE FUNCTION public.fn_block_cliente_internal_ticket_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perm TEXT;
  v_bypass TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Bypass interno usado pela RPC fn_cliente_encerrar_ticket
  v_bypass := current_setting('app.bypass_cliente_check', true);
  IF v_bypass = '1' THEN
    RETURN NEW;
  END IF;

  SELECT permissao INTO v_perm
  FROM public.usuarios
  WHERE auth_user_id = auth.uid() AND ativo = true
  LIMIT 1;

  IF v_perm IS DISTINCT FROM 'CLIENTE' THEN
    RETURN NEW;
  END IF;

  IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id THEN
    RAISE EXCEPTION 'cliente_cannot_change_empresa';
  END IF;

  IF NEW.tecnico_id          IS DISTINCT FROM OLD.tecnico_id
  OR NEW.assigned_by         IS DISTINCT FROM OLD.assigned_by
  OR NEW.assigned_group_id   IS DISTINCT FROM OLD.assigned_group_id
  OR NEW.assigned_at         IS DISTINCT FROM OLD.assigned_at
  OR NEW.fila_id             IS DISTINCT FROM OLD.fila_id
  OR NEW.categoria_id        IS DISTINCT FROM OLD.categoria_id
  OR NEW.operadora_id        IS DISTINCT FROM OLD.operadora_id
  OR NEW.prioridade          IS DISTINCT FROM OLD.prioridade
  OR NEW.nivel_escalonamento IS DISTINCT FROM OLD.nivel_escalonamento
  OR NEW.status              IS DISTINCT FROM OLD.status
  OR NEW.tipo_chamado        IS DISTINCT FROM OLD.tipo_chamado
  OR NEW.sla_policy_id       IS DISTINCT FROM OLD.sla_policy_id
  OR NEW.sla_atendimento_minutos IS DISTINCT FROM OLD.sla_atendimento_minutos
  OR NEW.sla_solucao_minutos     IS DISTINCT FROM OLD.sla_solucao_minutos
  OR NEW.first_response_due_at   IS DISTINCT FROM OLD.first_response_due_at
  OR NEW.resolution_due_at       IS DISTINCT FROM OLD.resolution_due_at
  OR NEW.first_response_sla_status IS DISTINCT FROM OLD.first_response_sla_status
  OR NEW.resolution_sla_status     IS DISTINCT FROM OLD.resolution_sla_status
  THEN
    RAISE EXCEPTION 'cliente_cannot_modify_internal_fields';
  END IF;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_cliente_encerrar_ticket(INTEGER) TO authenticated;

-- =========================================================
-- 3) Trigger: impede CLIENTE de alterar tokens Zabbix em usuarios
-- =========================================================
CREATE OR REPLACE FUNCTION public.fn_block_cliente_sensitive_user_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perm TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  SELECT permissao INTO v_perm
  FROM public.usuarios
  WHERE auth_user_id = auth.uid() AND ativo = true
  LIMIT 1;

  IF v_perm IS DISTINCT FROM 'CLIENTE' THEN RETURN NEW; END IF;

  -- CLIENTE não pode alterar tokens Zabbix nem assinatura de e-mail nem permissao/empresa/access_scope
  IF NEW.zabbix_token_z1     IS DISTINCT FROM OLD.zabbix_token_z1
  OR NEW.zabbix_token_z2     IS DISTINCT FROM OLD.zabbix_token_z2
  OR NEW.assinatura_email_url IS DISTINCT FROM OLD.assinatura_email_url
  OR NEW.permissao           IS DISTINCT FROM OLD.permissao
  OR NEW.empresa_id          IS DISTINCT FROM OLD.empresa_id
  OR NEW.access_scope        IS DISTINCT FROM OLD.access_scope
  OR NEW.ativo               IS DISTINCT FROM OLD.ativo
  THEN
    RAISE EXCEPTION 'cliente_cannot_modify_sensitive_fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_cliente_sensitive_user_updates ON public.usuarios;
CREATE TRIGGER trg_block_cliente_sensitive_user_updates
BEFORE UPDATE ON public.usuarios
FOR EACH ROW EXECUTE FUNCTION public.fn_block_cliente_sensitive_user_updates();

-- =========================================================
-- 4) Storage: restringir bucket email-signatures a equipe interna
-- =========================================================
DROP POLICY IF EXISTS "Anyone can delete email signatures" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update email signatures" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload email signatures" ON storage.objects;
DROP POLICY IF EXISTS "Public read email signatures" ON storage.objects;

CREATE POLICY "email_signatures_internal_select"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'email-signatures'
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND u.ativo = true
      AND u.permissao IN ('SUPERADMIN','ADMIN','USER','VIEWER')
  )
);

CREATE POLICY "email_signatures_internal_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'email-signatures'
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND u.ativo = true
      AND u.permissao IN ('SUPERADMIN','ADMIN','USER')
  )
);

CREATE POLICY "email_signatures_internal_update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'email-signatures'
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND u.ativo = true
      AND u.permissao IN ('SUPERADMIN','ADMIN','USER')
  )
);

CREATE POLICY "email_signatures_internal_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'email-signatures'
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND u.ativo = true
      AND u.permissao IN ('SUPERADMIN','ADMIN','USER')
  )
);
