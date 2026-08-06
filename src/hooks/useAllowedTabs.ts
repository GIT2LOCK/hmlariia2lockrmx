import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";

export type TabKey =
  | "dashboard" | "chamados" | "atendimento" | "usuarios" | "empresas"
  | "unidades" | "operadoras" | "grafana" | "permissoes" | "base_conhecimento"
  | "relatorios" | "equipes" | "zabbix" | "pessoas" | "responsaveis" | "linkai";

const ALL_TABS: TabKey[] = [
  "dashboard","chamados","atendimento","usuarios","empresas","unidades",
  "operadoras","grafana","permissoes","base_conhecimento","relatorios",
  "equipes","zabbix","pessoas","responsaveis","linkai",
];

/** Hook que retorna as abas que o usuário atual pode acessar.
 *  SUPERADMIN/ADMIN sempre veem tudo.
 *  CLIENTE/USER/VIEWER respeitam user_tab_permissions; sem registros usa default por cargo. */
export function useAllowedTabs() {
  const { user, isAuthenticated } = useUser();
  const [tabs, setTabs] = useState<TabKey[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!isAuthenticated || !user?.id) { setTabs([]); setLoading(false); return; }
      // Bypass para SUPERADMIN/ADMIN
      if (user.cargo === "SUPERADMIN" || user.cargo === "ADMIN") {
        if (!cancelled) { setTabs(ALL_TABS); setLoading(false); }
        return;
      }
      setLoading(true);
      const { data, error } = await supabase.rpc("fn_user_allowed_tabs", { _usuario_id: user.id });
      if (cancelled) return;
      if (error) {
        console.error("[useAllowedTabs] error", error);
        setTabs([]);
      } else {
        setTabs((data as TabKey[]) || []);
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [isAuthenticated, user?.id, user?.cargo]);

  const allows = (tab: TabKey | undefined) => {
    if (!tab) return true;
    if (user?.cargo === "SUPERADMIN" || user?.cargo === "ADMIN") return true;
    return (tabs || []).includes(tab);
  };

  return { tabs: tabs || [], allows, loading, allTabs: ALL_TABS };
}
