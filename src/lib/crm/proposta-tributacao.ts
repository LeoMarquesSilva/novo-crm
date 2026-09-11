/** Valor canónico em `field_definitions` / RD — honorários com tributos. */
export const TRIBUTACAO_ENGLOBANDO = "Valor Englobando Tributos";
/** Valor canónico — honorários líquidos, sem tributos. */
export const TRIBUTACAO_LIQUIDO = "Valor Líquido de Tributos";

export const PROPOSTA_TRIBUTACAO_OPTIONS = [
  { value: TRIBUTACAO_ENGLOBANDO, label: "Incluindo tributos" },
  { value: TRIBUTACAO_LIQUIDO, label: "Não incluindo tributos" },
] as const;

export const PROPOSTA_TRIBUTACAO_LABELS: Record<string, string> = Object.fromEntries(
  PROPOSTA_TRIBUTACAO_OPTIONS.map((item) => [item.value, item.label]),
);

const PHRASE_INCLUIDOS = "já incluídos os tributos incidentes";
const PHRASE_NAO_INCLUIDOS = "não incluídos os tributos incidentes";

export function normalizeTributacaoValue(raw: string): string {
  const t = raw.trim().toLocaleLowerCase("pt-BR");
  if (!t) return "";
  if (t.includes("englobando") || t === "incluindo tributos") return TRIBUTACAO_ENGLOBANDO;
  if (
    t.includes("líquido") ||
    t.includes("liquido") ||
    t === "não incluindo tributos" ||
    t === "nao incluindo tributos"
  ) {
    return TRIBUTACAO_LIQUIDO;
  }
  return raw.trim();
}

/** Sem escolha, mantém o texto-modelo (tributos incluídos). */
export function isTributosIncluidos(raw: string): boolean {
  return normalizeTributacaoValue(raw) !== TRIBUTACAO_LIQUIDO;
}

export function applyTributacaoPhrase(text: string, tributacao: string): string {
  if (!text.trim()) return text;
  if (isTributosIncluidos(tributacao)) {
    return text.replace(/não incluídos os tributos incidentes/gi, PHRASE_INCLUIDOS);
  }
  return text.replace(/já incluídos os tributos incidentes/gi, PHRASE_NAO_INCLUIDOS);
}
