export const ATTACHMENT_BUCKET = "ariiatalk-attachments";
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const documentTypes: Record<string, string> = {
  pdf: "application/pdf", txt: "text/plain", csv: "text/csv", zip: "application/zip",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
const mediaTypes: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", mp4: "video/mp4", mov: "video/quicktime", mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", m4a: "audio/mp4" };
export const ATTACHMENT_ACCEPT = Object.keys({ ...documentTypes, ...mediaTypes }).map(ext => `.${ext}`).join(",");

export function attachmentInfo(file: { name: string; size: number; type: string }) {
  if (!file.size) throw new Error("O arquivo está vazio.");
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error("O anexo deve ter no máximo 20 MB.");
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = mediaTypes[extension] ?? documentTypes[extension];
  if (!mime) throw new Error("Formato não permitido. Selecione uma imagem, vídeo, áudio, PDF ou documento.");
  if (file.type && file.type !== "application/octet-stream" && file.type !== mime && !documentTypes[extension]) throw new Error("O formato do arquivo não corresponde à extensão.");
  const kind = mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "document";
  return { mime, kind, name: file.name.replace(/[\x00-\x1f/\\]/g, "_").slice(0, 180) || `anexo.${extension}` };
}

export function mediaPayload(number: string, url: string, file: ReturnType<typeof attachmentInfo>, caption: string, quoted?: unknown) {
  return { number, mediatype: file.kind, mimetype: file.mime, media: url, fileName: file.name, caption, ...(quoted ? { quoted } : {}) };
}