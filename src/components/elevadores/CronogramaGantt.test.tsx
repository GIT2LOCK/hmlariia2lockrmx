import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import CronogramaGantt from "./CronogramaGantt";
import type { Atividade } from "./cronogramaModel";

afterEach(cleanup);

describe("Gantt scroll layering", () => {
  it("contains bars beneath the sticky labels and headers", () => {
    const activity: Atividade = {
      id: 1, etapa_id: 1, nome: "Instalação SANTA CECÍLIA", ordem: 1,
      data_inicio: "2026-10-05", data_fim: "2027-01-08",
      status: "CONCLUIDO", responsavel: null, observacoes: null,
    };
    render(<CronogramaGantt stages={[{ id: 1, nome: "Instalação Facial", ordem: 1 }]}
      atividades={[activity]} unidadesDe={() => []} />);
    const region = screen.getByRole("region", { name: "Gantt do cronograma" });
    expect(region).toHaveClass("isolate", "overflow-auto");
    const bar = screen.getByRole("button", { name: "Instalação SANTA CECÍLIA — Concluída" });
    expect(bar.parentElement?.parentElement).toHaveClass("isolate", "z-0");
    const label = screen.getByRole("button", { name: "Instalação SANTA CECÍLIA", exact: true });
    expect(label.parentElement?.parentElement).toHaveClass("sticky", "left-0", "z-10", "bg-background");
  });
});