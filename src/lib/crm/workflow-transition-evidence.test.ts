import { describe, expect, it } from "vitest";

import {
  buildWorkflowEvidenceBlocker,
  type WorkflowTransitionEvidence,
} from "./workflow-transition-evidence";

const oportunidadeId = "00000000-0000-4000-8000-000000000001";

function evidence(
  patch: Partial<WorkflowTransitionEvidence> = {},
): WorkflowTransitionEvidence {
  return {
    proposalArtifactStored: false,
    contractArtifactStored: false,
    contractReviewApproved: false,
    d4SignDocumentSent: false,
    d4SignDocumentFinalized: false,
    ...patch,
  };
}

describe("buildWorkflowEvidenceBlocker", () => {
  it("exige proposta oficial armazenada antes de Proposta Enviada", () => {
    expect(
      buildWorkflowEvidenceBlocker(
        "confeccao_proposta",
        "proposta_enviada",
        evidence(),
        oportunidadeId,
      ),
    ).toMatchObject({ code: "proposal_artifact_required" });

    expect(
      buildWorkflowEvidenceBlocker(
        "confeccao_proposta",
        "proposta_enviada",
        evidence({ proposalArtifactStored: true }),
        oportunidadeId,
      ),
    ).toBeNull();
  });

  it("exige contrato oficial armazenado antes de Contrato Elaborado", () => {
    expect(
      buildWorkflowEvidenceBlocker(
        "confeccao_contrato",
        "contrato_elaborado",
        evidence(),
        oportunidadeId,
      ),
    ).toMatchObject({ code: "contract_artifact_required" });

    expect(
      buildWorkflowEvidenceBlocker(
        "confeccao_contrato",
        "contrato_elaborado",
        evidence({ contractArtifactStored: true }),
        oportunidadeId,
      ),
    ).toMatchObject({ code: "contract_review_required" });

    expect(
      buildWorkflowEvidenceBlocker(
        "confeccao_contrato",
        "contrato_elaborado",
        evidence({
          contractArtifactStored: true,
          contractReviewApproved: true,
        }),
        oportunidadeId,
      ),
    ).toBeNull();
  });

  it("exige revisão e envio D4Sign antes de Contrato Enviado", () => {
    expect(
      buildWorkflowEvidenceBlocker(
        "contrato_elaborado",
        "contrato_enviado",
        evidence(),
        oportunidadeId,
      ),
    ).toMatchObject({ code: "contract_review_required" });

    expect(
      buildWorkflowEvidenceBlocker(
        "contrato_elaborado",
        "contrato_enviado",
        evidence({ contractReviewApproved: true }),
        oportunidadeId,
      ),
    ).toMatchObject({ code: "d4sign_send_required" });

    expect(
      buildWorkflowEvidenceBlocker(
        "contrato_elaborado",
        "contrato_enviado",
        evidence({
          contractReviewApproved: true,
          d4SignDocumentSent: true,
        }),
        oportunidadeId,
      ),
    ).toBeNull();
  });

  it("exige finalização e todos os signatários confirmados antes de Contrato Assinado", () => {
    expect(
      buildWorkflowEvidenceBlocker(
        "contrato_enviado",
        "contrato_assinado",
        evidence({ d4SignDocumentSent: true }),
        oportunidadeId,
      ),
    ).toMatchObject({ code: "d4sign_finalization_required" });

    expect(
      buildWorkflowEvidenceBlocker(
        "contrato_enviado",
        "contrato_assinado",
        evidence({
          d4SignDocumentSent: true,
          d4SignDocumentFinalized: true,
        }),
        oportunidadeId,
      ),
    ).toBeNull();
  });

  it("não bloqueia o retorno para uma etapa anterior", () => {
    expect(
      buildWorkflowEvidenceBlocker(
        "contrato_assinado",
        "contrato_enviado",
        evidence(),
        oportunidadeId,
      ),
    ).toBeNull();
  });
});
