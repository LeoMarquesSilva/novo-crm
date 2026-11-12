import { afterEach, describe, expect, it, vi } from "vitest";

import { lookupCnpj } from "./cnpj-lookup";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lookupCnpj (04/11/2026)", () => {
  it("Fichário responde: razão social, situação e cidade", async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () =>
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
    // As três fontes são consultadas juntas (11/11/2026); o mesmo CNPJ de novo vem do cache, sem chamar a API.
    const chamadas = fetchMock.mock.calls.length;
    await lookupCnpj("07396951000170", 2);
    expect(fetchMock).toHaveBeenCalledTimes(chamadas);
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

  it("manda User-Agent (a BrasilAPI recusa sem ele) e não espera o Fichário fora do ar (11/11/2026)", async () => {
    const headersPorUrl = new Map<string, Record<string, string>>();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        headersPorUrl.set(url, (init?.headers ?? {}) as Record<string, string>);
        // Fichário pendurado: nunca responde.
        if (url.includes("genesisinnovation")) return new Promise<Response>(() => {});
        if (url.includes("opencnpj")) return Promise.resolve(json(404, {}));
        return Promise.resolve(json(200, { razao_social: "PRISMA LTDA", municipio: "SAO PAULO", uf: "SP" }));
      }),
    );
    await expect(lookupCnpj("09267863000609", 1)).resolves.toMatchObject({
      status: "found",
      razaoSocial: "PRISMA LTDA",
      fonte: "brasilapi",
    });
    const brasil = [...headersPorUrl.entries()].find(([url]) => url.includes("brasilapi"))?.[1];
    expect(brasil?.["User-Agent"]).toMatch(/CRM/);
  });

  it("OpenCNPJ cobre quando Fichário e BrasilAPI falham", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("opencnpj")
          ? json(200, { razao_social: "ACME COMERCIO LTDA", situacao_cadastral: "Ativa", municipio: "Campinas", uf: "SP" })
          : json(403, {}),
      ),
    );
    await expect(lookupCnpj("12345678000195", 1)).resolves.toMatchObject({
      status: "found",
      razaoSocial: "ACME COMERCIO LTDA",
      situacao: "ATIVA",
      fonte: "opencnpj",
    });
  });
});
