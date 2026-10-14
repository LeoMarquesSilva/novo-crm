import { describe, expect, it } from "vitest";

import { buildClientSignerSuggestions } from "./signer-suggestions";

const isFirmEmail = (email: string) => email.endsWith("@bpplaw.com.br");

describe("buildClientSignerSuggestions", () => {
  it("prioriza envio anterior, depois ponto focal, contatos e cliente, sem duplicar nem sócios", () => {
    const suggestions = buildClientSignerSuggestions({
      previousSigners: [
        { email: "gustavo@bpplaw.com.br", role: "CONTRATADA", name: "Gustavo" },
        { email: "Diretor@Cliente.com", role: "CONTRATANTE", name: "Diretor" },
      ],
      focal: { name: "Ana", email: "ana@cliente.com" },
      contacts: [
        { nome: "Diretor de novo", email: "diretor@cliente.com" },
        { nome: "Financeiro", email: "fin@cliente.com" },
      ],
      cliente: { nome: "Cliente SA", email: "contato@cliente.com" },
      isFirmEmail,
    });
    expect(suggestions.map((s) => [s.email, s.source])).toEqual([
      ["diretor@cliente.com", "envio_anterior"],
      ["ana@cliente.com", "ponto_focal"],
      ["fin@cliente.com", "contato_cliente"],
      ["contato@cliente.com", "cliente"],
    ]);
  });

  it("ignora e-mails inválidos e vazios", () => {
    expect(
      buildClientSignerSuggestions({
        previousSigners: null,
        focal: { name: "Ana", email: "não tem" },
        contacts: [{ nome: null, email: null }],
        cliente: null,
        isFirmEmail,
      }),
    ).toEqual([]);
  });
});
