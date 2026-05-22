import { normalizePracticeAreaKey } from "@/lib/crm/area-keys-alignment";
import {
  PROPOSTA_INVESTIMENTO_TIPOS_CATALOG,
  type InvestimentoTipoDef,
} from "@/data/proposta-investimento-catalog";
import {
  PROPOSTA_TIPOS_CATALOG,
  type PropostaEscopoDetalhe,
  type PropostaEscopoDetalheEntry,
  type PropostaTiposCatalog,
} from "@/data/proposta-tipos-catalog";
import { findInvestmentSubtype, findScopeSubtype } from "@/lib/crm/proposal-catalog-utils";
import {
  investmentSubtypeHasParcelas,
  validateParcelasPlaceholders,
} from "@/lib/crm/proposta-investimento-parcelas";
import { normalizeEntriesForArea } from "@/lib/crm/proposta-escopo-json";

/** Entradas no JSON podem estar na chave legada ou canónica da área. */
export function getEscopoEntriesForArea(
  escopo: PropostaEscopoDetalhe,
  areaKey: string,
): PropostaEscopoDetalheEntry[] {
  const k = areaKey.trim();
  if (escopo[k]) return escopo[k].map((e) => ({ ...e }));
  const canon = normalizePracticeAreaKey(k);
  if (canon !== k && escopo[canon]) return escopo[canon].map((e) => ({ ...e }));
  for (const [key, val] of Object.entries(escopo)) {
    if (normalizePracticeAreaKey(key) === canon) {
      return Array.isArray(val) ? val.map((e) => ({ ...e })) : normalizeEntriesForArea(val);
    }
  }
  return [];
}

/** Primeiro bloco da área (compatibilidade com leituras antigas). */
export function getEscopoEntryForArea(
  escopo: PropostaEscopoDetalhe,
  areaKey: string,
): PropostaEscopoDetalheEntry | undefined {
  return getEscopoEntriesForArea(escopo, areaKey)[0];
}

export function isEscopoEntryStarted(entry: PropostaEscopoDetalheEntry | undefined): boolean {
  if (!entry) return false;
  return Boolean(entry.tipoId?.trim() || entry.subtipoId?.trim());
}

/** Mesmas regras que `refreshSolicitacaoConcluidaForEscopoJson` no servidor. */
export function isEscopoEntryComplete(
  areaKeyFromRow: string,
  entry: PropostaEscopoDetalheEntry | undefined,
): boolean {
  return isEscopoEntryCompleteWithCatalog(
    areaKeyFromRow,
    entry,
    PROPOSTA_TIPOS_CATALOG,
    PROPOSTA_INVESTIMENTO_TIPOS_CATALOG,
  );
}

export function isEscopoEntryCompleteWithCatalog(
  areaKeyFromRow: string,
  entry: PropostaEscopoDetalheEntry | undefined,
  scopeCatalog: PropostaTiposCatalog,
  investmentCatalog: InvestimentoTipoDef[],
): boolean {
  if (!entry?.tipoId?.trim() || !entry?.subtipoId?.trim()) return false;
  const catalogArea = normalizePracticeAreaKey(areaKeyFromRow);
  const sub = findScopeSubtype(scopeCatalog, catalogArea, entry.tipoId, entry.subtipoId);
  if (!sub) return false;
  const keys = sub.placeholderKeys ?? [];
  for (const k of keys) {
    const v = entry.placeholders?.[k]?.trim() ?? "";
    if (!v) return false;
  }

  const inv = entry.investimento;
  if (!inv?.tipoId?.trim() || !inv?.subtipoId?.trim()) return false;
  const invSub = findInvestmentSubtype(investmentCatalog, inv.tipoId, inv.subtipoId);
  if (!invSub) return false;
  const invPh = inv.placeholders ?? {};
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

/** Área concluída quando há ao menos um bloco completo e nenhum bloco iniciado está incompleto. */
export function isEscopoAreaComplete(
  areaKeyFromRow: string,
  entries: PropostaEscopoDetalheEntry[] | undefined,
  scopeCatalog: PropostaTiposCatalog = PROPOSTA_TIPOS_CATALOG,
  investmentCatalog: InvestimentoTipoDef[] = PROPOSTA_INVESTIMENTO_TIPOS_CATALOG,
): boolean {
  const list = entries ?? [];
  const started = list.filter(isEscopoEntryStarted);
  if (started.length === 0) return false;
  const anyComplete = started.some((e) =>
    isEscopoEntryCompleteWithCatalog(areaKeyFromRow, e, scopeCatalog, investmentCatalog),
  );
  if (!anyComplete) return false;
  return started.every((e) =>
    isEscopoEntryCompleteWithCatalog(areaKeyFromRow, e, scopeCatalog, investmentCatalog),
  );
}
