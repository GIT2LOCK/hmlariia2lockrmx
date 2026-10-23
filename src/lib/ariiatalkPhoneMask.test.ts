import { describe, it, expect } from "vitest";
import { maskPhoneInput, phoneDigits } from "./ariiatalkPhoneMask";

describe("maskPhoneInput", () => {
  it("formata telefone brasileiro progressivamente", () => {
    expect(maskPhoneInput("1")).toBe("(1");
    expect(maskPhoneInput("11")).toBe("(11");
    expect(maskPhoneInput("119")).toBe("(11) 9");
    expect(maskPhoneInput("1191234")).toBe("(11) 91234");
    expect(maskPhoneInput("11912345678")).toBe("(11) 91234-5678");
  });

  it("bloqueia letras e símbolos", () => {
    expect(maskPhoneInput("abc1191234-5678x")).toBe("(11) 91234-5678");
    expect(maskPhoneInput("(11) 9a8b7c6-5d432")).toBe("(11) 98765-4321");
  });

  it("mantém prefixo internacional", () => {
    expect(maskPhoneInput("+5511912345678")).toBe("+55 (11) 91234-5678");
    expect(maskPhoneInput("+")).toBe("+");
  });

  it("limita o tamanho", () => {
    expect(maskPhoneInput("119123456789012345678")).toBe("(11) 91234-5678");
    expect(maskPhoneInput("+55119123456789999")).toBe("+55 (11) 91234-5678");
  });

  it("phoneDigits extrai somente dígitos", () => {
    expect(phoneDigits("(11) 91234-5678")).toBe("11912345678");
  });
});
