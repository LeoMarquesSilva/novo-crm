import { describe, expect, it } from "vitest";
import { ICP_CLIENTS_CSV_HEADER, buildClientsCsv, clientsCsvFileName, csvCell } from "@/components/crm/icp/icp-clients-csv";
import { icpFixtureData } from "@/components/crm/icp/icp-test-fixture";

describe("csvCell", () => {
  it("só põe aspas quando há separador, aspas ou quebra de linha", () => {
    expect(csvCell("Alfa")).toBe("Alfa");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(1200)).toBe("1200");
    expect(csvCell("A;B")).toBe('"A;B"');
    expect(csvCell('Diz "oi"')).toBe('"Diz ""oi"""');
    expect(csvCell("linha 1\nlinha 2")).toBe('"linha 1\nlinha 2"');
  });
});

describe("buildClientsCsv", () => {
  const data = icpFixtureData();
  const csv = buildClientsCsv(data.groups);
  const [header, ...lines] = csv.replace(/^﻿/, "").split("\r\n");

  it("começa com BOM e usa ';' como separador, com as mesmas colunas", () => {
    expect(csv.startsWith("﻿")).toBe(true);
    expect(header).toBe(ICP_CLIENTS_CSV_HEADER.join(";"));
    expect(header.split(";")).toHaveLength(19);
    expect(lines).toHaveLength(data.groups.length);
  });

  it("preenche uma linha por grupo com os dados do ICP", () => {
    const alfa = lines[0].split(";");
    expect(alfa).toEqual([
      "A",
      "Alfa",
      "Indústria",
      "Fabricação de embalagens de material plástico",
      "51 a 200",
      "57",
      "https://www.linkedin.com/company/alfa-embalagens",
      "https://www.alfa.com.br",
      "Campinas",
      "SP",
      "ALFA EMBALAGENS S.A.",
      "12.345.678/0001-90",
      "Maria da Silva",
      "Insolvência",
      "Insolvência, Trabalhista, Cível",
      "HONORÁRIOS MENSAIS",
      "250000",
      "20833",
      "7000",
    ]);
  });

  it("explica a falta de segmento e deixa vazios os campos sem dado", () => {
    const gama = lines.find((l) => l.split(";")[1] === "Gama")!.split(";");
    expect(gama[0]).toBe("C");
    expect(gama[2]).toBe("Pessoa física");
    expect(gama[3]).toBe("");
    expect(gama[4]).toBe("");
    expect(gama[13]).toBe("Trabalhista");
    // Plano de contas como no SIOE.
    expect(gama[15]).toBe("HONORÁRIOS DE ÊXITO");
    expect(gama[18]).toBe("20000");
  });

  it("nomeia o arquivo com a data", () => {
    expect(clientsCsvFileName(new Date("2026-10-13T15:00:00Z"))).toBe("icp-clientes-2026-10-13.csv");
  });
});
