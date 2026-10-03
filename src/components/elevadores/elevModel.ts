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
  numero_serie: string | null; presenca: Presenca; instalacao: Instalacao; instalado_em: string | null; observacao: string | null;
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
