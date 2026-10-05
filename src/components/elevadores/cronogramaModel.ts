export type Atividade = { id: number; etapa_id: number; nome: string; descricao: string | null; responsavel: string | null; ordem: number; data_inicio: string | null; data_fim: string | null; status: string; observacoes: string | null };
/** Vínculo atividade ↔ unidade (via participação da unidade na etapa). Datas/status legados não são usados. */
export type Execucao = { id: number; atividade_id: number; etapa_unidade_id: number; data_inicio: string | null; data_fim: string | null; status: string; responsavel: string | null; observacoes: string | null };
export type Bloqueio = { id: number; projeto_id: number; data_inicio: string; data_fim: string; tipo: string; descricao: string | null };

export const EXEC_STATUSES = [["NAO_INICIADO", "Não iniciada"], ["EM_ANDAMENTO", "Em andamento"], ["CONCLUIDO", "Concluída"], ["BLOQUEADO", "Bloqueada"]] as const;
export const execLabel = (v: string) => v === "ATRASADO" ? "Atraso" : EXEC_STATUSES.find(([k]) => k === v)?.[1] || v;
/** Status exibido: passou da data de fim sem concluir = ATRASADO. */
export const statusEfetivo = (e: { status: string; data_fim: string | null; data_inicio: string | null }, hoje = iso(new Date())) => e.status !== "CONCLUIDO" && !!(e.data_fim || e.data_inicio) && (e.data_fim || e.data_inicio)! < hoje ? "ATRASADO" : e.status;

export const progresso = (xs: { status: string }[]) => xs.length ? Math.round(xs.filter((e) => e.status === "CONCLUIDO").length / xs.length * 1000) / 10 : 0;

/** Status da etapa derivado das atividades. */
export const statusDerivado = (xs: { status: string }[]) => {
  if (!xs.length) return "NAO_INICIADO";
  if (xs.every((e) => e.status === "CONCLUIDO")) return "CONCLUIDO";
  if (xs.some((e) => e.status !== "NAO_INICIADO")) return "EM_ANDAMENTO";
  return "NAO_INICIADO";
};

/** Período = menor início e maior fim. */
export const periodo = (xs: { data_inicio: string | null; data_fim: string | null }[]) => {
  const ini = xs.map((e) => e.data_inicio).filter(Boolean) as string[];
  const fim = xs.map((e) => e.data_fim || e.data_inicio).filter(Boolean) as string[];
  return { inicio: ini.length ? ini.sort()[0] : null, fim: fim.length ? fim.sort()[fim.length - 1] : null };
};

export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const parse = (s: string) => new Date(`${s}T12:00:00`);
export const noDia = (e: { data_inicio: string | null; data_fim: string | null }, dia: string) => !!e.data_inicio && e.data_inicio <= dia && (e.data_fim || e.data_inicio) >= dia;

/** Domingo de Páscoa (algoritmo de Meeus). */
const pascoa = (y: number) => {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return new Date(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1, 12);
};
const add = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return iso(x); };

export type DiaEspecial = { tipo: "FERIADO_NACIONAL" | "FERIADO_ESTADUAL" | "PONTO_FACULTATIVO"; nome: string };
const cache = new Map<number, Map<string, DiaEspecial>>();
export const diasEspeciais = (y: number) => {
  if (cache.has(y)) return cache.get(y)!;
  const p = pascoa(y), m = new Map<string, DiaEspecial>();
  const N = (md: string, nome: string) => m.set(`${y}-${md}`, { tipo: "FERIADO_NACIONAL", nome });
  N("01-01", "Confraternização Universal"); N("04-21", "Tiradentes"); N("05-01", "Dia do Trabalho"); N("09-07", "Independência"); N("10-12", "Nossa Senhora Aparecida"); N("11-02", "Finados"); N("11-15", "Proclamação da República"); N("11-20", "Consciência Negra"); N("12-25", "Natal");
  m.set(add(p, -2), { tipo: "FERIADO_NACIONAL", nome: "Paixão de Cristo" });
  m.set(`${y}-07-09`, { tipo: "FERIADO_ESTADUAL", nome: "Revolução Constitucionalista (SP)" });
  m.set(add(p, -48), { tipo: "PONTO_FACULTATIVO", nome: "Carnaval" });
  m.set(add(p, -47), { tipo: "PONTO_FACULTATIVO", nome: "Carnaval" });
  m.set(add(p, -46), { tipo: "PONTO_FACULTATIVO", nome: "Quarta-feira de Cinzas (até 14h)" });
  m.set(add(p, 60), { tipo: "PONTO_FACULTATIVO", nome: "Corpus Christi" });
  cache.set(y, m); return m;
};
export const diaEspecial = (d: string) => diasEspeciais(Number(d.slice(0, 4))).get(d);
export const fimDeSemana = (d: string) => { const w = parse(d).getDay(); return w === 0 || w === 6; };
