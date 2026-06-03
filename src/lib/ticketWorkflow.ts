// Helpers do Fluxo Operacional de Chamados.
// Reutiliza ticket_history para todos os eventos operacionais.
// Cria notificações em ticket_notifications para os destinatários.

import { supabase } from "@/integrations/supabase/client";

export type TicketNivel = "N1" | "N2" | "N3";

export interface ActionUser {
  id: number;
  nome: string;
}

interface BaseTicket {
  id: number;
  tecnico_id?: number | null;
  assigned_group_id?: number | null;
  fila_id?: number | null;
  nivel_escalonamento?: TicketNivel | null;
  status?: string | null;
}

/** Insere um evento em ticket_history. */
async function logEvent(params: {
  ticketId: number;
  campo: string;
  valorAnterior?: string | null;
  valorNovo?: string | null;
  observacao?: string | null;
  user: ActionUser | null | undefined;
}) {
  await supabase.from("ticket_history").insert({
    ticket_id: params.ticketId,
    campo: params.campo,
    valor_anterior: params.valorAnterior ?? null,
    valor_novo: params.valorNovo ?? null,
    observacao: params.observacao ?? null,
    autor_id: params.user?.id ?? null,
    autor_nome: params.user?.nome ?? null,
  });
}

async function notify(usuarioId: number | null | undefined, ticketId: number, tipo: string, mensagem: string) {
  if (!usuarioId) return;
  await supabase.from("ticket_notifications").insert({
    ticket_id: ticketId,
    usuario_id: usuarioId,
    tipo,
    mensagem,
  });
}

async function getUserName(id: number | null | undefined) {
  if (!id) return null;
  const { data } = await supabase.from("usuarios").select("nome").eq("id", id).maybeSingle();
  return data?.nome || null;
}

async function getGroupName(id: number | null | undefined) {
  if (!id) return null;
  const { data } = await supabase.from("support_groups").select("nome").eq("id", id).maybeSingle();
  return data?.nome || null;
}

async function getGroupMembers(groupId: number) {
  const { data } = await supabase
    .from("support_group_members")
    .select("usuario_id")
    .eq("group_id", groupId)
    .eq("ativo", true);
  return (data || []).map((m) => m.usuario_id as number);
}

/** Atribui ou assume um chamado (técnico e/ou equipe). */
export async function atribuirResponsavel(opts: {
  ticket: BaseTicket;
  novoTecnicoId: number | null;
  novaEquipeId: number | null;
  motivo?: string | null;
  user: ActionUser;
}) {
  const { ticket, novoTecnicoId, novaEquipeId, motivo, user } = opts;
  const now = new Date().toISOString();
  const update: any = {
    tecnico_id: novoTecnicoId,
    assigned_group_id: novaEquipeId,
    assigned_by: user.id,
    assigned_at: now,
  };
  const { error } = await supabase.from("tickets").update(update).eq("id", ticket.id);
  if (error) throw error;

  const oldTecNome = await getUserName(ticket.tecnico_id);
  const newTecNome = await getUserName(novoTecnicoId);
  const oldGrpNome = await getGroupName(ticket.assigned_group_id);
  const newGrpNome = await getGroupName(novaEquipeId);

  await logEvent({
    ticketId: ticket.id,
    campo: "assigned",
    valorAnterior: [oldTecNome, oldGrpNome].filter(Boolean).join(" / ") || null,
    valorNovo: [newTecNome, newGrpNome].filter(Boolean).join(" / ") || null,
    observacao: motivo || `Atribuído por ${user.nome}`,
    user,
  });

  if (novoTecnicoId && novoTecnicoId !== ticket.tecnico_id) {
    await notify(novoTecnicoId, ticket.id, "assigned", `Você foi atribuído ao chamado.`);
  }
  if (novaEquipeId && novaEquipeId !== ticket.assigned_group_id) {
    const members = await getGroupMembers(novaEquipeId);
    await Promise.all(
      members
        .filter((m) => m !== novoTecnicoId)
        .map((m) => notify(m, ticket.id, "assigned", `Sua equipe recebeu um novo chamado.`)),
    );
  }
}

/** Altera apenas o responsável (técnico), com motivo obrigatório. */
export async function alterarResponsavel(opts: {
  ticket: BaseTicket;
  novoTecnicoId: number | null;
  motivo: string;
  observacao?: string;
  user: ActionUser;
}) {
  const { ticket, novoTecnicoId, motivo, observacao, user } = opts;
  if (!motivo?.trim()) throw new Error("Motivo é obrigatório.");
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("tickets")
    .update({ tecnico_id: novoTecnicoId, assigned_by: user.id, assigned_at: now })
    .eq("id", ticket.id);
  if (error) throw error;

  const oldNome = (await getUserName(ticket.tecnico_id)) || "—";
  const newNome = (await getUserName(novoTecnicoId)) || "—";
  await logEvent({
    ticketId: ticket.id,
    campo: "tecnico_id",
    valorAnterior: oldNome,
    valorNovo: newNome,
    observacao: [motivo, observacao].filter(Boolean).join(" — "),
    user,
  });

  if (novoTecnicoId) {
    await notify(novoTecnicoId, ticket.id, "assigned", `Você é o novo responsável pelo chamado. Motivo: ${motivo}`);
  }
}

