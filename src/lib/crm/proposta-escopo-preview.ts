import {
  formatNumberPtBr2,
  parseBrlUserInput,
  valorReaisPorExtensoPtBr,
} from "@/lib/crm/proposta-valor-brl-extenso";

/** Chaves cujo valor é salvo e mostrado em MAIÚSCULAS (exceto máscara de processo). `RESUMO_DO_PROCESSO` fica de fora (texto livre). */
export const ESCOPO_PLACEHOLDER_UPPERCASE = new Set([
  "TIPO DA AÇÃO",
  "PARTE_CONTRÁRIA",
  "VALOR_CAUSA",
]);

/** Placeholder da razão social na proposta (não forçar maiúsculas). */
export const ESCOPO_PLACEHOLDER_NOME_EMPRESA = "NOME EMPRESA";

/** Detecta chave de número de processo (máscara CNJ). */
export function isNumeroProcessoPlaceholderKey(key: string): boolean {
  const k = key.trim().toUpperCase();
  return k.includes("NUM") && k.includes("PROCESSO");
}

/** Placeholders de investimento tratados como valor monetário (número pt-BR + extenso). */
export const PROPOSTA_INVESTIMENTO_PLACEHOLDER_CURRENCY = new Set([
  "VALORMENSAL",
  "VALORMENSALESCALONADO",
  "VALORMENSALVARIAVEL",
  "VALORHORA",
  "VALORMENSALESTIMADO",
  "VALORMENSALBASE",
  "VALORSPOT",
  "VALORPARCELA",
  "VALORMANUTENCAO",
  "VALOREXITO",
]);

/** Formata até 20 dígitos no padrão CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO */
export function maskNumeroProcessoCNJ(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 20);
  if (d.length === 0) return "";
  const p: string[] = [];
  p.push(d.slice(0, Math.min(7, d.length)));
  if (d.length > 7) p.push(d.slice(7, Math.min(9, d.length)));
  if (d.length > 9) p.push(d.slice(9, Math.min(13, d.length)));
  if (d.length > 13) p.push(d.slice(13, Math.min(14, d.length)));
  if (d.length > 14) p.push(d.slice(14, Math.min(16, d.length)));
  if (d.length > 16) p.push(d.slice(16, 20));
  let s = p[0] ?? "";
  if (p[1] !== undefined) s += `-${p[1]}`;
  if (p[2] !== undefined) s += `.${p[2]}`;
  if (p[3] !== undefined) s += `.${p[3]}`;
  if (p[4] !== undefined) s += `.${p[4]}`;
  if (p[5] !== undefined) s += `.${p[5]}`;
  return s;
}

/**
 * Substitui `[chaves]` pelo texto em `placeholders`; `NOME EMPRESA` vazio usa `defaultNomeEmpresa` se existir.
 */
export function mergeEscopoTemplate(
  template: string,
  placeholders: Record<string, string>,
  opts: { defaultNomeEmpresa?: string | null },
): string {
  return template.replace(/\[([^\]]+)\]/g, (_, inner: string) => {
    const key = inner.trim();
    let v = placeholders[key];
    if ((v == null || v === "") && key === ESCOPO_PLACEHOLDER_NOME_EMPRESA) {
      v = opts.defaultNomeEmpresa ?? "";
    }
    return v ?? "";
  });
}

/**
 * Substitui placeholders no texto de investimento; valores monetários viram `9.999,99 (nove mil...)`
 * (sem `R$` extra — o modelo já inclui `R$` antes do colchete quando aplicável).
 */
export function mergeInvestimentoTemplate(
  template: string,
  placeholders: Record<string, string>,
  opts: { defaultNomeEmpresa?: string | null } = {},
): string {
  return template.replace(/\[([^\]]+)\]/g, (_, inner: string) => {
    const key = inner.trim();
    let v = placeholders[key];
    if ((v == null || v === "") && key === ESCOPO_PLACEHOLDER_NOME_EMPRESA) {
      v = opts.defaultNomeEmpresa ?? "";
    }
    if (v == null || v === "") return "";
    if (PROPOSTA_INVESTIMENTO_PLACEHOLDER_CURRENCY.has(key)) {
      const n = parseBrlUserInput(String(v));
      if (n == null) return String(v);
      const numPart = formatNumberPtBr2(n);
      const ex = valorReaisPorExtensoPtBr(n);
      return `${numPart} (${ex})`;
    }
    return String(v);
  });
}
