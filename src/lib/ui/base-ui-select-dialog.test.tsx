// @vitest-environment jsdom
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dialogSelectOutsideHandlers } from "@/lib/ui/base-ui-select-dialog";

/**
 * Contrato funcional obrigatório (DESIGN_SYSTEM_V2_CRM_BP.md §18.3): selecionar um item
 * de um Select (Base UI) dentro de um Dialog (Radix) não pode fechar o dialog. Sem
 * `dialogSelectOutsideHandlers()`, o clique no item — que é renderizado em portal, fora
 * da árvore do DialogContent — é interpretado como clique externo e fecha o dialog.
 * Escrito originalmente pela Codex (QA) durante a revisão da Fase 2 do redesign V2.
 */
test("selecionar uma opção do Select não fecha o Dialog", async () => {
  const user = userEvent.setup();

  render(
    <Dialog modal={false}>
      <DialogTrigger>Abrir</DialogTrigger>
      <DialogContent {...dialogSelectOutsideHandlers()}>
        <DialogTitle>Teste de contrato</DialogTitle>
        <Select modal={false} defaultValue="um">
          <SelectTrigger aria-label="Opção">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="um">Um</SelectItem>
            <SelectItem value="dois">Dois</SelectItem>
          </SelectContent>
        </Select>
      </DialogContent>
    </Dialog>,
  );

  await user.click(screen.getByRole("button", { name: "Abrir" }));
  await user.click(screen.getByRole("combobox", { name: "Opção" }));
  await user.click(await screen.findByRole("option", { name: "Dois" }));

  expect(screen.getByRole("dialog", { name: "Teste de contrato" })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Opção" })).toHaveTextContent("dois");
});
