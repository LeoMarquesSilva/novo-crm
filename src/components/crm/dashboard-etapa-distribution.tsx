import type { ReactNode } from "react";
import { FolderKanban } from "lucide-react";
import type { DashboardFunnel, DashboardPipelineSummary } from "@/lib/crm/dashboard-pipeline-summary";
import { cn } from "@/lib/utils";

interface DashboardEtapaDistributionProps {
  summary: DashboardPipelineSummary;
}

/**
 * Funil do Dashboard na ordem das colunas do kanban (Vendas e Pós-venda). A barra mostra o volume
 * da etapa; o trecho vermelho são os leads além do prazo da etapa (o vermelho do quadro).
 */
export function DashboardEtapaDistribution({ summary }: DashboardEtapaDistributionProps) {
  const total = summary.vendas.total + summary.posVenda.total;
  const rd = summary.vendas.rd + summary.posVenda.rd;

  if (total === 0) {
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
          <p className="text-xs font-medium text-muted-foreground">No funil</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight text-foreground">{total}</p>
        </div>
        <div className="text-right text-xs leading-5 text-muted-foreground">
          <p className="tabular-nums">
            {total - rd} no CRM · {rd} do RD
            {summary.perdidos > 0 ? ` · ${summary.perdidos} perdidos ficam fora` : ""}
          </p>
          <ul className="mt-1 flex justify-end gap-3" aria-label="Legenda das barras">
            <LegendItem className="bg-brand-navy">CRM</LegendItem>
            <LegendItem className="bg-danger-text">CRM além do prazo</LegendItem>
            <LegendItem className="bg-brand-navy/25">RD (só consulta)</LegendItem>
          </ul>
        </div>
      </div>

      <div className="space-y-7">
        <FunnelSection funnel={summary.vendas} />
        <FunnelSection funnel={summary.posVenda} />
      </div>
    </div>
  );
}

function FunnelSection({ funnel }: { funnel: DashboardFunnel }) {
  const maximum = Math.max(0, ...funnel.rows.map((r) => r.total));
  const headingId = `funil-${funnel.key}`;

  return (
    <section aria-labelledby={headingId}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 id={headingId} className="text-sm font-semibold text-foreground">
          {funnel.title}
          <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">· {funnel.total}</span>
        </h3>
        <span className="text-right text-xs tabular-nums">
          {funnel.parados > 0 ? (
            <span className="font-semibold text-danger-text">{funnel.parados} além do prazo</span>
          ) : (
            <span className="text-muted-foreground">CRM no prazo</span>
          )}
          {funnel.paradosRd > 0 ? (
            <span className="text-muted-foreground"> · {funnel.paradosRd} do RD sem movimento</span>
          ) : null}
        </span>
      </div>

      <ol className="space-y-3.5">
        {funnel.rows.map((row) => {
          const empty = row.total === 0;
          const width = maximum > 0 && !empty ? Math.max(3, Math.round((row.total / maximum) * 100)) : 0;
          const share = (n: number) => (row.total > 0 ? `${(n / row.total) * 100}%` : "0%");
          const crmNoPrazo = row.total - row.rd - row.parados;
          return (
            <li key={row.stage} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
              <span
                className={cn(
                  "truncate text-sm",
                  empty ? "font-medium text-muted-foreground" : "font-semibold text-foreground",
                )}
              >
                {row.title}
              </span>
              <span className="flex items-baseline gap-3">
                {row.parados > 0 ? (
                  <span className="text-xs font-semibold tabular-nums text-danger-text">
                    {row.parados} {row.parados === 1 ? "parado" : "parados"}
                  </span>
                ) : null}
                <span
                  className={cn(
                    "w-8 text-right text-sm font-bold tabular-nums",
                    empty ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {row.total}
                </span>
              </span>
              <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="flex h-full overflow-hidden rounded-full transition-[width] duration-500"
                  style={{ width: `${width}%` }}
                  role="img"
                  aria-label={[
                    `${row.total} leads`,
                    row.rd > 0 ? `${row.rd} do RD` : null,
                    row.parados > 0 ? `${row.parados} do CRM além do prazo da etapa` : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                >
                  {crmNoPrazo > 0 ? <div className="h-full bg-brand-navy" style={{ width: share(crmNoPrazo) }} /> : null}
                  {row.parados > 0 ? <div className="h-full bg-danger-text" style={{ width: share(row.parados) }} /> : null}
                  {row.rd > 0 ? <div className="h-full bg-brand-navy/25" style={{ width: share(row.rd) }} /> : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function LegendItem({ className, children }: { className: string; children: ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", className)} aria-hidden />
      {children}
    </li>
  );
}
