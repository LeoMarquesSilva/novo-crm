import { describe, expect, it } from "vitest";
import { isDueReviewApprovedForCycle } from "./due-area-task-status";

const row = (area_key: string, revision_cycle: number, status: string) => ({ area_key, revision_cycle, status });

describe("isDueReviewApprovedForCycle", () => {
  it("aprova quando todas as áreas do ciclo aprovaram", () => {
    expect(isDueReviewApprovedForCycle([row("Cível", 1, "ok"), row("Trabalhista", 1, "ok")], 1)).toBe(true);
  });

  it("vale a última tarefa de cada área: quem aprovou no ciclo 1 continua aprovado", () => {
    const rows = [row("Cível", 1, "ajustes_solicitados"), row("Trabalhista", 1, "ok"), row("Cível", 2, "ok")];
    expect(isDueReviewApprovedForCycle(rows, 2)).toBe(true);
  });

  it("área que não respondeu no ciclo anterior segura a finalização (teste 3, 22/10/2026)", () => {
    const rows = [
      row("Cível", 1, "ajustes_solicitados"),
      row("Trabalhista", 1, "pendente"),
      row("Tributário", 1, "pendente"),
      row("Cível", 2, "ok"),
    ];
    expect(isDueReviewApprovedForCycle(rows, 2)).toBe(false);
  });

  it("sem tarefa no ciclo atual não aprova", () => {
    expect(isDueReviewApprovedForCycle([row("Cível", 1, "ok")], 2)).toBe(false);
    expect(isDueReviewApprovedForCycle([], 1)).toBe(false);
  });
});
