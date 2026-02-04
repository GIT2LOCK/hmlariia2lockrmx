import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { getStoredUser, syncUserFromDatabase, AuthUser } from "@/services/authService";
import { supabase } from "@/integrations/supabase/client";

export type UserRole = "SUPERADMIN" | "ADMIN" | "USER" | "VIEWER";

interface User {
  id: number;
  nome: string;
  sobrenome: string;
  email: string;
  cargo: string;
  role: UserRole;
  avatar: string;
}

interface UserContextType {
  user: User;
  isLoading: boolean;
  isAuthenticated: boolean;
  refreshUser: () => void;
  syncFromDatabase: () => Promise<void>;
  updateAvatar: (newAvatarUrl: string) => void;
  canEdit: boolean;
  canManageUsers: boolean;
  canManageAdmins: boolean;
  hasFullAccess: boolean;
  isViewer: boolean;
}

// Helper to split full name into nome/sobrenome
const splitName = (fullName: string): { nome: string; sobrenome: string } => {
  const parts = fullName.trim().split(" ");
  if (parts.length === 1) {
    return { nome: parts[0], sobrenome: "" };
  }
  return {
    nome: parts[0],
    sobrenome: parts.slice(1).join(" "),
  };
};

// Default user when not authenticated
const defaultUser: User = {
  id: 0,
  nome: "Visitante",
  sobrenome: "",
  email: "",
  cargo: "Não autenticado",
  role: "VIEWER",
  avatar: "",
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(defaultUser);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Function to update avatar in state
  const updateAvatar = (newAvatarUrl: string) => {
    setUser(prev => ({ ...prev, avatar: newAvatarUrl }));
  };

  const loadUser = async () => {
    const storedUser = getStoredUser();
    
    if (storedUser) {
      const { nome, sobrenome } = splitName(storedUser.nome);
      const role = (storedUser.permissao as UserRole) || "VIEWER";
      
      // Load avatar from database
      let avatarUrl = "";
      try {
        const { data } = await supabase
          .from("tb_usuario")
          .select("avatar_url")
          .eq("user_id", storedUser.id)
          .maybeSingle();
        
        if (data?.avatar_url) {
          avatarUrl = data.avatar_url;
        }
      } catch (err) {
        console.error("Erro ao carregar avatar:", err);
      }
      
      setUser({
        id: storedUser.id,
        nome,
        sobrenome,
        email: storedUser.email || "",
        cargo: role,
        role,
        avatar: avatarUrl,
      });
      setIsAuthenticated(true);
    } else {
      setUser(defaultUser);
      setIsAuthenticated(false);
    }
    setIsLoading(false);
  };

  // Sync user data from database (for real-time permission updates)
  const syncFromDatabase = async () => {
    const updatedUser = await syncUserFromDatabase();
    if (updatedUser) {
      const { nome, sobrenome } = splitName(updatedUser.nome);
      const role = (updatedUser.permissao as UserRole) || "VIEWER";
      
      // Load avatar from database
      let avatarUrl = user.avatar; // Keep current avatar
      try {
        const { data } = await supabase
          .from("tb_usuario")
          .select("avatar_url")
          .eq("user_id", updatedUser.id)
          .maybeSingle();
        
        if (data?.avatar_url) {
          avatarUrl = data.avatar_url;
        }
      } catch (err) {
        console.error("Erro ao carregar avatar:", err);
      }
      
      setUser({
        id: updatedUser.id,
        nome,
        sobrenome,
        email: updatedUser.email || "",
        cargo: role,
        role,
        avatar: avatarUrl,
      });
    }
  };

  useEffect(() => {
    loadUser();
    
    // Sync from database on initial load if authenticated
    const storedUser = getStoredUser();
    if (storedUser) {
      syncFromDatabase();
    }
    
    // Listen for storage changes (e.g., login/logout in another tab)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "auth_user") {
        loadUser();
      }
    };
    
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const refreshUser = () => {
    loadUser();
  };

  // Permissões baseadas no perfil real
  // VIEWER não tem NENHUMA permissão de edição/adição
  const canEdit = user.role === "SUPERADMIN" || user.role === "ADMIN" || user.role === "USER";
  const canManageUsers = user.role === "SUPERADMIN" || user.role === "ADMIN";
  const canManageAdmins = user.role === "SUPERADMIN";
  const hasFullAccess = user.role === "SUPERADMIN";
  const isViewer = user.role === "VIEWER";

  return (
    <UserContext.Provider value={{ 
      user, 
      isLoading,
      isAuthenticated,
      refreshUser,
      syncFromDatabase,
      updateAvatar,
      canEdit, 
      canManageUsers, 
      canManageAdmins, 
      hasFullAccess,
      isViewer
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextType {
  const context = useContext(UserContext);
  if (!context) {
    // Return a safe default during initial render to prevent crashes
    console.warn("useUser called outside of UserProvider, returning default context");
    return {
      user: defaultUser,
      isLoading: true,
      isAuthenticated: false,
      refreshUser: () => {},
      syncFromDatabase: async () => {},
      updateAvatar: () => {},
      canEdit: false,
      canManageUsers: false,
      canManageAdmins: false,
      hasFullAccess: false,
      isViewer: true,
    };
  }
  return context;
}
