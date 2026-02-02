// IDs de usuários internos/ocultos que não devem aparecer em listagens
// Esses usuários são filtrados de todas as listagens do sistema
export const HIDDEN_USER_IDS: number[] = [21];

// Helper para verificar se um user_id deve ser oculto
export function isHiddenUser(userId: number): boolean {
  return HIDDEN_USER_IDS.includes(userId);
}
