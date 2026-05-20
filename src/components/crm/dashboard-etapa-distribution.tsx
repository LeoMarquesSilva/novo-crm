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
            className="flex items-center justify-between rounded-2xl border border-primary-dark/10 bg-white/60 px-4 py-3 text-sm shadow-sm shadow-primary-dark/[0.03]"
          >
            <span className="font-semibold tracking-[-0.01em] text-primary-dark">
              {OPPORTUNITY_STAGE_LABELS[stage] ?? etapa}
            </span>
            <span className="rounded-full border border-accent-teal/20 bg-accent-teal/10 px-2.5 py-1 text-xs font-bold tabular-nums text-accent-teal">
              {count}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
