import { useCallback, useState } from "react";

// Session-only: no chat content is persisted to browser storage.
export function useConversationDraft(userId: number | undefined, conversationId: string | null) {
  const [state, setState] = useState<{ owner: number | undefined; drafts: Record<string, string> }>({ owner: userId, drafts: {} });
  const text = state.owner === userId && conversationId ? state.drafts[conversationId] ?? "" : "";

  const saveDraft = useCallback((id: string, value: string) => {
    setState(current => {
      const drafts = current.owner === userId ? { ...current.drafts } : {};
      if (value) drafts[id] = value;
      else delete drafts[id];
      return { owner: userId, drafts };
    });
  }, [userId]);

  const setText = useCallback((value: string) => {
    if (conversationId) saveDraft(conversationId, value);
  }, [conversationId, saveDraft]);

  return { text, setText, saveDraft };
}