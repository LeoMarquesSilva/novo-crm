import type { InvestimentoTipoDef, InvestimentoSubtipoDef } from "@/data/proposta-investimento-catalog";
import {
  mergePlaceholderKeys,
  type PropostaAreaKey,
  type PropostaTiposCatalog,
  type SubtipoDef,
  type TipoDef,
} from "@/data/proposta-tipos-catalog";
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

/** Campos pedidos na inclusão: chaves declaradas + `[CHAVE]` do template. */
export function scopeSubtypeFieldKeys(sub: SubtipoDef | undefined): string[] {
  if (!sub) return [];
  return mergePlaceholderKeys(sub.placeholderKeys, sub.escopoTemplate);
}

export function investmentSubtypeFieldKeys(sub: InvestimentoSubtipoDef | undefined): string[] {
  if (!sub) return [];
  return mergePlaceholderKeys(sub.placeholderKeys, sub.template);
}
