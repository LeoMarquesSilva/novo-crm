export function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export function normalizeGroupKey(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isCnpj(digits: string): boolean {
  return digits.length === 14;
}

export function isCpf(digits: string): boolean {
  return digits.length === 11;
}

export function cnpjRoot(value: string | null | undefined): string {
  const digits = digitsOnly(value);
  return isCnpj(digits) ? digits.slice(0, 8) : "";
}

export function isCnpjMatriz(value: string | null | undefined): boolean {
  const digits = digitsOnly(value);
  return isCnpj(digits) && digits.slice(8, 12) === "0001";
}
