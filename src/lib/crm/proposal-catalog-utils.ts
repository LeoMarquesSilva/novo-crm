import type { InvestimentoTipoDef } from "@/data/proposta-investimento-catalog";
import type { PropostaAreaKey, PropostaTiposCatalog } from "@/data/proposta-tipos-catalog";
import { normalizePracticeAreaKey } from "@/lib/crm/area-keys-alignment";

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
  const tipos = catalog[area as keyof PropostaTiposCatalog] ?? [];
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
