// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { GroupPlans } from "@/components/crm/icp/icp-plano-contas";

test("com vários planos, passar o mouse mostra o valor e a parte de cada um", async () => {
  const user = userEvent.setup();
  render(
    <TooltipProvider delayDuration={0}>
      <GroupPlans revenueByPlan={{ "HONORÁRIOS SPOT": 25_000, "HONORÁRIOS MENSAIS": 75_000 }} />
    </TooltipProvider>,
  );

  const trigger = screen.getByRole("button", { name: /Valor por tipo de contrato/ });
  expect(trigger).toHaveAccessibleName(/HONORÁRIOS MENSAIS R\$\s?75 mil; HONORÁRIOS SPOT R\$\s?25 mil/);

  await user.hover(trigger);
  const tooltip = await screen.findByRole("tooltip");
  expect(tooltip).toHaveTextContent("HONORÁRIOS MENSAIS");
  expect(tooltip).toHaveTextContent("75%");
  expect(tooltip).toHaveTextContent("25%");
  expect(tooltip).toHaveTextContent(/Total\s*R\$\s?100 mil/);
});

test("com um plano só, mostra a lista sem tooltip", () => {
  render(
    <TooltipProvider>
      <GroupPlans revenueByPlan={{ "HONORÁRIOS MENSAIS": 75_000 }} />
    </TooltipProvider>,
  );
  expect(screen.getByText("HONORÁRIOS MENSAIS")).toBeInTheDocument();
  expect(screen.queryByRole("button")).toBeNull();
});
