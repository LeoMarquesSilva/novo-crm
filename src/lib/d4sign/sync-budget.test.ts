import { describe, expect, it } from "vitest";
import { D4SIGN_HUMAN_RESERVE, planD4SignSyncBudget } from "./sync-budget";

const full = { safe: 10, status: 10, list: 10, download: 10 };

describe("planD4SignSyncBudget", () => {
  it("usa a cota de cada método sem invadir a reserva humana", () => {
    expect(
      planD4SignSyncBudget({ remaining: full, phaseCycleOpen: true, folderMode: "backlog" }),
    ).toEqual({
      listing: 1,
      phases: 10,
      enrich: 10 - D4SIGN_HUMAN_RESERVE.list,
      folders: 10 - D4SIGN_HUMAN_RESERVE.safe - 1,
      precache: 1,
    });
  });

  it("com o ciclo de fases fechado, só atualiza a página 1", () => {
    expect(
      planD4SignSyncBudget({ remaining: full, phaseCycleOpen: false, folderMode: "rotate" }),
    ).toEqual({ listing: 1, phases: 1, enrich: 7, folders: 1, precache: 1 });
  });

  it("listagem esgotada não trava signatários nem PDF", () => {
    expect(
      planD4SignSyncBudget({
        remaining: { safe: 0, status: 0, list: 5, download: 9 },
        phaseCycleOpen: true,
        folderMode: "backlog",
      }),
    ).toEqual({ listing: 0, phases: 0, enrich: 2, folders: 0, precache: 1 });
  });

  it("não pré-carrega PDF quando só restam as vagas de quem está no CRM", () => {
    const plan = planD4SignSyncBudget({
      remaining: { ...full, download: D4SIGN_HUMAN_RESERVE.download },
      phaseCycleOpen: false,
      folderMode: "none",
    });
    expect(plan.precache).toBe(0);
    expect(plan.folders).toBe(0);
  });
});
