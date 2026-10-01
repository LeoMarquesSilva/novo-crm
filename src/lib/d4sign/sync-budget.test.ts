import { describe, expect, it } from "vitest";
import { D4SIGN_HUMAN_RESERVE, planD4SignSyncBudget } from "./sync-budget";

const full = { safe: 10, status: 10, list: 10, download: 10 };

describe("planD4SignSyncBudget", () => {
  it("usa a cota de cada método sem invadir a reserva humana", () => {
    expect(planD4SignSyncBudget({ remaining: full, folderMode: "backlog" })).toEqual({
      listing: 1,
      phases: 10,
      enrich: 10 - D4SIGN_HUMAN_RESERVE.list,
      folders: 10 - D4SIGN_HUMAN_RESERVE.safe - 1,
      precache: 1,
    });
  });

  it("em modo estável varre uma pasta por rodada", () => {
    expect(planD4SignSyncBudget({ remaining: full, folderMode: "rotate" })).toMatchObject({
      listing: 1,
      folders: 1,
    });
  });

  it("listagem esgotada não trava fases, signatários nem PDF", () => {
    expect(
      planD4SignSyncBudget({
        remaining: { safe: 0, status: 4, list: 5, download: 9 },
        folderMode: "backlog",
      }),
    ).toEqual({ listing: 0, phases: 4, enrich: 3, folders: 0, precache: 1 });
  });

  it("não pré-carrega PDF quando só restam as vagas de quem está no CRM", () => {
    const plan = planD4SignSyncBudget({
      remaining: { ...full, download: D4SIGN_HUMAN_RESERVE.download },
      folderMode: "none",
    });
    expect(plan.precache).toBe(0);
    expect(plan.folders).toBe(0);
  });
});
