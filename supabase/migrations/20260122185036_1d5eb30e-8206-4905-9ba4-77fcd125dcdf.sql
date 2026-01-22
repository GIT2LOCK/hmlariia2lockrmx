-- Standardize permission names to match code expectations
UPDATE public.tb_permissao SET nome = 'SUPERADMIN', descricao = 'Controle total e irrestrito do sistema' WHERE permissao_id = 1;
UPDATE public.tb_permissao SET nome = 'ADMIN', descricao = 'Gestão administrativa (exceto sobre Superadmins)' WHERE permissao_id = 2;
UPDATE public.tb_permissao SET nome = 'USER', descricao = 'Operacional focado em demandas próprias' WHERE permissao_id = 3;
UPDATE public.tb_permissao SET nome = 'VIEWER', descricao = 'Somente visualização' WHERE permissao_id = 4;