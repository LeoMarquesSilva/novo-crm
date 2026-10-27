// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test, vi } from "vitest";

import { DateInputBr } from "./date-input-br";
import { TimeInputBr } from "./time-input-br";

function ControlledDate({ initial = "", onChange }: { initial?: string; onChange: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <DateInputBr
      id="data"
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
    />
  );
}

function ControlledTime({ onChange, onInvalid }: { onChange: (v: string) => void; onInvalid?: (v: boolean) => void }) {
  const [value, setValue] = useState("");
  return (
    <TimeInputBr
      id="hora"
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
      onInvalidChange={onInvalid}
    />
  );
}

test("digita a data com máscara e devolve yyyy-mm-dd", async () => {
  const onChange = vi.fn();
  render(<ControlledDate onChange={onChange} />);
  const input = screen.getByRole("textbox");
  await userEvent.type(input, "20102026");
  expect(input).toHaveValue("20/10/2026");
  expect(onChange).toHaveBeenLastCalledWith("2026-10-20");
});

test("data que não existe fica no campo com aviso e o valor externo some", async () => {
  const onChange = vi.fn();
  render(<ControlledDate initial="2026-10-20" onChange={onChange} />);
  const input = screen.getByRole("textbox");
  await userEvent.clear(input);
  await userEvent.type(input, "31022026");
  await userEvent.tab();
  expect(input).toHaveValue("31/02/2026");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("alert")).toHaveTextContent("Data inválida");
  expect(onChange).toHaveBeenLastCalledWith("");
});

test("horário fora de 00:00–23:59 avisa e não vale", async () => {
  const onChange = vi.fn();
  const onInvalid = vi.fn();
  render(<ControlledTime onChange={onChange} onInvalid={onInvalid} />);
  const input = screen.getByRole("textbox");
  await userEvent.type(input, "2575");
  expect(input).toHaveValue("25:75");
  expect(screen.getByRole("alert")).toHaveTextContent("Horário inválido");
  expect(onInvalid).toHaveBeenLastCalledWith(true);
  expect(onChange).not.toHaveBeenCalledWith("25:75");
});

test("horário de três dígitos vira hh:mm ao sair do campo", async () => {
  const onChange = vi.fn();
  render(<ControlledTime onChange={onChange} />);
  const input = screen.getByRole("textbox");
  await userEvent.type(input, "930");
  await userEvent.tab();
  expect(input).toHaveValue("09:30");
  expect(onChange).toHaveBeenLastCalledWith("09:30");
});
