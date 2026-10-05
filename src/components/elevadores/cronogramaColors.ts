export const STAGE_COLORS = [
  { key: "azul", label: "Azul" }, { key: "laranja", label: "Laranja" },
  { key: "violeta", label: "Violeta" }, { key: "rosa", label: "Rosa" },
  { key: "ciano", label: "Ciano" }, { key: "ambar", label: "Âmbar" },
  { key: "vermelho", label: "Vermelho" }, { key: "grafite", label: "Grafite" },
] as const;
export type ColoredStage = { id: number; cor?: string | null };
export const stageColor = (stage?: ColoredStage) => STAGE_COLORS.some((c) => c.key === stage?.cor) ? stage?.cor : STAGE_COLORS[Math.abs((stage?.id || 1) - 1) % STAGE_COLORS.length].key;