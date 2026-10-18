import { describe, expect, it } from "vitest";

import { dropArrearsAdjustmentIndex } from "@/lib/contract-import/adjustment-index";
import { mapExtractionToConfiguration } from "@/lib/contract-import/map-to-configuration";
import type { ContractImportExtraction } from "@/lib/contract-import/schemas";
import { buildContractPrefill } from "@/modules/contracts/application/services/build-contract-prefill";
import { validateContractConfiguration } from "@/modules/contracts/domain/contract-validation";
import { emptyClientOnboardingPayload } from "@/modules/crm/domain/client-onboarding";

import {
  renatoOnboarding,
  renatoPdfExtraction,
  renatoProposalEscopoJson,
  renatoSignedPdfText,
} from "./fixtures/renato-e2e";
import { buildLeadExtraction, mergeLeadAndPdfExtraction, rateioFromOnboarding } from "./lead-extraction";

function onboarding() {
  const p = emptyClientOnboardingPayload();
  p.cadastro.razaoSocial = "ACME";
  p.cadastro.documento = "12345678000190";
  p.financeiro.inicioVigencia = "2026-10-15";
  p.financeiro.primeiroFaturamento = "2026-11-10";
  p.financeiro.reajuste.indice = "IPCA";
  p.financeiro.rateioPorArea = [
    { area: "Cível", percentual: "60" },
    { area: "Trabalhista", percentual: "40" },
  ];
  return p;
}

const emptyPrefill = { fields: {}, areas: [], billingComponents: [], areaAllocations: [] };

function pdf(patch: Partial<ContractImportExtraction> = {}): ContractImportExtraction {
  return {
    groupName: null,
    parties: [{ razaoSocial: "ACME LTDA", documento: "12345678000190", documentoTipo: "cnpj", endereco: null, role: "contratante" }],
    startsAt: "2026-10-01",
    signedAt: null,
    indefinite: true,
    dueDay: 10,
    firstInvoiceAt: "2026-11-10",
    firstInvoiceConditioned: false,
    adjustmentIndex: "IPCA",
    taxMode: null,
    areas: [{ areaKey: "Cível", includedProcesses: null, includedHours: null }],
    components: [{ kind: "mensal_fixo", description: "Mensalidade", amountCents: 500000 }],
    d4signUuid: null,
    signers: [],
    extras: { objectText: null },
    evidence: [],
    ...patch,
  };
}

describe("lead × PDF", () => {
  it("cadastro prevalece nas datas e no índice; cobrança vem do PDF; divergência anotada", () => {
    const lead = buildLeadExtraction({ onboarding: onboarding(), prefill: emptyPrefill });
    const { extraction, divergences } = mergeLeadAndPdfExtraction(lead, pdf());
    expect(extraction.startsAt).toBe("2026-10-15");
    expect(extraction.dueDay).toBe(10);
    expect(extraction.components).toHaveLength(1);
    expect(extraction.areas.map((a) => a.areaKey).sort()).toEqual(["Cível", "Trabalhista"]);
    expect(divergences).toEqual([{ field: "startsAt", leadValue: "2026-10-15", pdfValue: "2026-10-01" }]);
  });

  it("sem PDF lido, usa só o lead", () => {
    const lead = buildLeadExtraction({ onboarding: onboarding(), prefill: emptyPrefill });
    expect(mergeLeadAndPdfExtraction(lead, null).extraction).toBe(lead);
  });

  it("rateio do cadastro em pontos-base", () => {
    expect(rateioFromOnboarding(onboarding())?.shares).toEqual([
      { areaKey: "Cível", percentageBasisPoints: 6000, amountCents: 0 },
      { areaKey: "Trabalhista", percentageBasisPoints: 4000, amountCents: 0 },
    ]);
    expect(rateioFromOnboarding(null)).toBeNull();
  });

  it("primeiro faturamento condicionado não leva data", () => {
    const o = onboarding();
    o.financeiro.primeiroFaturamentoCondicionado = true;
    const lead = buildLeadExtraction({ onboarding: o, prefill: emptyPrefill });
    expect(lead.firstInvoiceAt).toBeNull();
    expect(lead.firstInvoiceConditioned).toBe(true);
  });
});

