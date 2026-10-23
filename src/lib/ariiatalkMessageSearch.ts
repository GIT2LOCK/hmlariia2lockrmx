// Conversation message search: accent-insensitive, case-insensitive matching
// that maps hits back to exact positions in the original text for highlighting.
export function buildNorm(text: string): { norm: string; map: number[] } {
  const chars: string[] = [];
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const normalized = text[i].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    for (const ch of normalized) {
      chars.push(ch);
      map.push(i);
    }
  }
  return { norm: chars.join(""), map };
}

export type SearchedMessage = { conteudo: string | null };

export type MessageMatch<T extends SearchedMessage> = {
  message: T;
  start: number;
  end: number;
};

export function findMessageMatches<T extends SearchedMessage>(messages: T[], search: string): MessageMatch<T>[] {
  const term = buildNorm(search.trim()).norm;
  if (!term) return [];
  const matches: MessageMatch<T>[] = [];
  for (const message of messages) {
    if (!message.conteudo) continue;
    const { norm, map } = buildNorm(message.conteudo);
    const idx = norm.indexOf(term);
    if (idx === -1) continue;
    const start = map[idx];
    const end = (map[idx + term.length - 1] ?? map[map.length - 1] ?? start) + 1;
    matches.push({ message, start, end });
  }
  return matches;
}
