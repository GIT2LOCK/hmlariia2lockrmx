
-- 1) usuarios.empresa_id (CLIENTE vinculado a empresa)
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES public.empresas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_usuarios_empresa_id ON public.usuarios(empresa_id);

-- 2) ticket_comments.interno (comentários internos ocultos para CLIENTE)
ALTER TABLE public.ticket_comments
  ADD COLUMN IF NOT EXISTS interno BOOLEAN NOT NULL DEFAULT false;

-- 3) Helper: dados do usuário atual
CREATE OR REPLACE FUNCTION public.fn_current_usuario()
RETURNS TABLE(id integer, permissao text, empresa_id integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.permissao, u.empresa_id
  FROM public.usuarios u
  WHERE u.auth_user_id = auth.uid() AND u.ativo = true
  LIMIT 1;
$$;

-- 4) Helper: visibilidade de ticket (matriz central no BD)
CREATE OR REPLACE FUNCTION public.fn_can_view_ticket(_ticket_id integer)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid int; v_perm text; v_emp int;
  v_t record;
BEGIN
  SELECT id, permissao, empresa_id INTO v_uid, v_perm, v_emp FROM public.fn_current_usuario();
  IF v_uid IS NULL THEN RETURN false; END IF;
  IF v_perm IN ('SUPERADMIN','ADMIN') THEN RETURN true; END IF;

  SELECT empresa_id, tecnico_id, criado_por, assigned_by, assigned_group_id
    INTO v_t FROM public.tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_perm = 'CLIENTE' THEN
    RETURN v_emp IS NOT NULL AND v_t.empresa_id = v_emp;
  END IF;

  -- USER (técnico/supervisor): próprio ou grupo
  RETURN v_t.tecnico_id = v_uid
      OR v_t.criado_por = v_uid
      OR v_t.assigned_by = v_uid
      OR EXISTS (
        SELECT 1 FROM public.support_group_members m
        WHERE m.usuario_id = v_uid AND m.ativo = true AND m.group_id = v_t.assigned_group_id
      );
END;
$$;

-- 5) Atualiza fn_dashboard_ticket_ids para incluir CLIENTE
CREATE OR REPLACE FUNCTION public.fn_dashboard_ticket_ids()
RETURNS TABLE(ticket_id integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid int; v_perm text; v_emp int;
BEGIN
  SELECT id, permissao, empresa_id INTO v_uid, v_perm, v_emp FROM public.fn_current_usuario();
  IF v_uid IS NULL THEN RETURN; END IF;

  IF v_perm IN ('SUPERADMIN','ADMIN') THEN
    RETURN QUERY SELECT t.id FROM public.tickets t;
  ELSIF v_perm = 'CLIENTE' THEN
    RETURN QUERY SELECT t.id FROM public.tickets t WHERE t.empresa_id = v_emp;
  ELSE
    RETURN QUERY
      SELECT DISTINCT t.id FROM public.tickets t
      WHERE t.tecnico_id = v_uid
         OR t.criado_por = v_uid
         OR t.assigned_by = v_uid
         OR t.assigned_group_id IN (
              SELECT m.group_id FROM public.support_group_members m
              WHERE m.usuario_id = v_uid AND m.ativo = true
         );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_current_usuario() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_can_view_ticket(integer) TO authenticated;
