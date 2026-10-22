// @vitest-environment jsdom
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";

import { ContractPercentInput } from "./contract-money-percent-inputs";

function Harness({ initial }: { initial: number | null }) {
  const [bp, setBp] = useState<number | null>(initial);
  return (
    <>
      <ContractPercentInput id="pct" basisPoints={bp} onBasisPointsChange={setBp} />
      <output data-testid="bp">{bp === null ? "vazio" : String(bp)}</output>
    </>
  );
}

test("digitar 5 grava 5% (500 bp), não 0,05%", async () => {
  const user = userEvent.setup();
  render(<Harness initial={null} />);
  const input = screen.getByRole("textbox");
  await user.type(input, "5");
  expect(screen.getByTestId("bp")).toHaveTextContent("500");
  await user.tab();
  expect(input).toHaveValue("5,00%");
});

test("edita um valor existente com vírgula decimal", async () => {
  const user = userEvent.setup();
  render(<Harness initial={1500} />);
  const input = screen.getByRole("textbox");
  expect(input).toHaveValue("15,00%");
  await user.click(input);
  expect(input).toHaveValue("15");
  await user.clear(input);
  await user.type(input, "12,5");
  expect(screen.getByTestId("bp")).toHaveTextContent("1250");
  await user.type(input, "x");
  expect(input).toHaveValue("12,5");
});
