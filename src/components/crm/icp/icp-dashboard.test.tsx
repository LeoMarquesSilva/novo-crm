// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import { IcpDashboard } from "@/components/crm/icp/icp-dashboard";
import { icpFixtureData } from "@/components/crm/icp/icp-test-fixture";

// A tela é grande: na suíte completa (jsdom em paralelo) os cliques passam dos 5 s padrão.
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
  refresh.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("mostra as abas e o Resumo por padrão", () => {
  render(<IcpDashboard data={icpFixtureData()} error={null} />);

  const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
  for (const label of ["Resumo", "Carteira", "Clientes", "Marketing", "Pauta comercial"]) {
    expect(tabs).toContain(label);
  }
  expect(screen.getByRole("tab", { name: "Resumo" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("O cliente ideal em uma frase")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Recalcular" })).toBeInTheDocument();
  // O título da página é do CrmPageHeader, não deste componente.
  expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
});

test("na aba Clientes, lista os grupos A e B por padrão e abre o detalhe do grupo", async () => {
  const user = userEvent.setup();
  render(<IcpDashboard data={icpFixtureData()} error={null} />);
  // Só a aba ativa é montada (como no original): a lista não existe antes do clique.
  expect(screen.queryByRole("heading", { name: "Grupos de clientes" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("tab", { name: "Clientes" }));

  expect(screen.getByRole("tab", { name: "Clientes" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("heading", { name: "Grupos de clientes" })).toBeInTheDocument();
  const alfa = screen.getByRole("button", { name: "Alfa" });
  expect(screen.getByRole("button", { name: "Beta" })).toBeInTheDocument();
  // Faixas C e D ficam fora do filtro padrão.
  expect(screen.queryByRole("button", { name: "Gama" })).not.toBeInTheDocument();
  expect(screen.getByText("2 grupos")).toBeInTheDocument();

  await user.click(alfa);
  expect(alfa).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("Sócios administradores")).toBeInTheDocument();
  expect(screen.getByText("Maria da Silva")).toBeInTheDocument();
  expect(screen.getByText("CNPJ 12.345.678/0001-90")).toBeInTheDocument();

  // Ligar a faixa C traz o Gama para a lista.
  await user.click(screen.getByRole("button", { name: /Faixa C/ }));
  expect(screen.getByRole("button", { name: "Gama" })).toBeInTheDocument();
});

test("ordena a lista de clientes pelo nome", async () => {
  const user = userEvent.setup();
  render(<IcpDashboard data={icpFixtureData()} error={null} />);
  await user.click(screen.getByRole("tab", { name: "Clientes" }));

  const table = screen.getByRole("table");
  const names = () =>
    within(table)
      .getAllByRole("button", { expanded: false })
      .map((b) => b.textContent);
  expect(names()).toEqual(["Alfa", "Beta"]);

  await user.click(within(table).getByRole("button", { name: /^Grupo/ }));
  expect(names()).toEqual(["Alfa", "Beta"]);
  await user.click(within(table).getByRole("button", { name: /^Grupo/ }));
  expect(names()).toEqual(["Beta", "Alfa"]);
});

test("as demais abas renderizam sem erro", async () => {
  const user = userEvent.setup();
  render(<IcpDashboard data={icpFixtureData()} error={null} />);

  await user.click(screen.getByRole("tab", { name: "Carteira" }));
  expect(screen.getByRole("heading", { name: "Faixas da carteira" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Quem está em cada bloco" })).toBeInTheDocument();
  const contractPanel = screen.getByRole("heading", { name: "Tipo de contrato" }).closest("section")!;
  // Fixture: Alfa e Delta pagam HONORÁRIOS MENSAIS; Beta, SPOT; Gama, DE ÊXITO.
  const planRows = within(contractPanel).getAllByRole("row").slice(1);
  expect(planRows.map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual([
    "HONORÁRIOS MENSAIS",
    "HONORÁRIOS SPOT",
    "HONORÁRIOS DE ÊXITO",
  ]);

  // Lista dos blocos: opção "Todos", tipo de contrato por grupo e linha que expande.
  const list = screen.getByRole("heading", { name: "Quem está em cada bloco" }).closest("section")!;
  await user.click(within(list).getByRole("tab", { name: /^Todos \(\d+\)$/ }));
  expect(within(list).getByText(/^Todos os \d+ clientes que pagaram/)).toBeInTheDocument();
  const alfaButton = within(list).getByRole("button", { name: "Alfa" });
  expect(alfaButton).toHaveAttribute("aria-expanded", "false");
  await user.click(alfaButton);
  expect(alfaButton).toHaveAttribute("aria-expanded", "true");
  expect(within(list).getByText("Tipo de contrato (plano de contas)")).toBeInTheDocument();
  expect(within(list).getAllByText("HONORÁRIOS MENSAIS").length).toBeGreaterThan(0);

  await user.click(screen.getByRole("tab", { name: "Marketing" }));
  expect(screen.getByRole("heading", { name: "Quem segue a página no LinkedIn" })).toBeInTheDocument();

  await user.click(screen.getByRole("tab", { name: "Pauta comercial" }));
  expect(screen.getByRole("heading", { name: "Área institucional" })).toBeInTheDocument();
  expect(screen.getAllByText("também em Produtos").length).toBeGreaterThan(0);
});

test("Recalcular faz POST em /api/crm/icp/refresh e atualiza a página", async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();
  render(<IcpDashboard data={icpFixtureData()} error={null} />);

  await user.click(screen.getByRole("button", { name: "Recalcular" }));

  expect(fetchMock).toHaveBeenCalledWith("/api/crm/icp/refresh", { method: "POST", credentials: "include" });
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("mostra o erro devolvido pela API ao recalcular", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "VIOS fora do ar." }), { status: 502 })),
  );
  const user = userEvent.setup();
  render(<IcpDashboard data={icpFixtureData()} error={null} />);

  await user.click(screen.getByRole("button", { name: "Recalcular" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("VIOS fora do ar.");
  expect(refresh).not.toHaveBeenCalled();
});

test("sem dados, mostra o erro do cálculo e permite tentar de novo", () => {
  render(<IcpDashboard data={null} error="Falha ao consultar o VIOS." />);

  expect(screen.getByText("O ICP não pôde ser calculado.")).toBeInTheDocument();
  expect(screen.getByText("Falha ao consultar o VIOS.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeEnabled();
  expect(screen.queryByRole("tab")).not.toBeInTheDocument();
});
