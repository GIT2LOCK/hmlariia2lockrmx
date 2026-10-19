import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserProvider, useUser } from "./UserContext";

const mocks = vi.hoisted(() => ({
  stored: { id: 101, nome: "Conta X", email: "x@example.test", permissao: "VIEWER" },
  saved: new Map<number, string>(),
  setTheme: vi.fn(),
  failSave: false,
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ setTheme: mocks.setTheme }) }));
vi.mock("@/services/authService", () => ({
  getStoredUser: () => mocks.stored,
  getAuthHeaders: () => ({ "Content-Type": "application/json" }),
  ensureSupabaseSessionFromAriiaToken: vi.fn(),
  syncUserFromDatabase: async () => mocks.stored,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null } }) },
    rpc: async () => ({ data: null }),
    channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel; },
    removeChannel: vi.fn(),
  },
}));

function Probe() {
  const { user, isLoading, saveAccountTheme, refreshUser } = useUser();
  return <>
    <span>{isLoading ? "loading" : user.id}</span>
    <button onClick={() => saveAccountTheme("goodstorage").catch(() => {})}>Save GoodStorage</button>
    <button onClick={() => refreshUser()}>Refresh</button>
  </>;
}

beforeEach(() => {
  mocks.stored = { id: 101, nome: "Conta X", email: "x@example.test", permissao: "VIEWER" };
  mocks.saved = new Map([[101, "goodstorage"], [202, "light"]]);
  mocks.setTheme.mockReset();
  mocks.failSave = false;
  vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.action === "set-theme" && mocks.failSave) {
      return { ok: false, json: async () => ({ error: "Save failed" }) };
    }
    if (body.action === "set-theme") mocks.saved.set(mocks.stored.id, body.tema);
    return { ok: true, json: async () => ({ success: true, tema: mocks.saved.get(mocks.stored.id) }) };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("account theme", () => {
  it("restores GoodStorage for X and Claro for Y when switching accounts", async () => {
    render(<UserProvider><Probe /></UserProvider>);
    await screen.findByText("101");
    expect(mocks.setTheme).toHaveBeenLastCalledWith("goodstorage");
    mocks.stored = { ...mocks.stored, id: 202, email: "y@example.test" };
    await act(async () => screen.getByText("Refresh").click());
    await screen.findByText("202");
    expect(mocks.setTheme).toHaveBeenLastCalledWith("light");
    expect(mocks.saved.get(101)).toBe("goodstorage");
  });

  it("saves Y without overwriting X and restores Y on a fresh device", async () => {
    mocks.stored = { ...mocks.stored, id: 202, email: "y@example.test" };
    const first = render(<UserProvider><Probe /></UserProvider>);
    await screen.findByText("202");
    await act(async () => screen.getByText("Save GoodStorage").click());
    await waitFor(() => expect(mocks.saved.get(202)).toBe("goodstorage"));
    expect(mocks.saved.get(101)).toBe("goodstorage");
    first.unmount();
    localStorage.clear();
    mocks.setTheme.mockClear();
    render(<UserProvider><Probe /></UserProvider>);
    await screen.findByText("202");
    expect(mocks.setTheme).toHaveBeenLastCalledWith("goodstorage");
  });

  it("does not apply or claim a saved theme when persistence fails", async () => {
    mocks.saved.set(101, "light");
    render(<UserProvider><Probe /></UserProvider>);
    await screen.findByText("101");
    mocks.failSave = true;
    await act(async () => screen.getByText("Save GoodStorage").click());
    expect(mocks.saved.get(101)).toBe("light");
    expect(mocks.setTheme).toHaveBeenLastCalledWith("light");
  });
});