export const normalizeTeamSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();

export function filterTeams<T extends { nome: string; descricao: string | null; nivel: string | null; ativo: boolean }>(teams: T[], search: string, status: string, level: string): T[] {
  const term = normalizeTeamSearch(search);
  return teams.filter(team =>
    (status === "all" || team.ativo === (status === "active")) &&
    (level === "all" || (level === "none" ? !team.nivel : team.nivel === level)) &&
    (!term || normalizeTeamSearch(`${team.nome} ${team.descricao ?? ""}`).includes(term))
  );
}

export function filterPeople<T extends { nome: string }>(people: T[], search: string): T[] {
  const term = normalizeTeamSearch(search);
  return people.filter(person => normalizeTeamSearch(person.nome).includes(term));
}