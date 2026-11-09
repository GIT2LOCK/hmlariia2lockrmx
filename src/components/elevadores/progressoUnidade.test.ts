import { describe, it, expect } from "vitest";
import { progressoUnidade } from "./elevModel";
const H = "2026-11-09";
describe("progressoUnidade", () => {
  it("concluída quando todos os elevadores estão instalados", () => expect(progressoUnidade([{ status: "INSTALADO" }, { status: "INSTALADO" }], "2026-01-01", H)).toBe("CONCLUIDA"));
  it("em andamento quando algum começou", () => expect(progressoUnidade([{ status: "INSTALADO" }, { status: "PENDENTE" }], null, H)).toBe("EM_ANDAMENTO"));
  it("não iniciada quando todos pendentes ou sem elevadores", () => { expect(progressoUnidade([{ status: "PENDENTE" }], null, H)).toBe("NAO_INICIADA"); expect(progressoUnidade([], null, H)).toBe("NAO_INICIADA"); });
  it("atrasada quando a data prevista passou sem concluir", () => expect(progressoUnidade([{ status: "EM_ANDAMENTO" }], "2026-11-01", H)).toBe("ATRASADA"));
});
