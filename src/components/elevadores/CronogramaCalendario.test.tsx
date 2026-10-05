import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import CronogramaCalendario from "./CronogramaCalendario";
import { iso } from "./cronogramaModel";

afterEach(cleanup);
it("colors the events themselves by stage in both views without a legend", () => {
  const date = iso(new Date());
  const activity = { id: 1, etapa_id: 1, nome: "Instalar facial", descricao: null, responsavel: null, observacoes: null, ordem: 1, data_inicio: date, data_fim: date, status: "CONCLUIDO" };
  const props = { stages: [{ id: 1, nome: "Montagem", ordem: 1, cor: "rosa" }], atividades: [activity], unidadesDe: () => [], bloqueios: [] };
  const { container, rerender } = render(<CronogramaCalendario {...props} />);
  expect(container.querySelector(".stage-event")).toHaveAttribute("data-stage-color", "rosa");
  expect(container.querySelector(".stage-event")).toHaveTextContent("Concluída");
  expect(container.querySelector(".stage-swatch")).toBeNull();
  rerender(<CronogramaCalendario {...props} stages={[{ ...props.stages[0], cor: "ciano" }]} />);
  expect(container.querySelector(".stage-event")).toHaveAttribute("data-stage-color", "ciano");
  fireEvent.click(screen.getByRole("button", { name: "Lista diária" }));
  expect(container.querySelector(".stage-event")).toHaveAttribute("data-stage-color", "ciano");
});