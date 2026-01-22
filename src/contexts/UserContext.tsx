import { createContext, useContext, useState, ReactNode } from "react";

export type UserRole = "USER" | "MANAGER" | "ADMIN";

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
}

const mockUsers: Record<UserRole, User> = {
  USER: {
    id: 1,
    nome: "Carlos",
    sobrenome: "Operador",
    email: "carlos@escritorio.com",
    cargo: "Assistente Contábil",
    role: "USER",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face",
  },
  MANAGER: {
    id: 2,
    nome: "Maria",
    sobrenome: "Gestora",
    email: "maria@escritorio.com",
    cargo: "Supervisora",
    role: "MANAGER",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=face",
  },
  ADMIN: {
    id: 3,
    nome: "Rebo",
    sobrenome: "Lador",
    email: "admin@escritorio.com",
    cargo: "Administrador",
    role: "ADMIN",
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face",
  },
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<UserRole>("ADMIN");

  const setRole = (newRole: UserRole) => {
    setRoleState(newRole);
  };

  const user = mockUsers[role];

  return (
    <UserContext.Provider value={{ user, setRole }}>
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
