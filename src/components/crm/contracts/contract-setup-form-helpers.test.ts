import { describe, expect, it } from "vitest";

import { startMonthBillingHelp } from "./contract-setup-form-helpers";

describe("startMonthBillingHelp", () => {
  const monthly = [{ kind: "mensal_fixo", effectiveFrom: "2026-10-18" }];

  it("explica as duas opções com os meses do contrato", () => {
    const help = startMonthBillingHelp(monthly, { replacesVersion: false });
    expect(help).toContain("18/10/2026");
    expect(help).toContain("cobra out/2026 inteiro");
    expect(help).toContain("1ª mensalidade é de nov/2026");
    expect(help).not.toContain("reajuste");
  });

  it("avisa do mês da troca em reajuste ou aditivo", () => {
    expect(startMonthBillingHelp(monthly, { replacesVersion: true })).toContain("deixa out/2026 sem mensalidade");
  });

  it("não pergunta sem mensalidade começando depois do dia 1", () => {
    expect(startMonthBillingHelp([{ kind: "mensal_preco_fechado", effectiveFrom: "2026-10-18" }], { replacesVersion: false })).toBeNull();
    expect(startMonthBillingHelp([{ kind: "mensal_fixo", effectiveFrom: "2026-10-01" }], { replacesVersion: false })).toBeNull();
  });
});
