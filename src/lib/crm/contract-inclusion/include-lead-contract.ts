import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { CrmActor } from "@/lib/auth/crm-access-policy";
import { buildImportedOrigemSnapshot, type AiProvenanceItem } from "@/lib/contract-import/ai-provenance";
import { CONTRACT_IMPORT_MIN_CHARS_PER_PAGE } from "@/lib/contract-import/constants";
import { stripD4SignCertificate } from "@/lib/contract-import/document-text";
import { extractContractFromText } from "@/lib/contract-import/extract";
import { mapExtractionToConfiguration } from "@/lib/contract-import/map-to-configuration";
import { writeImportedVersionContents } from "@/lib/contract-import/persist-draft";
import type { ContractImportExtraction } from "@/lib/contract-import/schemas";
import { applyAnnualRenewalDefaults } from "@/lib/crm/contract-renewal-date";
import { loadPipelineFieldByCode } from "@/lib/crm/proposta-document-data";
import { recordLeadActivityEvent } from "@/lib/crm/record-lead-activity";
import { loadSignedContractPdf } from "@/lib/d4sign/signed-pdf-cache";
import { logServerError, publicErrorMessage, PublicError } from "@/lib/http/api-errors";
import { extractDocumentText } from "@/lib/scope-import/text-extraction";
import type { Json } from "@/lib/supabase/database.types";
import { buildContractPrefill } from "@/modules/contracts/application/services/build-contract-prefill";
import { parseClientOnboardingPayload } from "@/modules/crm/domain/client-onboarding";

import {
  buildLeadExtraction,
  mergeLeadAndPdfExtraction,
  rateioFromOnboarding,
  type InclusionDivergence,
} from "./lead-extraction";

/** Prazo da leitura por IA dentro da rota (maxDuration 300). */
const PDF_AI_TIMEOUT_MS = 90_000;

export type PdfReadStatus =
  | "read"
  | "not_signed"
  | "not_cached"
  | "quota_exhausted"
  | "scanned"
  | "failed"
  | "no_document";

export type ContractInclusionResult = {
  contractId: string;
  setupHref: string;
  prefilled: boolean;
  pdf: { status: PdfReadStatus; message: string | null; resetAt?: string | null };
  divergences: InclusionDivergence[];
};

type Supabase = SupabaseClient;

async function readSignedPdfWithAi(
  documentUuid: string | null,
): Promise<{ extraction: ContractImportExtraction | null; status: PdfReadStatus; message: string | null; resetAt?: string | null }> {
  if (!documentUuid) return { extraction: null, status: "no_document", message: "Lead sem documento de assinatura." };
  const pdf = await loadSignedContractPdf(documentUuid, { allowDownload: true, source: "contract-inclusion" });
  if (!pdf.ok) {
    const status: PdfReadStatus =
      pdf.reason === "not_finalized"
        ? "not_signed"
        : pdf.reason === "quota_exhausted"
          ? "quota_exhausted"
          : pdf.reason === "not_cached"
            ? "not_cached"
            : "failed";
    return { extraction: null, status, message: pdf.message, resetAt: pdf.resetAt ?? null };
  }
  try {
    const text = await extractDocumentText(Buffer.from(pdf.bytes), "application/pdf");
    if (!text.text.trim() || text.charsPerPage < CONTRACT_IMPORT_MIN_CHARS_PER_PAGE) {
      return { extraction: null, status: "scanned", message: "PDF sem texto suficiente (provavelmente escaneado)." };
    }
    const stripped = stripD4SignCertificate(text.text);
    const ai = await extractContractFromText(`${documentUuid}.pdf`, stripped.body, { timeoutMs: PDF_AI_TIMEOUT_MS });
    return { extraction: { ...ai.data, d4signUuid: stripped.d4signUuid ?? documentUuid }, status: "read", message: null };
  } catch (error) {
    logServerError("contract-inclusion/pdf-ai", error, { documentUuid });
    return { extraction: null, status: "failed", message: publicErrorMessage(error, "Não foi possível ler o PDF com a IA.") };
  }
}

