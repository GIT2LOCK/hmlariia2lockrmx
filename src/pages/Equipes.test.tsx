import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import Equipes from "./Equipes";

vi.mock("@/contexts/UserContext", () => ({ useUser: () => ({ canManageUsers: true }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const data = table === "support_groups" ? [
    { id: 1, nome: "Suporte N1", descricao: "Operação técnica", nivel: "N1", ativo: true },
    { id: 2, nome: "NOC", descricao: "Monitoramento", nivel: "N2", ativo: false },
  ] : table === "support_group_members" ? [
    { id: 1, group_id: 1, usuario_id: 7, role_in_group: "MEMBRO", ativo: true },
    { id: 2, group_id: 1, usuario_id: 8, role_in_group: "MEMBRO", ativo: false },
  ] : [{ id: 7, nome: "João" }, { id: 8, nome: "Maria" }, { id: 9, nome: "Ana" }];
  const query = { select: () => query, order: () => query, eq: () => query, in: () => query,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) };
  return query;
} } }));

it("busca por descrição e limpa filtros sem perder filas", async () => {
  render(<Equipes />);
  await screen.findByText("Suporte N1");
  fireEvent.change(screen.getByLabelText("Pesquisar filas e equipes"), { target: { value: "operacao" } });
  expect(screen.getByText("Suporte N1")).toBeInTheDocument();
  expect(screen.queryByText("NOC")).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Limpar busca"));
  expect(screen.getByText("NOC")).toBeInTheDocument();
});

it("pesquisa membros sem remover outras associações", async () => {
  render(<Equipes />);
  fireEvent.click(await screen.findByLabelText("Membros de Suporte N1"));
  await screen.findByText("João");
  fireEvent.change(screen.getByLabelText("Pesquisar membros"), { target: { value: "joao" } });
  expect(screen.getByText("João")).toBeInTheDocument();
  expect(screen.queryByText("Maria")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Pesquisar membros"), { target: { value: "" } });
  await waitFor(() => expect(screen.getByText("Maria")).toBeInTheDocument());
});