// IDs de usuários internos/ocultos que não devem aparecer em listagens
// Esses usuários são filtrados de todas as listagens do sistema
export const HIDDEN_USER_IDS: number[] = [21];

// Mapeamento de nomes visuais (nome exibido no site diferente do banco)
// Chave: user_id, Valor: nome visual a ser exibido
export const DISPLAY_NAME_OVERRIDES: Record<number, string> = {
  21: "Thamires G.",
};

// Helper para verificar se um user_id deve ser oculto
export function isHiddenUser(userId: number): boolean {
  return HIDDEN_USER_IDS.includes(userId);
}

// Helper para obter o nome visual de um usuário
export function getDisplayName(userId: number, originalName: string): string {
  return DISPLAY_NAME_OVERRIDES[userId] || originalName;
}
