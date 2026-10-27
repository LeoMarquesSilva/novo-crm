// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./client-onboarding-form", () => ({ ClientOnboardingForm: () => <div>formulário</div> }));
vi.mock("./ops-legais-review-panel", () => ({ OpsLegaisReviewPanel: () => <div>painel Operações Legais</div> }));
vi.mock("@/modules/crm/domain/client-onboarding", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/crm/domain/client-onboarding")>()),
  listMissingOnboardingFields: () => [],
  listMissingCadastroFields: () => [],
  listMissingFaturamentoFields: () => [],
}));

import { ClientOnboardingTab } from "./client-onboarding-tab";

const permissions = { editDraft: true, submit: true, review: true, returnToOwner: true, conclude: true };
const response = (stage: string, status: string) => ({
  ok: true,
  stage,
  isRdLead: false,
  migrationPending: false,
  onboarding: { status, returnComment: null, returnedAt: null, concludedAt: null, grupoNome: null, viosReferencia: null, updatedAt: "2026-10-18T12:00:00Z" },
  payload: {},
  checklist: {},
  permissions,
});

let serverState = response("aguardando_cadastro", "rascunho");
async function serverFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input);
  if (url.endsWith("/submit") && init?.method === "POST") {
    serverState = response("cadastro_novo_cliente", "enviado");
    return new Response(JSON.stringify({ ok: true, stage: "cadastro_novo_cliente" }), { status: 200 });
  }
  return new Response(JSON.stringify(serverState), { status: 200 });
}
const fetchMock = vi.fn(serverFetch);

beforeEach(() => {
  serverState = response("aguardando_cadastro", "rascunho");
  fetchMock.mockReset();
  fetchMock.mockImplementation(serverFetch);
  refresh.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

test("depois de enviar para Operações Legais a aba mostra o novo status sem recarregar", async () => {
  const user = userEvent.setup();
  render(<ClientOnboardingTab leadId="lead-1" />);
  expect(await screen.findByText("Em preenchimento pelo responsável")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /Enviar para Operações Legais/ }));
  await user.click(await screen.findByRole("button", { name: "Enviar" }));

  await waitFor(() => expect(screen.getByText("Com Operações Legais")).toBeInTheDocument());
  expect(screen.queryByText("Em preenchimento pelo responsável")).not.toBeInTheDocument();
  expect(screen.getByText("painel Operações Legais")).toBeInTheDocument();
  expect(refresh).toHaveBeenCalled();
});

test("mostra o status do envio mesmo antes da releitura terminar", async () => {
  const user = userEvent.setup();
  render(<ClientOnboardingTab leadId="lead-1" stage="aguardando_cadastro" />);
  expect(await screen.findByText("Em preenchimento pelo responsável")).toBeInTheDocument();

  // A releitura depois do envio fica pendurada: a tela não pode depender dela.
  let releaseGet: (() => void) | null = null;
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith("/submit") && init?.method === "POST") {
      serverState = response("cadastro_novo_cliente", "enviado");
      return new Response(JSON.stringify({ ok: true, stage: "cadastro_novo_cliente" }), { status: 200 });
    }
    await new Promise<void>((resolve) => {
      releaseGet = resolve;
    });
    return new Response(JSON.stringify(serverState), { status: 200 });
  });

  await user.click(screen.getByRole("button", { name: /Enviar para Operações Legais/ }));
  await user.click(await screen.findByRole("button", { name: "Enviar" }));
  expect(await screen.findByText("Com Operações Legais")).toBeInTheDocument();
  (releaseGet as (() => void) | null)?.();
});

test("relê o cadastro quando a etapa do lead muda no servidor", async () => {
  serverState = response("cadastro_novo_cliente", "enviado");
  const { rerender } = render(<ClientOnboardingTab leadId="lead-1" stage="cadastro_novo_cliente" />);
  expect(await screen.findByText("Com Operações Legais")).toBeInTheDocument();

  // Operações Legais devolveu em outra sessão; o Realtime atualiza a etapa da ficha.
  serverState = { ...response("aguardando_cadastro", "devolvido") };
  rerender(<ClientOnboardingTab leadId="lead-1" stage="aguardando_cadastro" />);
  expect(await screen.findByText("Devolvido para ajuste")).toBeInTheDocument();
});
