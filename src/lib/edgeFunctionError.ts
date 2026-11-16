/**
 * Extrai o código de erro devolvido por uma Edge Function do Supabase.
 *
 * Quando a função responde com status diferente de 2xx (ex.: 502), a biblioteca
 * do Supabase devolve `data: null` e coloca a resposta bruta em `error.context`.
 * Sem isso, o app só consegue mostrar o texto cru do erro ("Edge function
 * returned 502: Error, {"error":"..."}") em vez da mensagem amigável.
 */

type InvokeResultLike = {
  data?: unknown;
  error?: unknown;
  response?: unknown;
};

function codeFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.error === "string") return record.error;
  if (typeof record.message === "string") return record.message;
  return null;
}

export async function edgeErrorCode(result: InvokeResultLike): Promise<string | null> {
  const fromData = codeFromBody(result.data);
  if (fromData) return fromData;
  if (!result.error) return null;

  const context = (result.error as { context?: unknown } | null)?.context ?? result.response;
  if (context instanceof Response) {
    try {
      return codeFromBody(await context.clone().json());
    } catch {
      return null;
    }
  }

  return null;
}
