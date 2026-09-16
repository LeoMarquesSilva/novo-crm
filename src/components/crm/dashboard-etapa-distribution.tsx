import { FolderKanban } from "lucide-react";
import { OPPORTUNITY_STAGE_LABELS } from "@/lib/crm/stage-labels";
import type { Oportunidade } from "@/modules/crm/domain/entities";

interface DashboardEtapaDistributionProps {
  countsByEtapa: Partial<Record<Oportunidade["etapa"], number>>;
}

export function DashboardEtapaDistribution({
  countsByEtapa,
}: DashboardEtapaDistributionProps) {
  const entries = Object.entries(countsByEtapa)
    .filter(([, n]) => (n ?? 0) > 0)
    .sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  const maximum = entries[0]?.[1] ?? 0;

  if (entries.length === 0) {
    return (
      <div className="flex min-h-52 flex-col items-center justify-center rounded-(--radius-v2-lg) border border-dashed border-border bg-surface-subtle px-6 text-center">
        <span className="flex size-10 items-center justify-center rounded-(--radius-v2-lg) bg-white text-muted-foreground shadow-sm">
          <FolderKanban className="size-4" aria-hidden />
        </span>
        <p className="mt-3 text-sm font-semibold text-foreground">Pipeline ainda vazio</p>
        <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
          As oportunidades aparecerão aqui assim que o primeiro lead for cadastrado.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Volume distribuído</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight text-foreground">
            {total}
          </p>
        </div>
        <p className="text-right text-xs leading-5 text-muted-foreground">
          {entries.length} {entries.length === 1 ? "etapa ativa" : "etapas ativas"}
        </p>
      </div>

      <ol className="space-y-4">
      {entries.map(([etapa, count], index) => {
        const stage = etapa as Oportunidade["etapa"];
        const percent = total > 0 ? Math.round((count / total) * 100) : 0;
        const relativeWidth = maximum > 0 ? Math.max(4, Math.round((count / maximum) * 100)) : 0;
        return (
          <li
            key={etapa}
            className="group grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2"
          >
            <span className="text-xs font-semibold tabular-nums text-neutral-400">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="truncate text-sm font-semibold tracking-[-0.01em] text-foreground">
              {OPPORTUNITY_STAGE_LABELS[stage] ?? etapa}
            </span>
            <span className="flex items-baseline gap-2">
              <span className="text-sm font-bold tabular-nums text-foreground">{count}</span>
              <span className="w-8 text-right text-[11px] tabular-nums text-muted-foreground">
                {percent}%
              </span>
            </span>
            <div className="col-start-2 col-end-4 h-1.5 overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-interactive-600 transition-[width] duration-500"
                style={{ width: `${relativeWidth}%` }}
                role="img"
                aria-label={`${count} oportunidades, ${percent}% do total`}
              />
            </div>
          </li>
        );
      })}
      </ol>
    </div>
  );
}
