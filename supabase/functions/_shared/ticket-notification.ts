type FunctionsClient = {
  functions: {
    invoke: (name: string, options: { body: Record<string, unknown> }) => Promise<{
      data: unknown;
      error: { message?: string } | null;
    }>;
  };
};

export type TicketNotificationResult = {
  ok: boolean;
  error?: string;
  data?: unknown;
};

/**
 * Aguarda a Edge Function de notificação terminar e nunca ignora respostas HTTP de erro.
 * As tentativas adicionais cobrem falhas transitórias entre Edge Functions.
 */
export async function sendTicketNotification(
  supabase: FunctionsClient,
  body: Record<string, unknown>,
  source: string,
  attempts = 3,
): Promise<TicketNotificationResult> {
  const ticketId = Number(body.ticket_id);
  let lastError = "notification_failed";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const { data, error } = await supabase.functions.invoke("send-email-notification", { body });
      const responseError = error?.message ||
        (data && typeof data === "object" && "error" in data
          ? String((data as { error?: unknown }).error || "notification_failed")
          : "");

      if (!responseError) {
        console.log(`[${source}] notification delivered`, { ticket_id: ticketId, attempt });
        return { ok: true, data };
      }
      lastError = responseError;
    } catch (error) {
      lastError = (error as Error)?.message || String(error);
    }

    console.error(`[${source}] notification attempt failed`, {
      ticket_id: ticketId,
      attempt,
      error: lastError,
    });
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }

  return { ok: false, error: lastError };
}