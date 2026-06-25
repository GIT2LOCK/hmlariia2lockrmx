import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { getStoredUser, syncUserFromDatabase, AuthUser } from "@/services/authService";
import { can as permCan, Permission, Role } from "@/lib/permissions";

export type UserRole = Role;

export type AccessScope = "ARIIA_ONLY" | "GRAFANA_ONLY" | "ARIIA_AND_GRAFANA" | "BLOCKED";

export interface ModulePerm {
  view: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
  manage: boolean;
}

export type ModuleAction = keyof ModulePerm;

interface User {
  id: number;
  nome: string;
  sobrenome: string;
  email: string;
  cargo: string;
  role: UserRole;
  avatar: string;
  empresa_id: number | null;
}

interface SyncStatus {
  last_at: string | null;
  status: string | null;
  error: string | null;
}

interface GrafanaPerms {
  is_grafana_admin: boolean;
  orgs: Array<{ org_id: number; grafana_org_id: number; name: string; role: string }>;
}

interface UserContextType {
  user: User;
  isLoading: boolean;
  isAuthenticated: boolean;
  refreshUser: () => Promise<void>;
  syncFromDatabase: () => Promise<void>;
  refreshContext: () => Promise<void>;
  updateAvatar: (newAvatarUrl: string) => void;
  canEdit: boolean;
  canManageUsers: boolean;
  canManageAdmins: boolean;
  hasFullAccess: boolean;
  isViewer: boolean;
  isTvView: boolean;
  isCliente: boolean;
  isAdmin: boolean;
  can: (p: Permission) => boolean;
  // Phase 4 additions
  accessScope: AccessScope;
  modulePerms: Record<string, ModulePerm>;
  grafanaPerms: GrafanaPerms;
  grafanaGroups: Array<{ id: number; name: string }>;
  syncStatus: SyncStatus | null;
  canAccessAriia: boolean;
  canAccessGrafana: boolean;
  isBlocked: boolean;
  isGrafanaOnly: boolean;
  canModule: (key: string, action?: ModuleAction) => boolean;
  grafanaKioskUrl: string;
}

const splitName = (fullName: string): { nome: string; sobrenome: string } => {
  const parts = fullName.trim().split(" ");
  if (parts.length === 1) return { nome: parts[0], sobrenome: "" };
  return { nome: parts[0], sobrenome: parts.slice(1).join(" ") };
};

const defaultUser: User = {
  id: 0, nome: "Visitante", sobrenome: "", email: "",
  cargo: "Não autenticado", role: "VIEWER", avatar: "", empresa_id: null,
};

