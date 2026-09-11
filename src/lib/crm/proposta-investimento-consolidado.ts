import {
  PROPOSTA_INVESTIMENTO_TIPOS_CATALOG,
  type InvestimentoTipoDef,
} from "@/data/proposta-investimento-catalog";
import type {
  PropostaEscopoDetalhe,
  PropostaInvestimentoDocumento,
  PropostaInvestimentoDocumentoItem,
} from "@/data/proposta-tipos-catalog";
import { findInvestmentSubtype } from "@/lib/crm/proposal-catalog-utils";
import { getEscopoEntriesForArea } from "@/lib/crm/proposta-escopo-entry";
import {
  createEmptyInvestimentoDocumentoItem,
  createInvestimentoDocumentoItemId,
} from "@/lib/crm/proposta-escopo-json";
import { mergeInvestimentoTemplate } from "@/lib/crm/proposta-escopo-preview";
import {
  investmentSubtypeHasParcelas,
  validateParcelasPlaceholders,
} from "@/lib/crm/proposta-investimento-parcelas";
import { PROPOSTA_INVESTIMENTO_PLACEHOLDER_CURRENCY } from "@/lib/crm/proposta-escopo-preview";
import { applyTributacaoPhrase } from "@/lib/crm/proposta-tributacao";
import {
  formatNumberPtBr2,
  parseBrlUserInput,
} from "@/lib/crm/proposta-valor-brl-extenso";

/** Chave monetária principal usada na soma por subtipo de investimento. */
export function getPrimarySumKeyForSubtipo(subtipoId: string): string | null {
  switch (subtipoId) {
    case "mensal_fixo":
      return "VALORMENSAL";
    case "mensal_escalonado":
      return "VALORMENSALESCALONADO";
    case "mensal_variavel":
      return "VALORMENSALVARIAVEL";
    case "mensal_variavel_hora":
      return "VALORMENSALESTIMADO";
    case "mensal_condicionado":
      return "VALORMENSALBASE";
    case "spot":
    case "spot_condicionado":
    case "spot_mais_exito":
      return "VALORSPOT";
    case "manutencao":
      return "VALORMANUTENCAO";
    case "exito_valor_fixo":
      return "VALOREXITO";
    case "mensal_mais_exito":
      return "VALORMENSAL";
    default:
      return null;
  }
}

function copyNonCurrencyPlaceholders(
  source: Record<string, string>,
  targetSubtipoKeys: string[],
): Record<string, string> {
  const keysSet = new Set(targetSubtipoKeys);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!value.trim()) continue;
    if (!keysSet.has(key)) continue;
    if (PROPOSTA_INVESTIMENTO_PLACEHOLDER_CURRENCY.has(key)) continue;
    if (key === "PARCELAS" || key === "VALORPARCELA" || key === "DETALHEPARCELAS") continue;
    out[key] = value;
  }
  return out;
}

/** Soma valores primários de investimento de todas as áreas/blocos. */
export function sumInvestimentoAreas(
  escopo: PropostaEscopoDetalhe,
  areas: string[],
  investmentCatalog: InvestimentoTipoDef[] = PROPOSTA_INVESTIMENTO_TIPOS_CATALOG,
): number {
  let total = 0;
  for (const area of areas) {
    for (const entry of getEscopoEntriesForArea(escopo, area)) {
      const inv = entry.investimento;
      if (!inv?.subtipoId?.trim()) continue;
      const sumKey = getPrimarySumKeyForSubtipo(inv.subtipoId);
      if (!sumKey) continue;
      const invSub = findInvestmentSubtype(
        investmentCatalog,
        inv.tipoId,
        inv.subtipoId,
      );
      if (!invSub) continue;
      const raw = inv.placeholders?.[sumKey] ?? "";
      const n = parseBrlUserInput(raw);
      if (n != null && n > 0) total += n;
    }
  }
  return total;
}

