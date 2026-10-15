-- Seed das categorias voltadas ao Cliente (idempotente por nome no nível raiz)
INSERT INTO public.ticket_categorias (nome, parent_id, ativo)
SELECT v.nome, NULL, true
FROM (VALUES
  ('Internet / Rede'),
  ('Wi-Fi'),
  ('Câmeras'),
  ('Computador / Notebook'),
  ('Sistema / Aplicação'),
  ('Impressora'),
  ('Telefonia'),
  ('Acesso / Login'),
  ('Equipamento sem funcionar'),
  ('Lentidão'),
  ('Outro')
) AS v(nome)
WHERE NOT EXISTS (
  SELECT 1 FROM public.ticket_categorias c
  WHERE c.parent_id IS NULL AND lower(c.nome) = lower(v.nome)
);

-- Guarda de segurança: CLIENTE só pode abrir chamado da própria empresa
CREATE OR REPLACE FUNCTION public.fn_ticket_cliente_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid INT;
  v_perm TEXT;
  v_emp  INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, permissao, empresa_id
    INTO v_uid, v_perm, v_emp
  FROM public.usuarios
  WHERE auth_user_id = auth.uid() AND ativo = true
  LIMIT 1;

  IF v_perm IS DISTINCT FROM 'CLIENTE' THEN
    RETURN NEW;
  END IF;

  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'cliente_sem_empresa_vinculada';
  END IF;

  -- Força empresa do criador
  NEW.empresa_id := v_emp;

  -- Unidade (se informada) precisa pertencer à empresa do criador
  IF NEW.unidade_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.unidades u
      WHERE u.id = NEW.unidade_id AND u.empresa_id = v_emp
    ) THEN
      RAISE EXCEPTION 'unidade_nao_pertence_a_empresa_do_cliente';
    END IF;
  END IF;

  -- Campos que o Cliente nunca define
  NEW.status            := 'NOVO';
  NEW.tipo_chamado      := 'T';
  NEW.tecnico_id        := NULL;
  NEW.assigned_by       := NULL;
  NEW.assigned_group_id := NULL;
  NEW.assigned_at       := NULL;
  NEW.fila_id           := NULL;
  NEW.criado_por        := v_uid;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ticket_cliente_guard ON public.tickets;
CREATE TRIGGER trg_ticket_cliente_guard
BEFORE INSERT ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.fn_ticket_cliente_guard();