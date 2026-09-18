import { describe, expect, it } from "vitest";
import { stripD4SignCertificate, extractDocumentIdentifiers } from "../document-text";
import { mapExtractionToConfiguration } from "../map-to-configuration";
import { matchExtractionToCarteira, importedContractTitle } from "../match-carteira";
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
    expect(configuration.renewalDate).toBe("2027-04-30");
    expect(configuration.renewalAlertDate).toBe("2027-03-31");
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
    expect(configuration.version.areaAllocations).toHaveLength(0);
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

describe("matchExtractionToCarteira", () => {
  const pagueMenosGroup = { id: "g-pague", nome: "Grupo Pague Menos", chaveEstavel: "grupo pague menos" };
  const elevaGroup = { id: "g-eleva", nome: "Grupo Eleva", chaveEstavel: "grupo eleva" };
  const loja32 = {
    id: "c-loja-32",
    razaoSocial: "LOJA 32",
    documento: "60.494.416/0033-12",
    grupoId: "g-pague",
  };
  const loja01 = {
    id: "c-loja-01",
    razaoSocial: "LOJA 01",
    documento: "60.494.416/0001-35",
    grupoId: "g-pague",
  };
  const eleva = {
    id: "c-eleva",
    razaoSocial: "ELEVA PARTICIPACOES E NEGOCIOS S.A.",
    documento: "26.453.669/0001-22",
    grupoId: "g-eleva",
  };
  const pagueExtraction: typeof leBlogExtraction = {
    ...leBlogExtraction,
    groupName: "Grupo Eleva",
    parties: [
      {
        razaoSocial: "PAGUE MENOS COMÉRCIO DE PRODUTOS ALIMENTÍCIOS LTDA.",
        documento: "60.494.416/0033-12",
        documentoTipo: "cnpj",
        endereco: null,
        role: "contratante",
      },
      {
        razaoSocial: "BISMARCHI | PIRES – SOCIEDADE DE ADVOGADOS",
        documento: "26.080.152/0001-35",
        documentoTipo: "cnpj",
        endereco: null,
        role: "relacionada",
      },
    ],
  };

  it("casa a contratante pelo CNPJ e ignora grupo residual de modelo", () => {
    const match = matchExtractionToCarteira({
      extraction: pagueExtraction,
      grupos: [pagueMenosGroup, elevaGroup],
      clientes: [loja32, loja01, eleva],
    });
    expect(match.grupoId).toBe("g-pague");
    expect(match.clienteId).toBe("c-loja-01");
    expect(match.matchedDocuments).toEqual(["60494416003312"]);
    expect(
      importedContractTitle({
        extraction: pagueExtraction,
        match,
        grupos: [pagueMenosGroup, elevaGroup],
        filename: "CONTRATO_PAGUE MENOS_Trabalhista_ass.pdf",
      }),
    ).toBe("Grupo Pague Menos");
  });

  it("mapeia preço por pasta para variavel_processo sem expandir para mensal_fixo", () => {
    let seq = 1;
    const configuration = mapExtractionToConfiguration({
      extraction: {
        ...pagueExtraction,
        extras: { ...pagueExtraction.extras, kmRateCents: undefined },
        areas: [{ areaKey: "Trabalhista", includedHours: 25, includedProcesses: 745 }],
        components: [
          {
            kind: "mensal_fixo",
            description: "Honorários por pasta ativa",
            amountCents: 8500,
            percentageBasisPoints: null,
            effectiveFrom: "2026-07-27",
            effectiveTo: null,
            installmentCount: null,
            installmentAmountCents: null,
            firstDueDate: "2026-09-01",
            requiresManualRelease: false,
            includedQuantity: 745,
            unitAmountCents: 8500,
            chargeMode: "quantidade_total",
            areaKey: "Trabalhista",
          },
        ],
      },
      clientId: "c-loja-01",
      versionId: "version-pague",
      nextId: () => `00000000-0000-4000-8000-${String(seq++).padStart(12, "0")}`,
    });
    expect(configuration.version.components.some((component) => component.kind === "mensal_fixo")).toBe(false);
    const perFolder = configuration.version.components.find((component) => component.kind === "variavel_processo");
    expect(perFolder).toMatchObject({
      kind: "variavel_processo",
      chargeMode: "quantidade_total",
      includedQuantity: 745,
      unitAmountCents: BigInt(8500),
      areaAllocationEligible: true,
    });
    expect(perFolder && "amountCents" in perFolder).toBe(false);
    expect(configuration.version.areaAllocations).toEqual([
      expect.objectContaining({
        mode: "percentual",
        percentageBasisPoints: 10_000,
      }),
    ]);
    expect(configuration.areas.map((area) => area.areaKey)).toEqual(["Trabalhista"]);
  });

  it("não inventa mensal_fixo do SIOE quando já há variável por pasta", () => {
    let seq = 1;
    const configuration = mapExtractionToConfiguration({
      extraction: {
        ...pagueExtraction,
        extras: { ...pagueExtraction.extras, kmRateCents: undefined },
        areas: [{ areaKey: "Trabalhista", includedHours: 25, includedProcesses: 745 }],
        components: [
          {
            kind: "variavel_processo",
            description: "Honorários por pasta ativa",
            amountCents: null,
            percentageBasisPoints: null,
            effectiveFrom: "2026-07-27",
            effectiveTo: null,
            installmentCount: null,
            installmentAmountCents: null,
            firstDueDate: "2026-09-01",
            requiresManualRelease: false,
            includedQuantity: 745,
            unitAmountCents: 8500,
            chargeMode: "quantidade_total",
            areaKey: "Trabalhista",
          },
        ],
      },
      clientId: "c-loja-01",
      versionId: "version-pague",
      nextId: () => `00000000-0000-4000-8000-${String(seq++).padStart(12, "0")}`,
      sioeRateio: {
        ciTitulo: 1,
        competency: "2026-09-01",
        situacao: "ABERTO",
        totalCents: 6_332_500,
        shares: [{ areaKey: "Trabalhista", amountCents: 6_332_500, percentageBasisPoints: 10_000 }],
      },
    });
    expect(configuration.version.components.filter((component) => component.kind === "mensal_fixo")).toHaveLength(0);
    expect(configuration.version.components[0]).toMatchObject({
      kind: "variavel_processo",
      areaAllocationEligible: true,
    });
    expect(configuration.version.areaAllocations).toHaveLength(1);
    expect(configuration.version.areaAllocations[0]).toMatchObject({
      mode: "percentual",
      percentageBasisPoints: 10_000,
    });
  });
});