describe("inclusão do contrato do teste E2E (18/10/2026)", () => {
  const ids = () => {
    let n = 0;
    return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  };

  function configure(pdfExtraction: ContractImportExtraction | null) {
    const onboarding = renatoOnboarding();
    const prefill = buildContractPrefill({ fieldValues: { cp_escopo_detalhe_json: renatoProposalEscopoJson } });
    const lead = buildLeadExtraction({ onboarding, prefill });
    const merged = mergeLeadAndPdfExtraction(lead, pdfExtraction);
    const configuration = mapExtractionToConfiguration({
      extraction: merged.extraction,
      clientId: "client-renato",
      versionId: "version-1",
      nextId: ids(),
      sioeRateio: rateioFromOnboarding(onboarding),
    });
    return { ...merged, configuration };
  }

  function expectRenatoBilling(configuration: ReturnType<typeof configure>["configuration"]) {
    const [closed, maintenance, success] = configuration.version.components;
    expect(closed).toMatchObject({ kind: "mensal_preco_fechado", amountCents: BigInt(1_200_000) });
    if (closed?.kind !== "mensal_preco_fechado") throw new Error("esperado preço fechado");
    expect(closed.installments).toEqual([
      { number: 1, competency: "2026-10-01", dueDate: "2026-10-20", amountCents: BigInt(240_000) },
      { number: 2, competency: "2026-11-01", dueDate: "2026-11-20", amountCents: BigInt(240_000) },
      { number: 3, competency: "2026-12-01", dueDate: "2026-12-20", amountCents: BigInt(240_000) },
      { number: 4, competency: "2027-01-01", dueDate: "2027-01-20", amountCents: BigInt(240_000) },
      { number: 5, competency: "2027-02-01", dueDate: "2027-02-20", amountCents: BigInt(240_000) },
    ]);
    expect(maintenance).toMatchObject({
      kind: "manutencao",
      amountCents: BigInt(25_000),
      effectiveFrom: "2027-03-01",
      effectiveTo: null,
    });
    expect(success).toMatchObject({ kind: "exito_percentual", percentageBasisPoints: 500, requiresManualRelease: true });
    expect(configuration.version.components).toHaveLength(3);
    expect(configuration.startsAt).toBe("2026-10-18");
    expect(configuration.firstInvoiceAt).toBe("2026-10-20");
    expect(configuration.adjustmentIndex).toBe("IPCA");
    expect(validateContractConfiguration(configuration, { imported: true }).filter((i) => i.severity === "error")).toEqual([]);
  }

  it("PDF lido: preço fechado com total e vencimentos no dia 20, manutenção após a 5ª parcela, êxito da proposta", () => {
    const pdf = dropArrearsAdjustmentIndex(renatoPdfExtraction(), renatoSignedPdfText);
    const { configuration, divergences, fromProposal } = configure(pdf);
    expectRenatoBilling(configuration);
    expect(divergences).toEqual([]);
    expect(fromProposal.map((c) => [c.kind, c.percentageBasisPoints])).toEqual([["exito_percentual", 500]]);
  });

  it("PDF que não menciona o êxito também recebe o êxito da proposta", () => {
    const pdf = renatoPdfExtraction();
    pdf.adjustmentIndex = null;
    pdf.components = pdf.components.filter((c) => c.kind !== "exito_percentual");
    expectRenatoBilling(configure(pdf).configuration);
  });

  it("sem PDF (escaneado/cota), a proposta monta a mesma cobrança", () => {
    expectRenatoBilling(configure(null).configuration);
  });
});
