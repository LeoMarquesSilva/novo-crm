// @vitest-environment jsdom
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, expect, test, vi } from "vitest";

import { IndicatorPickerField, normalizeSearch } from "@/components/crm/new-lead-modal";

const BASE = ["Ana Paula Renault", "Lorena Lourenço Miranda", "João Silva"];

beforeAll(() => {
  // jsdom não implementa scrollIntoView (o picker rola a opção ativa para a vista).
  Element.prototype.scrollIntoView = vi.fn();
});

function renderPicker() {
  const onChange = vi.fn();
  const onRegisterNew = vi.fn();
  render(
    <IndicatorPickerField
      id="indicador"
      placeholder="Pesquisar na base aprovada"
      options={BASE}
      value=""
      onChange={onChange}
      onRegisterNew={onRegisterNew}
    />,
  );
  return { onChange, onRegisterNew };
}

test("normalizeSearch ignora acento, maiúscula e espaços repetidos", () => {
  expect(normalizeSearch("  Lorena   LOURENÇO ")).toBe("lorena lourenco");
});

test("busca sem acento e escolhe com Enter", async () => {
  const user = userEvent.setup();
  const { onChange } = renderPicker();

  await user.click(screen.getByRole("combobox", { name: "" }));
  await user.keyboard("lourenco");

  expect(screen.getByRole("option", { name: "Lorena Lourenço Miranda" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Ana Paula Renault" })).not.toBeInTheDocument();

  await user.keyboard("{Enter}");
  expect(onChange).toHaveBeenCalledWith("Lorena Lourenço Miranda");
});

test("nome fora da base: o atalho cadastra levando o texto digitado", async () => {
  const user = userEvent.setup();
  const { onChange, onRegisterNew } = renderPicker();

  await user.click(screen.getByRole("combobox", { name: "" }));
  await user.keyboard("Carlos Pereira");

  expect(screen.getByText("Nenhum nome encontrado na base.")).toBeInTheDocument();
  await user.keyboard("{Enter}");

  expect(onChange).not.toHaveBeenCalled();
  expect(onRegisterNew).toHaveBeenCalledWith("Carlos Pereira");
});

test("nome que já existe na base não vira cadastro novo com o texto digitado", async () => {
  const user = userEvent.setup();
  const { onRegisterNew } = renderPicker();

  await user.click(screen.getByRole("combobox", { name: "" }));
  await user.keyboard("joao silva");
  // Desce da opção encontrada até o atalho do rodapé.
  await user.keyboard("{ArrowDown}{Enter}");

  expect(onRegisterNew).toHaveBeenCalledWith("");
});
