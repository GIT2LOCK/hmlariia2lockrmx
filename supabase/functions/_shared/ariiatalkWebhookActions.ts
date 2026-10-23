export function quotedContext(message: any) {
  const context = message?.extendedTextMessage?.contextInfo ?? message?.imageMessage?.contextInfo ?? message?.videoMessage?.contextInfo ?? message?.documentMessage?.contextInfo ?? message?.audioMessage?.contextInfo;
  if (!context?.stanzaId) return null;
  const quoted = context.quotedMessage ?? {};
  return { evolutionId: context.stanzaId, snapshot: { autor_nome: "Mensagem citada", conteudo: quoted.conversation ?? quoted.extendedTextMessage?.text ?? quoted.imageMessage?.caption ?? "[Mídia]" } };
}

export function editedContent(message: any) {
  const protocol = message?.protocolMessage ?? message?.editedMessage?.message?.protocolMessage;
  if (!protocol?.editedMessage || !protocol?.key?.id) return null;
  const text = protocol.editedMessage.conversation ?? protocol.editedMessage.extendedTextMessage?.text;
  return typeof text === "string" ? { evolutionId: protocol.key.id, text } : null;
}

export function cleanEditedText(text: string, signature: string | null) {
  const prefix = signature ? `${signature}:\n\n` : "";
  return prefix && text.startsWith(prefix) ? text.slice(prefix.length) : text;
}