/**
 * Abertura do objeto ("O presente Contrato tem por objeto…") só no primeiro escopo do contrato. Nos seguintes ela
 * sai e o texto começa pelo próprio objeto: "A prestação de serviços advocatícios na área trabalhista…"
 * (pedido de 16/11/2026). Texto que não começa com uma abertura conhecida volta como veio.
 */
const ABERTURAS: Array<{ re: RegExp; artigo?: (contracao: string) => string }> = [
  { re: /^\s*O\s+(?:presente\s+)?Contrato\s+tem\s+por\s+objeto\s+/i },
  { re: /^\s*O\s+objeto\s+(?:deste|do\s+presente)\s+Contrato\s+(?:é|inclui)\s+/i },
  {
    // "consiste na disponibilização…" → "A disponibilização…"; "consiste em …" → "…".
    re: /^\s*O\s+objeto\s+(?:deste|do\s+presente)\s+Contrato\s+consiste\s+(em|na|no|nas|nos)\s+/i,
    artigo: (c) => ({ em: "", na: "a ", no: "o ", nas: "as ", nos: "os " })[c.toLowerCase()] ?? "",
  },
];

export function semAberturaDoObjeto(texto: string): string {
  for (const { re, artigo } of ABERTURAS) {
    const m = re.exec(texto);
    if (!m) continue;
    const resto = `${artigo ? artigo(m[1] ?? "") : ""}${texto.slice(m[0].length)}`;
    if (!resto.trim()) return texto;
    return resto.charAt(0).toLocaleUpperCase("pt-BR") + resto.slice(1);
  }
  return texto;
}
