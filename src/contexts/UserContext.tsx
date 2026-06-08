import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { getStoredUser, syncUserFromDatabase, AuthUser } from "@/services/authService";
import { can as permCan, Permission, Role } from "@/lib/permissions";

export type UserRole = Role;

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

interface UserContextType {
  user: User;
  isLoading: boolean;
  isAuthenticated: boolean;
  refreshUser: () => Promise<void>;
  syncFromDatabase: () => Promise<void>;
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

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(defaultUser);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const updateAvatar = (newAvatarUrl: string) => {
    setUser(prev => ({ ...prev, avatar: newAvatarUrl }));
  };

  const loadUser = async () => {
    const storedUser = getStoredUser();
    if (storedUser) {
      const { nome, sobrenome } = splitName(storedUser.nome);
      const role = (storedUser.permissao as UserRole) || "VIEWER";
      let avatarUrl = "";
      let empresaId: number | null = null;
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await supabase
          .from("usuarios")
          .select("avatar_url, empresa_id")
          .eq("id", storedUser.id)
          .single();
        avatarUrl = (data as any)?.avatar_url || "";
        empresaId = (data as any)?.empresa_id ?? null;
      } catch {}
      setUser({
        id: storedUser.id, nome, sobrenome,
        email: storedUser.email || "", cargo: role, role, avatar: avatarUrl,
        empresa_id: empresaId,
      });
      setIsAuthenticated(true);
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
              const stored = getStoredUser();
              if (stored) {
                localStorage.setItem("auth_user", JSON.stringify({
                  ...stored,
                  nome: newData.nome || stored.nome,
                  email: newData.email || stored.email,
                  permissao: newRole,
                }));
              }
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
  }, [isAuthenticated, user.id]);

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

  return (
    <UserContext.Provider value={{
      user, isLoading, isAuthenticated, refreshUser, syncFromDatabase,
      updateAvatar, canEdit, canManageUsers, canManageAdmins, hasFullAccess,
      isViewer, isTvView, isCliente, isAdmin, can,
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
      refreshUser: async () => {}, syncFromDatabase: async () => {}, updateAvatar: () => {},
      canEdit: false, canManageUsers: false, canManageAdmins: false, hasFullAccess: false,
      isViewer: true, isTvView: false, isCliente: false, isAdmin: false,
      can: () => false,
    };
  }
  return context;
}
