"use client";

/** Aba Carteira: tipo de contrato = plano de contas do SIOE, por faixa e no painel próprio. */
import { useState } from "react";
import { Repeat } from "lucide-react";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { planSummary, type IcpData, type IcpGroupRow } from "@/modules/icp/domain/compute";
import { HONORARIOS_MENSAIS, HONORARIO_PLANS, planShortLabel } from "@/modules/icp/domain/plano-contas";
import { INFO, SRC, groupsInScope, scopeText, type TierScope } from "./icp-content";
import { money, pct } from "./icp-format";
import { PlanDot, planFill } from "./icp-plano-contas";
import { Panel, TierScopeTabs } from "./icp-primitives";
import { SortableHead, nextSort, sortRows, type SortState } from "./icp-sort";

/** Barra 100% com a receita da faixa dividida por plano de contas. */
export function PlanMixBar({ groups }: { groups: IcpGroupRow[] }) {
  const summary = planSummary(groups);
  if (summary.rows.length === 0) return <span className="text-muted-foreground">—</span>;
  const mensais = summary.rows.find((r) => r.plan === HONORARIOS_MENSAIS);
  return (
    <div className="w-full max-w-[160px]">
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-(--radius-v2-sm)">
        {summary.rows.map((r) => (
          <div
            key={r.plan}
            className={planFill(r.plan)}
            title={`${r.plan}: ${pct(r.revenueShare)} da receita`}
            style={{ width: `${r.revenueShare * 100}%` }}
          />
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {pct(mensais?.revenueShare ?? 0)} {planShortLabel(HONORARIOS_MENSAIS)}
      </p>
    </div>
  );
}

/** Legenda com os planos que aparecem nos grupos. */
export function PlanLegend({ groups }: { groups: IcpGroupRow[] }) {
  const plans = planSummary(groups).rows.map((r) => r.plan);
  if (plans.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>Tipo de contrato:</span>
      {plans.map((plan) => (
        <span key={plan} className="inline-flex items-center gap-1.5">
          <PlanDot plan={plan} />
          {plan}
        </span>
      ))}
    </div>
  );
}

type PlanSortKey = "plano" | "grupos" | "receita" | "share" | "ticket";

/** Posição do plano na lista do SIOE (planos fora da lista vão para o fim). */
function planOrder(plan: string): number {
  const index = (HONORARIO_PLANS as readonly string[]).indexOf(plan);
  return index === -1 ? HONORARIO_PLANS.length : index;
}

/** Grupos, receita e ticket por plano de contas do SIOE, um plano por linha. */
export function PlanoContasPanel({ data }: { data: IcpData }) {
  const [scope, setScope] = useState<TierScope>("all");
  const inScope = groupsInScope(data, scope);
  const summary = planSummary(inScope);
  const [sort, setSort] = useState<SortState<PlanSortKey>>({ key: "plano", desc: false });
  const onSort = (key: PlanSortKey) => setSort((s) => nextSort(s, key));
  const rows = sortRows(summary.rows, sort, (r, key) => {
    if (key === "plano") return planOrder(r.plan);
    if (key === "grupos") return r.groups;
    if (key === "ticket") return r.avgMonthly;
    return r.revenue;
  });

  return (
    <Panel
      icon={Repeat}
      title="Tipo de contrato"
      description={`Honorários por plano de contas do SIOE nos ${summary.groups} grupos ${scopeText(data, scope)}`}
      info={INFO.tipoContrato}
      sources={[SRC.planoContas]}
    >
      <TierScopeTabs value={scope} onChange={setScope} />

      {summary.revenue > 0 && (
        <div className="mb-4 flex h-9 gap-0.5 overflow-hidden rounded-(--radius-v2-md)">
          {summary.rows.map((r) => (
            <div
              key={r.plan}
              className={cn(
                "flex items-center justify-center text-xs font-semibold tabular-nums",
                planFill(r.plan),
                r.plan === HONORARIOS_MENSAIS ? "text-white" : "text-foreground",
              )}
              style={{ width: `${r.revenueShare * 100}%` }}
              title={`${r.plan}: ${money(r.revenue)} (${pct(r.revenueShare)})`}
            >
              {r.revenueShare >= 0.08 ? pct(r.revenueShare) : ""}
            </div>
          ))}
        </div>
      )}

      <Table className="min-w-[620px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <SortableHead label="Plano de contas" sortKey="plano" sort={sort} onSort={onSort} info={INFO.tipoContrato} />
            <SortableHead label="Grupos" sortKey="grupos" sort={sort} onSort={onSort} info={INFO.gruposPorPlano} align="right" />
            <SortableHead label="Receita 12 meses" sortKey="receita" sort={sort} onSort={onSort} align="right" />
            <SortableHead label="% da receita" sortKey="share" sort={sort} onSort={onSort} align="right" />
            <SortableHead label="Ticket/mês" sortKey="ticket" sort={sort} onSort={onSort} info={INFO.ticketPorPlano} align="right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.plan} className="hover:bg-transparent">
              <TableCell className="py-3">
                <span className="inline-flex items-center gap-2 font-medium text-foreground">
                  <PlanDot plan={r.plan} />
                  {r.plan}
                </span>
              </TableCell>
              <TableCell className="py-3 text-right tabular-nums">
                {r.groups}
                <span className="ml-1 text-xs text-muted-foreground">({pct(r.groupShare)})</span>
              </TableCell>
              <TableCell className="py-3 text-right tabular-nums">{money(r.revenue)}</TableCell>
              <TableCell className="py-3 text-right font-medium tabular-nums">{pct(r.revenueShare)}</TableCell>
              <TableCell className="py-3 text-right tabular-nums">{money(r.avgMonthly)}</TableCell>
            </TableRow>
          ))}
          {summary.rows.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                Nenhum honorário pago nos grupos selecionados.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Panel>
  );
}
