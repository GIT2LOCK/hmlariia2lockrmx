import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CronogramaConstrutor from "./CronogramaConstrutor";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/integrations/supabase/client", () => {
  const data: Record<string, unknown[]> = {
    elev_cronograma_projetos: [{ id: 1, nome: "Projeto teste", ativo: true }],
    elev_cronograma_etapas: [{ id: 1, projeto_id: 1, nome: "Instalação", ordem: 1 }],
    elev_cronograma_atividades: [{ id: 1, etapa_id: 1, nome: "Instalar leitora", ordem: 1, data_inicio: "2026-10-13", data_fim: "2026-10-15", status: "CONCLUIDO", responsavel: "Equipe" }],
  };
  return { supabase: {
    from: (table: string) => {
      const query = { select: () => query, eq: () => query, order: () => query, limit: () => query, then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: data[table] || [], error: null }).then(resolve) };
      return query;
    },
    channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel; },
    removeChannel: vi.fn(),
  } };
});

afterEach(cleanup);
describe("Cronograma views and creation labels", () => {
  it("uses estrutura throughout the Nova Estrutura dialog", async () => {
    render(<CronogramaConstrutor lojas={[]} admin />);
    fireEvent.click(await screen.findByRole("button", { name: "Nova estrutura" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Nova Estrutura" })).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "Nome da estrutura" })).toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(/etapa/i);
  });
  it("opens Nova Etapa from Etapas and restores the activity Gantt", async () => {
    render(<CronogramaConstrutor lojas={[]} admin />);
    fireEvent.click(await screen.findByRole("button", { name: "Nova Etapa" }));
    expect(within(screen.getByRole("dialog")).getByRole("heading", { name: "Nova Etapa" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Gantt", exact: true }));
    expect(screen.getByRole("region", { name: "Gantt do cronograma" })).toBeInTheDocument();
    const bar = screen.getByRole("button", { name: "Instalar leitora — Concluída" });
    expect(bar.parentElement?.style.gridColumn).toBe("1 / span 3");
    fireEvent.click(bar);
    expect(within(screen.getByRole("dialog")).getByText("13/10/2026")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByText("15/10/2026")).toBeInTheDocument();
  });
  it("keeps creation controls restricted to administrators", async () => {
    render(<CronogramaConstrutor lojas={[]} admin={false} />);
    await screen.findByRole("heading", { name: "Projeto teste" });
    expect(screen.queryByRole("button", { name: "Nova estrutura" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nova Etapa" })).not.toBeInTheDocument();
  });
});