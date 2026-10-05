export type Atividade = { id: number; etapa_id: number; nome: string; descricao: string | null; responsavel: string | null; ordem: number };
export type Execucao = { id: number; atividade_id: number; etapa_unidade_id: number; data_inicio: string | null; data_fim: string | null; status: string; responsavel: string | null; observacoes: string | null };
export type Bloqueio = { id: number; projeto_id: number; data_inicio: string; data_fim: string; tipo: string; descricao: string | null };

export const EXEC_STATUSES = [["NAO_INICIADO", "Não iniciada"], ["EM_ANDAMENTO", "Em andamento"], ["CONCLUIDO", "Concluída"], ["BLOQUEADO", "Bloqueada"]] as const;
export const execLabel = (v: string) => v === "ATRASADO" ? "Atraso" : EXEC_STATUSES.find(([k]) => k === v)?.[1] || v;
/** Status exibido: passou da data de fim sem concluir = ATRASADO. */
export const statusEfetivo = (e: Pick<Execucao, "status" | "data_fim" | "data_inicio">, hoje = iso(new Date())) => e.status !== "CONCLUIDO" && !!(e.data_fim || e.data_inicio) && (e.data_fim || e.data_inicio)! < hoje ? "ATRASADO" : e.status;

export const progresso = (exes: Execucao[]) => exes.length ? Math.round(exes.filter((e) => e.status === "CONCLUIDO").length / exes.length * 1000) / 10 : 0;

/** Status derivado: Não iniciada / Em andamento / Concluída (atividades também podem ser Bloqueada). */
export const statusDerivado = (exes: Execucao[], permiteBloqueio = false) => {
  if (!exes.length) return "NAO_INICIADO";
  if (exes.every((e) => e.status === "CONCLUIDO")) return "CONCLUIDO";
  if (permiteBloqueio && exes.some((e) => e.status === "BLOQUEADO") && !exes.some((e) => e.status === "EM_ANDAMENTO")) return "BLOQUEADO";
  if (exes.some((e) => e.status !== "NAO_INICIADO")) return "EM_ANDAMENTO";
  return "NAO_INICIADO";
};

/** Período = menor início e maior fim entre as execuções. */
export const periodo = (exes: Execucao[]) => {
  const ini = exes.map((e) => e.data_inicio).filter(Boolean) as string[];
  const fim = exes.map((e) => e.data_fim || e.data_inicio).filter(Boolean) as string[];
  return { inicio: ini.length ? ini.sort()[0] : null, fim: fim.length ? fim.sort()[fim.length - 1] : null };
};

export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const parse = (s: string) => new Date(`${s}T12:00:00`);
export const noDia = (e: Execucao, dia: string) => !!e.data_inicio && e.data_inicio <= dia && (e.data_fim || e.data_inicio) >= dia;