/** Itens de origem "cadastro" para os campos que vieram do lead (e não do PDF). */
function leadProvenance(
  extraction: ContractImportExtraction,
  pdf: ContractImportExtraction | null,
  fromProposal: ContractImportExtraction["components"],
): AiProvenanceItem[] {
  const items: AiProvenanceItem[] = [];
  const add = (field: string, value: string | null | undefined, fromPdf: string | null | undefined) => {
    if (!value || (fromPdf && fromPdf === value)) return;
    items.push({
      field,
      quote: "Informado no cadastro do cliente (responsável do lead, conferido por Operações Legais).",
      clause: null,
      source: "cadastro",
      extractedValue: value,
    });
  };
  add("startsAt", extraction.startsAt, pdf?.startsAt);
  add("firstInvoiceAt", extraction.firstInvoiceAt, pdf?.firstInvoiceAt);
  add("adjustmentIndex", extraction.adjustmentIndex, pdf?.adjustmentIndex);
  if (!pdf?.components.length && extraction.components.length) {
    items.push({
      field: "components",
      quote: "Sugerido pela proposta/contrato montado no CRM.",
      clause: null,
      source: "cadastro",
      extractedValue: extraction.components.map((c) => c.description || c.kind).join("; "),
    });
  }
  if (pdf?.components.length && fromProposal.length) {
    items.push({
      field: "components",
      quote: "O contrato não traz o valor; completado pelo investimento da proposta.",
      clause: null,
      source: "cadastro",
      extractedValue: fromProposal
        .map((c) =>
          c.kind === "exito_percentual" && c.percentageBasisPoints
            ? `Êxito ${c.percentageBasisPoints / 100}%`
            : c.description || c.kind,
        )
        .join("; "),
    });
  }
  return items;
}

/**
 * Financeiro inclui o contrato do lead no gerenciamento de contratos: garante o rascunho,
 * lê o PDF assinado com a IA, junta com o cadastro do cliente e a proposta e grava as
 * regras de cobrança sugeridas (uma vez; "Reler PDF" só atualiza a origem e as
 * divergências). Abre a configuração no assistente do contrato.
 */
