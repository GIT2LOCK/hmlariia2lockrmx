/**
 * Máscara progressiva de telefone para inputs de contato.
 * Aceita formato brasileiro com DDD e, opcionalmente, prefixo internacional "+".
 * Bloqueia letras e qualquer caractere que não seja dígito (o "+" inicial).
 * Exemplos: "11912345678" -> "(11) 91234-5678" | "+5511912345678" -> "+55 (11) 91234-5678"
 */
export function maskPhoneInput(value: string): string {
  const hasPlus = value.trimStart().startsWith("+");
  let digits = value.replace(/\D/g, "");
  if (hasPlus) {
    digits = digits.slice(0, 13);
    if (digits.length <= 2) return "+" + digits;
    return `+${digits.slice(0, 2)} ${formatNational(digits.slice(2))}`.trimEnd();
  }
  return formatNational(digits.slice(0, 11));
}

function formatNational(digits: string): string {
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  const area = digits.slice(0, 2);
  const rest = digits.slice(2, 11);
  if (rest.length <= 5) return `(${area}) ${rest}`;
  return `(${area}) ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
}

/** Somente dígitos, para validação/envio. */
export function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}
