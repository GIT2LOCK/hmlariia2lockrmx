export const PHOTO_CACHE_MS = 24 * 60 * 60 * 1000;

export function isPhotoFresh(checkedAt: string | null | undefined, now = Date.now()) {
  const time = Date.parse(checkedAt ?? "");
  return Number.isFinite(time) && time <= now && now - time < PHOTO_CACHE_MS;
}

export function profilePictureUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function whatsappNumber(value: string | null | undefined): string | null {
  if (value?.includes("@")) {
    return /^\d{6,20}@(s\.whatsapp\.net|lid)$|^\d{6,40}(-\d+)?@g\.us$/.test(value) ? value : null;
  }
  let digits = (value ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return /^\d{12,15}$/.test(digits) ? digits : null;
}