import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import OpenTicketDialog from "./OpenTicketDialog";

const { queueFilters } = vi.hoisted(() => ({ queueFilters: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const query = {
        select: () => query,
        is: () => query,
        eq: (column: string, value: unknown) => {
          if (table === "ticket_filas") queueFilters(column, value);
          return query;
        },
        order: () => Promise.resolve({ data: [], error: null }),
      };
      return query;
    },
  },
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("loads only active queues for a new ticket, excluding retired NOC and Suporte N1 queues", async () => {
  render(<OpenTicketDialog
    open
    onOpenChange={() => {}}
    prefill={{ nome: "Solicitante", email: "", telefone: "", empresa_id: null, unidade_id: null, conversa: "Conversa" }}
    empresas={[]}
    unidades={[]}
    staff={[]}
  />);
  await waitFor(() => expect(queueFilters).toHaveBeenCalledWith("ativo", true));
});