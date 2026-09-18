import { describe, expect, it } from "vitest";
import { stripD4SignCertificate, extractDocumentIdentifiers } from "../document-text";
import { mapExtractionToConfiguration } from "../map-to-configuration";
import { matchExtractionToCarteira } from "../match-carteira";
import { validateContractConfiguration } from "@/modules/contracts/domain/contract-validation";
import {
  extrutechExtraction,
  fabianaToziniExtraction,
  leBlogExtraction,
} from "./gold-extractions";

describe("stripD4SignCertificate", () => {
  it("extrai o uuid e corta o certificado", () => {
    const text = [
      "CLÁUSULA 12. Foro de Campinas.",
      "D4Sign 89a9955b-80d8-4eeb-ac05-156ab1469c47 - Para confirmar as assinaturas acesse https://secure.d4sign.com.br/verificar",
      "Certificado de assinaturas gerado em 22 de August de 2026",
      "Fabiana Fogagnoli Tozini assinou",
    ].join("\n");
    const result = stripD4SignCertificate(text);
    expect(result.d4signUuid).toBe("89a9955b-80d8-4eeb-ac05-156ab1469c47");
    expect(result.body).toContain("Foro de Campinas");
    expect(result.body).not.toContain("Fabiana Fogagnoli Tozini assinou");
  });
});

describe("extractDocumentIdentifiers", () => {
  it("coleta CNPJs das contratantes", () => {
    const text = "CNPJ 36.704.785/0001-20 e 36.704.785/0002-01";
    expect(extractDocumentIdentifiers(text)).toEqual(["36704785000120", "36704785000201"]);
  });
});

describe("gold mappings", () => {
  const ids = ["00000000-0000-4000-8000-000000000001"];
  let n = 1;
  const nextId = () => {
    const value = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    n += 1;
    ids.push(value);
    return value;
  };

  it("mapeia Extrutech para mensalidade escalonada, IPCA e áreas", () => {
    n = 1;
    const configuration = mapExtractionToConfiguration({
      extraction: extrutechExtraction,
      clientId: "client-extrutech",
      versionId: "version-1",
      nextId,
    });
    expect(configuration.indefinite).toBe(true);
    expect(configuration.dueDay).toBe(5);
    expect(configuration.firstInvoiceConditioned).toBe(true);
    expect(configuration.adjustmentIndex).toBe("IPCA");
    expect(configuration.areas.map((area) => area.areaKey)).toEqual([
      "Reestruturação e Insolvência",
      "Trabalhista",
    ]);
    const stepped = configuration.version.components.filter((component) => component.kind === "mensal_escalonado");
    expect(stepped).toHaveLength(2);
    expect(stepped[0]).toMatchObject({ amountCents: BigInt(2_000_000), effectiveTo: "2026-10-31" });
    expect(stepped[1]).toMatchObject({ amountCents: BigInt(2_500_000), effectiveFrom: "2026-11-01" });
    expect(configuration.version.components.some((component) => component.kind === "despesa_km")).toBe(true);
    const issues = validateContractConfiguration(configuration, { imported: true });
    expect(issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
  });

  it("mapeia Fabiana Tozini para preço fechado em 10 parcelas", () => {
    n = 1;
    const configuration = mapExtractionToConfiguration({
      extraction: fabianaToziniExtraction,
      clientId: "client-tozini",
      versionId: "version-2",
      nextId,
    });
    const closed = configuration.version.components.find((component) => component.kind === "mensal_preco_fechado");
    expect(closed?.kind).toBe("mensal_preco_fechado");
    if (closed?.kind !== "mensal_preco_fechado") throw new Error("expected closed price");
    expect(closed.installments).toHaveLength(10);
    expect(closed.installments[0]).toMatchObject({
      number: 1,
      competency: "2026-08-01",
      amountCents: BigInt(100_000),
    });
    expect(configuration.dueDay).toBe(15);
    expect(validateContractConfiguration(configuration, { imported: true }).filter((issue) => issue.severity === "error")).toHaveLength(0);
  });

  it("mapeia Le Blog para mensal fixo líquido + êxito 3% e IGP-M", () => {
    n = 1;
    const configuration = mapExtractionToConfiguration({
      extraction: leBlogExtraction,
      clientId: "client-leblog",
      versionId: "version-3",
      nextId,
    });
    expect(configuration.adjustmentIndex).toBe("IGP-M");
    const monthly = configuration.version.components.find((component) => component.kind === "mensal_fixo");
    expect(monthly).toMatchObject({ amountCents: BigInt(1_500_000) });
    expect(monthly && "tax" in monthly ? monthly.tax : null).toEqual({
      mode: "added",
      percentageBasisPoints: 0,
    });
    const success = configuration.version.components.find((component) => component.kind === "exito_percentual");
    expect(success).toMatchObject({ percentageBasisPoints: 300, requiresManualRelease: true });
    expect(leBlogExtraction.extras.solidarity).toBe(true);
    expect(leBlogExtraction.extras.moraFinePercent).toBe(10);
    expect(validateContractConfiguration(configuration, { imported: true }).filter((issue) => issue.severity === "error")).toHaveLength(0);
  });

  it("casa CNPJs e nome do grupo com a carteira local", () => {
    const match = matchExtractionToCarteira({
      extraction: leBlogExtraction,
      grupos: [{ id: "g-leblog", nome: "Grupo Le Blog", chaveEstavel: "grupo le blog" }],
      clientes: [
        {
          id: "c-leblog",
          razaoSocial: "Le Blog Confeccoes Ltda",
          documento: "13.419.020/0001-43",
          grupoId: "g-leblog",
        },
      ],
    });
    expect(match).toEqual({
      grupoId: "g-leblog",
      clienteId: "c-leblog",
      matchedDocuments: ["13419020000143", "48978532000124"],
    });
  });

  it("deduplica área Contratos/Societário e aplica rateio do SIOE", () => {
    n = 1;
    const configuration = mapExtractionToConfiguration({
      extraction: {
        ...leBlogExtraction,
        areas: [
          { areaKey: "Contratos", includedHours: 6, includedProcesses: null },
          { areaKey: "Societário e Contratos", includedHours: 8, includedProcesses: null },
          { areaKey: "Trabalhista", includedHours: null, includedProcesses: 20 },
        ],
      },
      clientId: "client-leblog",
      versionId: "version-4",
      nextId,
      sioeRateio: {
        ciTitulo: 13324,
        competency: "2026-12-15",
        situacao: "ABERTO",
        totalCents: 1_460_000,
        shares: [
          { areaKey: "Cível", amountCents: 400_040, percentageBasisPoints: 2_740 },
          { areaKey: "Societário e Contratos", amountCents: 249_952, percentageBasisPoints: 1_712 },
          { areaKey: "Trabalhista", amountCents: 810_008, percentageBasisPoints: 5_548 },
        ],
      },
    });
    expect(configuration.areas.map((area) => area.areaKey)).toEqual([
      "Societário e Contratos",
      "Trabalhista",
      "Cível",
    ]);
    const monthly = configuration.version.components.find((component) => component.kind === "mensal_fixo");
    expect(monthly?.areaAllocationEligible).toBe(true);
    expect(configuration.version.areaAllocations).toHaveLength(3);
    expect(
      configuration.version.areaAllocations.reduce(
        (sum, row) => (row.mode === "percentual" ? sum + row.percentageBasisPoints : sum),
        0,
      ),
    ).toBe(10_000);
    expect(
      validateContractConfiguration(configuration, { imported: true }).filter((issue) => issue.severity === "error"),
    ).toHaveLength(0);
  });
});
