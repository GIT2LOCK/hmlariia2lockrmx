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

export interface LinkFormData {
  operadora_id: string;
  config_rede: string;
  tipo_link: string;
  smart_sigma: boolean;
}

export const emptyLinkData: LinkFormData = {
  operadora_id: "",
  config_rede: "",
  tipo_link: "",
  smart_sigma: false,
};

export const generateHostname = (
  prefix: string,
  link1: LinkFormData,
  link2: LinkFormData | null,
  operadorasMap: Record<string, string> // id -> nome
): string => {
  if (!prefix.trim()) return "";

  const getAbrev = (operadoraId: string) => {
    const nome = operadorasMap[operadoraId];
    return nome ? OPERADORA_ABREVIACOES[nome] || "" : "";
  };

  let hostname = prefix.trim();

  if (link1.operadora_id) {
    const abrev = getAbrev(link1.operadora_id);
    if (abrev) {
      hostname += `_${abrev}W1${link1.smart_sigma ? "S" : ""}`;
    }
  }

  if (link2 && link2.operadora_id) {
    const abrev = getAbrev(link2.operadora_id);
    if (abrev) {
      hostname += `_${abrev}W2${link2.smart_sigma ? "S" : ""}`;
    }
  }

  return hostname;
};
