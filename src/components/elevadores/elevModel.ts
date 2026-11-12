export type Status = "PENDENTE" | "EM_ANDAMENTO" | "PAUSADO" | "INSTALADO";
export type Validacao = "NAO_VALIDADO" | "VALIDADO";
export type FacialSituacao = "NAO_IDENTIFICADO" | "ENCONTRADO" | "NAO_ENCONTRADO" | "NECESSITA_COMPRA";
export type Presenca = "NAO_IDENTIFICADO" | "PRESENTE" | "NAO_ENCONTRADO";
export type Instalacao = "NAO_INICIADA" | "AGUARDANDO" | "INSTALADA";

export interface Elevador {
  id: number; unidade_id: number; tipo: string; marca: string | null; numero_serie: string | null; observacao?: string | null;
  status: Status; instalado_em: string | null; iniciado_em: string | null;
  validacao_status: Validacao; validado_em: string | null; validacao_obs: string | null; facial_situacao: FacialSituacao;
  checklist: Record<string, boolean> | null;
  ini?: { nome: string } | null; fim?: { nome: string } | null; val?: { nome: string } | null;
}
export interface Facial {
  id: number; unidade_id: number; elevador_id: number | null; codigo: string; marca: string | null; modelo: string | null;
  numero_serie: string | null; presenca: Presenca; instalacao: Instalacao; instalado_em: string | null; observacao: string | null; origem_tipo?: string | null; origem_unidade_id?: number | null; origem_descricao?: string | null;
}

export const STATUS_LABEL: Record<Status, string> = { PENDENTE: "Pendente", EM_ANDAMENTO: "Em andamento", PAUSADO: "Pausado", INSTALADO: "Instalado" };
export const VALID_LABEL: Record<Validacao, string> = { NAO_VALIDADO: "Não validado", VALIDADO: "Validado" };
export const FSIT_LABEL: Record<FacialSituacao, string> = { NAO_IDENTIFICADO: "Não identificado", ENCONTRADO: "Encontrado", NAO_ENCONTRADO: "Não encontrado", NECESSITA_COMPRA: "Necessita compra" };
export const PRES_LABEL: Record<Presenca, string> = { NAO_IDENTIFICADO: "Não identificado", PRESENTE: "Presente na unidade", NAO_ENCONTRADO: "Não encontrado" };
export const INST_LABEL: Record<Instalacao, string> = { NAO_INICIADA: "Não iniciada", AGUARDANDO: "Aguardando instalação", INSTALADA: "Instalada" };

export type Situacao = "AGUARDANDO_VALIDACAO" | "CONCLUIDO" | "AGUARDANDO_INSTALACAO" | "NECESSITA_COMPRA" | "FACIAL_NAO_ENCONTRADO" | "SEM_FACIAL";
export const SIT_LABEL: Record<Situacao, string> = {
  AGUARDANDO_VALIDACAO: "Aguardando validação", CONCLUIDO: "Concluído", AGUARDANDO_INSTALACAO: "Falta instalar",
  NECESSITA_COMPRA: "Necessita compra", FACIAL_NAO_ENCONTRADO: "Facial não encontrado", SEM_FACIAL: "Sem facial",
};
export const SIT_VARIANT: Record<Situacao, "outline" | "secondary" | "default" | "destructive"> = {
  AGUARDANDO_VALIDACAO: "outline", CONCLUIDO: "default", AGUARDANDO_INSTALACAO: "secondary",
  NECESSITA_COMPRA: "destructive", FACIAL_NAO_ENCONTRADO: "destructive", SEM_FACIAL: "destructive",
};

export function situacao(e: Elevador, f?: Facial | null): Situacao {
  if (e.validacao_status === "NAO_VALIDADO") return "AGUARDANDO_VALIDACAO";
  if (f?.instalacao === "INSTALADA") return "CONCLUIDO";
  if (f) return "AGUARDANDO_INSTALACAO";
  if (e.facial_situacao === "NECESSITA_COMPRA") return "NECESSITA_COMPRA";
  if (e.facial_situacao === "NAO_ENCONTRADO") return "FACIAL_NAO_ENCONTRADO";
  return "SEM_FACIAL";
}

