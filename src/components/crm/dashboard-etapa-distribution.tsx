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

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nenhuma oportunidade cadastrada.</p>
    );
  }

  return (
    <ul className="space-y-2">
      {entries.map(([etapa, count]) => {
        const stage = etapa as Oportunidade["etapa"];
        return (
          <li
            key={etapa}
            className="flex items-center justify-between rounded-(--radius-v2-md) border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm"
          >
            <span className="font-semibold tracking-[-0.01em] text-foreground">
              {OPPORTUNITY_STAGE_LABELS[stage] ?? etapa}
            </span>
            <span className="rounded-(--radius-v2-full) bg-interactive-100 px-2.5 py-1 text-xs font-bold tabular-nums text-interactive-700">
              {count}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
