import { describe, expect, it } from "vitest";
import { matchesOutboundEcho, normalizeSignature, outgoingText } from "../../supabase/functions/_shared/ariiatalkSignature";

describe("AriiaTalk signatures", () => {
  it("sends Analista 01 with colon and blank line only in WhatsApp text", () => {
    const internalText = "Bom dia!";
    expect(outgoingText(internalText, "Analista 01")).toBe("Analista 01:\n\nBom dia!");
    expect(internalText).toBe("Bom dia!");
  });
  it("leaves messages unsigned when no signature is configured", () => {
    expect(outgoingText("Bom dia!", "")).toBe("Bom dia!");
  });
  it("normalizes the label without duplicate colons", () => {
    expect(normalizeSignature(" Analista 01: ")).toBe("Analista 01");
  });
  it("rejects multiline signatures", () => {
    expect(() => normalizeSignature("Analista 01\nOutro")).toThrow("invalid_signature");
  });
  it("reconciles only an exact authenticated outbound echo", () => {
    const pending = { texto_whatsapp: "Analista 01:\n\nBom dia!", direcao: "saida", enviado_por: 7 };
    expect(matchesOutboundEcho(pending, "Analista 01:\n\nBom dia!")).toBe(true);
    expect(matchesOutboundEcho(pending, "Bom dia!")).toBe(false);
    expect(matchesOutboundEcho({ ...pending, direcao: "entrada" }, pending.texto_whatsapp)).toBe(false);
    expect(matchesOutboundEcho({ ...pending, enviado_por: null }, pending.texto_whatsapp)).toBe(false);
  });
});