
DROP POLICY IF EXISTS "admins manage automation rules" ON public.grafana_automation_rules;

CREATE POLICY "Authenticated full access automation rules"
  ON public.grafana_automation_rules
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Anon full access automation rules"
  ON public.grafana_automation_rules
  FOR ALL TO anon
  USING (true) WITH CHECK (true);
