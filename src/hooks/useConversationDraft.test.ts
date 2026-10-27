import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useConversationDraft } from "./useConversationDraft";

it("restores independent drafts when switching conversations", () => {
  const { result, rerender } = renderHook(({ id }) => useConversationDraft(7, id), { initialProps: { id: "a" } });
  act(() => result.current.setText("Problema no link\nUnidade A"));
  rerender({ id: "b" });
  expect(result.current.text).toBe("");
  act(() => result.current.setText("Unidade B"));
  rerender({ id: "a" });
  expect(result.current.text).toBe("Problema no link\nUnidade A");
  act(() => result.current.setText(""));
  rerender({ id: "b" });
  expect(result.current.text).toBe("Unidade B");
});

it("does not show another user's drafts", () => {
  const { result, rerender } = renderHook(({ user }) => useConversationDraft(user, "a"), { initialProps: { user: 7 } });
  act(() => result.current.setText("Interno"));
  rerender({ user: 8 });
  expect(result.current.text).toBe("");
  act(() => result.current.setText("Outro técnico"));
  rerender({ user: 7 });
  expect(result.current.text).toBe("");
});

it("recovers a failed send in its original conversation", () => {
  const { result, rerender } = renderHook(({ id }) => useConversationDraft(7, id), { initialProps: { id: "a" } });
  rerender({ id: "b" });
  act(() => result.current.saveDraft("a", "Tentar novamente"));
  expect(result.current.text).toBe("");
  rerender({ id: "a" });
  expect(result.current.text).toBe("Tentar novamente");
});