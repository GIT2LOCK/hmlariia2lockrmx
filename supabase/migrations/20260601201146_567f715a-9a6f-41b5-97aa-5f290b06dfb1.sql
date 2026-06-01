
-- Align grafana_* tables with the project's session-based auth model (anon key is used by UI)
-- Keep service_role full access; expose read/write via anon and authenticated to match other tables.

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'grafana_organizations',
    'grafana_access_groups',
    'grafana_access_group_members',
    'grafana_group_org_permissions',
    'grafana_user_links',
    'grafana_user_org_permissions',
    'grafana_sync_logs'
  ]) LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated;', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role;', t);

    EXECUTE format('DROP POLICY IF EXISTS "Anon full access" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated full access" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Service full access" ON public.%I;', t);

    EXECUTE format('CREATE POLICY "Anon full access" ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true);', t);
    EXECUTE format('CREATE POLICY "Authenticated full access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);', t);
    EXECUTE format('CREATE POLICY "Service full access" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);', t);
  END LOOP;
END $$;
