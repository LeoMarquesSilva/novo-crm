import { describe, expect, it } from "vitest";

import {
  canAccessContractCapability,
  canAccessModule,
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

  it("libera documento órfão para sócio signatário", () => {
    expect(
      canViewD4SignDocumentRecord({
        role: "comercial",
        oportunidadeId: null,
        isFirmPartner: true,
      }),
    ).toBe(true);
  });
});

describe("canAccessModule", () => {
  it("libera qualquer módulo para admin, mesmo sem liberação", () => {
    expect(canAccessModule({ role: "admin", modules: [], module: "icp" })).toBe(true);
  });

  it.each(["comercial", "controladoria", "financeiro"] as const)(
    "exige liberação do ICP para %s",
    (role) => {
      expect(canAccessModule({ role, modules: [], module: "icp" })).toBe(false);
      expect(canAccessModule({ role, modules: ["icp"], module: "icp" })).toBe(true);
    },
  );
});
describe("evaluateLeadAction", () => {
  const roles = ["admin", "comercial", "controladoria", "financeiro"] as const;
  const actor = (
    role: (typeof roles)[number],
    extra: Partial<crmAccessPolicy.CrmActor> = {},
  ): crmAccessPolicy.CrmActor => ({
    appUserId: "u-1",
    role,
    area: null,
    email: "pessoa@bp.com.br",
    modules: [],
    ...extra,
  });

  it.each([
    "lead.create",
    "lead.close",
    "proposal.manage",
    "contract.edit",
    "contract.send",
    "contract.review.request",
    "d4sign.ops",
  ] as const)("%s só para admin e comercial", (action) => {
    for (const role of roles) {
      const allowed = crmAccessPolicy.canPerformLeadAction(actor(role), { action } as crmAccessPolicy.LeadActionInput);
      expect(allowed, role).toBe(role === "admin" || role === "comercial");
    }
  });

  it.each(["lead.delete", "d4sign.cancel"] as const)("%s só para admin", (action) => {
    for (const role of roles) {
      expect(crmAccessPolicy.canPerformLeadAction(actor(role), { action }), role).toBe(role === "admin");
    }
  });

  it("conclui revisão: admin, comercial, área Societário (com ou sem acento) e designado", () => {
    const input = { action: "contract.review.update", assignedToAppUserId: null } as const;
    expect(crmAccessPolicy.canPerformLeadAction(actor("admin"), input)).toBe(true);
    expect(crmAccessPolicy.canPerformLeadAction(actor("comercial"), input)).toBe(true);
    expect(crmAccessPolicy.canPerformLeadAction(actor("financeiro"), input)).toBe(false);
    expect(crmAccessPolicy.canPerformLeadAction(actor("controladoria"), input)).toBe(false);
    expect(
      crmAccessPolicy.canPerformLeadAction(actor("controladoria", { area: "Societário e Contratos" }), input),
    ).toBe(true);
    expect(
      crmAccessPolicy.canPerformLeadAction(actor("financeiro", { area: "Societario e Contratos" }), input),
    ).toBe(true);
    expect(
      crmAccessPolicy.canPerformLeadAction(actor("financeiro"), {
        action: "contract.review.update",
        assignedToAppUserId: "u-1",
      }),
    ).toBe(true);
  });

  it("lead.edit segue canPatchLeadDetail", () => {
    const input = {
      action: "lead.edit",
      mutationKind: "pipeline",
      pipelineFieldCode: "cp_escopo_detalhe_json",
    } as const;
    expect(crmAccessPolicy.canPerformLeadAction(actor("financeiro"), input)).toBe(false);
    expect(crmAccessPolicy.canPerformLeadAction(actor("financeiro", { area: "Cível" }), input)).toBe(true);
  });

  describe("stage.advance", () => {
    const lead = { createdByAppUserId: "dono", requesterEmail: "captador@bp.com.br" };
    const advance = (from: string, to: string, channel?: string) =>
      ({ action: "stage.advance", from, to, lead, channel }) as crmAccessPolicy.LeadActionInput;

    it("etapas de venda: admin e comercial pelo caminho manual", () => {
      expect(crmAccessPolicy.canPerformLeadAction(actor("comercial"), advance("reuniao", "confeccao_proposta"))).toBe(true);
      expect(crmAccessPolicy.canPerformLeadAction(actor("financeiro"), advance("reuniao", "confeccao_proposta"))).toBe(false);
    });

    it("contrato elaborado → enviado só pelo diálogo de envio", () => {
      const manual = crmAccessPolicy.evaluateLeadAction(actor("comercial"), advance("contrato_elaborado", "contrato_enviado"));
      expect(manual).toMatchObject({ allowed: false, code: "use_dedicated_action", actionKind: "open_send_dialog" });
      expect(
        crmAccessPolicy.canPerformLeadAction(
          actor("comercial"),
          advance("contrato_elaborado", "contrato_enviado", "send_dialog"),
        ),
      ).toBe(true);
    });

    it("assinatura: só o sistema, com override manual de admin", () => {
      expect(crmAccessPolicy.canPerformLeadAction(actor("admin"), advance("contrato_enviado", "contrato_assinado"))).toBe(true);
      expect(
        crmAccessPolicy.evaluateLeadAction(actor("comercial"), advance("contrato_enviado", "contrato_assinado")),
      ).toMatchObject({ allowed: false, code: "forbidden" });
    });

    it("enviar cadastro: dono do lead (criador ou captador), comercial e admin", () => {
      const submit = advance("aguardando_cadastro", "cadastro_novo_cliente", "onboarding_submit");
      expect(crmAccessPolicy.canPerformLeadAction(actor("controladoria", { appUserId: "dono" }), submit)).toBe(true);
      expect(
        crmAccessPolicy.canPerformLeadAction(actor("financeiro", { email: "CAPTADOR@bp.com.br".toLowerCase() }), submit),
      ).toBe(true);
      expect(crmAccessPolicy.canPerformLeadAction(actor("financeiro"), submit)).toBe(false);
      expect(crmAccessPolicy.canPerformLeadAction(actor("comercial"), submit)).toBe(true);
    });

    it("concluir cadastro: time Operações Legais e admin", () => {
      const conclude = advance("cadastro_novo_cliente", "inclusao_faturamento", "onboarding_conclude");
      expect(crmAccessPolicy.canPerformLeadAction(actor("comercial"), conclude)).toBe(false);
      expect(
        crmAccessPolicy.canPerformLeadAction(actor("controladoria", { modules: ["operacoes_legais"] }), conclude),
      ).toBe(true);
      expect(crmAccessPolicy.canPerformLeadAction(actor("admin"), conclude)).toBe(true);
      expect(
        crmAccessPolicy.evaluateLeadAction(
          actor("controladoria", { modules: ["operacoes_legais"] }),
          advance("cadastro_novo_cliente", "inclusao_faturamento"),
        ),
      ).toMatchObject({ allowed: false, code: "use_dedicated_action", actionKind: "open_ops_panel" });
    });

    it("boas-vindas só pela ativação do contrato (financeiro, controladoria, admin)", () => {
      const activation = advance("inclusao_faturamento", "boas_vindas", "contract_activation");
      for (const role of roles) {
        expect(crmAccessPolicy.canPerformLeadAction(actor(role), activation), role).toBe(role !== "comercial");
      }
      expect(
        crmAccessPolicy.evaluateLeadAction(actor("admin"), advance("inclusao_faturamento", "boas_vindas")),
      ).toMatchObject({ allowed: false, code: "use_dedicated_action", actionKind: "open_contract_setup" });
    });

    it("pós-venda sem regra própria: só admin", () => {
      expect(crmAccessPolicy.canPerformLeadAction(actor("comercial"), advance("inclusao_faturamento", "cadastro_novo_cliente"))).toBe(false);
      expect(crmAccessPolicy.canPerformLeadAction(actor("admin"), advance("inclusao_faturamento", "cadastro_novo_cliente"))).toBe(true);
    });
  });

  it("toCrmActor descarta papel e módulos desconhecidos", () => {
    expect(crmAccessPolicy.toCrmActor({ appUserId: "x", role: "socio", area: null })).toBeNull();
    expect(
      crmAccessPolicy.toCrmActor({ appUserId: "x", role: "comercial", area: null, modules: ["icp", "outro"] })?.modules,
    ).toEqual(["icp"]);
  });
});
