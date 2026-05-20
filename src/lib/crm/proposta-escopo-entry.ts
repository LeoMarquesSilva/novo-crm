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

/** Entrada no JSON pode estar na chave legada (`Civel`) ou canónica (`Cível`). */
export function getEscopoEntryForArea(
  escopo: PropostaEscopoDetalhe,
  areaKey: string,
): PropostaEscopoDetalheEntry | undefined {
  const k = areaKey.trim();
  if (escopo[k]) return escopo[k];
  const canon = normalizePracticeAreaKey(k);
  if (canon !== k && escopo[canon]) return escopo[canon];
  for (const [key, val] of Object.entries(escopo)) {
    if (normalizePracticeAreaKey(key) === canon) return val;
  }
  return undefined;
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
  for (const k of invSub.placeholderKeys) {
    const v = inv.placeholders?.[k]?.trim() ?? "";
    if (!v) return false;
  }
  return true;
}
