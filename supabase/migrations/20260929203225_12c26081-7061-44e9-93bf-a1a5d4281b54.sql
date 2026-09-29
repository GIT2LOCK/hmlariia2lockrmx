CREATE OR REPLACE FUNCTION public.fn_elev_is_admin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_user_id=auth.uid() AND u.ativo=true
    AND u.access_scope NOT IN ('BLOCKED','GRAFANA_ONLY')
    AND (u.permissao IN ('SUPERADMIN','ADMIN')
         OR lower(split_part(u.email,'@',2)) = 'wctech.com.br'));
$function$;