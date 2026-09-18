import { describe, expect, it } from "vitest";
import {
  collectContractGroupIds,
  computeActiveGroupCoverage,
  countContractsByArea,
} from "./contract-hub-summary";

describe("countContractsByArea", () => {
  it("conta o contrato em cada área e não duplica a mesma área no mesmo contrato", () => {
    const counts = countContractsByArea([
      { areas: ["Cível", "Trabalhista", "Cível"] },
      { areas: ["Civel"] },
      { areas: [] },
    ]);
    expect(counts.find((row) => row.area === "Cível")?.count).toBe(2);
    expect(counts.find((row) => row.area === "Trabalhista")?.count).toBe(1);
    expect(counts.find((row) => row.area === "Tributário")?.count).toBe(0);
  });
});

describe("computeActiveGroupCoverage", () => {
  it("alerta grupo Cliente ativo sem contrato e ignora o enum antigo de títulos", () => {
    const coverage = computeActiveGroupCoverage({
      orqestraiGroups: [
        { id: "orq-1", name: "Grupo Ingevity", gestorAtividade: "ativo" },
        { id: "orq-2", name: "Grupo Pague Menos", gestorAtividade: "Ativo" },
        { id: "orq-3", name: "Grupo Eleva", gestorAtividade: "inativo" },
        { id: "orq-4", name: "Grupo Nulo", gestorAtividade: null },
      ],
      localGroups: [
        { id: "local-1", nome: "Grupo Ingevity", chaveEstavel: "grupo ingevity", orqestraiId: "orq-1" },
        { id: "local-2", nome: "Grupo Pague Menos", chaveEstavel: "grupo pague menos", orqestraiId: "orq-2" },
      ],
      contractGroupIds: collectContractGroupIds({
        contracts: [
          { grupoId: "local-2", clienteId: null },
          { grupoId: null, clienteId: "cli-1" },
        ],
        clients: [{ id: "cli-1", grupoId: "local-2" }],
      }),
    });

    expect(coverage.activeCount).toBe(2);
    expect(coverage.inactiveCount).toBe(2);
    expect(coverage.coveredCount).toBe(1);
    expect(coverage.orphans).toEqual([
      { orqestraiId: "orq-1", name: "Grupo Ingevity", localGroupId: "local-1" },
    ]);
  });
});
