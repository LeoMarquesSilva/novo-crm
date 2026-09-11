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
import { findScopeSubtype, scopeSubtypeFieldKeys } from "@/lib/crm/proposal-catalog-utils";
import { normalizeEntriesForArea, isInvestimentoDocumentoMetaKey } from "@/lib/crm/proposta-escopo-json";

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
    if (isInvestimentoDocumentoMetaKey(key)) continue;
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

/**
 * Investimento não faz mais parte da completude por bloco de escopo — o valor
 * (total) e a forma de pagamento agora vivem só na seção consolidada, no final
 * do modal (ver `isInvestimentoDocumentoComplete` em
 * `proposta-investimento-consolidado.ts`, que é o gate real disso na geração
 * do Word). `investmentCatalog` fica no parâmetro só por compatibilidade de
 * assinatura com os chamadores existentes.
 */
export function isEscopoEntryCompleteWithCatalog(
  areaKeyFromRow: string,
  entry: PropostaEscopoDetalheEntry | undefined,
  scopeCatalog: PropostaTiposCatalog,
  _investmentCatalog: InvestimentoTipoDef[],
): boolean {
  if (!entry?.tipoId?.trim() || !entry?.subtipoId?.trim()) return false;
  const catalogArea = normalizePracticeAreaKey(areaKeyFromRow);
  const sub = findScopeSubtype(scopeCatalog, catalogArea, entry.tipoId, entry.subtipoId);
  if (!sub) return false;
  const keys = scopeSubtypeFieldKeys(sub);
  for (const k of keys) {
    const v = entry.placeholders?.[k]?.trim() ?? "";
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
