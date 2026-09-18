// @vitest-environment jsdom
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { CarteiraGrupoDetailDialog } from "@/components/crm/carteira-grupo-detail-dialog";

const GRUPO = {
  id: "11111111-1111-1111-1111-111111111111",
  nome: "Grupo Teste",
  clienteStatus: "ativo" as const,
  origemLinha: "cliente" as const,
  responsibleArea: null,
  tipoLead: "Lead Ativa",
  tipoIndicacao: null,
  nomeIndicacao: null,
  areasAtuacao: [],
  membros: [],
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/crm/carteira/grupos/")) {
        return new Response(
          JSON.stringify({
            ok: true,
            data: { derivedAreas: [] },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    }),
  );
});

test("no modo editar, clicar a área marca o chip mesmo com o Select de Indicação no dialog", async () => {
  const user = userEvent.setup();

  render(
    <CarteiraGrupoDetailDialog grupo={GRUPO} canEdit onOpenChange={() => undefined} />,
  );

  await user.click(screen.getByRole("button", { name: "Editar" }));

  const indication = screen.getByRole("combobox");
  await user.click(indication);
  expect(await screen.findByRole("option", { name: "Lead Digital" })).toBeInTheDocument();

  const chip = screen.getByRole("checkbox", { name: /Trabalhista/ });
  expect(chip).toHaveAttribute("aria-checked", "false");
  await user.click(chip);

  expect(screen.getByRole("dialog", { name: "Grupo Teste" })).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: /Trabalhista/ })).toHaveAttribute("aria-checked", "true");
  expect(chip).toHaveTextContent("Manual, se marcada");
});
