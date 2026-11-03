// @vitest-environment jsdom
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";

import { emptyClientOnboardingPayload, type ClientOnboardingPayload, type LeadIndicacao } from "@/modules/crm/domain/client-onboarding";

import { ClientOnboardingForm } from "./client-onboarding-form";

function Faturamento({ initial, indicacao = null }: { initial: ClientOnboardingPayload; indicacao?: LeadIndicacao | null }) {
  const [payload, setPayload] = useState(initial);
  return <ClientOnboardingForm payload={payload} sections="faturamento" indicacao={indicacao} onChange={setPayload} />;
}

function comRateio() {
  const p = emptyClientOnboardingPayload();
  p.financeiro.valorRateio = "R$ 10.000,00";
  p.financeiro.rateioPorArea = [
    { area: "Cível", percentual: "60" },
    { area: "Trabalhista", percentual: "30" },
  ];
  return p;
}

test("rateio mostra o R$ de cada área e quanto falta para 100% (29/10/2026)", async () => {
  render(<Faturamento initial={comRateio()} />);
  expect(screen.getByText("R$ 6.000,00")).toBeTruthy();
  expect(screen.getByText("R$ 3.000,00")).toBeTruthy();
  expect(screen.getByText("Faltam 10%")).toBeTruthy();

  const segundo = screen.getByLabelText("Percentual da área 2");
  await userEvent.clear(segundo);
  await userEvent.type(segundo, "40");
  expect(screen.getByText("Fecha 100%")).toBeTruthy();
  expect(screen.getByText("R$ 4.000,00")).toBeTruthy();
});

test("nova área já vem com o que falta, e dividir igualmente fecha 100%", async () => {
  render(<Faturamento initial={comRateio()} />);
  await userEvent.click(screen.getByRole("button", { name: /Adicionar área/ }));
  expect((screen.getByLabelText("Percentual da área 3") as HTMLInputElement).value).toBe("10");
  await userEvent.click(screen.getByRole("button", { name: "Dividir igualmente" }));
  expect((screen.getByLabelText("Percentual da área 1") as HTMLInputElement).value).toBe("33,33");
  expect((screen.getByLabelText("Percentual da área 3") as HTMLInputElement).value).toBe("33,34");
  expect(screen.getByText("Fecha 100%")).toBeTruthy();
});

test("modal sobre a aba usa outro prefixo de id: o rótulo foca o campo do modal (03/11/2026)", () => {
  render(
    <>
      <ClientOnboardingForm payload={emptyClientOnboardingPayload()} sections="cadastro" onChange={() => undefined} />
      <ClientOnboardingForm payload={emptyClientOnboardingPayload()} sections="cadastro" idPrefix="dlg-" onChange={() => undefined} />
    </>,
  );
  const [aba, modal] = screen.getAllByLabelText("E-mail do cliente");
  expect(aba!.id).toBe("ob-email");
  expect(modal!.id).toBe("dlg-ob-email");
});

test("repasse acordado só aparece em lead de indicação", () => {
  const { unmount } = render(<Faturamento initial={comRateio()} />);
  expect(screen.queryByLabelText(/Repasse acordado/)).toBeNull();
  unmount();
  render(<Faturamento initial={comRateio()} indicacao={{ tipo: "Contador", nome: "João" }} />);
  expect(screen.getByLabelText(/Repasse acordado com a indicação/)).toBeTruthy();
  expect(screen.getByText(/Indicação de João \(Contador\)/)).toBeTruthy();
});
