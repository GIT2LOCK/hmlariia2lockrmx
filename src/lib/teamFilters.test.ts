import { describe, expect, it } from "vitest";
import { filterPeople, filterTeams } from "./teamFilters";

const teams = [
  { nome: "N1 Suporte", descricao: "Operação técnica", nivel: "N1", ativo: true },
  { nome: "NOC", descricao: "Monitoramento", nivel: "N2", ativo: false },
  { nome: "Parceiros", descricao: null, nivel: null, ativo: true },
];
describe("filtros de filas e equipes", () => {
  it("busca nome e descrição ignorando acentos", () => {
    expect(filterTeams(teams, "OPERACAO", "all", "all")).toEqual([teams[0]]);
    expect(filterTeams(teams, "noc", "all", "all")).toEqual([teams[1]]);
  });
  it("combina status e nível sem mudar registros", () => {
    expect(filterTeams(teams, "", "inactive", "N2")).toEqual([teams[1]]);
    expect(filterTeams(teams, "", "active", "N2")).toEqual([]);
    expect(filterTeams(teams, "", "active", "none")).toEqual([teams[2]]);
    expect(filterTeams(teams, "", "all", "all")).toHaveLength(3);
  });
  it("busca usuários por nome sem acentos", () => {
    expect(filterPeople([{ nome: "João" }, { nome: "Maria" }], "JOAO")).toEqual([{ nome: "João" }]);
  });
});