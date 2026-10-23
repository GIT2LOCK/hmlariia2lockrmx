export type ActionMessage = {
  id: string; conversa_id: string; evolution_message_id: string | null;
  direcao: string; tipo: string; conteudo: string | null;
  enviado_por: number | null; autor_nome?: string | null; status: string;
  texto_whatsapp?: string | null; payload?: any;
};

export function canEditMessage(message: ActionMessage, userId: number | undefined) {
  return userId != null && message.enviado_por === userId && message.direcao === "saida"
    && ["text", "texto"].includes(message.tipo) && Boolean(message.evolution_message_id)
    && !["erro", "enviando", "pendente"].includes(message.status);
}

export function quoteSnapshot(message: ActionMessage) {
  return { id: message.id, autor_nome: message.autor_nome || (message.direcao === "entrada" ? "Contato" : "WhatsApp / dispositivo"), conteudo: message.conteudo || `[${message.tipo}]` };
}

export function buildQuoted(message: ActionMessage, conversationId: string, remoteJid: string) {
  if (message.conversa_id !== conversationId || !message.evolution_message_id) throw new Error("invalid_reply_target");
  return {
    key: { id: message.evolution_message_id, remoteJid, fromMe: message.direcao === "saida" },
    message: message.payload?.message ?? message.payload?.data?.message ?? { conversation: message.texto_whatsapp || message.conteudo || `[${message.tipo}]` },
  };
}