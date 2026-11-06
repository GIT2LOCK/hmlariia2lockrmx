import { describe, it, expect } from "vitest";
import { availabilityPct, isLinkOutage, mergedDowntime, monthWindows } from "./linkAvailability";

describe("linkAvailability", () => {
  it("counts only internet link outages", () => {
    expect(isLinkOutage("Indisponibilidade de Link 1")).toBe(true);
    expect(isLinkOutage("Sem conexão com a unidade")).toBe(true);
    expect(isLinkOutage("Indisponibilidade de DDNS")).toBe(false);
    expect(isLinkOutage("Switch offline")).toBe(false);
  });
it("keeps the unit-wide trigger out of individual link outages", () => {
    expect(isLinkOutage("Indisponibilidade de Link 1")).toBe(true);
    expect(isLinkOutage("Sem conexao na unidade")).toBe(false);
    expect(isLinkOutage("Indisponibilidade de DDNS")).toBe(false);
  });

  it("does not double count overlapping outages", () => {
    expect(mergedDowntime([[0, 100], [50, 150], [300, 400]], 0, 1000)).toBe(250);
  });

  it("clips outages to the report period", () => {
    expect(mergedDowntime([[-100, 50]], 0, 1000)).toBe(50);
  });

  it("1 hour down in 100 hours is 99% available", () => {
    expect(availabilityPct(3600, 0, 360000)).toBeCloseTo(99, 5);
  });

  it("splits 6 months into calendar months", () => {
    const from = new Date(2026, 4, 15).getTime() / 1000;
    const till = new Date(2026, 10, 5).getTime() / 1000;
    expect(monthWindows(from, till).map((m) => m.label)).toEqual(["mai/26", "jun/26", "jul/26", "ago/26", "set/26", "out/26", "nov/26"]);
  });
});