const GRAFANA_KIOSK_URL =
  "https://painel.2lock.app.br/d/ad8nmt9/2lock-home?orgId=1&from=now-6h&to=now&kiosk";

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(defaultUser);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessScope, setAccessScope] = useState<AccessScope>("ARIIA_AND_GRAFANA");
  const [modulePerms, setModulePerms] = useState<Record<string, ModulePerm>>({});
  const [grafanaPerms, setGrafanaPerms] = useState<GrafanaPerms>({ is_grafana_admin: false, orgs: [] });
  const [grafanaGroups, setGrafanaGroups] = useState<Array<{ id: number; name: string }>>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  const updateAvatar = (newAvatarUrl: string) => {
    setUser(prev => ({ ...prev, avatar: newAvatarUrl }));
  };

  const refreshContext = useCallback(async () => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await supabase.rpc("fn_user_context");
      if (error || !data) return;
      const ctx: any = data;
      if (!ctx?.authenticated) return;
      if (ctx.user) {
        setAccessScope((ctx.user.access_scope as AccessScope) || "ARIIA_AND_GRAFANA");
      }
      setModulePerms((ctx.module_permissions as Record<string, ModulePerm>) || {});
      setGrafanaPerms((ctx.grafana_permissions as GrafanaPerms) || { is_grafana_admin: false, orgs: [] });
      setGrafanaGroups(ctx.grafana_groups || []);
      setSyncStatus(ctx.sync_status || null);
    } catch (e) {
      console.error("[UserContext] refreshContext error", e);
    }
  }, []);

  const loadUser = async () => {
    const storedUser = getStoredUser();
    if (storedUser) {
      const { nome, sobrenome } = splitName(storedUser.nome);
      const role = (storedUser.permissao as UserRole) || "VIEWER";
      let avatarUrl = "";
      let empresaId: number | null = null;
      try {
        const { supabase } = await import("@/integrations/supabase/client");

        // Detecta sessão Supabase residual de OUTRO usuário. Se houver
        // divergência, derruba a sessão para evitar que o PostgREST execute
        // RLS como o usuário errado (causa de "violates row-level security
        // policy" ao abrir chamados logo após cadastro/login).
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const sessionEmail = (session?.user?.email || "").trim().toLowerCase();
          const storedEmail = (storedUser.email || "").trim().toLowerCase();
          if (session && storedEmail && sessionEmail && sessionEmail !== storedEmail) {
            console.warn("[UserContext] Supabase session mismatch — signing out leftover session", {
              sessionEmail, storedEmail,
            });
            await supabase.auth.signOut();
          }
        } catch (e) {
          console.warn("[UserContext] session check failed", e);
        }

        const { data } = await supabase
          .from("usuarios")
          .select("avatar_url, empresa_id, access_scope")
          .eq("id", storedUser.id)
          .single();
        avatarUrl = (data as any)?.avatar_url || "";
        empresaId = (data as any)?.empresa_id ?? null;
        if ((data as any)?.access_scope) setAccessScope((data as any).access_scope as AccessScope);
      } catch {}
      setUser({
        id: storedUser.id, nome, sobrenome,
        email: storedUser.email || "", cargo: role, role, avatar: avatarUrl,
        empresa_id: empresaId,
      });
      setIsAuthenticated(true);
      refreshContext();
    } else {
      setUser(defaultUser);
      setIsAuthenticated(false);
    }
    setIsLoading(false);
  };

  const syncFromDatabase = async () => {
    const updatedUser = await syncUserFromDatabase();
    if (updatedUser) {
      const { nome, sobrenome } = splitName(updatedUser.nome);
      const role = (updatedUser.permissao as UserRole) || "VIEWER";
      setUser(prev => ({
        ...prev,
        id: updatedUser.id, nome, sobrenome,
        email: updatedUser.email || "", cargo: role, role,
      }));
    }
  };

  useEffect(() => {
    loadUser();
    const storedUser = getStoredUser();
    if (storedUser) syncFromDatabase();
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "auth_user") loadUser();
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || user.id === 0) return;

    const channel = (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const ch = supabase
        .channel(`user-role-${user.id}`)
        .on(
          "postgres_changes" as any,
          { event: "UPDATE", schema: "public", table: "usuarios", filter: `id=eq.${user.id}` },
          (payload: any) => {
            const newData = payload.new;
            if (newData) {
              const newRole = (newData.permissao as UserRole) || "VIEWER";
              const { nome, sobrenome } = splitName(newData.nome || "");
              setUser(prev => ({
                ...prev,
                nome,
                sobrenome,
                email: newData.email || prev.email,
                role: newRole,
                cargo: newRole,
                avatar: newData.avatar_url || prev.avatar,
                empresa_id: newData.empresa_id ?? prev.empresa_id,
              }));
              if (newData.access_scope) setAccessScope(newData.access_scope as AccessScope);
              const stored = getStoredUser();
              if (stored) {
                localStorage.setItem("auth_user", JSON.stringify({
                  ...stored,
                  nome: newData.nome || stored.nome,
                  email: newData.email || stored.email,
                  permissao: newRole,
                }));
              }
              // Recarregar permissões efetivas quando o usuário muda
              refreshContext();
            }
          }
        )
        .subscribe();
      return ch;
    })();

    return () => {
      channel.then(async (ch) => {
        const { supabase } = await import("@/integrations/supabase/client");
        supabase.removeChannel(ch);
      });
    };
  }, [isAuthenticated, user.id, refreshContext]);

  const refreshUser = () => loadUser();
  const isAdmin = user.role === "SUPERADMIN" || user.role === "ADMIN";
  const canEdit = isAdmin || user.role === "USER";
  const canManageUsers = isAdmin;
  const canManageAdmins = user.role === "SUPERADMIN";
  const hasFullAccess = user.role === "SUPERADMIN";
  const isViewer = user.role === "VIEWER";
  const isTvView = user.role === "TV_VIEW";
  const isCliente = user.role === "CLIENTE";
  const can = (p: Permission) =>
    permCan({ role: user.role, id: user.id, empresa_id: user.empresa_id }, p);

  const isBlocked = accessScope === "BLOCKED";
  const isGrafanaOnly = accessScope === "GRAFANA_ONLY";
  const canAccessAriia = accessScope === "ARIIA_ONLY" || accessScope === "ARIIA_AND_GRAFANA";
  const canAccessGrafana = accessScope === "GRAFANA_ONLY" || accessScope === "ARIIA_AND_GRAFANA";

  const canModule = (key: string, action: ModuleAction = "view") => {
    if (isBlocked) return false;
    if (isAdmin) return true; // SUPERADMIN/ADMIN sempre
    const p = modulePerms[key];
    if (!p) return false;
    return Boolean(p[action]);
  };

  return (
    <UserContext.Provider value={{
      user, isLoading, isAuthenticated, refreshUser, syncFromDatabase, refreshContext,
      updateAvatar, canEdit, canManageUsers, canManageAdmins, hasFullAccess,
      isViewer, isTvView, isCliente, isAdmin, can,
      accessScope, modulePerms, grafanaPerms, grafanaGroups, syncStatus,
      canAccessAriia, canAccessGrafana, isBlocked, isGrafanaOnly,
      canModule, grafanaKioskUrl: GRAFANA_KIOSK_URL,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextType {
  const context = useContext(UserContext);
  if (!context) {
    return {
      user: defaultUser, isLoading: true, isAuthenticated: false,
      refreshUser: async () => {}, syncFromDatabase: async () => {}, refreshContext: async () => {},
      updateAvatar: () => {},
      canEdit: false, canManageUsers: false, canManageAdmins: false, hasFullAccess: false,
      isViewer: true, isTvView: false, isCliente: false, isAdmin: false,
      can: () => false,
      accessScope: "ARIIA_AND_GRAFANA", modulePerms: {},
      grafanaPerms: { is_grafana_admin: false, orgs: [] }, grafanaGroups: [], syncStatus: null,
      canAccessAriia: true, canAccessGrafana: true, isBlocked: false, isGrafanaOnly: false,
      canModule: () => false, grafanaKioskUrl: GRAFANA_KIOSK_URL,
    };
  }
  return context;
}
