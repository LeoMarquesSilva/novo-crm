import { describe, expect, it } from "vitest";

import {
  canPatchLeadDetail,
  canViewD4SignDocument,
  canViewD4SignDocumentRecord,
} from "./crm-access-policy";

describe("canPatchLeadDetail", () => {
  it.each(["intake", "rd", "pipeline"] as const)(
    "permite que admin edite %s",
    (mutationKind) => {
      expect(
        canPatchLeadDetail({
          role: "admin",
          appArea: null,
          mutationKind,
          pipelineFieldCode: "qualquer_campo",
        }),
      ).toBe(true);
    },
  );

  it("permite que comercial edite cadastro e campos do pipeline", () => {
    expect(
      canPatchLeadDetail({
        role: "comercial",
        appArea: null,
        mutationKind: "intake",
        pipelineFieldCode: null,
      }),
    ).toBe(true);
  });

  it("nega alteração de cadastro e snapshot RD a perfis de área", () => {
    expect(
      canPatchLeadDetail({
        role: "controladoria",
        appArea: "Tributário",
        mutationKind: "intake",
        pipelineFieldCode: null,
      }),
    ).toBe(false);
    expect(
      canPatchLeadDetail({
        role: "financeiro",
        appArea: "Financeiro",
        mutationKind: "rd",
        pipelineFieldCode: null,
      }),
    ).toBe(false);
  });

  it("permite a perfil de área somente o escopo detalhado da própria área", () => {
    expect(
      canPatchLeadDetail({
        role: "controladoria",
        appArea: "Tributário",
        mutationKind: "pipeline",
        pipelineFieldCode: "cp_escopo_detalhe_json",
      }),
    ).toBe(true);
    expect(
      canPatchLeadDetail({
        role: "controladoria",
        appArea: "Tributário",
        mutationKind: "pipeline",
        pipelineFieldCode: "cp_areas_objeto",
      }),
    ).toBe(false);
  });

  it("nega escopo de área quando o perfil não possui área configurada", () => {
    expect(
      canPatchLeadDetail({
        role: "controladoria",
        appArea: null,
        mutationKind: "pipeline",
        pipelineFieldCode: "cp_escopo_detalhe_json",
      }),
    ).toBe(false);
  });
});

describe("canViewD4SignDocument", () => {
  it.each(["admin", "comercial", "controladoria", "financeiro"] as const)(
    "permite que %s visualize documentos D4Sign",
    (role) => {
      expect(canViewD4SignDocument({ role })).toBe(true);
    },
  );

  it.each(["", "desconhecido"] as const)(
    "nega role inválida (%s)",
    (role) => {
      expect(
        canViewD4SignDocument({
          role: role as never,
        }),
      ).toBe(false);
    },
  );
});

describe("canViewD4SignDocumentRecord", () => {
  it("restringe documento órfão ao administrador", () => {
    expect(
      canViewD4SignDocumentRecord({
        role: "admin",
        oportunidadeId: null,
      }),
    ).toBe(true);
    expect(
      canViewD4SignDocumentRecord({
        role: "comercial",
        oportunidadeId: null,
      }),
    ).toBe(false);
  });
});
