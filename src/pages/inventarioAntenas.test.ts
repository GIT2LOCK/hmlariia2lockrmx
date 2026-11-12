import { describe, expect, it } from "vitest";
import { isAntenaNova } from "./Inventario";

describe("isAntenaNova", () => {
  it.each(["U7LT", "U2Lv2", "BZ2", "UAP-AC-LITE", "AC Lite", "UAP-AC-PRO", "UAP-AC-LR"])(
    "classifica modelo legado %s como antigo",
    (model) => expect(isAntenaNova(model)).toBe(false),
  );

  it.each(["UAL6", "UAPL6", "UALR6v2", "U6 Lite", "U6+", "U6-Pro", "UAP6MP", "U7 Lite", "U7-Pro"])(
    "classifica geração U6+ %s como nova",
    (model) => expect(isAntenaNova(model)).toBe(true),
  );

  it("não classifica modelos desconhecidos como novos", () => {
    expect(isAntenaNova("N/E")).toBe(false);
    expect(isAntenaNova("UAP")).toBe(false);
  });
});
