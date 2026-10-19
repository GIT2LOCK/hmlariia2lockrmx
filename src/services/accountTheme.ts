import { getAuthHeaders } from "@/services/authService";

export type AccountTheme = "light" | "dark" | "goodstorage";

export function isAccountTheme(value: unknown): value is AccountTheme {
  return value === "light" || value === "dark" || value === "goodstorage";
}

async function requestTheme(action: "get-theme" | "set-theme", tema?: AccountTheme): Promise<AccountTheme> {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-profile`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ action, ...(tema ? { tema } : {}) }),
  });
  const result = await response.json();
  if (!response.ok || !result.success || !isAccountTheme(result.tema)) {
    throw new Error(result.error || "Não foi possível salvar ou carregar o tema da conta.");
  }
  return result.tema;
}

export const loadAccountTheme = () => requestTheme("get-theme");
export const persistAccountTheme = (tema: AccountTheme) => requestTheme("set-theme", tema);