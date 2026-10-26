import { describe, expect, it } from "vitest";
import { attachmentInfo, mediaPayload, MAX_ATTACHMENT_BYTES } from "../../supabase/functions/_shared/ariiatalkAttachments";

describe("Anexos AriiaTalk", () => {
  it("aceita PDF sem texto obrigatório e envia como documento", () => {
    const info = attachmentInfo({ name: "relatorio.pdf", size: 12, type: "application/pdf" });
    expect(mediaPayload("grupo@g.us", "https://storage.test/file", info, "Analista:\n\nrelatorio.pdf")).toEqual({ number: "grupo@g.us", mediatype: "document", mimetype: "application/pdf", media: "https://storage.test/file", fileName: "relatorio.pdf", caption: "Analista:\n\nrelatorio.pdf" });
  });
  it("classifica imagens, vídeos e áudios", () => {
    expect(attachmentInfo({ name: "foto.png", size: 10, type: "image/png" }).kind).toBe("image");
    expect(attachmentInfo({ name: "video.mp4", size: 10, type: "video/mp4" }).kind).toBe("video");
    expect(attachmentInfo({ name: "audio.mp3", size: 10, type: "audio/mpeg" }).kind).toBe("audio");
  });
  it("rejeita arquivos vazios, acima de 20 MB e executáveis", () => {
    expect(() => attachmentInfo({ name: "a.pdf", size: 0, type: "" })).toThrow();
    expect(attachmentInfo({ name: "a.pdf", size: MAX_ATTACHMENT_BYTES, type: "" }).kind).toBe("document");
    expect(() => attachmentInfo({ name: "a.pdf", size: MAX_ATTACHMENT_BYTES + 1, type: "" })).toThrow();
    expect(() => attachmentInfo({ name: "a.exe", size: 10, type: "" })).toThrow();
    expect(() => attachmentInfo({ name: "a.svg", size: 10, type: "" })).toThrow();
  });
  it("preserva citação e não recebe notas internas", () => {
    const quote = { key: { id: "whatsapp-id" } };
    const body = mediaPayload("5511", "https://storage.test/f", attachmentInfo({ name: "a.jpg", size: 10, type: "image/jpeg" }), "Foto", quote);
    expect(body.quoted).toEqual(quote);
    expect(body).not.toHaveProperty("nota");
  });
});