/** Primeira entrada com investimento tipo+subtipo preenchidos (ordem das áreas). */
export function findFirstInvestimentoEntry(
  escopo: PropostaEscopoDetalhe,
  areas: string[],
) {
  for (const area of areas) {
    for (const entry of getEscopoEntriesForArea(escopo, area)) {
      const inv = entry.investimento;
      if (inv?.tipoId?.trim() && inv?.subtipoId?.trim()) {
        return inv;
      }
    }
  }
  return undefined;
}

/** Detecta subtipos distintos entre áreas (aviso na UI). */
export function collectDistinctInvestimentoSubtipos(
  escopo: PropostaEscopoDetalhe,
  areas: string[],
): string[] {
  const set = new Set<string>();
  for (const area of areas) {
    for (const entry of getEscopoEntriesForArea(escopo, area)) {
      const sub = entry.investimento?.subtipoId?.trim();
      if (sub) set.add(sub);
    }
  }
  return [...set];
}

export function getInvestimentoDocumentoItems(
  doc: PropostaInvestimentoDocumento | undefined,
): PropostaInvestimentoDocumentoItem[] {
  if (!doc) return [];
  if (Array.isArray(doc.items) && doc.items.length > 0) {
    return doc.items.map((item, index) => ({
      id: item.id || `inv-${index}`,
      tipoId: item.tipoId ?? "",
      subtipoId: item.subtipoId ?? "",
      placeholders: { ...(item.placeholders ?? {}) },
      ...(item.autoSum === false ? { autoSum: false } : {}),
    }));
  }
  if (
    doc.tipoId.trim() ||
    doc.subtipoId.trim() ||
    Object.values(doc.placeholders ?? {}).some((v) => v.trim())
  ) {
    return [
      {
        id: "inv-0",
        tipoId: doc.tipoId,
        subtipoId: doc.subtipoId,
        placeholders: { ...(doc.placeholders ?? {}) },
        ...(doc.autoSum === false ? { autoSum: false } : {}),
      },
    ];
  }
  return [];
}

export function documentoFromItems(
  items: PropostaInvestimentoDocumentoItem[],
): PropostaInvestimentoDocumento | undefined {
  const list = items.map((item) => ({
    ...item,
    id: item.id || createInvestimentoDocumentoItemId(),
    placeholders: { ...(item.placeholders ?? {}) },
  }));
  if (list.length === 0) return undefined;
  const first = list[0]!;
  return {
    tipoId: first.tipoId,
    subtipoId: first.subtipoId,
    placeholders: first.placeholders,
    autoSum: first.autoSum !== false,
    items: list,
  };
}

function resolveDocumentoItem(
  item: PropostaInvestimentoDocumentoItem,
  escopo: PropostaEscopoDetalhe,
  areas: string[],
  investmentCatalog: InvestimentoTipoDef[],
  applyAreaSum: boolean,
): PropostaInvestimentoDocumentoItem {
  const sumKey = getPrimarySumKeyForSubtipo(item.subtipoId.trim());
  const autoSum = item.autoSum !== false;
  const placeholders = { ...(item.placeholders ?? {}) };
  if (applyAreaSum && autoSum && sumKey) {
    const total = sumInvestimentoAreas(escopo, areas, investmentCatalog);
    if (total > 0) placeholders[sumKey] = formatNumberPtBr2(total);
  }
  return {
    ...item,
    placeholders,
    ...(autoSum ? {} : { autoSum: false }),
  };
}

/** Deriva bloco consolidado a partir das áreas (sem meta salva). */
export function deriveInvestimentoDocumentoFromAreas(
  escopo: PropostaEscopoDetalhe,
  areas: string[],
  investmentCatalog: InvestimentoTipoDef[] = PROPOSTA_INVESTIMENTO_TIPOS_CATALOG,
): PropostaInvestimentoDocumento | undefined {
  const first = findFirstInvestimentoEntry(escopo, areas);
  if (!first) return undefined;

  const invSub = findInvestmentSubtype(
    investmentCatalog,
    first.tipoId,
    first.subtipoId,
  );
  const sumKey = getPrimarySumKeyForSubtipo(first.subtipoId);
  const total = sumInvestimentoAreas(escopo, areas, investmentCatalog);
  const placeholders: Record<string, string> = {
    ...copyNonCurrencyPlaceholders(
      first.placeholders ?? {},
      invSub?.placeholderKeys ?? [],
    ),
  };
  if (sumKey && total > 0) {
    placeholders[sumKey] = formatNumberPtBr2(total);
  }

  return documentoFromItems([
    {
      id: createInvestimentoDocumentoItemId(),
      tipoId: first.tipoId,
      subtipoId: first.subtipoId,
      placeholders,
      autoSum: true,
    },
  ]);
}

