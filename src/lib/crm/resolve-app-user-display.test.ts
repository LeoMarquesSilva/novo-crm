import { describe, expect, it } from "vitest";

import { resolveSolicitanteInternoDisplay } from "./resolve-app-user-display";

describe("resolveSolicitanteInternoDisplay", () => {
  const usersByEmail = {
    "pessoa@bpplaw.com.br": {
      fullName: "Nome no app_users",
      avatarUrl: "https://cdn.example/avatar.png",
    },
  };

  it("preserva o nome escolhido no cadastro e resolve o avatar pelo e-mail", () => {
    expect(
      resolveSolicitanteInternoDisplay({
        nomeCadastro: "Nome escolhido no cadastro",
        solicitanteEmail: " PESSOA@BPPLAW.COM.BR ",
        usersByEmail,
      }),
    ).toEqual({
      nome: "Nome escolhido no cadastro",
      avatarUrl: "https://cdn.example/avatar.png",
    });
  });

  it("usa o nome do app_users quando o cadastro não trouxe nome", () => {
    expect(
      resolveSolicitanteInternoDisplay({
        nomeCadastro: null,
        solicitanteEmail: "pessoa@bpplaw.com.br",
        usersByEmail,
      }),
    ).toEqual({
      nome: "Nome no app_users",
      avatarUrl: "https://cdn.example/avatar.png",
    });
  });

  it("retorna fallback vazio sem confundir com quem cadastrou", () => {
    expect(
      resolveSolicitanteInternoDisplay({
        nomeCadastro: null,
        solicitanteEmail: null,
        usersByEmail,
      }),
    ).toEqual({ nome: "—", avatarUrl: null });
  });
});
