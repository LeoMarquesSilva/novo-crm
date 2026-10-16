import { describe, expect, it } from "vitest";

import { opportunityStageFromReconciliationDetails } from "./rd-pipeline-stage-from-reconciliation";
import { summarizeRdReconciliation, summarizeRdReconciliationRows } from "./rd-reconciliation-summary";

const bigOptions = Array.from({ length: 200 }, (_, i) => ({ id: `opt-${i}`, label: `Opção ${i}` }));

const details = {
  deal: {
    deal_stage: { name: "Proposta Enviada (Cível)" },
    updated_at: "2026-10-01T12:00:00Z",
    deal_lost_reason: { name: "Preço" },
    user: { name: "Fulano" },
    deal_custom_fields: [
      { custom_field: { label: "Cadastro realizado por", opts: bigOptions }, value: "Fulano@Firma.com.br" },
      { custom_field: { label: "Solicitante", opts: bigOptions }, value: "Beltrano" },
      { custom_field: { label: "Outro campo", opts: bigOptions }, value: "x" },
    ],
  },
  lead: { id: "1" },
};

describe("summarizeRdReconciliation", () => {
  it("guarda só etapa, datas, motivo e os dois campos usados pelo kanban", () => {
    const summary = summarizeRdReconciliation(details);
    expect(summary).toEqual({
      details: { deal: { deal_stage: { name: "Proposta Enviada (Cível)" } } },
      rdDealAtualizadoEm: "2026-10-01T12:00:00Z",
      motivoPerda: "Preço",
      cadastroRealizadoPor: "Fulano@Firma.com.br",
      solicitante: "Beltrano",
    });
    expect(JSON.stringify(summary).length).toBeLessThan(400);
  });

  it("o resumo resolve a mesma etapa que o snapshot inteiro", () => {
    const summary = summarizeRdReconciliation(details);
    expect(opportunityStageFromReconciliationDetails(summary.details)).toBe(
      opportunityStageFromReconciliationDetails(details),
    );
    expect(opportunityStageFromReconciliationDetails(summary.details)).toBe("proposta_enviada");
  });

  it("snapshot sem deal vira resumo vazio", () => {
    expect(summarizeRdReconciliation({ lead: {} })).toEqual({
      details: null,
      rdDealAtualizadoEm: null,
      motivoPerda: null,
      cadastroRealizadoPor: null,
      solicitante: null,
    });
  });
});

describe("summarizeRdReconciliationRows", () => {
  it("fica com o primeiro snapshot de cada oportunidade (mais recente) e ignora linha sem lead", () => {
    const result = summarizeRdReconciliationRows([
      { oportunidade_id: "a", detalhes: { deal: { updated_at: "novo" } } },
      { oportunidade_id: "a", detalhes: { deal: { updated_at: "antigo" } } },
      { oportunidade_id: null, detalhes: { deal: { updated_at: "x" } } },
    ]);
    expect(Object.keys(result)).toEqual(["a"]);
    expect(result.a.rdDealAtualizadoEm).toBe("novo");
  });
});
