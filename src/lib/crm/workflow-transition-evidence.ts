import { generatedDocumentObjectExists } from "@/lib/crm/generated-document-storage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { OpportunityStage } from "@/modules/crm/domain/entities";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type WorkflowTransitionEvidence = {
  proposalArtifactStored: boolean;
  contractArtifactStored: boolean;
  contractReviewApproved: boolean;
  d4SignDocumentSent: boolean;
  d4SignDocumentFinalized: boolean;
};

export type WorkflowEvidenceBlocker = {
  code:
    | "proposal_artifact_required"
    | "contract_artifact_required"
    | "contract_review_required"
    | "d4sign_send_required"
    | "d4sign_finalization_required";
  message: string;
  actionHref: string;
};

const EMPTY_EVIDENCE: WorkflowTransitionEvidence = {
  proposalArtifactStored: false,
  contractArtifactStored: false,
  contractReviewApproved: false,
  d4SignDocumentSent: false,
  d4SignDocumentFinalized: false,
};

export async function hasStoredGeneratedDocument(
  supabase: SupabaseAdminClient,
  oportunidadeId: string,
  documentType: "proposta" | "contrato",
): Promise<boolean> {
  const { data: templates, error: templatesError } = await supabase
    .from("document_templates")
    .select("id")
    .eq("document_type", documentType);
  if (templatesError) throw templatesError;

  const templateIds = (templates ?? []).map((row) => row.id);
  if (templateIds.length === 0) return false;

  const { data: instances, error: instancesError } = await supabase
    .from("document_instances")
    .select("id")
    .eq("oportunidade_id", oportunidadeId)
    .in("template_id", templateIds);
  if (instancesError) throw instancesError;

  const instanceIds = (instances ?? []).map((row) => row.id);
  if (instanceIds.length === 0) return false;

  const { data: versions, error: versionsError } = await supabase
    .from("document_versions")
    .select("generated_file_path, generated_at")
    .in("instance_id", instanceIds)
    .not("generated_file_path", "is", null)
    .order("generated_at", { ascending: false })
    .limit(25);
  if (versionsError) throw versionsError;

  for (const version of versions ?? []) {
    const path = version.generated_file_path?.trim();
    if (path && (await generatedDocumentObjectExists(supabase, path))) {
      return true;
    }
  }

  return false;
}

function isCanceledD4SignDocument(row: {
  d4sign_status: string | null;
  status_name: string | null;
  who_canceled: unknown;
}): boolean {
  if (row.who_canceled != null) return true;
  const status = `${row.d4sign_status ?? ""} ${row.status_name ?? ""}`.toLowerCase();
  return status.includes("cancel");
}

function allD4SignersSigned(signers: unknown): boolean {
  return (
    Array.isArray(signers) &&
    signers.length > 0 &&
    signers.every(
      (signer) =>
        signer != null &&
        typeof signer === "object" &&
        (signer as Record<string, unknown>).signed === true,
    )
  );
}

