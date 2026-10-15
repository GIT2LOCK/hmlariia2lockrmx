
-- 1) Espelhar Equipes (support_groups) como Filas (ticket_filas) 1:1 usando o mesmo id
INSERT INTO public.ticket_filas (id, nome, ativo, criado_em, atualizado_em)
SELECT sg.id, sg.nome, sg.ativo, sg.criado_em, sg.atualizado_em
FROM public.support_groups sg
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ativo = EXCLUDED.ativo;

-- 2) Desativar filas antigas que não correspondem a nenhuma equipe
UPDATE public.ticket_filas
   SET ativo = false
 WHERE id NOT IN (SELECT id FROM public.support_groups);

-- 3) Alinhar tickets existentes: fila = equipe
UPDATE public.tickets
   SET fila_id = assigned_group_id
 WHERE assigned_group_id IS NOT NULL
   AND fila_id IS DISTINCT FROM assigned_group_id;

-- Se o ticket tinha só fila antiga (não é equipe), zera fila
UPDATE public.tickets
   SET fila_id = NULL
 WHERE assigned_group_id IS NULL
   AND fila_id IS NOT NULL
   AND fila_id NOT IN (SELECT id FROM public.support_groups);

-- 4) Avançar sequence de ticket_filas para não colidir com support_groups
SELECT setval(
  pg_get_serial_sequence('public.ticket_filas','id'),
  GREATEST(
    (SELECT COALESCE(MAX(id),1) FROM public.ticket_filas),
    (SELECT COALESCE(MAX(id),1) FROM public.support_groups)
  )
);

-- 5) Trigger: quando uma equipe é criada/atualizada, refletir na fila
CREATE OR REPLACE FUNCTION public.fn_sync_group_to_fila()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.ticket_filas SET ativo = false WHERE id = OLD.id;
    RETURN OLD;
  END IF;
  INSERT INTO public.ticket_filas (id, nome, ativo)
  VALUES (NEW.id, NEW.nome, NEW.ativo)
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ativo = EXCLUDED.ativo, atualizado_em = now();
  PERFORM setval(
    pg_get_serial_sequence('public.ticket_filas','id'),
    GREATEST((SELECT COALESCE(MAX(id),1) FROM public.ticket_filas), NEW.id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_group_to_fila ON public.support_groups;
CREATE TRIGGER trg_sync_group_to_fila
AFTER INSERT OR UPDATE OR DELETE ON public.support_groups
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_group_to_fila();

-- 6) Trigger em tickets: manter fila_id == assigned_group_id
CREATE OR REPLACE FUNCTION public.fn_sync_ticket_fila_equipe()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_group_id IS NOT NULL THEN
      NEW.fila_id := NEW.assigned_group_id;
    ELSIF NEW.fila_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM public.support_groups WHERE id = NEW.fila_id) THEN
      NEW.assigned_group_id := NEW.fila_id;
    ELSIF NEW.fila_id IS NOT NULL THEN
      -- fila antiga inválida -> ignora
      NEW.fila_id := NULL;
    END IF;
  ELSE
    IF NEW.assigned_group_id IS DISTINCT FROM OLD.assigned_group_id THEN
      NEW.fila_id := NEW.assigned_group_id;
    ELSIF NEW.fila_id IS DISTINCT FROM OLD.fila_id THEN
      IF NEW.fila_id IS NULL THEN
        NEW.assigned_group_id := NULL;
      ELSIF EXISTS (SELECT 1 FROM public.support_groups WHERE id = NEW.fila_id) THEN
        NEW.assigned_group_id := NEW.fila_id;
      ELSE
        NEW.fila_id := OLD.fila_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_ticket_fila_equipe ON public.tickets;
CREATE TRIGGER trg_sync_ticket_fila_equipe
BEFORE INSERT OR UPDATE OF fila_id, assigned_group_id ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_ticket_fila_equipe();
