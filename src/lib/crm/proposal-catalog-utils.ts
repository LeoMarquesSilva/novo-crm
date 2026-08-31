import type { InvestimentoTipoDef } from "@/data/proposta-investimento-catalog";
import type { PropostaAreaKey, PropostaTiposCatalog, SubtipoDef, TipoDef } from "@/data/proposta-tipos-catalog";
import { normalizePracticeAreaKey } from "@/lib/crm/area-keys-alignment";

/** Rótulo do documento: só o subtipo, nunca o tipo do escopo. */
export function formatScopeTypeLabel(
  _tipo: TipoDef | undefined,
  sub: SubtipoDef | undefined,
): string | null {
  const subLabel = sub?.label?.trim();
  return subLabel || null;
}

export function findScopeTipo(
  catalog: PropostaTiposCatalog,
  area: string,
  tipoId: string,
) {
  const catalogArea = normalizePracticeAreaKey(area) as PropostaAreaKey;
  return (catalog[catalogArea] ?? []).find((item) => item.tipoId === tipoId);
}

export function findScopeSubtype(
  catalog: PropostaTiposCatalog,
  area: string,
  tipoId: string,
  subtipoId: string,
) {
  const catalogArea = normalizePracticeAreaKey(area) as PropostaAreaKey;
  const tipos = catalog[catalogArea] ?? [];
  const tipo = tipos.find((item) => item.tipoId === tipoId);
  return tipo?.subtipos.find((item) => item.subtipoId === subtipoId);
}

export function findInvestmentSubtype(
  catalog: InvestimentoTipoDef[],
  tipoId: string,
  subtipoId: string,
) {
  const tipo = catalog.find((item) => item.tipoId === tipoId);
  return tipo?.subtipos.find((item) => item.subtipoId === subtipoId);
}
