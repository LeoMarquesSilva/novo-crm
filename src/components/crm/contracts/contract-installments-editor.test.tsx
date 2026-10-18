// @vitest-environment jsdom
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { ContractInstallmentsEditor } from "./contract-installments-editor";

type Installment = { number: number; competency: string; amountCents: string; dueDate?: string };

function Harness({ onChange }: { onChange: (next: { installments: Installment[]; amountCents: string }) => void }) {
  const [installments, setInstallments] = React.useState<Installment[]>([]);
  return (
    <ContractInstallmentsEditor
      key={installments.length}
      installments={installments}
      defaultFirstDueDate="2026-10-20"
      onChange={(next) => {
        setInstallments(next.installments);
        onChange(next);
      }}
    />
  );
}

test("gera 5 parcelas de R$ 2.400 vencendo no dia 20 e recalcula o total ao editar uma parcela", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<Harness onChange={onChange} />);

  const [count, total] = screen.getAllByRole("textbox");
  await user.clear(count!);
  await user.type(count!, "5");
  await user.type(total!, "1200000");
  await user.click(screen.getByRole("button", { name: "Gerar parcelas" }));

  expect(onChange).toHaveBeenLastCalledWith({
    amountCents: "1200000",
    installments: [
      { number: 1, competency: "2026-10-01", dueDate: "2026-10-20", amountCents: "240000" },
      { number: 2, competency: "2026-11-01", dueDate: "2026-11-20", amountCents: "240000" },
      { number: 3, competency: "2026-12-01", dueDate: "2026-12-20", amountCents: "240000" },
      { number: 4, competency: "2027-01-01", dueDate: "2027-01-20", amountCents: "240000" },
      { number: 5, competency: "2027-02-01", dueDate: "2027-02-20", amountCents: "240000" },
    ],
  });
  expect(screen.getByText("out/2026")).toBeTruthy();
  expect(screen.getByText("fev/2027")).toBeTruthy();

  await user.click(screen.getByRole("button", { name: "Remover parcela 5" }));
  expect(onChange.mock.lastCall?.[0]).toMatchObject({ amountCents: "960000" });
  expect(onChange.mock.lastCall?.[0].installments).toHaveLength(4);
});
