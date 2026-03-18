export const OPERADORA_ABREVIACOES: Record<string, string> = {
  "America-NET": "AMT",
  "Century Telecom": "CNT",
  "Claro NET": "CLA",
  "Ctinet Solucoes": "CIT",
  "Directnet": "DIR",
  "Hostfiber": "HFB",
  "Mec Solutions Ltda": "MEC",
  "Mundiox": "MVX",
  "Sothis Tecnologia": "STH",
  "Transit do Brasil": "TRA",
  "Vivo": "VIVO",
  "Wireless Comm - WCS": "WCS",
  "Vogel": "VOG",
  "SkyNet": "SKY",
  "NET": "NET",
};

export const CONFIG_REDE_OPTIONS = [
  { value: "bridge_pppoe", label: "Bridge (PPPoE)" },
  { value: "cgnat", label: "CGNAT (Apenas Links da Claro NET)" },
  { value: "estatico", label: "Estático" },
  { value: "dhcp", label: "DHCP" },
  { value: "dhcp_publico", label: "DHCP Público" },
];

export const TIPO_LINK_OPTIONS = [
  { value: "banda_larga", label: "Banda Larga" },
  { value: "link_dedicado", label: "Dedicado" },
  { value: "radio", label: "Radio" },
];

export interface ChamadoFormData {
  designacao: string;
  cnpj_abertura: string;
  numero_cliente: string;
}

export const emptyChamadoData: ChamadoFormData = {
  designacao: "",
  cnpj_abertura: "",
  numero_cliente: "",
};

export interface LinkFormData {
  operadora_id: string;
  config_rede: string;
  tipo_link: string;
  smart_sigma: boolean;
  pppoe_usuario: string;
  pppoe_senha: string;
  ddns_enabled: boolean;
  ddns: string;
  ip_estatico: string;
  mascara: string;
  gateway: string;
  chamado: ChamadoFormData;
}

export const emptyLinkData: LinkFormData = {
  operadora_id: "",
  config_rede: "",
  tipo_link: "",
  smart_sigma: false,
  pppoe_usuario: "",
  pppoe_senha: "",
  ddns_enabled: false,
  ddns: "",
  ip_estatico: "",
  mascara: "",
  gateway: "",
  chamado: { ...emptyChamadoData },
};

export const generateLinkHostname = (
  prefix: string,
  linkData: LinkFormData,
  linkNumber: 1 | 2,
  operadorasMap: Record<string, string>
): string => {
  if (!prefix.trim() || !linkData.operadora_id) return "";

  const nome = operadorasMap[linkData.operadora_id];
  const abrev = nome ? OPERADORA_ABREVIACOES[nome] || "" : "";
  if (!abrev) return "";

  return `${prefix.trim()}_${abrev}W${linkNumber}${linkData.smart_sigma ? "S" : ""}`;
};
