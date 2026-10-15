-- Drop existing check constraint and recreate with TV_VIEW
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_permissao_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_permissao_check 
  CHECK (permissao IN ('SUPERADMIN', 'ADMIN', 'USER', 'VIEWER', 'TV_VIEW'));

-- Insert TV View user
INSERT INTO public.usuarios (nome, email, senha_hash, permissao, ativo, totp_enabled)
VALUES (
  'Ariia Panel',
  'ariiapanel@2lock.com.br',
  'bc260e68cb5710c689a8045590a91e22:9f77170f5ad0341c5cfa85b88a3d91d4447f784d0e3a25a653a8347667bc7480',
  'TV_VIEW',
  true,
  false
)
ON CONFLICT DO NOTHING;