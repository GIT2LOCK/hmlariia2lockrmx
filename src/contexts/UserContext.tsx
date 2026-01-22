import { createContext, useContext, useState, ReactNode } from "react";

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
  setRole: (role: UserRole) => void;
  canEdit: boolean;
  canManageUsers: boolean;
  canManageAdmins: boolean;
  hasFullAccess: boolean;
}

const mockUsers: Record<UserRole, User> = {
  SUPERADMIN: {
    id: 1,
    nome: "Super",
    sobrenome: "Admin",
    email: "superadmin@escritorio.com",
    cargo: "Superadministrador",
    role: "SUPERADMIN",
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face",
  },
  ADMIN: {
    id: 2,
    nome: "João",
    sobrenome: "Silva",
    email: "admin@escritorio.com",
    cargo: "Administrador",
    role: "ADMIN",
    avatar: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&h=150&fit=crop&crop=face",
  },
  USER: {
    id: 3,
    nome: "Carlos",
    sobrenome: "Operador",
    email: "carlos@escritorio.com",
    cargo: "Assistente Contábil",
    role: "USER",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face",
  },
  VIEWER: {
    id: 4,
    nome: "Ana",
    sobrenome: "Auditora",
    email: "ana@escritorio.com",
    cargo: "Auditora",
    role: "VIEWER",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=face",
  },
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<UserRole>("SUPERADMIN");

  const setRole = (newRole: UserRole) => {
    setRoleState(newRole);
  };

  const user = mockUsers[role];

  // Permissões baseadas no perfil
  const canEdit = role === "SUPERADMIN" || role === "ADMIN" || role === "USER";
  const canManageUsers = role === "SUPERADMIN" || role === "ADMIN";
  const canManageAdmins = role === "SUPERADMIN";
  const hasFullAccess = role === "SUPERADMIN";

  return (
    <UserContext.Provider value={{ user, setRole, canEdit, canManageUsers, canManageAdmins, hasFullAccess }}>
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
