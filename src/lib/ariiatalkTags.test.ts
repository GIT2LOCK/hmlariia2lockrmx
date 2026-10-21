import { describe, it, expect } from "vitest";
import { empresaTagColor, categoriaTagColor, contactCategoria } from "./ariiatalkTags";

describe("ariiatalkTags", () => {
  it("usa a cor configurada da empresa", () => expect(empresaTagColor(7, "rosa")).toBe("rosa"));
  it("cor padrão da empresa é estável pelo id", () => expect(empresaTagColor(7, null)).toBe(empresaTagColor(7, undefined)));
  it("Responsável e Recepção têm cores próprias", () => {
    expect(categoriaTagColor("Responsável")).toBe("laranja");
    expect(categoriaTagColor("recepcao")).toBe("rosa");
  });
  it("contato legado do tipo responsavel vira categoria Responsável", () =>
    expect(contactCategoria({ tipo: "responsavel", categoria: null })).toBe("Responsável"));
});
