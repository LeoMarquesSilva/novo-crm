import { describe, expect, it } from "vitest";

import {
  canAccessContractCapability,
  canPatchLeadDetail,
  canViewD4SignDocument,
  canViewD4SignDocumentRecord,
} from "./crm-access-policy";
import * as crmAccessPolicy from "./crm-access-policy";

const canEnsureContractDraft = (
  crmAccessPolicy as unknown as {
    canEnsureContractDraft?: (role: "admin" | "comercial" | "controladoria" | "financeiro") => boolean;
  }
).canEnsureContractDraft;

describe("canEnsureContractDraft", () => {
  it.each([
    ["admin", true],
    ["comercial", true],
    ["controladoria", true],
    ["financeiro", false],
  ] as const)("maps %s to %s for the repair banner", (role, allowed) => {
    expect(canEnsureContractDraft?.(role)).toBe(allowed);
  });
});

describe("canAccessContractCapability", () => {
  it.each([
    ["admin", "view", true],
    ["admin", "configure", true],
    ["admin", "prepare_closing", true],
    ["admin", "approve_closing", true],
    ["admin", "register_vios", true],
    ["admin", "manage_renewal", true],
    ["admin", "ensure_draft", true],
    ["controladoria", "view", true],
    ["controladoria", "configure", true],
    ["controladoria", "prepare_closing", true],
    ["controladoria", "approve_closing", true],
    ["controladoria", "register_vios", true],
    ["controladoria", "manage_renewal", true],
    ["controladoria", "ensure_draft", true],
    ["financeiro", "view", true],
    ["financeiro", "configure", false],
    ["financeiro", "prepare_closing", true],
    ["financeiro", "approve_closing", false],
    ["financeiro", "register_vios", true],
    ["financeiro", "manage_renewal", false],
    ["financeiro", "ensure_draft", false],
    ["comercial", "view", true],
    ["comercial", "configure", false],
    ["comercial", "prepare_closing", false],
    ["comercial", "approve_closing", false],
    ["comercial", "register_vios", false],
    ["comercial", "manage_renewal", false],
    ["comercial", "ensure_draft", true],
  ] as const)(
    "%s %s: %s",
    (role, capability, allowed) => {
      expect(canAccessContractCapability({ role, capability })).toBe(allowed);
    },
  );

  it("nega role inválida por padrão", () => {
    expect(
      canAccessContractCapability({
        role: "desconhecido" as never,
        capability: "view",
      }),
    ).toBe(false);
  });
});

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
