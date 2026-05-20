import { CrmRepository } from "@/modules/crm/infrastructure/repositories/crm-repository";

export interface CrmOverview {
  totalOportunidades: number;
  totalClientes: number;
  totalContratos: number;
  indicadoresPendentes: number;
}

export async function getCrmOverview(
  repository: CrmRepository,
): Promise<CrmOverview> {
  const [
    totalOportunidades,
    totalClientes,
    totalContratos,
    indicadoresPendentes,
  ] = await Promise.all([
    repository.countOportunidades(),
    repository.countClientes(),
    repository.countContratos(),
    repository.countIndicadoresPendentes(),
  ]);

  return {
    totalOportunidades,
    totalClientes,
    totalContratos,
    indicadoresPendentes,
  };
}
