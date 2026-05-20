import type { InvestimentoTipoDef } from "@/data/proposta-investimento-catalog";
import type { PropostaTiposCatalog } from "@/data/proposta-tipos-catalog";

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
