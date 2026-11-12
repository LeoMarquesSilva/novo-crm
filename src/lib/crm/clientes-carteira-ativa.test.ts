import { describe, expect, it } from "vitest";

import { filtrarClientesDaCarteiraAtiva } from "./clientes-carteira-ativa";

describe("filtrarClientesDaCarteiraAtiva (12/11/2026)", () => {
  const grupos = [
    { id: "g-ativo", gestor_atividade: "ativo" },
    { id: "g-inativo", gestor_atividade: "inativo" },
    { id: "g-sem", gestor_atividade: null },
  ];

  it("só entra cliente ligado a grupo com status Cliente ativo", () => {
    const clientes = [
      { id: "1", razao_social: "ATIVA LTDA", grupo_id: "g-ativo" },
      { id: "2", razao_social: "INATIVA LTDA", grupo_id: "g-inativo" },
      { id: "3", razao_social: "SEM STATUS LTDA", grupo_id: "g-sem" },
      { id: "4", razao_social: "LEAD QUE NUNCA VIROU CLIENTE", grupo_id: null },
      { id: "5", razao_social: "[TESTE E2E] EMPRESA", grupo_id: null },
    ];
    expect(filtrarClientesDaCarteiraAtiva(clientes, grupos).map((c) => c.id)).toEqual(["1"]);
  });

  it("sem grupo ativo, ninguém é cliente existente", () => {
    expect(filtrarClientesDaCarteiraAtiva([{ id: "1", grupo_id: "g-inativo" }], grupos)).toEqual([]);
  });
});
