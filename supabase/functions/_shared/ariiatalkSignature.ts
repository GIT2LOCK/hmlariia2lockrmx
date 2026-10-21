export function normalizeSignature(value: unknown): string {
  if (typeof value !== "string") throw new Error("invalid_signature");
  const signature = value.trim();
  if (signature.length > 80 || /[\r\n\x00-\x1f]/.test(signature)) throw new Error("invalid_signature");
  return signature.replace(/:+$/, "").trim();
}

export function outgoingText(text: string, signature: string): string {
  return signature ? `${signature}:\n\n${text}` : text;
}

export function matchesOutboundEcho(message: { texto_whatsapp: string | null; direcao: string; enviado_por: number | null }, content: string | null): boolean {
  return message.direcao === "saida" && message.enviado_por !== null && content !== null && message.texto_whatsapp === content;
}