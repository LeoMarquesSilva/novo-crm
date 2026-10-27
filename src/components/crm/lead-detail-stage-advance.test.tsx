// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { OpportunityStage } from "@/modules/crm/domain/entities";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/crm/contracts/send-contract-signature-dialog", () => ({
  SendContractSignatureDialog: () => null,
}));
vi.mock("@/components/crm/client-onboarding-submit-dialog", () => ({
  ClientOnboardingSubmitDialog: ({ open }: { open: boolean }) => (open ? <div>modal do cadastro do cliente</div> : null),
}));
vi.mock("@/components/crm/lead-stage-duration-strip", () => ({
  LeadStageDurationStrip: ({
    advanceStage,
    onAdvance,
  }: {
    advanceStage: OpportunityStage | null;
    onAdvance?: (stage: OpportunityStage) => void;
  }) =>
    advanceStage && onAdvance ? (
      <button type="button" onClick={() => onAdvance(advanceStage)}>
        Avançar etapa
      </button>
    ) : null,
}));

import { LeadDetailStageAdvance } from "./lead-detail-stage-advance";

vi.setConfig({ testTimeout: 20_000 });

const condicaoDue = { type: "field_equals", field: "cp_realizou_due", value: "Sim" };
const requirements = {
  ok: true,
  needsModal: true,
  missingLinkProposta: false,
  missingLinkContrato: false,
  leadIntake: null,
  leadIntakeBlockingReason: null,
  empresasIntake: [{ index: 0, razao_social: "ACME Ltda", tipo_documento: "CNPJ", documento: "12.345.678/0001-90" }],
  customFields: [
    { id: "1", field_code: "cp_proposta_empresas_json", label: "Empresas na proposta (JSON) [CP]", field_type: "textarea", is_required: true, condition_json: null, field_options: [], sort_order: 18, stage_code: "confeccao_proposta", pipeline_code: "vendas", is_active: true },
    { id: "2", field_code: "cp_escopo_detalhe_json", label: "Escopo detalhado por área (JSON) [CP]", field_type: "textarea", is_required: false, condition_json: null, field_options: [], sort_order: 32, stage_code: "confeccao_proposta", pipeline_code: "vendas", is_active: true },
    { id: "3", field_code: "cp_realizou_due", label: "Realizou Due Diligence? [CP]", field_type: "select", is_required: false, condition_json: null, field_options: ["Sim", "Nao"], sort_order: 80, stage_code: "confeccao_proposta", pipeline_code: "vendas", is_active: true },
    { id: "4", field_code: "cp_link_arquivo_due", label: "Link do Arquivo DUE", field_type: "url", is_required: true, condition_json: condicaoDue, field_options: [], sort_order: 140, stage_code: "confeccao_proposta", pipeline_code: "vendas", is_active: true },
  ],
  fieldValues: { cp_realizou_due: "Nao", cp_cliente_logradouro: "Rua das Flores" },
  warnings: [],
  transitionBlocker: null,
};

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("transition-requirements")) {
    return new Response(JSON.stringify(requirements), { status: 200 });
  }
  return new Response(JSON.stringify({ ok: false }), { status: 200 });
});

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function renderAdvance() {
  return render(
    <LeadDetailStageAdvance
      leadId="lead-1"
      currentStage="reuniao"
      hasDueDiligence={false}
      timeline={{ periods: [], activities: [], summary: {} } as never}
      canAdvance
      linkProposta={null}
      linkContrato={null}
    />,
  );
}

const requirementCalls = () =>
  fetchMock.mock.calls.filter(([input]) => String(input).includes("transition-requirements")).length;

test("Reunião → Confecção: bloco dedicado no lugar do JSON e sem link da DUE quando não houve DUE", async () => {
  const user = userEvent.setup();
  renderAdvance();
  await user.click(screen.getByRole("button", { name: "Avançar etapa" }));

  expect(await screen.findByText("Endereço do cliente")).toBeInTheDocument();
  expect(screen.queryByText(/\(JSON\)/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Link do Arquivo DUE/)).not.toBeInTheDocument();
  expect(document.querySelector('input[type="url"]')).toBeNull();
});

test("fechar e reabrir mantém o que foi preenchido", async () => {
  const user = userEvent.setup();
  renderAdvance();
  await user.click(screen.getByRole("button", { name: "Avançar etapa" }));
  const logradouro = await screen.findByDisplayValue("Rua das Flores");
  await user.type(logradouro, ", 100");

  await user.click(screen.getByRole("button", { name: "Fechar" }));
  await waitFor(() => expect(screen.queryByText("Endereço do cliente")).not.toBeInTheDocument());

  await user.click(screen.getByRole("button", { name: "Avançar etapa" }));
  expect(await screen.findByDisplayValue("Rua das Flores, 100")).toBeInTheDocument();
  expect(requirementCalls()).toBe(1);

  // "Recomeçar" busca os dados de novo e descarta o rascunho.
  await user.click(screen.getByRole("button", { name: "Recomeçar" }));
  expect(await screen.findByDisplayValue("Rua das Flores")).toBeInTheDocument();
  expect(requirementCalls()).toBe(2);
});

test("Aguardando Cadastro → Cadastro de Novo Cliente abre o cadastro do cliente num modal", async () => {
  fetchMock.mockImplementationOnce(async () =>
    new Response(
      JSON.stringify({
        ok: true,
        needsModal: false,
        transitionBlocker: {
          code: "use_dedicated_action",
          message: "Preencha o cadastro do cliente e envie para Operações Legais.",
          actionHref: "/crm/leads/lead-1?tab=onboarding",
          actionKind: "open_onboarding",
        },
      }),
      { status: 200 },
    ),
  );
  const user = userEvent.setup();
  render(
    <LeadDetailStageAdvance
      leadId="lead-1"
      currentStage="aguardando_cadastro"
      hasDueDiligence={false}
      timeline={{ periods: [], activities: [], summary: {} } as never}
      canAdvance
      linkProposta={null}
      linkContrato={null}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Avançar etapa" }));

  expect(await screen.findByText("modal do cadastro do cliente")).toBeInTheDocument();
  expect(screen.queryByText("Existe uma pendência")).not.toBeInTheDocument();
});
