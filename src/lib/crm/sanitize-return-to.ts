/** Caminho interno do CRM para voltar depois de uma ação; qualquer outra coisa é ignorada. */
export function sanitizeReturnTo(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value.startsWith("/crm/") && value !== "/crm") return null;
  if (value.startsWith("//") || value.includes("\\") || /[\r\n]/.test(value)) return null;
  return value;
}
