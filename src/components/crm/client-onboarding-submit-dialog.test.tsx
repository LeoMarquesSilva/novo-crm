// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { parseClientOnboardingPayload } from "@/modules/crm/domain/client-onboarding";

import { ClientOnboardingSubmitDialog } from "./client-onboarding-submit-dialog";

vi.setConfig({ testTimeout: 20_000 });

const payload = parseClientOnboardingPayload({
  cadastro: {
    razaoSocial: "ACME LTDA",
    documento: "11222333000181",
    endereco: { cep: "13010000", logradouro: "Rua das Flores", numero: "100", bairro: "Centro", cidade: "Campinas", uf: "SP" },
    email: "ana@acme.com",
    telefone: "(19) 98215-2220",
  },
  financeiro: {
    faturamento: { razaoSocial: "ACME LTDA", documento: "11222333000181" },
    inicioVigencia: "2026-10-01",
    primeiroFaturamento: "2026-11-10",
    contatoFinanceiro: { nome: "Ana", posicao: "Financeiro", email: "ana@acme.com", telefone: "" },
    rateioPorArea: [{ area: "Cível", percentual: "100" }],
    reajuste: { indice: "IPCA", periodicidadeMeses: "12" },
  },
  sources: { "cadastro.email": "ponto_focal" },
});

const response = (permissions = { editDraft: true, submit: true }) => ({
  ok: true,
  stage: "aguardando_cadastro",
  isRdLead: false,
  migrationPending: false,
  onboarding: { status: "rascunho", returnComment: null, updatedAt: "2026-10-27T12:00:00Z" },
  payload,
  permissions: { ...permissions, review: false, returnToOwner: false, conclude: false },
});

let getResponse = response();
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.endsWith("/submit") && init?.method === "POST") {
    return new Response(JSON.stringify({ ok: true, stage: "cadastro_novo_cliente" }), { status: 200 });
  }
  if (init?.method === "PUT") {
    return new Response(JSON.stringify({ ok: true, updatedAt: "2026-10-27T12:05:00Z" }), { status: 200 });
  }
  return new Response(JSON.stringify(getResponse), { status: 200 });
});

beforeEach(() => {
  getResponse = response();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function renderDialog() {
  const onOpenChange = vi.fn();
  const onSubmitted = vi.fn();
  render(
    <ClientOnboardingSubmitDialog
      open
      onOpenChange={onOpenChange}
      leadId="lead-1"
      leadName="ACME LTDA"
      onSubmitted={onSubmitted}
    />,
  );
  return { onOpenChange, onSubmitted };
}

const callsTo = (method: string) =>
  fetchMock.mock.calls.filter(([, init]) => (init?.method ?? "GET") === method);

test("abre com o cadastro já preenchido e envia para Operações Legais", async () => {
  const user = userEvent.setup();
  const { onOpenChange, onSubmitted } = renderDialog();

  expect(await screen.findByLabelText("E-mail do cliente")).toHaveValue("ana@acme.com");
  expect(screen.getByLabelText("Razão social *")).toHaveValue("ACME LTDA");
  expect(screen.getByText("Ponto focal — confirme")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /Enviar para Operações Legais/ }));

  await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith({ stage: "cadastro_novo_cliente" }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
  const [, init] = callsTo("POST")[0]!;
  expect(JSON.parse(String(init?.body)).payload.cadastro.razaoSocial).toBe("ACME LTDA");
});

test("fechar depois de editar guarda o rascunho", async () => {
  const user = userEvent.setup();
  const { onOpenChange, onSubmitted } = renderDialog();
  const email = await screen.findByLabelText("E-mail do cliente");

  await user.clear(email);
  await user.type(email, "contato@acme.com");
  await user.click(screen.getByRole("button", { name: "Fechar" }));

  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  const [, init] = callsTo("PUT")[0]!;
  const body = JSON.parse(String(init?.body));
  expect(body.payload.cadastro.email).toBe("contato@acme.com");
  expect(body.expectedUpdatedAt).toBe("2026-10-27T12:00:00Z");
  expect(onSubmitted).not.toHaveBeenCalled();
});

test("sem permissão de envio o modal só mostra o cadastro", async () => {
  getResponse = response({ editDraft: false, submit: false });
  renderDialog();

  expect(await screen.findByText(/Só o responsável pelo lead/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Enviar para Operações Legais/ })).toBeDisabled();
  expect(screen.queryByRole("button", { name: /Salvar rascunho/ })).not.toBeInTheDocument();
});
