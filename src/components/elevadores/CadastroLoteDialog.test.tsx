import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CadastroLoteDialog from "./CadastroLoteDialog";

const mocks = vi.hoisted(() => ({ insert: vi.fn().mockResolvedValue({ error: null }), eq: vi.fn(), toast: vi.fn(), empty: false }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const query = {
    select: () => query, order: () => query,
    eq: (...args: unknown[]) => { mocks.eq(...args); return query; },
    insert: (value: unknown) => { mocks.insert(table, value); return Promise.resolve({ error: null }); },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null, data: table === "unidades"
      ? [{ id: 1, nome_unidade: "JÁ ADICIONADA" }, ...(mocks.empty ? [] : [{ id: 2, nome_unidade: "NOVA DISPONÍVEL" }])]
      : [{ unidade_id: 1 }] }).then(resolve),
  };
  return query;
} } }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange, disabled }: any) => <select aria-label="Unidade" value={value} disabled={disabled} onChange={(e) => onValueChange(e.target.value)}><option value="">Selecione</option>{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.empty = false; });
describe("Adicionar unidade existente em Elevadores", () => {
  it("only links an available GoodStorage unit without creating a unit or equipment", async () => {
    const saved = vi.fn();
    render(<CadastroLoteDialog modo="unidade" lojas={[]} elevadores={[]} onClose={vi.fn()} onSaved={saved} unidadeInicial={1} />);
    await screen.findByRole("option", { name: "NOVA DISPONÍVEL" });
    expect(screen.queryByRole("option", { name: "JÁ ADICIONADA" })).not.toBeInTheDocument();
    expect(mocks.eq).toHaveBeenCalledWith("empresa_id", 1);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adicionar elevador" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adicionar facial" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adicionar unidade" })).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox", { name: "Unidade" }), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar unidade" }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(mocks.insert).toHaveBeenCalledExactlyOnceWith("elev_lojas", { unidade_id: 2, estoque_leitoras: 0 });
  });
  it("shows an empty state when every unit is already added", async () => {
    mocks.empty = true;
    render(<CadastroLoteDialog modo="unidade" lojas={[]} elevadores={[]} onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByText("Nenhuma unidade disponível para adicionar.");
    expect(screen.getByRole("button", { name: "Adicionar unidade" })).toBeDisabled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});