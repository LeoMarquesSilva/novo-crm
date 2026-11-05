/**
 * Resumo do snapshot do RD (`rd_deal_reconciliacao.detalhes`) com só o que o kanban usa.
 * O `detalhes` inteiro tem ~37 KB por negócio (quase tudo em `deal_custom_fields`, com a
 * definição de cada campo personalizado); o resumo fica em poucas centenas de bytes.
 */

export const RD_OWNER_EMAIL_LABELS = ["Cadastro realizado por", "Cadastro realizado por (e-mail)"];
export const RD_SOLICITANTE_LABELS = ["Solicitante", "Nome do solicitante", "Solicitante (nome)"];

const STAGE_KEYS = ["deal_stage", "stage_name", "stage_label", "stage", "stageName"] as const;

export type RdLeadSummary = {
  /** Só as chaves de etapa do `deal`, no formato que `resolvePipelineEtapaFromDbAndRd` lê. */
  details: { deal: Record<string, unknown> } | null;
  rdDealAtualizadoEm: string | null;
  motivoPerda: string | null;
  cadastroRealizadoPor: string | null;
  solicitante: string | null;
};

function normalizeLabel(label: string): string {
  return label
    .replace(/[–—―]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function dealOf(details: unknown): Record<string, unknown> | null {
  return asObject(asObject(details)?.deal);
}

export function getDealCustomFieldValue(details: unknown, labels: string[]): string | null {
  const deal = dealOf(details);
  if (!deal || !Array.isArray(deal.deal_custom_fields)) return null;

  const targetLabels = labels.map(normalizeLabel);
  for (const field of deal.deal_custom_fields) {
    const row = asObject(field);
    if (!row) continue;
    const customField = asObject(row.custom_field);
    const rawLabel = asString(customField?.label) ?? asString(row.label);
    if (!rawLabel) continue;
    if (!targetLabels.includes(normalizeLabel(rawLabel))) continue;
    const value = asString(row.value) ?? asString(row.content);
    if (value) return value;
  }
  return null;
}

export function getRdDealUpdatedAtIso(details: unknown): string | null {
  const deal = dealOf(details);
  if (!deal) return null;
  return asString(deal.updated_at) ?? asString(deal.updatedAt);
}

export function getRdDealLostReason(details: unknown): string | null {
  const lostReason = asObject(dealOf(details)?.deal_lost_reason);
  if (!lostReason) return null;
  return asString(lostReason.name) ?? asString(lostReason.reason) ?? null;
}

export function summarizeRdReconciliation(details: unknown): RdLeadSummary {
  const deal = dealOf(details);
  const stage: Record<string, unknown> = {};
  for (const key of STAGE_KEYS) {
    if (deal && deal[key] !== undefined && deal[key] !== null) stage[key] = deal[key];
  }
  return {
    details: deal ? { deal: stage } : null,
    rdDealAtualizadoEm: getRdDealUpdatedAtIso(details),
    motivoPerda: getRdDealLostReason(details),
    cadastroRealizadoPor: getDealCustomFieldValue(details, RD_OWNER_EMAIL_LABELS),
    solicitante: getDealCustomFieldValue(details, RD_SOLICITANTE_LABELS),
  };
}

/**
 * Último snapshot por oportunidade (as linhas chegam ordenadas por `reconciled_at` desc).
 */
export function summarizeRdReconciliationRows(
  rows: { oportunidade_id: string | null; detalhes: unknown }[],
): Record<string, RdLeadSummary> {
  const byOpportunity: Record<string, RdLeadSummary> = {};
  for (const row of rows) {
    const id = row.oportunidade_id ? String(row.oportunidade_id) : "";
    if (!id || byOpportunity[id]) continue;
    byOpportunity[id] = summarizeRdReconciliation(row.detalhes);
  }
  return byOpportunity;
}
