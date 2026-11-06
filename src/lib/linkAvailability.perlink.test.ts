import { describe, it, expect } from "vitest";
import { matchLink, simultaneousDowntime } from "./linkAvailability";

describe("per-link availability", () => {
  it("unit is only down while both links are down", () => {
    expect(simultaneousDowntime([[[0, 100]], [[50, 200]]], 0, 1000)).toBe(50);
    expect(simultaneousDowntime([[[0, 100]], []], 0, 1000)).toBe(0);
  });
  it("matches event to the right link by hostname", () => {
    const links = [
      { id: 1, abrev: "VIVO", index: 1, operadora: "Vivo" },
      { id: 2, abrev: "CLA", index: 2, operadora: "Claro NET" },
    ];
    expect(matchLink({ name: "x", clock: 0, duration_sec: 1, hostname: "GSACL_CLAW2" }, links)?.id).toBe(2);
    expect(matchLink({ name: "x", clock: 0, duration_sec: 1, hostname: "GSACL_VIVOW1S" }, links)?.id).toBe(1);
    expect(matchLink({ name: "x", clock: 0, duration_sec: 1, hostname: "GSACL" }, links)).toBeNull();
  });
});
