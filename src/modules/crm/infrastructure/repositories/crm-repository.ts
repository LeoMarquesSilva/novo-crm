import { Indicador } from "@/modules/crm/domain/entities";

export interface CrmRepository {
  countOportunidades(): Promise<number>;
  countClientes(): Promise<number>;
  countContratos(): Promise<number>;
  countIndicadoresPendentes(): Promise<number>;
  listIndicadoresPendentes(): Promise<Indicador[]>;
}