/** Transferência técnico → técnico. */
export async function transferirTecnico(opts: {
  ticket: BaseTicket;
  destinoTecnicoId: number;
  motivo: string;
  observacao?: string;
  notificarDestino?: boolean;
  novaFilaId?: number | null;
  user: ActionUser;
}) {
  const { ticket, destinoTecnicoId, motivo, observacao, notificarDestino = true, novaFilaId, user } = opts;
  if (!motivo?.trim()) throw new Error("Motivo é obrigatório.");
  const now = new Date().toISOString();
  const update: any = {
    tecnico_id: destinoTecnicoId,
    assigned_by: user.id,
    assigned_at: now,
  };
  if (novaFilaId !== undefined && novaFilaId !== null) update.fila_id = novaFilaId;
  const { error } = await supabase.from("tickets").update(update).eq("id", ticket.id);
  if (error) throw error;

  const oldNome = (await getUserName(ticket.tecnico_id)) || "—";
  const newNome = (await getUserName(destinoTecnicoId)) || "—";
  await logEvent({
    ticketId: ticket.id,
    campo: "transferred_user",
    valorAnterior: oldNome,
    valorNovo: newNome,
    observacao: [motivo, observacao].filter(Boolean).join(" — "),
    user,
  });

  if (notificarDestino) {
    await notify(destinoTecnicoId, ticket.id, "transferred", `Chamado transferido para você por ${user.nome}. Motivo: ${motivo}`);
  }
}

/** Transferência equipe → equipe (opcionalmente já escolhe técnico). */
export async function transferirGrupo(opts: {
  ticket: BaseTicket;
  destinoGrupoId: number;
  destinoTecnicoId?: number | null;
  motivo: string;
  observacao?: string;
  novaFilaId?: number | null;
  user: ActionUser;
}) {
  const { ticket, destinoGrupoId, destinoTecnicoId, motivo, observacao, novaFilaId, user } = opts;
  if (!motivo?.trim()) throw new Error("Motivo é obrigatório.");
  const now = new Date().toISOString();
  const update: any = {
    assigned_group_id: destinoGrupoId,
    tecnico_id: destinoTecnicoId ?? null,
    assigned_by: user.id,
    assigned_at: now,
  };
  if (novaFilaId !== undefined && novaFilaId !== null) update.fila_id = novaFilaId;

  const { error } = await supabase.from("tickets").update(update).eq("id", ticket.id);
  if (error) throw error;

  const oldGrpNome = (await getGroupName(ticket.assigned_group_id)) || "—";
  const newGrpNome = (await getGroupName(destinoGrupoId)) || "—";
  await logEvent({
    ticketId: ticket.id,
    campo: "transferred_group",
    valorAnterior: oldGrpNome,
    valorNovo: newGrpNome,
    observacao: [motivo, observacao].filter(Boolean).join(" — "),
    user,
  });

  const members = await getGroupMembers(destinoGrupoId);
  await Promise.all(
    members
      .filter((m) => m !== destinoTecnicoId)
      .map((m) => notify(m, ticket.id, "transferred_group", `Sua equipe recebeu um chamado. Motivo: ${motivo}`)),
  );
  if (destinoTecnicoId) {
    await notify(destinoTecnicoId, ticket.id, "assigned", `Chamado atribuído a você na transferência de equipe.`);
  }
}

/** Escalonar / Rebaixar nível. */
export async function alterarNivel(opts: {
  ticket: BaseTicket;
  novoNivel: TicketNivel;
  motivo: string;
  observacao?: string;
  destinoGrupoId?: number | null;
  destinoTecnicoId?: number | null;
  user: ActionUser;
}) {
  const { ticket, novoNivel, motivo, observacao, destinoGrupoId, destinoTecnicoId, user } = opts;
  if (!motivo?.trim()) throw new Error("Motivo é obrigatório.");
  const niveis: TicketNivel[] = ["N1", "N2", "N3"];
  const atual = (ticket.nivel_escalonamento || "N1") as TicketNivel;
  const isEscalonar = niveis.indexOf(novoNivel) > niveis.indexOf(atual);
  const now = new Date().toISOString();
  const update: any = { nivel_escalonamento: novoNivel };
  if (destinoGrupoId !== undefined) update.assigned_group_id = destinoGrupoId;
  if (destinoTecnicoId !== undefined) {
    update.tecnico_id = destinoTecnicoId;
    update.assigned_by = user.id;
    update.assigned_at = now;
  }

  const { error } = await supabase.from("tickets").update(update).eq("id", ticket.id);
  if (error) throw error;

  await logEvent({
    ticketId: ticket.id,
    campo: isEscalonar ? "escalated" : "demoted",
    valorAnterior: atual,
    valorNovo: novoNivel,
    observacao: [motivo, observacao].filter(Boolean).join(" — "),
    user,
  });

  if (destinoTecnicoId) {
    await notify(destinoTecnicoId, ticket.id, isEscalonar ? "escalated" : "demoted",
      `Chamado ${isEscalonar ? "escalonado" : "rebaixado"} para ${novoNivel} e atribuído a você.`);
  } else if (destinoGrupoId) {
    const members = await getGroupMembers(destinoGrupoId);
    const grpNome = await getGroupName(destinoGrupoId);
    await Promise.all(members.map((m) => notify(m, ticket.id, isEscalonar ? "escalated" : "demoted",
      `Chamado ${isEscalonar ? "escalonado" : "rebaixado"} para ${novoNivel} (equipe ${grpNome}).`)));
  }
}

