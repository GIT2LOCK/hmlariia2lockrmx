
ALTER TABLE public.support_group_members
  ADD CONSTRAINT support_group_members_usuario_id_fkey
  FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;

ALTER TABLE public.support_group_members
  ADD CONSTRAINT support_group_members_group_id_fkey
  FOREIGN KEY (group_id) REFERENCES public.support_groups(id) ON DELETE CASCADE;

NOTIFY pgrst, 'reload schema';
