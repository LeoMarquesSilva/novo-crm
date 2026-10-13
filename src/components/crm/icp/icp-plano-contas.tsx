/** Tipo de contrato no ICP: cores, barra e lista dos planos de contas do SIOE. */
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { IcpPlanRow } from "@/modules/icp/domain/compute";
import { sortedPlans, type HonorarioPlan } from "@/modules/icp/domain/plano-contas";
import { money, pct } from "./icp-format";
import { focusRing } from "./icp-primitives";

/** Categoria (não estado): uma cor fixa por plano, da paleta de gráficos. */
const PLAN_FILL: Record<HonorarioPlan, string> = {
  "HONORÁRIOS MENSAIS": "bg-chart-1",
  "HONORÁRIOS ADVOCATÍCIOS": "bg-chart-6",
  "HONORÁRIOS SPOT": "bg-chart-4",
  "HONORÁRIOS DE ÊXITO": "bg-chart-2",
  "HONORÁRIOS DE SUCUMBÊNCIA": "bg-chart-3",
  "HONORÁRIOS DE MANUTENÇÃO": "bg-interactive-300",
  "HONORÁRIOS POR HORA TRABALHADA": "bg-neutral-400",
};

export function planFill(plan: string): string {
  return PLAN_FILL[plan as HonorarioPlan] ?? "bg-neutral-300";
}

export function PlanDot({ plan, className }: { plan: string; className?: string }) {
  return <span className={cn("size-2.5 shrink-0 rounded-full", planFill(plan), className)} aria-hidden />;
}

/** Barra 100% fina com a receita dividida por plano. */
export function PlanStack({ rows, className }: { rows: IcpPlanRow[]; className?: string }) {
  if (rows.length === 0) return null;
  return (
    <div className={cn("flex h-2 gap-0.5 overflow-hidden rounded-(--radius-v2-sm)", className)}>
      {rows.map((r) => (
        <div
          key={r.plan}
          className={planFill(r.plan)}
          title={`${r.plan}: ${money(r.revenue)} (${pct(r.revenueShare)})`}
          style={{ width: `${r.revenueShare * 100}%` }}
        />
      ))}
    </div>
  );
}

/**
 * Planos que o grupo pagou em 12 meses, um por linha, na ordem do SIOE. Com mais de um
 * plano, passar o mouse (ou focar) mostra o valor e a parte de cada um.
 */
export function GroupPlans({
  revenueByPlan,
  withValues = false,
  className,
}: {
  revenueByPlan: Record<string, number>;
  withValues?: boolean;
  className?: string;
}) {
  const plans = sortedPlans(revenueByPlan);
  if (plans.length === 0) return <span className="text-xs text-muted-foreground">—</span>;

  if (withValues || plans.length === 1) {
    return (
      <ul className={cn("space-y-1", className)}>
        {plans.map(([plan, value]) => (
          <li key={plan} className="flex items-center gap-1.5 text-xs text-foreground">
            <PlanDot plan={plan} className="size-2" />
            <span className="min-w-0 flex-1 truncate">{plan}</span>
            {withValues && <span className="shrink-0 tabular-nums text-muted-foreground">{money(value)}</span>}
          </li>
        ))}
      </ul>
    );
  }

  const total = plans.reduce((acc, [, value]) => acc + value, 0);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn("block max-w-full cursor-help space-y-1 rounded-(--radius-v2-sm) text-left", focusRing, className)}
          aria-label={`Valor por tipo de contrato: ${plans.map(([plan, value]) => `${plan} ${money(value)}`).join("; ")}`}
        >
          {plans.map(([plan]) => (
            <span key={plan} className="flex items-center gap-1.5 text-xs text-foreground">
              <PlanDot plan={plan} className="size-2" />
              <span className="min-w-0 truncate underline decoration-neutral-300 decoration-dotted underline-offset-2">
                {plan}
              </span>
            </span>
          ))}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="px-3.5 py-3">
        <p className="text-sm font-semibold leading-snug text-foreground">Valor por tipo de contrato</p>
        <p className="text-xs text-muted-foreground">Honorários pagos em 12 meses, por plano de contas</p>
        <ul className="mt-2.5 space-y-1.5">
          {plans.map(([plan, value]) => (
            <li key={plan} className="flex items-start gap-2 text-xs">
              <PlanDot plan={plan} className="mt-1 size-2" />
              <span className="min-w-0 flex-1 leading-snug text-foreground">{plan}</span>
              <span className="shrink-0 font-semibold tabular-nums text-foreground">{money(value)}</span>
              <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground">{pct(value / total)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2 text-xs">
          <span className="text-muted-foreground">Total</span>
          <span className="font-semibold tabular-nums text-foreground">{money(total)}</span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
