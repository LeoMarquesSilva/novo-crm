import {
  PROPOSTA_INVESTIMENTO_TIPOS_CATALOG,
  type InvestimentoTipoDef,
} from "@/data/proposta-investimento-catalog";
import type {
  PropostaEscopoDetalhe,
  PropostaInvestimentoDocumento,
} from "@/data/proposta-tipos-catalog";
import { findInvestmentSubtype } from "@/lib/crm/proposal-catalog-utils";
import { getEscopoEntriesForArea } from "@/lib/crm/proposta-escopo-entry";
import { mergeInvestimentoTemplate } from "@/lib/crm/proposta-escopo-preview";
import {
  investmentSubtypeHasParcelas,
  validateParcelasPlaceholders,
} from "@/lib/crm/proposta-investimento-parcelas";
import { PROPOSTA_INVESTIMENTO_PLACEHOLDER_CURRENCY } from "@/lib/crm/proposta-escopo-preview";
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

  return {
    tipoId: first.tipoId,
    subtipoId: first.subtipoId,
    placeholders,
    autoSum: true,
  };
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

  const subtipoId = base.subtipoId.trim();
  const sumKey = getPrimarySumKeyForSubtipo(subtipoId);
  const autoSum = base.autoSum !== false;

  if (!autoSum || !sumKey) {
    return {
      tipoId: base.tipoId,
      subtipoId: base.subtipoId,
      placeholders: { ...(base.placeholders ?? {}) },
      autoSum: base.autoSum,
    };
  }

  const total = sumInvestimentoAreas(escopo, areas, investmentCatalog);
  const placeholders = { ...(base.placeholders ?? {}) };
  if (total > 0) {
    placeholders[sumKey] = formatNumberPtBr2(total);
  }

  return {
    tipoId: base.tipoId,
    subtipoId: base.subtipoId,
    placeholders,
    autoSum: true,
  };
}

export function isInvestimentoDocumentoComplete(
  doc: PropostaInvestimentoDocumento | undefined,
  investmentCatalog: InvestimentoTipoDef[] = PROPOSTA_INVESTIMENTO_TIPOS_CATALOG,
): boolean {
  if (!doc?.tipoId?.trim() || !doc?.subtipoId?.trim()) return false;
  const invSub = findInvestmentSubtype(investmentCatalog, doc.tipoId, doc.subtipoId);
  if (!invSub) return false;
  const invPh = doc.placeholders ?? {};
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

export function buildInvestimentoDocumentoText(
  doc: PropostaInvestimentoDocumento | undefined,
  investmentCatalog: InvestimentoTipoDef[] = PROPOSTA_INVESTIMENTO_TIPOS_CATALOG,
  opts: { defaultNomeEmpresa?: string | null } = {},
): string {
  if (!doc?.tipoId?.trim() || !doc?.subtipoId?.trim()) return "";
  const invSub = findInvestmentSubtype(investmentCatalog, doc.tipoId, doc.subtipoId);
  if (!invSub) return "";
  return mergeInvestimentoTemplate(invSub.template, doc.placeholders ?? {}, opts).trim();
}
