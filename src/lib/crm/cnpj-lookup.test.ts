import { afterEach, describe, expect, it, vi } from "vitest";

import { lookupCnpj } from "./cnpj-lookup";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lookupCnpj (04/11/2026)", () => {
  it("Fichário responde: razão social, situação e cidade", async () => {
    const fetchMock = vi.fn(async () =>
      json(200, {
        cnpj: "07396951000170",
        razao_social: "LCS TRANSPORTES E LOGISTICA LTDA",
        nome_fantasia: "LCS",
        situacao: "ATIVA",
        endereco: { municipio: "CAMPOS NOVOS", uf: "SC" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(lookupCnpj("07396951000170", 1)).resolves.toEqual({
      status: "found",
      cnpj: "07396951000170",
      razaoSocial: "LCS TRANSPORTES E LOGISTICA LTDA",
      nomeFantasia: "LCS",
      situacao: "ATIVA",
      municipio: "CAMPOS NOVOS",
      uf: "SC",
      fonte: "fichario",
    });
    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://cnpj.genesisinnovation.io/api/v1/cnpj/07396951000170");
    // Mesmo CNPJ de novo: vem do cache, sem chamar a API.
    await lookupCnpj("07396951000170", 2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("limite do Fichário (429) cai na BrasilAPI", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("genesisinnovation")
          ? json(429, { erro: "limite" })
          : json(200, { razao_social: "ACME LTDA", descricao_situacao_cadastral: "ATIVA", municipio: "CAMPINAS", uf: "SP" }),
      ),
    );
    await expect(lookupCnpj("11222333000181", 1)).resolves.toMatchObject({
      status: "found",
      razaoSocial: "ACME LTDA",
      fonte: "brasilapi",
    });
  });

  it("404 nas duas: não encontrado; falha de rede nas duas: erro", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(404, {})));
    await expect(lookupCnpj("11444777000161", 1)).resolves.toEqual({ status: "not_found", cnpj: "11444777000161" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("fora do ar");
      }),
    );
    await expect(lookupCnpj("45997418000153", 1)).resolves.toMatchObject({ status: "error", cnpj: "45997418000153" });
  });
});
