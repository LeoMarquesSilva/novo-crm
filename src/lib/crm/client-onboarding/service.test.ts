import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CrmActor } from "@/lib/auth/crm-access-policy";
import { PublicError } from "@/lib/http/api-errors";
import { createSupabaseFake } from "@/test/supabase-fake";
import { emptyClientOnboardingPayload, parseOpsChecklist } from "@/modules/crm/domain/client-onboarding";

import type { OnboardingContext } from "./load-onboarding-context";
import { concludeOnboarding, evaluateOnboardingAction, submitOnboarding } from "./service";

vi.mock("@/lib/crm/notifications/crm-notify", () => ({ notifyAudience: vi.fn(async () => [{}]) }));
vi.mock("@/lib/crm/record-lead-activity", () => ({ recordLeadActivityEvent: vi.fn() }));
vi.mock("@/lib/crm/post-sale/on-enter-inclusao-faturamento", () => ({ onEnteredInclusaoFaturamento: vi.fn() }));

const actor = (role: CrmActor["role"], extra: Partial<CrmActor> = {}): CrmActor => ({
  appUserId: "u-1",
  role,
  area: null,
  email: "pessoa@bp.com.br",
  modules: [],
  ...extra,
});

function ctx(etapa: OnboardingContext["opportunity"]["etapa"], patch: Partial<OnboardingContext> = {}): OnboardingContext {
  return {
    opportunity: {
      id: "lead-1",
      etapa,
      solicitanteNome: "ACME",
      solicitanteEmail: "captador@bp.com.br",
      criadoPor: "dono",
      clienteId: null,
    },
    isRdLead: false,
    migrationPending: false,
    row: null,
    payload: emptyClientOnboardingPayload(),
    checklist: parseOpsChecklist({}),
    ...patch,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("evaluateOnboardingAction", () => {
  it("responsável (captador) edita e envia em Aguardando Cadastro; financeiro não", () => {
    const c = ctx("aguardando_cadastro");
    expect(evaluateOnboardingAction(actor("financeiro", { email: "captador@bp.com.br" }), c, "submit").allowed).toBe(true);
    expect(evaluateOnboardingAction(actor("financeiro"), c, "submit").allowed).toBe(false);
    expect(evaluateOnboardingAction(actor("comercial"), c, "edit_draft").allowed).toBe(true);
  });

  it("só Operações Legais (e admin) conferem, devolvem e concluem", () => {
    const c = ctx("cadastro_novo_cliente");
    expect(evaluateOnboardingAction(actor("comercial"), c, "conclude").allowed).toBe(false);
    expect(evaluateOnboardingAction(actor("controladoria", { modules: ["operacoes_legais"] }), c, "conclude").allowed).toBe(true);
    expect(evaluateOnboardingAction(actor("controladoria", { modules: ["operacoes_legais"] }), c, "return").allowed).toBe(true);
    expect(evaluateOnboardingAction(actor("admin"), c, "edit_draft").allowed).toBe(true);
  });

  it("etapa errada e lead do RD são recusados", () => {
    expect(evaluateOnboardingAction(actor("admin"), ctx("inclusao_faturamento"), "submit").allowed).toBe(false);
    expect(evaluateOnboardingAction(actor("admin"), ctx("aguardando_cadastro", { isRdLead: true }), "submit").allowed).toBe(false);
  });
});

describe("submitOnboarding / concludeOnboarding", () => {
  it("envio incompleto é recusado com a lista do que falta", async () => {
    const fake = createSupabaseFake({});
    const error = await submitOnboarding(fake.client as never, {
      ctx: ctx("aguardando_cadastro"),
      actor: actor("comercial"),
      payload: emptyClientOnboardingPayload(),
    }).catch((e) => e);
    expect(error).toBeInstanceOf(PublicError);
    expect((error as PublicError).status).toBe(422);
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("migration pendente responde 409", async () => {
    const fake = createSupabaseFake({});
    const error = await submitOnboarding(fake.client as never, {
      ctx: ctx("aguardando_cadastro", { migrationPending: true }),
      actor: actor("comercial"),
      payload: emptyClientOnboardingPayload(),
    }).catch((e) => e);
    expect((error as PublicError).status).toBe(409);
  });

  it("checklist incompleto bloqueia a conclusão", async () => {
    const fake = createSupabaseFake({});
    const error = await concludeOnboarding(fake.client as never, {
      ctx: ctx("cadastro_novo_cliente"),
      actor: actor("admin"),
      checklist: parseOpsChecklist({ dadosConferidos: true }),
      grupoId: null,
      clienteId: null,
    }).catch((e) => e);
    expect((error as PublicError).code).toBe("CHECKLIST_INCOMPLETE");
  });

  it("cliente em outro grupo vira 409 explicado", async () => {
    const payload = emptyClientOnboardingPayload();
    Object.assign(payload.cadastro, {
      razaoSocial: "ACME",
      documento: "12345678000190",
      endereco: { cep: "13010000", logradouro: "Rua", numero: "1", complemento: "", bairro: "", cidade: "Campinas", uf: "SP" },
    });
    Object.assign(payload.financeiro, {
      faturamento: { razaoSocial: "ACME", documento: "12345678000190" },
      inicioVigencia: "2026-10-15",
      primeiroFaturamento: "2026-11-10",
      contatoFinanceiro: { nome: "Ana", posicao: "", email: "ana@acme.com", telefone: "" },
      reajuste: { indice: "IPCA", periodicidadeMeses: "12" },
    });
    const fake = createSupabaseFake({
      rpc: {
        conclude_client_onboarding_atomic: { data: null, error: { code: "23514", message: "CLIENTE_GRUPO_CONFLICT" } },
      },
    });
    const error = await concludeOnboarding(fake.client as never, {
      ctx: ctx("cadastro_novo_cliente", { payload }),
      actor: actor("admin"),
      checklist: parseOpsChecklist({
        dadosConferidos: true,
        viosCadastrado: true,
        viosReferencia: "V-1",
        sistemasLegadosAtualizados: true,
        grupoNome: "Grupo ACME",
      }),
      grupoId: null,
      clienteId: null,
    }).catch((e) => e);
    expect((error as PublicError).code).toBe("CLIENTE_GRUPO_CONFLICT");
    expect(fake.rpc).toHaveBeenCalledWith(
      "conclude_client_onboarding_atomic",
      expect.objectContaining({ p_grupo_nome: "Grupo ACME", p_grupo_chave: "grupo acme" }),
    );
  });
});
