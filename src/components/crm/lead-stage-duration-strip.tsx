import { ArrowRight, Loader2 } from "lucide-react";

import type { LeadLifecycleTimeline } from "@/lib/crm/lead-lifecycle-timeline";
import { buildLeadStageDurationItems } from "@/lib/crm/lead-stage-duration-strip";
import { OPPORTUNITY_STAGE_LABELS } from "@/lib/crm/stage-labels";
import { cn } from "@/lib/utils";
import type { OpportunityStage } from "@/modules/crm/domain/entities";

type LeadStageDurationStripProps = {
  currentStage: OpportunityStage;
  timeline: LeadLifecycleTimeline;
  advanceStage?: OpportunityStage | null;
  advancing?: boolean;
  onAdvance?: (stage: OpportunityStage) => void;
};

export function LeadStageDurationStrip({
  currentStage,
  timeline,
  advanceStage = null,
  advancing = false,
  onAdvance,
}: LeadStageDurationStripProps) {
  const items = buildLeadStageDurationItems(currentStage, timeline);
  const displayItems =
    advanceStage && !items.some((item) => item.stage === advanceStage)
      ? [
          ...items,
          {
            stage: advanceStage,
            title: OPPORTUNITY_STAGE_LABELS[advanceStage],
            durationLabel: "—",
            isCurrent: false,
            isVisited: false,
          },
        ]
      : items;

  return (
    <section aria-labelledby="lead-stage-duration-title">
      <h2 id="lead-stage-duration-title" className="sr-only">
        Tempo de permanência em cada etapa do funil
      </h2>
      <div className="crm-scrollbar overflow-x-auto pb-1">
        <ol className="flex min-w-max divide-x divide-neutral-200 overflow-hidden rounded-(--radius-v2-xl) border border-neutral-200 bg-white xl:min-w-full">
          {displayItems.map((item) => {
            const isAdvanceTarget =
              item.stage === advanceStage && typeof onAdvance === "function";
            const content = (
              <>
                <span className="truncate text-[11px] font-semibold leading-tight">
                  {item.title}
                </span>
                <span
                  className={cn(
                    "mt-0.5 inline-flex items-center gap-1 truncate text-[10px] font-medium tabular-nums",
                    item.isCurrent ? "text-white/80" : "text-muted-foreground",
                    isAdvanceTarget && "text-interactive-700",
                  )}
                >
                  {isAdvanceTarget ? (
                    advancing ? (
                      <Loader2 className="size-3 animate-spin" aria-hidden />
                    ) : (
                      <ArrowRight className="size-3" aria-hidden />
                    )
                  ) : null}
                  {isAdvanceTarget
                    ? advancing
                      ? "Validando…"
                      : "Avançar para esta etapa"
                    : item.durationLabel}
                  {item.isCurrent ? " · atual" : ""}
                </span>
              </>
            );

            return (
              <li
                key={item.stage}
                aria-current={item.isCurrent ? "step" : undefined}
                title={`${item.title}: ${isAdvanceTarget ? "avançar" : item.durationLabel}`}
                className={cn(
                  "min-h-12 w-[148px] shrink-0 transition-colors xl:min-w-0 xl:flex-1",
                  item.isCurrent
                    ? "bg-interactive-600 text-white"
                    : item.isVisited
                      ? "bg-interactive-50 text-interactive-800"
                      : "bg-white text-neutral-500",
                  isAdvanceTarget &&
                    "bg-interactive-50 text-interactive-800 hover:bg-interactive-100",
                )}
              >
                {isAdvanceTarget ? (
                  <button
                    type="button"
                    className="flex min-h-12 w-full flex-col justify-center px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    disabled={advancing}
                    onClick={() => onAdvance(item.stage)}
                    aria-label={`Avançar para ${item.title}`}
                  >
                    {content}
                  </button>
                ) : (
                  <div className="flex min-h-12 flex-col justify-center px-3 py-2">
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
