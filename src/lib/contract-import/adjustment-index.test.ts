import { describe, expect, it } from "vitest";

import { renatoPdfExtraction, renatoSignedPdfText } from "@/lib/crm/contract-inclusion/fixtures/renato-e2e";

import { dropArrearsAdjustmentIndex } from "./adjustment-index";

describe("dropArrearsAdjustmentIndex", () => {
  it("descarta o índice citado só na correção do valor em atraso (teste E2E 18/10/2026)", () => {
    const result = dropArrearsAdjustmentIndex(renatoPdfExtraction(), renatoSignedPdfText);
    expect(result.adjustmentIndex).toBeNull();
    expect(result.evidence.some((item) => item.field === "adjustmentIndex")).toBe(false);
  });

  it("mantém o índice quando o contrato fala em reajuste", () => {
    const text = `${renatoSignedPdfText}\n6.1. Os honorários serão reajustados anualmente pelo IPCA-E.`;
    expect(dropArrearsAdjustmentIndex(renatoPdfExtraction(), text).adjustmentIndex).toBe("IPCA-E");
  });

  it("não confunde IPCA com IPCA-E", () => {
    const extraction = { ...renatoPdfExtraction(), adjustmentIndex: "IPCA", evidence: [] };
    const text = `${renatoSignedPdfText}\nValores corrigidos anualmente pelo IPCA.`;
    expect(dropArrearsAdjustmentIndex(extraction, text).adjustmentIndex).toBe("IPCA");
  });

  it("sem trecho para conferir, mantém o que a IA leu", () => {
    const extraction = { ...renatoPdfExtraction(), adjustmentIndex: "IGP-M", evidence: [] };
    expect(dropArrearsAdjustmentIndex(extraction, "Contrato sem cláusula de reajuste.").adjustmentIndex).toBe("IGP-M");
  });
});
