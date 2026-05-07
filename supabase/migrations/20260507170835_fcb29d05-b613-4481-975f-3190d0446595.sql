UPDATE public.tickets t
SET solicitante_nome = COALESCE(t.solicitante_nome, u.nome),
    solicitante_telefone = COALESCE(t.solicitante_telefone, u.telefone)
FROM public.usuarios u
WHERE lower(t.solicitante_email) = lower(u.email)
  AND (t.solicitante_nome IS NULL OR t.solicitante_telefone IS NULL);

UPDATE public.tickets t
SET solicitante_nome = COALESCE(t.solicitante_nome, c.nome),
    solicitante_telefone = COALESCE(t.solicitante_telefone, c.telefone),
    empresa_id = COALESCE(t.empresa_id, c.empresa_id),
    unidade_id = COALESCE(t.unidade_id, c.unidade_id)
FROM public.contatos c
WHERE lower(t.solicitante_email) = lower(c.email)
  AND (t.solicitante_nome IS NULL OR t.solicitante_telefone IS NULL OR t.empresa_id IS NULL OR t.unidade_id IS NULL);