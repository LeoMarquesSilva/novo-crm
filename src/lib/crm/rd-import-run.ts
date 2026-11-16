import { invalidateRdReconciliationCache } from "@/lib/crm/kanban-data-cache";
import { RdImportConnector } from "@/modules/crm/infrastructure/integrations/rd-import";

/** Importação completa de negócios e contatos RD para o ano informado (usa `RD_CRM_TOKEN`). */
export async function runRdFullImport(year: number) {
  const token = process.env.RD_CRM_TOKEN ?? "";
  const connector = new RdImportConnector(token);
  try {
    return await connector.importDeals(year);
  } finally {
    // Mesmo com falha no meio, o que já foi gravado precisa aparecer no kanban.
    invalidateRdReconciliationCache();
  }
}