export function buildWorkflowEvidenceBlocker(
  currentStage: OpportunityStage,
  nextStage: OpportunityStage,
  evidence: WorkflowTransitionEvidence,
  oportunidadeId: string,
): WorkflowEvidenceBlocker | null {
  const leadHref = `/crm/leads/${encodeURIComponent(oportunidadeId)}`;
  const proposalHref = `${leadHref}?tab=proposal`;
  const contractHref = `${leadHref}?tab=contract`;
  const signatureHref = `${leadHref}?tab=signature`;

  if (
    currentStage === "confeccao_proposta" &&
    nextStage === "proposta_enviada" &&
    !evidence.proposalArtifactStored
  ) {
    return {
      code: "proposal_artifact_required",
      message:
        "Gere a proposta no editor do CRM antes de avançar para Proposta Enviada. O arquivo precisa estar salvo no Storage e vinculado a este lead.",
      actionHref: proposalHref,
    };
  }

  if (
    currentStage === "confeccao_contrato" &&
    nextStage === "contrato_elaborado" &&
    !evidence.contractArtifactStored
  ) {
    return {
      code: "contract_artifact_required",
      message:
        "Gere o contrato no builder antes de avançar para Contrato Elaborado. O arquivo precisa estar salvo no Storage e vinculado a este lead.",
      actionHref: contractHref,
    };
  }
  if (
    currentStage === "confeccao_contrato" &&
    nextStage === "contrato_elaborado" &&
    !evidence.contractReviewApproved
  ) {
    return {
      code: "contract_review_required",
      message:
        "A revisão da área Societário e Contratos precisa estar concluída antes de avançar para Contrato Elaborado.",
      actionHref: contractHref,
    };
  }

  if (currentStage === "contrato_elaborado" && nextStage === "contrato_enviado") {
    if (!evidence.contractReviewApproved) {
      return {
        code: "contract_review_required",
        message:
          "A revisão da área Societário e Contratos precisa estar concluída antes do envio.",
        actionHref: contractHref,
      };
    }
    if (!evidence.d4SignDocumentSent) {
      return {
        code: "d4sign_send_required",
        message:
          "Envie o contrato pela D4Sign dentro do CRM. A etapa será atualizada automaticamente após o envio.",
        actionHref: contractHref,
      };
    }
  }

  if (
    currentStage === "contrato_enviado" &&
    nextStage === "contrato_assinado" &&
    !evidence.d4SignDocumentFinalized
  ) {
    return {
      code: "d4sign_finalization_required",
      message:
        "O contrato só pode ser marcado como assinado após a D4Sign confirmar a assinatura de todos os signatários.",
      actionHref: signatureHref,
    };
  }

  return null;
}

export async function loadWorkflowEvidenceBlocker(params: {
  supabase: SupabaseAdminClient;
  oportunidadeId: string;
  currentStage: OpportunityStage;
  nextStage: OpportunityStage;
}): Promise<WorkflowEvidenceBlocker | null> {
  const { supabase, oportunidadeId, currentStage, nextStage } = params;
  const evidence = { ...EMPTY_EVIDENCE };

  if (currentStage === "confeccao_proposta" && nextStage === "proposta_enviada") {
    evidence.proposalArtifactStored = await hasStoredGeneratedDocument(
      supabase,
      oportunidadeId,
      "proposta",
    );
  }

  if (currentStage === "confeccao_contrato" && nextStage === "contrato_elaborado") {
    evidence.contractArtifactStored = await hasStoredGeneratedDocument(
      supabase,
      oportunidadeId,
      "contrato",
    );
  }

  if (
    (currentStage === "confeccao_contrato" && nextStage === "contrato_elaborado") ||
    (currentStage === "contrato_elaborado" && nextStage === "contrato_enviado")
  ) {
    const { data: reviewTask, error: reviewError } = await supabase
      .from("contract_review_tasks")
      .select("status, concluido_em")
      .eq("oportunidade_id", oportunidadeId)
      .maybeSingle();
    if (reviewError) throw reviewError;
    evidence.contractReviewApproved =
      reviewTask?.status === "concluido" && Boolean(reviewTask.concluido_em);
  }

  if (
    (currentStage === "contrato_elaborado" && nextStage === "contrato_enviado") ||
    (currentStage === "contrato_enviado" && nextStage === "contrato_assinado")
  ) {
    const { data: d4SignDocument, error: d4SignError } = await supabase
      .from("d4sign_documents")
      .select(
        "uuid_doc, d4sign_status, status_name, signers, finalized_at, created_at_d4sign, who_canceled",
      )
      .eq("oportunidade_id", oportunidadeId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (d4SignError) throw d4SignError;

    if (d4SignDocument && !isCanceledD4SignDocument(d4SignDocument)) {
      evidence.d4SignDocumentSent = Boolean(
        d4SignDocument.uuid_doc && d4SignDocument.created_at_d4sign,
      );
      evidence.d4SignDocumentFinalized =
        Boolean(d4SignDocument.finalized_at) &&
        allD4SignersSigned(d4SignDocument.signers);
    }
  }

  return buildWorkflowEvidenceBlocker(
    currentStage,
    nextStage,
    evidence,
    oportunidadeId,
  );
}
