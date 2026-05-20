export interface ReconciliationRecord {
  rdDealId: string;
  opportunityId: string | null;
  status: "importado" | "conflito" | "erro";
}

export interface ReconciliationSummary {
  total: number;
  imported: number;
  conflicts: number;
  errors: number;
}

export function buildReconciliationSummary(
  records: ReconciliationRecord[],
): ReconciliationSummary {
  return {
    total: records.length,
    imported: records.filter((r) => r.status === "importado").length,
    conflicts: records.filter((r) => r.status === "conflito").length,
    errors: records.filter((r) => r.status === "erro").length,
  };
}
