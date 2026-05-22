"use client";

import { cn } from "@/lib/utils";
import { OPPORTUNITY_STAGE_LABELS } from "@/lib/crm/stage-labels";
import { getDwellTrafficStatus, type DwellTrafficStatus } from "@/lib/crm/stage-dwell-traffic";
import type { Oportunidade } from "@/modules/crm/domain/entities";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const STATUS_COPY: Record<
  DwellTrafficStatus,
  { headline: string; badge: string }
> = {
  ok: { headline: "Dentro do prazo", badge: "No prazo" },
  warning: { headline: "Esgotando o tempo", badge: "Atenção" },
  critical: { headline: "Muito tempo parado", badge: "Crítico" },
  unknown: { headline: "Sem referência de data", badge: "Indefinido" },
};

const STATUS_BADGE: Record<DwellTrafficStatus, string> = {
  ok: "bg-emerald-500/14 text-emerald-950",
  warning: "bg-amber-500/16 text-amber-950",
  critical: "bg-red-500/14 text-red-950",
  unknown: "bg-slate-400/18 text-slate-800",
};

/** Apenas o ponto semáforo — sem borda lateral colorida. */
const DOT_SOLID: Record<DwellTrafficStatus, string> = {
  ok: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-red-600",
  unknown: "bg-slate-400",
};

function stageTitle(etapa: Oportunidade["etapa"]): string {
  return OPPORTUNITY_STAGE_LABELS[etapa] ?? etapa;
}

function dwellPrimaryLine(item: Oportunidade): string {
  const d = item.diasNaEtapa;
  if (d === null || d === undefined) {
    return "Não dá para calcular há quanto tempo está nesta etapa.";
  }
  if (d === 0) {
    return "Atualizado hoje nesta etapa.";
  }
  if (d === 1) {
    return "1 dia sem atualização nesta etapa.";
  }
  return `${d} dias sem atualização nesta etapa.`;
}

/** Texto mínimo ao lado do ponto: só o tempo (ex.: 6d, 0, —). */
function daysCompactToken(item: Oportunidade): string {
  const d = item.diasNaEtapa;
  if (d === null || d === undefined) return "—";
  if (d === 0) return "0";
  if (d === 1) return "1d";
  return `${d}d`;
}

function shortAriaSummary(item: Oportunidade, status: DwellTrafficStatus): string {
  const token = daysCompactToken(item);
  const copy = STATUS_COPY[status];
  return `Dias na etapa ${token}: ${copy.badge}, ${copy.headline}.`;
}

function DwellStageTooltipBody({ item }: { item: Oportunidade }) {
  const status = getDwellTrafficStatus(item.diasNaEtapa, item.etapa);
  const copy = STATUS_COPY[status];

  return (
    <div className="px-3.5 py-3">
      <div className="flex items-start gap-2.5">
        <span
          className={cn("mt-1 size-2.5 shrink-0 rounded-full", DOT_SOLID[status])}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="font-semibold leading-snug text-primary-dark">{stageTitle(item.etapa)}</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span
              className={cn(
                "inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-tight",
                STATUS_BADGE[status],
              )}
            >
              {copy.badge}
            </span>
            <span className="text-[12px] leading-snug text-slate-600">{copy.headline}</span>
          </div>
          <p className="mt-3 text-[13px] leading-snug text-primary-dark/90">{dwellPrimaryLine(item)}</p>
        </div>
      </div>
    </div>
  );
}

interface DaysInStagePanelProps {
  item: Oportunidade;
  className?: string;
  compact?: boolean;
}

export function DaysInStagePanel({ item, className, compact }: DaysInStagePanelProps) {
  const status = getDwellTrafficStatus(item.diasNaEtapa, item.etapa);
  const token = daysCompactToken(item);
  const aria = shortAriaSummary(item, status);

  const triggerClass = cn(
    "inline-flex cursor-default items-center gap-1.5 rounded-md border border-slate-400/35 bg-white/70 px-2 py-1 shadow-sm",
    "text-primary-dark outline-none transition-[background-color,border-color] hover:border-slate-500/45 hover:bg-white/90",
    "focus-visible:border-accent-teal/45 focus-visible:ring-2 focus-visible:ring-accent-teal/30 focus-visible:ring-offset-1",
    compact ? "px-1.5 py-0.5" : "py-1",
    className,
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          tabIndex={0}
          className={triggerClass}
          aria-label={aria}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span
            className={cn(
              "shrink-0 rounded-full",
              compact ? "size-2" : "size-2.5",
              DOT_SOLID[status],
            )}
            aria-hidden
          />
          <span
            className={cn(
              "font-semibold tabular-nums tracking-tight text-primary-dark/75",
              compact ? "text-[10px]" : "text-[11px]",
            )}
          >
            {token}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="p-0">
        <DwellStageTooltipBody item={item} />
      </TooltipContent>
    </Tooltip>
  );
}
