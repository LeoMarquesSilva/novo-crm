/**
 * Nome de pessoa enquanto digita (09/11/2026): primeira letra de cada nome maiúscula e o resto minúsculo
 * ("LUCAS DOURADO" → "Lucas Dourado"). Partículas depois do primeiro nome ficam minúsculas
 * ("Maria Da Silva" → "Maria da Silva"); depois de hífen ou apóstrofo também vira maiúscula
 * ("ana-maria d'avila" → "Ana-Maria D'Avila"). Os espaços ficam como foram digitados, para não
 * atrapalhar quem está no meio da palavra.
 */
const PARTICULAS = new Set(["da", "das", "de", "do", "dos", "e", "di", "du", "del", "van", "von"]);

export function maskNomePessoa(value: string): string {
  let indice = 0;
  return value.replace(/\S+/g, (palavra) => {
    const atual = indice++;
    const minuscula = palavra.toLocaleLowerCase("pt-BR");
    if (atual > 0 && PARTICULAS.has(minuscula)) return minuscula;
    return minuscula.replace(/(^|[-'’])(\p{L})/gu, (_, separador: string, letra: string) =>
      separador + letra.toLocaleUpperCase("pt-BR"),
    );
  });
}

/** Telefone BR com DDD: 10 (fixo) ou 11 (celular) dígitos, sem o +55. */
export function isTelefoneBrValido(value: string): boolean {
  let digits = value.replace(/\D/g, "");
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  return digits.length === 10 || digits.length === 11;
}

export function isEmailValido(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}
