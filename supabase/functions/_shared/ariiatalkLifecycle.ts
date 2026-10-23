/** Only apply after the WhatsApp provider has accepted the outgoing message. */
export function sentConversationUpdate(messageText: string, sentAt: string) {
  return {
    ultima_mensagem: messageText,
    ultima_mensagem_em: sentAt,
    atualizado_em: sentAt,
    status: "open",
    encerrado_em: null,
    encerrado_por: null,
  };
}