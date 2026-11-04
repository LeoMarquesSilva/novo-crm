// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/crm/crm-session-context", () => ({
  useCrmActor: () => ({ appUserId: "u1", role: "financeiro", area: null, isPartner: false, isAdmin: false }),
}));
let canConfigure = true;
vi.mock("@/lib/auth/crm-access-policy", () => ({ canConfigureContract: () => canConfigure }));

import type { LeadDetailData } from "./page";
import { ContractBillingOnboardingPanel } from "./contract-billing-onboarding-panel";

type Billing = NonNullable<LeadDetailData["contractBilling"]>;

function billing(patch: Partial<Billing> = {}): Billing {
  return {
    id: "c1",
    lifecycleStatus: "rascunho",
    version: { id: "v1", number: 1, status: "rascunho" },
    validationProgress: { completed: 1, total: 5, percentage: 20 },
    suggestionsOrigin: "Rascunho criado a partir da assinatura.",
    blockers: [
      "Informar o início da vigência.",
      "Definir o primeiro faturamento.",
      "Informar ao menos um responsável.",
      "Configurar ao menos uma regra de cobrança.",
    ],
    activationPending: true,
    readiness: { cadastroConcluido: true, clienteVinculado: true, datasNoCadastro: true, pdfAssinado: true },
    setupHref: "/crm/contratos/c1?setup=1&returnTo=%2Fcrm%2Fleads%2Fl1",
    inclusion: null,
    ...patch,
  };
}

const included = { prefilledAt: "2026-11-03T18:00:00Z", auto: true, pdfStatus: "read", pdfMessage: null, divergences: [] };

beforeEach(() => {
  canConfigure = true;
});

test("antes da inclusão automática, explica que é automática e não lista pendências do rascunho vazio", () => {
  render(<ContractBillingOnboardingPanel leadId="l1" stage="inclusao_faturamento" contractBilling={billing()} />);
  expect(screen.getByText("Inclusão automática em andamento")).toBeTruthy();
  expect(screen.queryByText("Falta configurar")).toBeNull();
  // Se a automática não aconteceu, o Financeiro inclui na hora.
  expect(screen.getByRole("button", { name: "Incluir agora" })).toBeTruthy();
});

test("antes da inclusão, aponta o que de fato falta (cadastro não concluído, sem PDF)", () => {
  render(
    <ContractBillingOnboardingPanel
      leadId="l1"
      stage="inclusao_faturamento"
      contractBilling={billing({
        validationProgress: { completed: 0, total: 5, percentage: 0 },
        readiness: { cadastroConcluido: false, clienteVinculado: false, datasNoCadastro: true, pdfAssinado: false },
      })}
    />,
  );
  expect(screen.getByText(/Operações Legais ainda não concluiu o cadastro/)).toBeTruthy();
  expect(screen.getByText(/Sem PDF assinado/)).toBeTruthy();
});

test("incluído e só falta ativar: aviso de próximo passo e link para conferir e ativar", () => {
  render(
    <ContractBillingOnboardingPanel
      leadId="l1"
      stage="inclusao_faturamento"
      contractBilling={billing({ validationProgress: { completed: 4, total: 5, percentage: 80 }, blockers: [], inclusion: included })}
    />,
  );
  expect(screen.getByText("Falta ativar o contrato")).toBeTruthy();
  expect(screen.getByText(/incluído automaticamente/)).toBeTruthy();
  expect(screen.queryByText("Falta configurar")).toBeNull();
  const link = screen.getByRole("link", { name: "Conferir e ativar o contrato" });
  expect(link.getAttribute("href")).toBe("/crm/contratos/c1?setup=1&returnTo=%2Fcrm%2Fleads%2Fl1");
});

test("quem não configura contrato só acompanha: link Abrir contrato, sem Incluir agora", () => {
  canConfigure = false;
  render(
    <ContractBillingOnboardingPanel
      leadId="l1"
      stage="inclusao_faturamento"
      contractBilling={billing({ validationProgress: { completed: 4, total: 5, percentage: 80 }, blockers: [], inclusion: included })}
    />,
  );
  expect(screen.getByRole("link", { name: "Abrir contrato" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Incluir agora" })).toBeNull();
});
