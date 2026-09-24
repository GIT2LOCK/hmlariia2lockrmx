REVOKE EXECUTE ON FUNCTION public.fn_elev_is_staff(), public.fn_elev_is_admin(), public.fn_elev_before_update() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_elev_before_update() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_elev_is_staff(), public.fn_elev_is_admin() TO authenticated;