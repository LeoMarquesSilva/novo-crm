import { describe, expect, it } from "vitest";
import { planD4SignSyncBudget } from "./sync-budget";

describe("planD4SignSyncBudget", () => {
  it("gasta a janela na listagem de fases enquanto o ciclo está aberto", () => {
    expect(
      planD4SignSyncBudget({
        remaining: 10,
        phaseCycleOpen: true,
        pendingWithoutSigners: 40,
        folderMode: "backlog",
      }),
    ).toEqual({ listing: 1, phases: 9, enrich: 0, folders: 0 });
  });

  it("com o ciclo fechado, atualiza a página 1 e enriquece pendentes antes das pastas", () => {
    expect(
      planD4SignSyncBudget({
        remaining: 10,
        phaseCycleOpen: false,
        pendingWithoutSigners: 8,
        folderMode: "backlog",
      }),
    ).toEqual({ listing: 1, phases: 1, enrich: 8, folders: 0 });
  });

  it("varre pastas só quando não há pendente sem signatário", () => {
    expect(
      planD4SignSyncBudget({
        remaining: 10,
        phaseCycleOpen: false,
        pendingWithoutSigners: 0,
        folderMode: "backlog",
      }),
    ).toEqual({ listing: 1, phases: 1, enrich: 0, folders: 8 });
  });

  it("em modo estável reserva uma pasta e o resto vai para signatário", () => {
    expect(
      planD4SignSyncBudget({
        remaining: 4,
        phaseCycleOpen: false,
        pendingWithoutSigners: 0,
        folderMode: "rotate",
      }),
    ).toEqual({ listing: 1, phases: 1, enrich: 1, folders: 1 });
  });

  it("com uma vaga só, fica na raiz", () => {
    expect(
      planD4SignSyncBudget({
        remaining: 1,
        phaseCycleOpen: true,
        pendingWithoutSigners: 3,
        folderMode: "backlog",
      }),
    ).toEqual({ listing: 1, phases: 0, enrich: 0, folders: 0 });
  });
});
