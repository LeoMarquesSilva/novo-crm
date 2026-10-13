"use client";

/** Aba Carteira: tipo de contrato = plano de contas do SIOE, por faixa e no painel próprio. */
import { useState } from "react";
import { Repeat } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { planSummary, type IcpData, type IcpGroupRow } from "@/modules/icp/domain/compute";
import { HONORARIOS_MENSAIS, planShortLabel } from "@/modules/icp/domain/plano-contas";
import { INFO, SRC, groupsInScope, scopeText, type TierScope } from "./icp-content";
import { money, pct } from "./icp-format";
import { PlanDot, planFill } from "./icp-plano-contas";
import { LabelWithInfo, Panel, TierScopeTabs } from "./icp-primitives";

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

const headClass = "text-xs font-medium text-muted-foreground";

/** Grupos, receita e ticket por plano de contas do SIOE, um plano por linha. */
export function PlanoContasPanel({ data }: { data: IcpData }) {
  const [scope, setScope] = useState<TierScope>("all");
  const inScope = groupsInScope(data, scope);
  const summary = planSummary(inScope);

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
            <TableHead className={headClass}>
              <LabelWithInfo label="Plano de contas" info={INFO.tipoContrato} />
            </TableHead>
            <TableHead className={cn(headClass, "text-right")}>
              <LabelWithInfo label="Grupos" info={INFO.gruposPorPlano} className="justify-end" />
            </TableHead>
            <TableHead className={cn(headClass, "text-right")}>Receita 12 meses</TableHead>
            <TableHead className={cn(headClass, "text-right")}>% da receita</TableHead>
            <TableHead className={cn(headClass, "text-right")}>
              <LabelWithInfo label="Ticket/mês" info={INFO.ticketPorPlano} className="justify-end" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {summary.rows.map((r) => (
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
