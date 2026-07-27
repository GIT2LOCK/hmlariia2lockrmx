-- 1) Colunas sensíveis de usuarios: remover leitura direta
REVOKE SELECT ON public.usuarios FROM authenticated;
REVOKE SELECT ON public.usuarios FROM anon;
GRANT SELECT (
  id, nome, email, permissao, ativo, criado_em, atualizado_em,
  totp_enabled, avatar_url, telefone, assinatura_email, assinatura_email_url,
  auth_user_id, empresa_id, permissao_manual, access_scope
) ON public.usuarios TO authenticated;

-- 2) Funções para acesso controlado aos tokens Zabbix
CREATE OR REPLACE FUNCTION public.fn_my_zabbix_tokens()
RETURNS TABLE(usuario_id integer, zabbix_token_z1 text, zabbix_token_z2 text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.zabbix_token_z1, u.zabbix_token_z2
  FROM public.usuarios u
  WHERE u.auth_user_id = auth.uid() AND u.ativo = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.fn_admin_zabbix_tokens()
RETURNS TABLE(usuario_id integer, zabbix_token_z1 text, zabbix_token_z2 text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_ariia_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY SELECT u.id, u.zabbix_token_z1, u.zabbix_token_z2 FROM public.usuarios u;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_my_zabbix_tokens() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_admin_zabbix_tokens() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_my_zabbix_tokens() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_admin_zabbix_tokens() TO authenticated, service_role;

-- 3) Remover EXECUTE anônimo/público de todas as funções do schema public
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname <> 'custom_access_token_hook'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;

-- 4) Funções administrativas: apenas servidor
REVOKE ALL ON FUNCTION public.apply_domain_rule(integer) FROM authenticated;
REVOKE ALL ON FUNCTION public.fn_delete_usuario_cascade(integer) FROM authenticated;
REVOKE ALL ON FUNCTION public.grafana_effective_permissions(integer) FROM authenticated;
REVOKE ALL ON FUNCTION public.grafana_set_user_org_role(integer, integer, text) FROM authenticated;

-- 5) Guard reforçado na exclusão de usuário
CREATE OR REPLACE FUNCTION public.fn_delete_usuario_cascade_guard()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_perm text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  SELECT permissao INTO v_perm FROM public.usuarios WHERE auth_user_id = auth.uid() AND ativo = true LIMIT 1;
  IF v_perm IS DISTINCT FROM 'SUPERADMIN' THEN RAISE EXCEPTION 'forbidden'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_delete_usuario_cascade_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_delete_usuario_cascade_guard() TO service_role;

-- 6) Storage: remover acesso anônimo aos anexos de chamados
DROP POLICY IF EXISTS "Anon read ticket attachments" ON storage.objects;
DROP POLICY IF EXISTS "Anon upload ticket attachments" ON storage.objects;
DROP POLICY IF EXISTS "Anon update ticket attachments" ON storage.objects;
DROP POLICY IF EXISTS "Anon delete ticket attachments" ON storage.objects;

-- 7) Storage: escrita de avatares exige login (leitura continua pública)
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Auth upload avatars" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars');
CREATE POLICY "Auth update avatars" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars');
CREATE POLICY "Auth delete avatars" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars');
