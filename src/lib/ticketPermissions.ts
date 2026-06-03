// Permissões finas para o Fluxo Operacional de chamados.
// Combina a permissão global do usuário (SUPERADMIN/ADMIN/USER/VIEWER)
// com o papel dele dentro de uma support_group (MEMBRO/COORDENADOR/GESTOR).

import { TicketNivel } from "./ticketWorkflow";

export type GlobalRole = "SUPERADMIN" | "ADMIN" | "USER" | "VIEWER" | "TV_VIEW";
export type GroupRole = "MEMBRO" | "COORDENADOR" | "GESTOR";

export interface UserContextLite {
  id: number;
  role: GlobalRole;
}

export interface UserGroupMembership {
  group_id: number;
  role_in_group: GroupRole;
  nivel?: TicketNivel | null; // nível padrão da equipe
}

export type OperationalAction =
  | "assumir"
  | "atribuir"
  | "alterar_responsavel"
  | "transferir_tecnico"
  | "transferir_grupo"
  | "escalonar"
  | "rebaixar"
  | "mover_fila"
  | "aguardando_cliente"
  | "retomar_atendimento";

const FULL_ACCESS: GlobalRole[] = ["SUPERADMIN", "ADMIN"];

export function isFullAccess(role: GlobalRole) {
  return FULL_ACCESS.includes(role);
}

export function isReadOnly(role: GlobalRole) {
  return role === "VIEWER" || role === "TV_VIEW";
}

/** Verifica se o usuário tem permissão para executar uma ação operacional. */
export function canPerform(
  action: OperationalAction,
  user: UserContextLite | null | undefined,
  ticket: { assigned_group_id?: number | null; nivel_escalonamento?: TicketNivel | null },
  memberships: UserGroupMembership[] = [],
): boolean {
  if (!user) return false;
  if (isReadOnly(user.role)) return false;
  if (isFullAccess(user.role)) return true;

  // USER (técnico) — depende de membership
  const groupOfTicket = ticket.assigned_group_id
    ? memberships.find((m) => m.group_id === ticket.assigned_group_id)
    : null;
  const isManagerSomewhere = memberships.some((m) => m.role_in_group === "GESTOR");
  const isCoordHere = groupOfTicket?.role_in_group === "COORDENADOR" || groupOfTicket?.role_in_group === "GESTOR";

  switch (action) {
    case "assumir":
    case "aguardando_cliente":
    case "retomar_atendimento":
      // técnico pode assumir/marcar aguardando se for membro da equipe do ticket
      // ou se ticket não tem equipe ainda
      return !ticket.assigned_group_id || !!groupOfTicket;
    case "alterar_responsavel":
    case "transferir_tecnico":
    case "mover_fila":
      return isCoordHere || isManagerSomewhere;
    case "atribuir":
    case "transferir_grupo":
    case "escalonar":
    case "rebaixar":
      return isCoordHere || isManagerSomewhere;
    default:
      return false;
  }
}

export const NIVEIS: TicketNivel[] = ["N1", "N2", "N3"];

export function nivelAcima(n: TicketNivel): TicketNivel | null {
  if (n === "N1") return "N2";
  if (n === "N2") return "N3";
  return null;
}
export function nivelAbaixo(n: TicketNivel): TicketNivel | null {
  if (n === "N3") return "N2";
  if (n === "N2") return "N1";
  return null;
}
