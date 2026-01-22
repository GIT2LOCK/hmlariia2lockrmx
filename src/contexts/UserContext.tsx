import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { getStoredUser, AuthUser } from "@/services/authService";

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
  canEdit: boolean;
  canManageUsers: boolean;
  canManageAdmins: boolean;
  hasFullAccess: boolean;
}

// Helper to get role description/cargo based on role
const getRoleCargo = (role: UserRole): string => {
  const cargos: Record<UserRole, string> = {
    SUPERADMIN: "Superadministrador",
    ADMIN: "Administrador",
    USER: "Usuário",
    VIEWER: "Visualizador",
  };
  return cargos[role] || "Usuário";
};

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

  const loadUser = () => {
    const storedUser = getStoredUser();
    
    if (storedUser) {
      const { nome, sobrenome } = splitName(storedUser.nome);
      const role = (storedUser.permissao as UserRole) || "VIEWER";
      
      setUser({
        id: storedUser.id,
        nome,
        sobrenome,
        email: storedUser.email || "",
        cargo: storedUser.permissao_descricao || getRoleCargo(role),
        role,
        avatar: "", // Could be loaded from a profile table later
      });
      setIsAuthenticated(true);
    } else {
      setUser(defaultUser);
      setIsAuthenticated(false);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadUser();
    
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
  const canEdit = user.role === "SUPERADMIN" || user.role === "ADMIN" || user.role === "USER";
  const canManageUsers = user.role === "SUPERADMIN" || user.role === "ADMIN";
  const canManageAdmins = user.role === "SUPERADMIN";
  const hasFullAccess = user.role === "SUPERADMIN";

  return (
    <UserContext.Provider value={{ 
      user, 
      isLoading,
      isAuthenticated,
      refreshUser,
      canEdit, 
      canManageUsers, 
      canManageAdmins, 
      hasFullAccess 
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
