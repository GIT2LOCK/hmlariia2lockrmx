import { describe, expect, it } from "vitest";
import { filterKanbanTickets, sortKanbanTickets, type KanbanFilterTicket } from "./kanbanFilters";

const now = new Date("2026-10-27T20:00:00Z");
const base: KanbanFilterTicket = { id: 1, codigo: "CH-1", titulo: "Conexão da operação", status: "NOVO", prioridade: "MEDIO", tecnico_id: 7, data_abertura: "2026-10-27T19:00:00Z", sla_atendimento_minutos: 120, sla_solucao_minutos: 120 };
const rows = [base, { ...base, id: 2, codigo: "CH-2", titulo: "Câmera", tecnico_id: null, data_abertura: "2026-10-27T16:00:00Z" }, { ...base, id: 3, tecnico_id: 8, status: "FECHADO" as const }];
const filters = { search: "", scope: "ABERTOS" as const, priority: "ALL", quick: "ALL" as const, userId: 7 };
describe("Kanban filters", () => {
  it("finds accented titles without accents", () => expect(filterKanbanTickets(rows, { ...filters, search: "conexao" }, now).map(t => t.id)).toEqual([1]));
  it("shows only the current technician's tickets", () => expect(filterKanbanTickets(rows, { ...filters, quick: "MINE" }, now).map(t => t.id)).toEqual([1]));
  it("finds unassigned tickets", () => expect(filterKanbanTickets(rows, { ...filters, quick: "UNASSIGNED" }, now).map(t => t.id)).toEqual([2]));
  it("finds expired SLA but not closed tickets", () => expect(filterKanbanTickets(rows, { ...filters, scope: "TODOS", quick: "OVERDUE" }, now).map(t => t.id)).toEqual([2]));
  it("combines priority with other filters", () => expect(filterKanbanTickets(rows, { ...filters, priority: "CRITICO" }, now)).toEqual([]));
  it("sorts by newest or oldest without mutating input", () => {
    expect(sortKanbanTickets(rows.slice(0, 2), "NEWEST", now).map(t => t.id)).toEqual([1, 2]);
    expect(sortKanbanTickets(rows.slice(0, 2), "OLDEST", now).map(t => t.id)).toEqual([2, 1]);
    expect(rows.map(t => t.id)).toEqual([1, 2, 3]);
  });
  it("keeps overdue tickets first in urgency order", () => expect(sortKanbanTickets(rows, "URGENCY", now)[0].id).toBe(2));
});