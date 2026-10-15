-- 1. Tornar senha_hash opcional (passa a ser gerenciada pelo Supabase Auth)
ALTER TABLE public.usuarios ALTER COLUMN senha_hash DROP NOT NULL;

-- 2. Índice único para auth_user_id (vínculo 1:1 com auth.users)
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_auth_user_id_key
  ON public.usuarios(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- 3. Custom Access Token Hook — injeta claims do Ariia no JWT do Supabase Auth
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u_id integer;
  u_permissao text;
  u_ativo boolean;
  claims jsonb;
  grafana_role text;
BEGIN
  claims := COALESCE(event->'claims', '{}'::jsonb);

  SELECT id, permissao, ativo
    INTO u_id, u_permissao, u_ativo
  FROM public.usuarios
  WHERE auth_user_id = (event->>'user_id')::uuid
  LIMIT 1;

  IF u_id IS NOT NULL AND COALESCE(u_ativo, false) = true THEN
    grafana_role := CASE u_permissao
      WHEN 'SUPERADMIN' THEN 'GrafanaAdmin'
      WHEN 'ADMIN' THEN 'Admin'
      WHEN 'USER' THEN 'Editor'
      ELSE 'Viewer'
    END;

    claims := claims
      || jsonb_build_object('ariia_usuario_id', u_id)
      || jsonb_build_object('ariia_permissao', u_permissao)
      || jsonb_build_object('grafana_role', grafana_role);

    event := jsonb_set(event, '{claims}', claims);
  END IF;

  RETURN event;
END;
$$;

-- Permissões do hook (apenas o serviço de auth executa)
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;

-- Permitir que o hook leia a tabela usuarios
GRANT SELECT ON public.usuarios TO supabase_auth_admin;