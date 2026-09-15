import type { LeadLifecycleTimeline } from "@/lib/crm/lead-lifecycle-timeline";
import { buildLeadStageDurationItems } from "@/lib/crm/lead-stage-duration-strip";
import { cn } from "@/lib/utils";
import type { OpportunityStage } from "@/modules/crm/domain/entities";

type LeadStageDurationStripProps = {
  currentStage: OpportunityStage;
  timeline: LeadLifecycleTimeline;
};

export function LeadStageDurationStrip({
  currentStage,
  timeline,
}: LeadStageDurationStripProps) {
  const items = buildLeadStageDurationItems(currentStage, timeline);

  return (
    <section aria-labelledby="lead-stage-duration-title">
      <h2 id="lead-stage-duration-title" className="sr-only">
        Tempo de permanência em cada etapa do funil
      </h2>
      <div className="crm-scrollbar overflow-x-auto pb-1">
        <ol className="flex min-w-max divide-x divide-neutral-200 overflow-hidden rounded-(--radius-v2-xl) border border-neutral-200 bg-white xl:min-w-full">
          {items.map((item) => (
            <li
              key={item.stage}
              aria-current={item.isCurrent ? "step" : undefined}
              title={`${item.title}: ${item.durationLabel}`}
              className={cn(
                "flex min-h-12 w-[148px] shrink-0 flex-col justify-center px-3 py-2 transition-colors xl:min-w-0 xl:flex-1",
                item.isCurrent
                  ? "bg-interactive-600 text-white"
                  : item.isVisited
                    ? "bg-interactive-50 text-interactive-800"
                    : "bg-white text-neutral-500",
              )}
            >
              <span className="truncate text-[11px] font-semibold leading-tight">
                {item.title}
              </span>
              <span
                className={cn(
                  "mt-0.5 truncate text-[10px] font-medium tabular-nums",
                  item.isCurrent ? "text-white/80" : "text-muted-foreground",
                )}
              >
                {item.durationLabel}
                {item.isCurrent ? " · atual" : ""}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