export const CHECKLIST = [
  { key: "identificado", label: "Elevador identificado" },
  { key: "validado", label: "Equipamento validado", auto: (e: Elevador) => e.validacao_status === "VALIDADO" },
  { key: "facial_localizado", label: "Facial localizado na unidade", auto: (_e: Elevador, f?: Facial | null) => !!f && f.presenca === "PRESENTE" },
  { key: "facial_instalado", label: "Facial instalado", auto: (_e: Elevador, f?: Facial | null) => f?.instalacao === "INSTALADA" },
  { key: "teste", label: "Teste realizado" },
] as const;

export const ACAO_LABEL: Record<string, string> = {
  ELEVADOR_CRIADO: "Elevador criado", ELEVADOR_VALIDADO: "Elevador validado", VALIDACAO_REMOVIDA: "Validação removida",
  FACIAL_CADASTRADO: "Facial cadastrado", FACIAL_ASSOCIADO: "Facial associado", FACIAL_DESASSOCIADO: "Facial desassociado",
  FACIAL_ENCONTRADO: "Facial encontrado na unidade", FACIAL_PRESENCA: "Presença do facial alterada",
  FACIAL_AGUARDANDO_INSTALACAO: "Facial aguardando instalação", FACIAL_INSTALADO: "Facial instalado", FACIAL_INSTALACAO: "Instalação do facial alterada",
  ELEVADOR_INICIADO: "Instalação iniciada", ELEVADOR_PAUSADO: "Elevador pausado", ELEVADOR_RETOMADO: "Elevador retomado",
  ELEVADOR_REINICIADO: "Elevador reiniciado", ELEVADOR_INSTALADO: "Elevador instalado", STATUS: "Status alterado",
};

export const elevNome = (e: Elevador) => `${e.tipo}${e.numero_serie ? ` · ${e.numero_serie}` : ` #${e.id}`}`;

export const traduzErro = (m: string) =>
  m.includes("elevador_sem_facial") ? "Associe um facial ao elevador antes de encerrar." :
  m.includes("facial_unidade_diferente") ? "O facial e o elevador precisam ser da mesma unidade." :
  m.includes("já possui outro facial") || m.includes("elev_faciais_elevador_uniq") ? "Este elevador já possui outro facial associado." :
  m.includes("facial_instalado_exige_elevador") ? "Um facial só pode ser marcado como instalado se estiver associado a um elevador." :
  m.includes("transicao_nao_permitida") ? "Essa ação não é permitida no estado atual." : m;

export type UnidadeProgresso = "CONCLUIDA" | "EM_ANDAMENTO" | "NAO_INICIADA" | "ATRASADA";
export type EtapaProgresso = { id: number; nome: string; data_fim: string | null };
export type ParticipacaoProgresso = { id: number; etapa_id: number; unidade_id: number; status: string; data_fim: string | null };
export type AtividadeProgresso = { id: number; etapa_id: number; nome?: string | null; status: string; data_inicio: string | null; data_fim: string | null };
export type VinculoProgresso = { atividade_id: number; etapa_unidade_id: number };

