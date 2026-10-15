DO $$
DECLARE
  tbl text;
  operational_tables text[] := ARRAY[
    'chamados',
    'cobertura_unidade',
    'contato_unidades',
    'contatos',
    'dados_abertura_chamado',
    'domain_rules',
    'empresas',
    'grafana_access_group_members',
    'grafana_access_groups',
    'grafana_automation_rules',
    'grafana_group_org_permissions',
    'grafana_organizations',
    'grafana_sync_logs',
    'grafana_user_links',
    'grafana_user_org_permissions',
    'links_internet',
    'module_permissions',
    'operadoras',
    'support_group_members',
    'support_groups',
    'ticket_attachments',
    'ticket_categorias',
    'ticket_comments',
    'ticket_filas',
    'ticket_history',
    'ticket_notifications',
    'ticket_sla_alerts',
    'ticket_sla_business_hours',
    'ticket_sla_pauses',
    'ticket_sla_policies',
    'tickets',
    'unidades',
    'user_audit_log',
    'user_sync_status',
    'user_tab_permissions',
    'zabbix_contatos'
  ];
BEGIN
  FOREACH tbl IN ARRAY operational_tables LOOP
    IF to_regclass(format('public.%I', tbl)) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl);
    END IF;
  END LOOP;
END $$;

-- Segurança: manter tabelas sensíveis sem acesso anônimo, e não reabrir leitura ampla de usuários.
REVOKE ALL ON public.sessions FROM anon, authenticated;
REVOKE ALL ON public.password_reset_tokens FROM anon, authenticated;
REVOKE ALL ON public.usuarios FROM anon;
REVOKE ALL ON public.usuarios FROM authenticated;

-- Reaplicar somente os campos não sensíveis de usuários necessários para a aplicação autenticada.
GRANT SELECT (id, nome, email, permissao, ativo, criado_em, atualizado_em, avatar_url, telefone, assinatura_email, assinatura_email_url, auth_user_id, empresa_id, permissao_manual, access_scope)
ON public.usuarios TO authenticated;
GRANT UPDATE (nome, telefone, avatar_url, assinatura_email, assinatura_email_url, atualizado_em)
ON public.usuarios TO authenticated;
GRANT ALL ON public.usuarios TO service_role;