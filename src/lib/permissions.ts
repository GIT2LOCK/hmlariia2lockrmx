// Matriz central de permissões do Ariia.
// Toda checagem de UI/rota deve passar por `can()`.
// Backend continua sendo a fonte de verdade via RLS / funções fn_can_view_ticket / fn_dashboard_ticket_ids.

export type Role =
  | "SUPERADMIN"
  | "ADMIN"
  | "USER"
  | "CLIENTE"
  | "VIEWER"
  | "TV_VIEW";

export type Permission =
  // Chamados
  | "tickets.view_own"
  | "tickets.view_team"
  | "tickets.view_all"
  | "tickets.create"
  | "tickets.comment"
  | "tickets.comment_internal"
  | "tickets.assign"
  | "tickets.transfer"
  | "tickets.escalate"
  | "tickets.close"
  | "tickets.reopen"
  // Equipe / supervisão
  | "team.view"
  | "team.manage_queue"
  // Administração
  | "users.view"
  | "users.manage"
  | "users.manage_permissions"
  | "system.configure"
  | "sla.configure"
  // Dashboards
  | "dashboard.client"
  | "dashboard.team"
  | "dashboard.admin"
  // Cadastros gerais
  | "registry.view"
  | "registry.manage";

export const PERMISSION_MATRIX: Record<Role, Permission[]> = {
  SUPERADMIN: [
    "tickets.view_own","tickets.view_team","tickets.view_all","tickets.create",
    "tickets.comment","tickets.comment_internal","tickets.assign","tickets.transfer",
    "tickets.escalate","tickets.close","tickets.reopen",
    "team.view","team.manage_queue",
    "users.view","users.manage","users.manage_permissions",
    "system.configure","sla.configure",
    "dashboard.client","dashboard.team","dashboard.admin",
    "registry.view","registry.manage",
  ],
  ADMIN: [
    "tickets.view_own","tickets.view_team","tickets.view_all","tickets.create",
    "tickets.comment","tickets.comment_internal","tickets.assign","tickets.transfer",
    "tickets.escalate","tickets.close","tickets.reopen",
    "team.view","team.manage_queue",
    "users.view","users.manage","users.manage_permissions",
    "system.configure","sla.configure",
    "dashboard.client","dashboard.team","dashboard.admin",
    "registry.view","registry.manage",
  ],
  // USER cobre Técnico e Supervisor. A diferenciação fina (transferir/escalonar/ver equipe)
  // continua sendo feita em ticketPermissions.ts via support_group_members.role_in_group.
  USER: [
    "tickets.view_own","tickets.view_team","tickets.create",
    "tickets.comment","tickets.comment_internal",
    "tickets.assign","tickets.transfer","tickets.escalate","tickets.close","tickets.reopen",
    "team.view",
    "dashboard.team",
    "registry.view",
  ],
  CLIENTE: [
    "tickets.view_own","tickets.create","tickets.comment",
    "dashboard.client",
  ],
  VIEWER: [
    "tickets.view_own","tickets.view_team",
    "dashboard.team","registry.view",
  ],
  TV_VIEW: [],
};

export interface PermissionUser {
  role: Role;
  id?: number;
  empresa_id?: number | null;
}

export function can(user: PermissionUser | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  return PERMISSION_MATRIX[user.role]?.includes(permission) ?? false;
}

export function canAny(user: PermissionUser | null | undefined, perms: Permission[]): boolean {
  return perms.some((p) => can(user, p));
}

export const ROLE_LABELS: Record<Role, string> = {
  SUPERADMIN: "Administrador",
  ADMIN: "Administrador",
  USER: "Técnico / Supervisor",
  CLIENTE: "Cliente",
  VIEWER: "Visualizador",
  TV_VIEW: "TV",
};

export const PERMISSION_DENIED_MESSAGES: Partial<Record<Permission, string>> = {
  "tickets.view_all": "Você não tem permissão para acessar este chamado.",
  "tickets.view_team": "Você não tem acesso aos chamados desta equipe.",
  "tickets.assign": "Seu perfil não permite atribuir chamados.",
  "tickets.transfer": "Seu perfil não permite transferir chamados.",
  "users.manage_permissions": "Apenas administradores podem gerenciar permissões.",
  "system.configure": "Apenas administradores podem alterar configurações do sistema.",
  "dashboard.admin": "Seu perfil não permite acessar este dashboard.",
};

export function denyMessage(permission: Permission): string {
  return PERMISSION_DENIED_MESSAGES[permission] ?? "Seu perfil não permite executar esta ação.";
}
