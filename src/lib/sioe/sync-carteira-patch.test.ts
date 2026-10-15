import { describe, expect, it } from "vitest";

import { buildClienteSyncPatch } from "./sync-carteira";

describe("buildClienteSyncPatch", () => {
  it("não apaga grupo nem contato quando o OrquestrAI manda vazio", () => {
    const patch = buildClienteSyncPatch({
      razao_social: "ACME",
      documento: "12345678000190",
      grupo_id: null,
      email_principal: null,
      telefone_principal: "",
      cidade: "Campinas",
    });
    expect(patch).toEqual({ razao_social: "ACME", documento: "12345678000190", cidade: "Campinas" });
  });

  it("valor vindo do OrquestrAI continua sobrescrevendo", () => {
    expect(buildClienteSyncPatch({ grupo_id: "g-1", email_principal: "a@b.com" })).toEqual({
      grupo_id: "g-1",
      email_principal: "a@b.com",
    });
  });
});
