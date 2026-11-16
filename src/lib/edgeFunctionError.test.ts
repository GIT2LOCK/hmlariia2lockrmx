import { describe, expect, it } from "vitest";
import { edgeErrorCode } from "./edgeFunctionError";

function httpError(body: unknown, status = 502) {
  const response = new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
  return { message: `Edge function returned ${status}: Error, ${JSON.stringify(body)}`, context: response };
}

describe("edgeErrorCode", () => {
  it("recupera o código quando a função responde 502 (data vem nulo)", async () => {
    const result = {
      data: null,
      error: httpError({ error: "evolution_status_failed" }),
    };
    expect(await edgeErrorCode(result)).toBe("evolution_status_failed");
  });

  it("recupera o código quando vem no corpo de uma resposta 2xx", async () => {
    expect(await edgeErrorCode({ data: { error: "folder_exists" }, error: null })).toBe("folder_exists");
  });

  it("devolve null quando a chamada deu certo", async () => {
    expect(await edgeErrorCode({ data: { instances: [] }, error: null })).toBeNull();
  });

  it("devolve null quando o corpo do erro não é JSON", async () => {
    const result = { data: null, error: httpError("bad gateway", 502) };
    expect(await edgeErrorCode(result)).toBeNull();
  });

  it("devolve null quando o erro não traz a resposta", async () => {
    expect(await edgeErrorCode({ data: null, error: { message: "Failed to fetch" } })).toBeNull();
  });

  it("não consome o corpo da resposta (dá para ler de novo)", async () => {
    const error = httpError({ error: "forbidden" });
    expect(await edgeErrorCode({ data: null, error })).toBe("forbidden");
    await expect((error.context as Response).json()).resolves.toEqual({ error: "forbidden" });
  });
});
