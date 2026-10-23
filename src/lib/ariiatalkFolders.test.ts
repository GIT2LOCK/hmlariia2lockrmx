import { describe, expect, it } from "vitest";
import { ownsFolder } from "../../supabase/functions/ariiatalk-conversas/folders";

describe("pastas pessoais", () => {
  it("somente o criador pode acessar sua pasta", () => {
    expect(ownsFolder({ criado_por: 35 }, 35)).toBe(true);
    expect(ownsFolder({ criado_por: 35 }, 1)).toBe(false);
  });
  it("pastas sem proprietário não são compartilhadas", () => {
    expect(ownsFolder({ criado_por: null }, 35)).toBe(false);
    expect(ownsFolder(null, 35)).toBe(false);
  });
});