// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

import { computeRdMigrationRequirements } from "@/lib/crm/rd-migration/requirements";
import type { RdMigrationDetail } from "@/lib/crm/rd-migration/service";
import { parseRdMigrationValues } from "@/lib/crm/rd-migration/values";

import { RdMigrationForm } from "./rd-migration-form";

const leadId = "00000000-0000-4000-8000-0000000000bb";

function detailFor(overrides: Partial<RdMigrationDetail> = {}): RdMigrationDetail {
  const values = parseRdMigrationValues({
    cadastro: {
      empresas: [{ tipo_documento: "CNPJ", razao_social: "ACME LTDA", documento: "12345678000199" }],
      tipoLead: "Lead Ativa",
      areasAnalise: ["Cível"],
      dueDiligence: "Nao",
      localReuniao: "",
      dataReuniao: "2026-10-10",
      horarioReuniao: "14:30",
    },
    sources: { "cadastro.empresas": "RD: Razão Social [CP]" },
  });
  const requirements = computeRdMigrationRequirements({
    stage: "reuniao",
    values,
    fieldDefinitions: [],
    responsibleAppUserId: "u-ana",
  });
  return {
    opportunityId: leadId,
    rdDealId: "68924d7526c1f50018dc039b",
    rdDealUrl: "https://crm.rdstation.com/deals/68924d7526c1f50018dc039b",
    nome: "ACME LTDA",
    status: "pendente",
    converted: false,
    rdStageLabel: "Reunião (SOLICITANTE)",
    stage: "reuniao",
    stageLabel: "Reunião",
    outOfScopeReason: null,
    responsible: { appUserId: "u-ana", fullName: "Ana Paula Souza", origem: "solicitante" },
    canEdit: true,
    isAdmin: false,
    values,
    requirements,
    gestorField: null,
    rdFields: [{ label: "Razão Social [CP]", value: "ACME LTDA" }],
    rdUpdatedAt: "2026-10-16T10:00:00-03:00",
    updatedAt: null,
    motivoFora: null,
    schemaPending: false,
    frozen: false,
    users: [{ id: "u-ana", fullName: "Ana Paula Souza" }],
    duplicate: null,
    ...overrides,
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  refresh.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

test("mostra a pendência, some ao preencher e salva o rascunho", async () => {
  const user = userEvent.setup();
  const initial = detailFor();
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const saved = detailFor({ values: parseRdMigrationValues(body.values), updatedAt: "2026-10-19T12:00:00Z" });
    return new Response(JSON.stringify({ ok: true, detail: saved, warnings: [] }), { status: 200 });
  });

  render(<RdMigrationForm initial={initial} />);

  const pendencias = screen.getByRole("heading", { name: "Pendências" }).closest("section")!;
  expect(within(pendencias).getByText("Local da reunião")).toBeTruthy();
  expect(screen.getByText("1 pendência antes da virada.")).toBeTruthy();
  // O que veio do RD aparece marcado e a lista do RD fica ao lado.
  expect(screen.getAllByText("Do RD").length).toBeGreaterThan(0);
  expect(screen.getByRole("link", { name: /Abrir no RD/ })).toBeTruthy();

  await user.type(screen.getByLabelText(/Local da reunião/), "Escritório Campinas");
  expect(within(pendencias).getByText(/Nada falta para a virada/)).toBeTruthy();
  expect(screen.getByText("Tudo pronto para a virada.")).toBeTruthy();

  await user.click(screen.getByRole("button", { name: "Salvar rascunho" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe(`/api/crm/rd-migration/${leadId}`);
  expect(init.method).toBe("PUT");
  expect(JSON.parse(String(init.body)).values.cadastro.localReuniao).toBe("Escritório Campinas");
  expect(await screen.findByText(/Rascunho salvo/)).toBeTruthy();
});

test("migração concluída fica só leitura e aponta para a ficha", () => {
  render(<RdMigrationForm initial={detailFor({ status: "concluida", converted: true, canEdit: false })} />);
  expect(screen.getByText("Migração concluída", { selector: "[data-slot='alert-title'], div, h5" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Salvar/ })).toBeNull();
  expect((screen.getByLabelText(/Local da reunião/) as HTMLInputElement).disabled).toBe(true);
  expect(screen.getAllByRole("link", { name: /ficha do lead/i }).length).toBeGreaterThan(0);
});
