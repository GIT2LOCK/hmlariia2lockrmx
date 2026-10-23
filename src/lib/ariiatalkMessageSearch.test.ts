import { describe, expect, it } from "vitest";
import { findMessageMatches } from "./ariiatalkMessageSearch";

const messages = [
  { conteudo: "Bom dia! O link da unidade está fora do ar." },
  { conteudo: "Reiniciei o equipamento, voltou." },
  { conteudo: null },
];

describe("pesquisa na conversa", () => {
  it("encontra por termo ignorando acentos e maiúsculas", () => {
    const hits = findMessageMatches(messages, "UNIDADE");
    expect(hits).toHaveLength(1);
    expect(hits[0].message).toBe(messages[0]);
    expect(messages[0].conteudo!.slice(hits[0].start, hits[0].end)).toBe("unidade");
  });

  it("localiza termo acentuado no texto original", () => {
    const hits = findMessageMatches(messages, "equipamento");
    expect(hits).toHaveLength(1);
    const text = messages[1].conteudo!;
    expect(text.slice(hits[0].start, hits[0].end)).toBe("equipamento");
    expect(text.slice(hits[0].start - 2, hits[0].end)).toBe("o equipamento");
  });

  it("retorna vazio para termo sem correspondência, em branco e em mensagens sem texto", () => {
    expect(findMessageMatches(messages, "fatura")).toEqual([]);
    expect(findMessageMatches(messages, "")).toEqual([]);
    expect(findMessageMatches(messages, "   ")).toEqual([]);
    expect(findMessageMatches([{ conteudo: "texto" }, { conteudo: null }], "texto")).toHaveLength(1);
  });
});
