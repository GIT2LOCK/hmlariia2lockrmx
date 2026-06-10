ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_permissao_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_permissao_check
  CHECK (permissao::text = ANY (ARRAY['SUPERADMIN','ADMIN','USER','CLIENTE','VIEWER','TV_VIEW']::text[]));