export async function includeLeadContract(
  supabase: Supabase,
  input: { opportunityId: string; actor: CrmActor; mode: "initial" | "reread_pdf" },
): Promise<ContractInclusionResult> {
  const { opportunityId, actor } = input;
  const { data: opp, error: oppError } = await supabase
    .from("oportunidades")
    .select("id, etapa, criado_por, solicitante_nome, d4sign_document_uuid, cliente_id")
    .eq("id", opportunityId)
    .maybeSingle();
  if (oppError) throw oppError;
  if (!opp) throw new PublicError("Lead não encontrado.", 404);
  const o = opp as {
    id: string;
    etapa: string;
    criado_por: string | null;
    solicitante_nome: string | null;
    d4sign_document_uuid: string | null;
    cliente_id: string | null;
  };
  if (o.etapa !== "inclusao_faturamento") {
    throw new PublicError("A inclusão no gerenciamento de contratos é feita em Inclusão no Faturamento.", 409, "STAGE");
  }

  const now = new Date().toISOString();
  const { data: contractId, error: ensureError } = await supabase.rpc("ensure_contract_draft_for_opportunity", {
    p_opportunity_id: opportunityId,
    p_now: now,
  });
  if (ensureError) throw ensureError;
  const id = String(contractId);

  const [{ data: contract }, { data: version }] = await Promise.all([
    supabase
      .from("contratos")
      .select("id, cliente_id, grupo_id, origem_importacao, vigente_de, primeiro_vencimento, indice_reajuste, dia_vencimento, data_base_renovacao, data_alerta_renovacao")
      .eq("id", id)
      .single(),
    supabase
      .from("contrato_versoes")
      .select("id, status, origem_snapshot, vigente_de")
      .eq("contrato_id", id)
      .eq("numero", 1)
      .single(),
  ]);
  const c = contract as Record<string, unknown> | null;
  const v = version as { id: string; status: string; origem_snapshot: unknown; vigente_de: string | null } | null;
  if (!c || !v) throw new Error("CONTRACT_DRAFT_NOT_FOUND");
  if (v.status !== "rascunho") {
    throw new PublicError("O contrato já foi ativado. Ajustes viram uma nova versão no gerenciamento de contratos.", 409, "ALREADY_ACTIVE");
  }

  const { count: componentCount } = await supabase
    .from("contrato_componentes_cobranca")
    .select("id", { count: "exact", head: true })
    .eq("versao_id", v.id);
  const alreadyPrefilled = (componentCount ?? 0) > 0;

  // Cadastro do cliente (fonte confirmada) + sugestões da proposta/contrato do CRM.
  const [{ data: onboardingRow }, fieldByCode] = await Promise.all([
    supabase.from("lead_client_onboarding").select("payload").eq("oportunidade_id", opportunityId).maybeSingle(),
    loadPipelineFieldByCode(supabase as never, opportunityId),
  ]);
  const onboarding = onboardingRow ? parseClientOnboardingPayload((onboardingRow as { payload: unknown }).payload) : null;
  const prefill = buildContractPrefill({ fieldValues: fieldByCode });
  const leadExtraction = buildLeadExtraction({ onboarding, prefill });

  const pdfRead = await readSignedPdfWithAi(o.d4sign_document_uuid);
  const { extraction, divergences, fromProposal } = mergeLeadAndPdfExtraction(leadExtraction, pdfRead.extraction);
  const rateio = rateioFromOnboarding(onboarding);

  const configuration = applyAnnualRenewalDefaults(
    mapExtractionToConfiguration({
      extraction,
      clientId: (c.cliente_id as string | null) ?? o.cliente_id,
      versionId: v.id,
      nextId: () => randomUUID(),
      sioeRateio: rateio,
    }),
  );

  let prefilled = false;
  if (input.mode === "initial" && !alreadyPrefilled) {
    await writeImportedVersionContents({ supabase: supabase as never, versionId: v.id, configuration, now });
    prefilled = true;

    // Cabeçalho: só completa o que está vazio (quem já editou no assistente prevalece).
    const header: Record<string, unknown> = { updated_at: now };
    const fill = (column: string, value: unknown) => {
      if ((c[column] === null || c[column] === undefined) && value !== null && value !== undefined) header[column] = value;
    };
    fill("vigente_de", configuration.startsAt);
    fill("primeiro_vencimento", configuration.firstInvoiceAt);
    fill("indice_reajuste", configuration.adjustmentIndex);
    // Sem dia de vencimento no contrato, vale o dia do primeiro faturamento (18/08 → dia 18).
    const firstInvoiceDay = configuration.firstInvoiceAt ? Number(configuration.firstInvoiceAt.slice(8, 10)) : null;
    fill("dia_vencimento", configuration.dueDay ?? (firstInvoiceDay && firstInvoiceDay <= 31 ? firstInvoiceDay : null));
    fill("data_base_renovacao", configuration.renewalDate);
    fill("data_alerta_renovacao", configuration.renewalAlertDate);
    fill("cliente_id", configuration.clientId);
    if (configuration.firstInvoiceConditioned) header.primeiro_faturamento_condicionado = true;
    // `prazo_indeterminado` nasce false no rascunho; o contrato do CRM e o PDF dizem se é indeterminado.
    if (configuration.indefinite) header.prazo_indeterminado = true;
    if (!c.origem_importacao) header.origem_importacao = "lead";
    const { error: headerError } = await supabase.from("contratos").update(header as never).eq("id", id);
    if (headerError) throw headerError;

    if (!v.vigente_de && configuration.version.effectiveFrom) {
      await supabase
        .from("contrato_versoes")
        .update({ vigente_de: configuration.version.effectiveFrom } as never)
        .eq("id", v.id);
    }

    await ensureResponsibles(supabase, { contractId: id, actor, leadCreatorId: o.criado_por });
  }

  // Origem dos dados (selos do assistente), preservando os vistos já marcados.
  const previous =
    v.origem_snapshot && typeof v.origem_snapshot === "object" && !Array.isArray(v.origem_snapshot)
      ? (v.origem_snapshot as Record<string, unknown>)
      : {};
  const pdfSnapshot = pdfRead.extraction ? buildImportedOrigemSnapshot({ extraction: pdfRead.extraction, sioeRateio: null }) : null;
  const snapshot = {
    ...previous,
    origin: "lead",
    aiProvenance: [...(pdfSnapshot?.aiProvenance ?? []), ...leadProvenance(extraction, pdfRead.extraction, fromProposal)],
    reviewedFieldKeys: Array.isArray(previous.reviewedFieldKeys) ? previous.reviewedFieldKeys : [],
    leadInclusion: {
      prefilledAt: prefilled ? now : ((previous.leadInclusion as Record<string, unknown> | undefined)?.prefilledAt ?? null),
      by: actor.appUserId,
      pdf: { status: pdfRead.status, message: pdfRead.message, readAt: now },
      divergences,
      rateio: rateio ? "cadastro" : null,
    },
  };
  const { error: snapshotError } = await supabase
    .from("contrato_versoes")
    .update({ origem_snapshot: snapshot as unknown as Json } as never)
    .eq("id", v.id);
  if (snapshotError) logServerError("contract-inclusion/snapshot", snapshotError, { contractId: id });

  await recordLeadActivityEvent(supabase, {
    oportunidadeId: opportunityId,
    kind: "contrato_incluido_gestao",
    title: input.mode === "initial" ? "Contrato incluído no gerenciamento de contratos" : "PDF do contrato relido",
    detail:
      pdfRead.status === "read"
        ? `Dados do cadastro e leitura do PDF assinado${divergences.length ? ` (${divergences.length} divergência(s) para conferir)` : ""}.`
        : `Dados do cadastro e da proposta. PDF: ${pdfRead.message ?? pdfRead.status}.`,
    etapa: "inclusao_faturamento",
    actorAppUserId: actor.appUserId,
    sourceId: input.mode === "initial" ? `contract-inclusion:${id}` : null,
    metadata: { contract_id: id, pdf_status: pdfRead.status, divergences },
  });

  return {
    contractId: id,
    setupHref: `/crm/contratos/${id}?setup=1&returnTo=${encodeURIComponent(`/crm/leads/${opportunityId}?tab=billing`)}`,
    prefilled,
    pdf: { status: pdfRead.status, message: pdfRead.message, resetAt: pdfRead.resetAt ?? null },
    divergences,
  };
}

