/** O que a inclusão do lead gravou em `contrato_versoes.origem_snapshot.leadInclusion`, para a tela. */
export type LeadInclusionView = {
  prefilledAt: string | null;
  /** Incluído sozinho ao entrar em Inclusão no Faturamento (03/11/2026), sem clique do Financeiro. */
  auto: boolean;
  pdfStatus: string | null;
  pdfMessage: string | null;
  divergences: { field: string; leadValue: string; pdfValue: string }[];
};

/** Configuração do contrato no gerenciamento, voltando para a ficha do lead. */
export function contractSetupHref(contractId: string, opportunityId: string): string {
  return `/crm/contratos/${contractId}?setup=1&returnTo=${encodeURIComponent(`/crm/leads/${opportunityId}`)}`;
}

export const PDF_STATUS_LABEL: Record<string, string> = {
  read: "PDF assinado lido pela IA",
  not_signed: "PDF ainda não finalizado na D4Sign",
  not_cached: "PDF assinado ainda não baixado",
  quota_exhausted: "Limite de downloads da D4Sign nesta hora",
  scanned: "PDF escaneado (sem texto para a IA)",
  failed: "Não foi possível ler o PDF",
  no_document: "Lead sem documento de assinatura",
};

export const DIVERGENCE_FIELD: Record<string, string> = {
  startsAt: "Início da vigência",
  firstInvoiceAt: "Primeiro faturamento",
  adjustmentIndex: "Índice de reajuste",
  components: "Valor total das cobranças",
};

export function parseLeadInclusion(snapshot: unknown): LeadInclusionView | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const raw = (snapshot as Record<string, unknown>).leadInclusion;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const pdf = (r.pdf && typeof r.pdf === "object" ? r.pdf : {}) as Record<string, unknown>;
  const divergences = Array.isArray(r.divergences)
    ? r.divergences.filter(
        (d): d is { field: string; leadValue: string; pdfValue: string } =>
          Boolean(d) && typeof d === "object" && typeof (d as { field?: unknown }).field === "string",
      )
    : [];
  return {
    prefilledAt: typeof r.prefilledAt === "string" ? r.prefilledAt : null,
    auto: r.auto === true,
    pdfStatus: typeof pdf.status === "string" ? pdf.status : null,
    pdfMessage: typeof pdf.message === "string" ? pdf.message : null,
    divergences,
  };
}