/** Resolve meta salva ou deriva; aplica soma automática quando `autoSum !== false`. */
export function resolveInvestimentoDocumento(
  escopo: PropostaEscopoDetalhe,
  areas: string[],
  saved: PropostaInvestimentoDocumento | undefined,
  investmentCatalog: InvestimentoTipoDef[] = PROPOSTA_INVESTIMENTO_TIPOS_CATALOG,
): PropostaInvestimentoDocumento | undefined {
  const base = saved ?? deriveInvestimentoDocumentoFromAreas(escopo, areas, investmentCatalog);
  if (!base) return undefined;

  const items = getInvestimentoDocumentoItems(base);
  if (items.length === 0) return undefined;

  let usedAreaSum = false;
  const resolvedItems = items.map((item) => {
    const sumKey = getPrimarySumKeyForSubtipo(item.subtipoId.trim());
    const applyAreaSum = !usedAreaSum && item.autoSum !== false && Boolean(sumKey);
    if (applyAreaSum) usedAreaSum = true;
    return resolveDocumentoItem(item, escopo, areas, investmentCatalog, applyAreaSum);
  });
  return documentoFromItems(resolvedItems);
}

function isDocumentoItemComplete(
  item: PropostaInvestimentoDocumentoItem,
  investmentCatalog: InvestimentoTipoDef[],
): boolean {
  if (!item.tipoId.trim() || !item.subtipoId.trim()) return false;
  const invSub = findInvestmentSubtype(investmentCatalog, item.tipoId, item.subtipoId);
  if (!invSub) return false;
  const invPh = item.placeholders ?? {};
  if (investmentSubtypeHasParcelas(invSub.placeholderKeys)) {
    if (!validateParcelasPlaceholders(invPh)) return false;
  }
  for (const k of invSub.placeholderKeys) {
    if (k === "PARCELAS" || k === "VALORPARCELA" || k === "DETALHEPARCELAS") continue;
    const v = invPh[k]?.trim() ?? "";
    if (!v) return false;
  }
  return true;
}

export function isInvestimentoDocumentoComplete(
  doc: PropostaInvestimentoDocumento | undefined,
  investmentCatalog: InvestimentoTipoDef[] = PROPOSTA_INVESTIMENTO_TIPOS_CATALOG,
): boolean {
  const items = getInvestimentoDocumentoItems(doc).filter(
    (item) =>
      item.tipoId.trim() ||
      item.subtipoId.trim() ||
      Object.values(item.placeholders ?? {}).some((value) => value.trim()),
  );
  if (items.length === 0) return false;
  return items.every((item) => isDocumentoItemComplete(item, investmentCatalog));
}

export function buildInvestimentoDocumentoText(
  doc: PropostaInvestimentoDocumento | undefined,
  investmentCatalog: InvestimentoTipoDef[] = PROPOSTA_INVESTIMENTO_TIPOS_CATALOG,
  opts: { defaultNomeEmpresa?: string | null; tributacao?: string | null } = {},
): string {
  const text = getInvestimentoDocumentoItems(doc)
    .map((item) => {
      if (!item.tipoId.trim() || !item.subtipoId.trim()) return "";
      const invSub = findInvestmentSubtype(investmentCatalog, item.tipoId, item.subtipoId);
      if (!invSub) return "";
      return mergeInvestimentoTemplate(invSub.template, item.placeholders ?? {}, opts).trim();
    })
    .filter(Boolean)
    .join("\n\n");
  return applyTributacaoPhrase(text, opts.tributacao ?? "");
}

export { createEmptyInvestimentoDocumentoItem };
