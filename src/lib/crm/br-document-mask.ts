/** Máscaras CPF/CNPJ alinhadas ao formulário de nova demanda. */

export function maskCpf(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function maskCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  }
  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function maskDocument(value: string, type: "CPF" | "CNPJ"): string {
  return type === "CPF" ? maskCpf(value) : maskCnpj(value);
}

/** CPF ou CNPJ pelo número de dígitos (até 11 = CPF), para campo que aceita os dois. */
export function maskCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length <= 11 ? maskCpf(digits) : maskCnpj(digits);
}

/**
 * Campos do funil gravados como texto que guardam documento (ex.: `cnpj_cpf_financeiro`): máscara pelo
 * código, já que o tipo no banco é "text". CEP fica de fora: `cp_cliente_cep` é gravado só com números.
 */
export function maskForFieldCode(code: string): ((value: string) => string) | null {
  const c = code.toLowerCase();
  if (/(^|_)(cnpj|cpf)(_|$)/.test(c)) return maskCpfCnpj;
  return null;
}

/** Telefone BR enquanto digita: (35) 3333-4444 (fixo) ou (35) 98875-4584 (celular); +55 inicial sai. */
export function maskPhoneBr(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  digits = digits.slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (rest.length <= 4) return `(${ddd}) ${rest}`;
  const split = rest.length === 9 ? 5 : 4;
  return `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`;
}
