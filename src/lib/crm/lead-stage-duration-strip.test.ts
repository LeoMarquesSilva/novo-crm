import { describe, expect, it } from "vitest";
import type { LeadLifecycleTimeline } from "@/lib/crm/lead-lifecycle-timeline";
import { buildLeadStageDurationItems } from "./lead-stage-duration-strip";

function timeline(
  periods: LeadLifecycleTimeline["periods"],
  currentEtapaDurationLabel = "3 h",
): LeadLifecycleTimeline {
  return {
    periods,
    activities: [],
    summary: {
      leadCreatedAt: "2026-09-01T00:00:00.000Z",
      totalDurationMs: null,
      totalDurationLabel: "—",
      currentEtapa: null,
      currentEtapaDurationMs: null,
      currentEtapaDurationLabel,
      periodCount: periods.length,
      activityCount: 0,
    },
  };
}

describe("buildLeadStageDurationItems", () => {
  it("exibe todas as etapas comerciais e soma reentradas na mesma etapa", () => {
    const items = buildLeadStageDurationItems(
      "compilacao",
      timeline([
        {
          id: "p1",
          etapa: "levantamento_dados",
          etapaLabel: "Levantamento de Dados",
          enteredAt: "2026-09-01T00:00:00.000Z",
          exitedAt: "2026-09-02T00:00:00.000Z",
          durationMs: 24 * 60 * 60 * 1000,
          durationLabel: "1 dia",
          isCurrent: false,
          source: null,
        },
        {
          id: "p2",
          etapa: "levantamento_dados",
          etapaLabel: "Levantamento de Dados",
          enteredAt: "2026-09-03T00:00:00.000Z",
          exitedAt: "2026-09-03T02:00:00.000Z",
          durationMs: 2 * 60 * 60 * 1000,
          durationLabel: "2 h",
          isCurrent: false,
          source: null,
        },
      ]),
    );

    expect(items).toHaveLength(11);
    expect(items[0]).toMatchObject({
      stage: "levantamento_dados",
      durationLabel: "1 dia e 2 h",
      isVisited: true,
    });
    expect(items.find((item) => item.stage === "compilacao")).toMatchObject({
      durationLabel: "3 h",
      isCurrent: true,
    });
    expect(items.at(-1)).toMatchObject({
      stage: "contrato_assinado",
      durationLabel: "—",
      isVisited: false,
    });
  });

  it("usa apenas as etapas do pós-venda quando o lead está nesse funil", () => {
    const items = buildLeadStageDurationItems(
      "boas_vindas",
      timeline([], "2 dias"),
    );

    expect(items.map((item) => item.stage)).toEqual([
      "aguardando_cadastro",
      "cadastro_novo_cliente",
      "inclusao_faturamento",
      "boas_vindas",
      "reuniao_kickoff",
    ]);
    expect(items[3]).toMatchObject({
      durationLabel: "2 dias",
      isCurrent: true,
    });
  });
});
