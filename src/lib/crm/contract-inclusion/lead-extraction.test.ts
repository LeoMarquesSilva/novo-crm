import { describe, expect, it } from "vitest";

import type { ContractImportExtraction } from "@/lib/contract-import/schemas";
import { emptyClientOnboardingPayload } from "@/modules/crm/domain/client-onboarding";

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