/** Usa as atividades vinculadas na Instalação Facial; participação legada só quando não há atividades vinculadas. */
export function progressoUnidade(unidadeId: number, etapas: EtapaProgresso[], participacoes: ParticipacaoProgresso[], atividades: AtividadeProgresso[], vinculos: VinculoProgresso[], hoje = new Date().toISOString().slice(0, 10), unidadeNome?: string | null): { status: UnidadeProgresso; iniciou: boolean } {
  const ids = new Set(etapas.filter((e) => e.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/^\s*\d+[.\s)\-:]+/, "").trim() === "instalacao facial").map((e) => e.id));
  const parts = participacoes.filter((p) => p.unidade_id === unidadeId && ids.has(p.etapa_id));
  const partIds = new Set(parts.map((p) => p.id));
  const atvIds = new Set(vinculos.filter((v) => partIds.has(v.etapa_unidade_id)).map((v) => v.atividade_id));
  const norm = (x: string) => ` ${x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim()} `;
  const alvo = unidadeNome ? norm(unidadeNome) : "";
  const porNome = (a: AtividadeProgresso) => alvo.trim().length > 0 && !!a.nome && norm(a.nome).includes(alvo);
  const atvs = atividades.filter((a) => ids.has(a.etapa_id) && (atvIds.has(a.id) || porNome(a)));
  const rows = atvs.length ? atvs : parts;
  const d = (x: string | null | undefined) => (x || "").slice(0, 10);
  const naoIniciado = (st: string) => ["NAO_INICIADO", "PENDENTE", "CANCELADO"].includes(st);
  const iniciou = rows.some((r) => !naoIniciado(r.status));
  if (!rows.length) return { status: "NAO_INICIADA", iniciou };
  const estado = (r: { status: string; data_inicio?: string | null; data_fim: string | null }): UnidadeProgresso => {
    if (r.status === "CONCLUIDO") return "CONCLUIDA";
    const ini = d(r.data_inicio ?? etapas.find((e) => e.id === (r as ParticipacaoProgresso).etapa_id)?.data_fim ?? null);
    const fim = d(r.data_fim);
    if (naoIniciado(r.status)) return (ini || fim) && (ini || fim) < hoje ? "ATRASADA" : "NAO_INICIADA";
    return fim && fim < hoje ? "ATRASADA" : "EM_ANDAMENTO";
  };
  const est = rows.map(estado);
  const status: UnidadeProgresso = est.every((e) => e === "CONCLUIDA") ? "CONCLUIDA" : est.includes("ATRASADA") ? "ATRASADA" : est.some((e) => e === "EM_ANDAMENTO" || e === "CONCLUIDA") ? "EM_ANDAMENTO" : "NAO_INICIADA";
  return { status, iniciou };
}

const semAcento = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export const ehEtapaInstalacaoFacial = (nome: string) => semAcento(nome).toLowerCase().replace(/^\s*\d+[.\s)\-:]+/, "").trim().startsWith("instalacao facial");

/** Status de uma atividade da etapa 8, literal: Concluído → concluída; Em andamento após o fim → atraso; não iniciada após o início → atraso. */
export function estadoAtividade(a: { status: string; data_inicio: string | null; data_fim: string | null }, hoje = new Date().toISOString().slice(0, 10)): UnidadeProgresso {
  const st = semAcento(a.status || "").toUpperCase().replace(/[^A-Z]+/g, "_");
  const ini = (a.data_inicio || "").slice(0, 10), fim = (a.data_fim || "").slice(0, 10);
  if (st.startsWith("CONCLU")) return "CONCLUIDA";
  if (["NAO_INICIADO", "NAO_INICIADA", "PENDENTE", ""].includes(st)) return ini && ini < hoje ? "ATRASADA" : "NAO_INICIADA";
  return fim && fim < hoje ? "ATRASADA" : "EM_ANDAMENTO";
}

/** Uma linha por atividade da etapa 8. Instalação Facial. */
export function progressoAtividadesFacial(etapas: EtapaProgresso[], atividades: AtividadeProgresso[], hoje = new Date().toISOString().slice(0, 10)) {
  const ids = new Set(etapas.filter((e) => ehEtapaInstalacaoFacial(e.nome)).map((e) => e.id));
  return atividades.filter((a) => ids.has(a.etapa_id)).map((a) => ({
    id: a.id,
    nome: (a.nome || `Atividade ${a.id}`).replace(/^\s*instala[cç][aã]o\s*(facial)?\s*[-–:]?\s*/i, "").trim().toUpperCase() || (a.nome || "").toUpperCase(),
    p: estadoAtividade(a, hoje),
    iniciou: !["NAO_INICIADO", "PENDENTE"].includes(a.status),
  })).sort((x, y) => x.nome.localeCompare(y.nome));
}
