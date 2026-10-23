export type NotifiableConversation = {
  id: string;
  nome_contato: string | null;
  ultima_mensagem: string | null;
  ultima_mensagem_em: string | null;
  nao_lidas: number;
  status: "open" | "closed";
  responsavel_id: number | null;
};

export type AriiaNotification = { kind: "message" | "assigned" | "opened"; conversationId: string; title: string; description: string };

const name = (c: NotifiableConversation) => c.nome_contato || "Contato";

/** Compares two conversation snapshots and returns what the technician should be alerted about. */
export function detectNotifications(prev: NotifiableConversation[] | null, next: NotifiableConversation[], userId: number | null | undefined, ignoreAssignIds: Set<string> = new Set()): AriiaNotification[] {
  if (!prev) return [];
  const before = new Map(prev.map(c => [c.id, c]));
  const out: AriiaNotification[] = [];
  for (const c of next) {
    const old = before.get(c.id);
    if (!old || (old.status === "closed" && c.status === "open")) {
      out.push({ kind: "opened", conversationId: c.id, title: "Conversa aberta", description: name(c) });
      continue;
    }
    if (userId && c.responsavel_id === userId && old.responsavel_id !== userId && !ignoreAssignIds.has(c.id)) {
      out.push({ kind: "assigned", conversationId: c.id, title: "Você foi atribuído a uma conversa", description: name(c) });
    }
    if (c.nao_lidas > old.nao_lidas) {
      out.push({ kind: "message", conversationId: c.id, title: `Nova mensagem de ${name(c)}`, description: (c.ultima_mensagem || "").slice(0, 120) });
    }
  }
  return out;
}

let ctx: AudioContext | null = null;
export function playNotificationSound() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx!.createOscillator(); const gain = ctx!.createGain();
      osc.type = "sine"; osc.frequency.value = freq;
      const s = t + i * 0.14;
      gain.gain.setValueAtTime(0.0001, s);
      gain.gain.exponentialRampToValueAtTime(0.25, s + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, s + 0.25);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(s); osc.stop(s + 0.3);
    });
  } catch { /* audio unavailable */ }
}