/** Move o ticket para uma fila (com log). */
export async function moverFila(opts: {
  ticket: BaseTicket;
  novaFilaId: number;
  motivo?: string;
  user: ActionUser;
}) {
  const { ticket, novaFilaId, motivo, user } = opts;
  const { error } = await supabase.from("tickets").update({ fila_id: novaFilaId }).eq("id", ticket.id);
  if (error) throw error;
  const oldNome = ticket.fila_id
    ? (await supabase.from("ticket_filas").select("nome").eq("id", ticket.fila_id).maybeSingle()).data?.nome || null
    : null;
  const newNome = (await supabase.from("ticket_filas").select("nome").eq("id", novaFilaId).maybeSingle()).data?.nome || null;
  await logEvent({
    ticketId: ticket.id,
    campo: "fila_id",
    valorAnterior: oldNome,
    valorNovo: newNome,
    observacao: motivo || null,
    user,
  });
}

/** Marca chamado como "Aguardando cliente" com motivo obrigatório. */
export async function marcarAguardandoCliente(opts: {
  ticket: BaseTicket;
  motivo: string;
  user: ActionUser;
}) {
  const { ticket, motivo, user } = opts;
  if (!motivo?.trim()) throw new Error("Motivo é obrigatório.");
  const now = new Date().toISOString();
  const update: any = {
    status: "AGUARDANDO_CLIENTE",
    aguardando_cliente_motivo: motivo,
    aguardando_cliente_desde: now,
    sla_pausa_inicio: now,
  };
  const { error } = await supabase.from("tickets").update(update).eq("id", ticket.id);
  if (error) throw error;
  await logEvent({
    ticketId: ticket.id,
    campo: "aguardando_cliente",
    valorAnterior: ticket.status || null,
    valorNovo: "AGUARDANDO_CLIENTE",
    observacao: motivo,
    user,
  });
}

/** Retoma atendimento (volta para EM_ATENDIMENTO, limpa motivo e pausa). */
export async function retomarAtendimento(opts: {
  ticket: BaseTicket & { sla_pausa_inicio?: string | null; sla_pausa_total_segundos?: number | null };
  observacao?: string;
  user: ActionUser;
}) {
  const { ticket, observacao, user } = opts;
  const now = new Date();
  const update: any = {
    status: "EM_ATENDIMENTO",
    aguardando_cliente_motivo: null,
    aguardando_cliente_desde: null,
  };
  if (ticket.sla_pausa_inicio) {
    const acc =
      (ticket.sla_pausa_total_segundos || 0) +
      Math.round((now.getTime() - new Date(ticket.sla_pausa_inicio).getTime()) / 1000);
    update.sla_pausa_inicio = null;
    update.sla_pausa_total_segundos = acc;
  }
  const { error } = await supabase.from("tickets").update(update).eq("id", ticket.id);
  if (error) throw error;
  await logEvent({
    ticketId: ticket.id,
    campo: "aguardando_cliente",
    valorAnterior: "AGUARDANDO_CLIENTE",
    valorNovo: "EM_ATENDIMENTO",
    observacao: observacao || "Atendimento retomado",
    user,
  });
}

export const MOTIVOS_ALTERAR_RESPONSAVEL = [
  "Técnico indisponível",
  "Redistribuição de carga",
  "Especialidade técnica",
  "Erro na atribuição anterior",
  "Solicitação do gestor",
  "Outro",
];

export const MOTIVOS_TRANSFERENCIA = [
  "Necessária análise avançada",
  "Especialidade técnica",
  "Falta de permissão/acesso",
  "Mudança de equipe responsável",
  "Solicitação do cliente",
  "Outro",
];

export const MOTIVOS_ESCALONAMENTO = [
  "Necessário acesso administrativo",
  "Problema fora do escopo do nível atual",
  "Complexidade técnica elevada",
  "Solicitação do gestor",
  "Outro",
];

export const MOTIVOS_AGUARDANDO_CLIENTE = [
  "Aguardando aprovação do cliente",
  "Aguardando informação do cliente",
  "Aguardando acesso do cliente",
  "Aguardando agendamento",
  "Outro",
];
