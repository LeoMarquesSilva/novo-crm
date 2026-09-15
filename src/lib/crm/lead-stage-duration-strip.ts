import { formatarDuracaoBr } from "@/lib/crm/due-diligence-timeline";
import {
  isPosVendaPipelineStage,
  POS_VENDA_PIPELINE_COLUMNS,
  SALES_PIPELINE_COLUMNS,
} from "@/lib/crm/pipeline-board-config";
import type { LeadLifecycleTimeline } from "@/lib/crm/lead-lifecycle-timeline";
import type { OpportunityStage } from "@/modules/crm/domain/entities";

export type LeadStageDurationItem = {
  stage: OpportunityStage;
  title: string;
  durationLabel: string;
  isCurrent: boolean;
  isVisited: boolean;
};

export function buildLeadStageDurationItems(
  currentStage: OpportunityStage,
  timeline: LeadLifecycleTimeline,
): LeadStageDurationItem[] {
  const columns = isPosVendaPipelineStage(currentStage)
    ? POS_VENDA_PIPELINE_COLUMNS
    : SALES_PIPELINE_COLUMNS;

  const durationByStage = new Map<OpportunityStage, number>();
  const visitedStages = new Set<OpportunityStage>();

  for (const period of timeline.periods) {
    visitedStages.add(period.etapa);
    if (period.durationMs == null) continue;
    durationByStage.set(
      period.etapa,
      (durationByStage.get(period.etapa) ?? 0) + period.durationMs,
    );
  }

  return columns.map((column) => {
    const durationMs = durationByStage.get(column.stage);
    const isCurrent = column.stage === currentStage;

    return {
      stage: column.stage,
      title: column.title,
      durationLabel:
        durationMs != null
          ? formatarDuracaoBr(durationMs)
          : isCurrent
            ? timeline.summary.currentEtapaDurationLabel
            : "—",
      isCurrent,
      isVisited: visitedStages.has(column.stage),
    };
  });
}
