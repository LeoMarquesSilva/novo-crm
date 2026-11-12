// @vitest-environment jsdom
import * as React from "react";
import { fireEvent, render } from "@testing-library/react";
import { expect, test } from "vitest";

import { ClientLogo } from "@/components/crm/client-logo";

const LOGO = "https://projeto.supabase.co/storage/v1/object/public/icp-logos/grupo-ab.jpg?v=1";
const OUTRA = "https://projeto.supabase.co/storage/v1/object/public/icp-logos/grupo-cd.png?v=2";

test("com logo, mostra a imagem decorativa (o nome fica ao lado)", () => {
  const { container } = render(<ClientLogo name="Grupo AB" logoUrl={LOGO} size={24} />);
  const box = container.querySelector("[data-client-logo]")!;
  expect(box).toHaveAttribute("data-client-logo", "image");
  expect(box).toHaveAttribute("aria-hidden", "true");
  expect(box.className).toContain("size-6");
  expect(box.className).toContain("rounded-(--radius-v2-sm)");
  expect(box.className).toContain("border-border");
  expect(box.querySelector("img")).toHaveAttribute("src", LOGO);
  expect(box.querySelector("img")).toHaveAttribute("alt", "");
});

test("sem logo, mostra as iniciais; no tamanho de avatar usa radius-md", () => {
  const { container } = render(<ClientLogo name="ACME Indústria e Comércio Ltda" logoUrl={null} size={32} />);
  const box = container.querySelector("[data-client-logo]")!;
  expect(box).toHaveAttribute("data-client-logo", "initials");
  expect(box).toHaveTextContent("AI");
  expect(box.className).toContain("rounded-(--radius-v2-md)");
  expect(box.querySelector("img")).toBeNull();
});

test("a 16px cabe uma letra só", () => {
  const { container } = render(<ClientLogo name="Banco do Brasil S.A." size={16} />);
  expect(container.querySelector("[data-client-logo]")).toHaveTextContent(/^B$/);
});

test("imagem que não carrega volta para as iniciais, e uma logo nova tenta de novo", () => {
  const { container, rerender } = render(<ClientLogo name="Grupo AB" logoUrl={LOGO} />);
  fireEvent.error(container.querySelector("img")!);
  const box = () => container.querySelector("[data-client-logo]")!;
  expect(box()).toHaveAttribute("data-client-logo", "initials");
  expect(box()).toHaveTextContent(/^A$/);

  rerender(<ClientLogo name="Grupo CD" logoUrl={OUTRA} />);
  expect(box()).toHaveAttribute("data-client-logo", "image");
  expect(container.querySelector("img")).toHaveAttribute("src", OUTRA);
});
