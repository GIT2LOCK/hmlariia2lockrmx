import { ATTACHMENT_BUCKET } from "./ariiatalkAttachments.ts";

const MEDIA_TYPES = new Set(["image", "video", "audio", "document", "sticker"]);
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/3gpp": "3gp", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "application/pdf": "pdf" };

// Baixa a mídia recebida (URL .enc do WhatsApp é criptografada) via Evolution e salva no bucket privado.
export async function importIncomingMedia(db: any, instanceName: string, payload: Record<string, any>, type: string): Promise<string | null> {
  if (!MEDIA_TYPES.has(type)) return null;
  const base = Deno.env.get("EVOLUTION_API_URL"); const apikey = Deno.env.get("EVOLUTION_API_KEY");
  if (!base || !apikey || !payload?.key) return null;
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`, {
      method: "POST", headers: { apikey, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { key: payload.key, message: payload.message }, convertToMp4: type === "video" }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) { console.error("getBase64 failed", res.status); return null; }
    const data = await res.json();
    const b64 = String(data?.base64 ?? "").replace(/^data:[^,]+,/, "");
    if (!b64) return null;
    const mime = String(data?.mimetype ?? "application/octet-stream").split(";")[0].trim();
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const ext = EXT[mime] ?? mime.split("/")[1]?.replace(/[^a-z0-9]/gi, "") ?? "bin";
    const path = `recebidos/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
    const { error } = await db.storage.from(ATTACHMENT_BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
    if (error) { console.error("incoming media upload failed", error); return null; }
    return `storage://${ATTACHMENT_BUCKET}/${path}`;
  } catch (e) { console.error("incoming media import failed", e); return null; }
}

export function isRemoteWhatsappMedia(url: unknown): boolean {
  return typeof url === "string" && /^https?:\/\/[^/]*whatsapp\.net\//i.test(url);
}
