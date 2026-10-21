// Cores centralizadas das tags do AriiaTalk (empresa, unidade, categoria).
// Usa as chaves semânticas de paleta já definidas em index.css (data-stage-color).
export const TAG_PALETTE = ["azul", "violeta", "ciano", "ambar", "rosa", "laranja", "vermelho", "grafite"] as const;
export type TagColor = (typeof TAG_PALETTE)[number];

function hashIndex(seed: string | number, size: number) {
  const s = String(seed);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % size;
}

/** Cor da empresa: usa a configurada (empresas.cor) ou uma padrão estável pelo id. */
export function empresaTagColor(id: number | null | undefined, cor?: string | null): TagColor {
  if (cor && (TAG_PALETTE as readonly string[]).includes(cor)) return cor as TagColor;
  return TAG_PALETTE[hashIndex(id ?? 0, 5)]; // azul, violeta, ciano, ambar, rosa
}

const CATEGORY_COLORS: Record<string, TagColor> = {
  responsavel: "laranja",
  recepcao: "rosa",
};

export function normalizeKey(v: string) {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function categoriaTagColor(categoria: string): TagColor {
  return CATEGORY_COLORS[normalizeKey(categoria)] ?? (["violeta", "ciano", "ambar"] as TagColor[])[hashIndex(normalizeKey(categoria), 3)];
}

/** Rótulo da categoria: campo próprio ou derivado do tipo legado. */
export function contactCategoria(c: { categoria?: string | null; tipo?: string | null }) {
  if (c.categoria) return c.categoria;
  if (c.tipo === "responsavel") return "Responsável";
  return null;
}

export const CATEGORIAS_SUGERIDAS = ["Responsável", "Recepção", "Financeiro", "TI", "Gerência"];
