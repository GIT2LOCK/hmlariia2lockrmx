import { describe, expect, it } from "vitest";
import { isPhotoFresh, profilePictureUrl, whatsappNumber } from "../../supabase/functions/ariiatalk-conversas/profilePicture";

describe("WhatsApp profile pictures", () => {
  it("normalizes the contact phone and preserves WhatsApp identifiers", () => {
    expect(whatsappNumber("(11) 99999-9999")).toBe("5511999999999");
    expect(whatsappNumber("5511999999999@s.whatsapp.net")).toBe("5511999999999@s.whatsapp.net");
    expect(whatsappNumber("123456789@lid")).toBe("123456789@lid");
    expect(whatsappNumber("12345@g.us")).toBeNull();
    expect(whatsappNumber(null)).toBeNull();
  });
  it("accepts only safe HTTPS photo URLs and handles missing/private pictures", () => {
    expect(profilePictureUrl("https://example.com/photo.jpg")).toBe("https://example.com/photo.jpg");
    for (const url of [null, "", "javascript:alert(1)", "http://example.com/photo.jpg", "https://user:pass@example.com/a"]) expect(profilePictureUrl(url)).toBeNull();
  });
  it("refreshes expired pictures, including cached no-picture results", () => {
    const now = Date.parse("2026-10-23T15:00:00Z");
    expect(isPhotoFresh("2026-10-23T14:00:00Z", now)).toBe(true);
    expect(isPhotoFresh("2026-10-22T15:00:00Z", now)).toBe(false);
    expect(isPhotoFresh(null, now)).toBe(false);
    expect(isPhotoFresh("2026-10-24T15:00:00Z", now)).toBe(false);
  });
});