/** Responsáveis do contrato, se ainda não há: quem trouxe o lead (comercial) e quem inclui (faturamento). */
async function ensureResponsibles(
  supabase: Supabase,
  input: { contractId: string; actor: CrmActor; leadCreatorId: string | null },
): Promise<void> {
  const { count } = await supabase
    .from("contrato_responsaveis")
    .select("id", { count: "exact", head: true })
    .eq("contrato_id", input.contractId);
  if ((count ?? 0) > 0) return;
  const ids = [...new Set([input.leadCreatorId, input.actor.appUserId].filter((v): v is string => Boolean(v)))];
  const { data: users } = await supabase.from("app_users").select("id, full_name").in("id", ids);
  const nameById = new Map(((users ?? []) as { id: string; full_name: string }[]).map((u) => [u.id, u.full_name]));
  const rows = [
    input.leadCreatorId && nameById.has(input.leadCreatorId)
      ? { contrato_id: input.contractId, app_user_id: input.leadCreatorId, nome: nameById.get(input.leadCreatorId)!, papel: "comercial" }
      : null,
    nameById.has(input.actor.appUserId)
      ? { contrato_id: input.contractId, app_user_id: input.actor.appUserId, nome: nameById.get(input.actor.appUserId)!, papel: "faturamento" }
      : null,
  ].filter((r): r is NonNullable<typeof r> => r !== null);
  if (rows.length === 0) return;
  const { error } = await supabase.from("contrato_responsaveis").insert(rows);
  if (error) logServerError("contract-inclusion/responsibles", error, { contractId: input.contractId });
}
