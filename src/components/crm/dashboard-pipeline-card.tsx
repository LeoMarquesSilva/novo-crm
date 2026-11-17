"use client";

import Link from "next/link";
import { ArrowRight, BarChart3 } from "lucide-react";
import { useState } from "react";
import { DashboardEtapaDistribution } from "@/components/crm/dashboard-etapa-distribution";
import type { ConversionFunnel, DashboardPipelineSummary } from "@/lib/crm/dashboard-pipeline-summary";
import { cn } from "@/lib/utils";

interface DashboardPipelineCardProps {
  funnel: ConversionFunnel;
  summary: DashboardPipelineSummary;
}

type View = "funil" | "etapas";

const fmt = new Intl.NumberFormat("pt-BR");

/** Tons das faixas, da entrada para o fim (texto branco: contraste ≥ 4,5:1). A última fase é a meta, em dourado. */
const FUNNEL_SHADES = ["#16263b", "#1d3149", "#253d58", "#2e4a68", "#385879", "#43668a"];
/** Largura mínima da faixa, para o rótulo caber mesmo com poucos leads. */
const MIN_WIDTH = 34;

export function DashboardPipelineCard({ funnel, summary }: DashboardPipelineCardProps) {
  const [view, setView] = useState<View>("funil");

  return (
    <section className="overflow-hidden rounded-(--radius-v2-xl) border border-border bg-white" aria-labelledby="pipeline-comercial">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-6 py-5">
        <div className="flex min-w-0 items-start gap-3">
          <BarChart3 className="mt-0.5 size-6 shrink-0 text-brand-navy" aria-hidden />
          <div className="min-w-0">
            <h2 id="pipeline-comercial" className="text-lg font-semibold leading-7 text-foreground">
              Pipeline comercial
            </h2>
            <p className="text-sm text-muted-foreground">
              {view === "funil"
                ? "Por onde os leads entram e até onde chegam."
                : "Onde os leads estão agora, na ordem do quadro."}
            </p>
          </div>
        </div>
        <div role="tablist" aria-label="Visão do pipeline" className="inline-flex rounded-(--radius-v2-lg) border border-border bg-white p-1">
          {(["funil", "etapas"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                "h-8 min-w-24 rounded-(--radius-v2-md) px-4 text-sm font-medium transition-colors",
                view === v ? "bg-brand-navy text-white" : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
              )}
            >
              {v === "funil" ? "Funil" : "Etapas"}
            </button>
          ))}
        </div>
      </header>

      {view === "funil" ? (
        <div className="grid gap-8 p-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
          <Funnel funnel={funnel} />
          <div className="min-w-0">
            <StatsRow funnel={funnel} />
            <PhaseTable funnel={funnel} />
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              Todos os leads desde o início, do CRM e do RD. Cada um conta até a fase em que está ou em que foi perdido;
              o período do topo não muda o funil.
            </p>
          </div>
        </div>
      ) : (
        <div className="p-6">
          <DashboardEtapaDistribution summary={summary} />
          <Link
            href="/crm/leads"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-interactive-700 hover:text-interactive-800 hover:underline"
          >
            Abrir o quadro de leads
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      )}
    </section>
  );
}

function Funnel({ funnel }: { funnel: ConversionFunnel }) {
  if (funnel.total === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum lead cadastrado ainda.</p>;
  }
  const n = funnel.phases.length;
  const width = (k: number): number => {
    if (k >= n) return Math.max(MIN_WIDTH - 6, width(n - 1) * 0.82);
    return Math.max(MIN_WIDTH, (funnel.phases[k].chegaram / funnel.total) * 100);
  };
  return (
    <ol className="flex flex-col items-center gap-1" aria-label="Funil de conversão">
      {funnel.phases.map((phase, i) => {
        const top = width(i);
        const bottom = Math.min(top, width(i + 1));
        const inset = ((top - bottom) / 2 / top) * 100;
        const meta = i === n - 1;
        return (
          <li
            key={phase.key}
            className={cn(
              "flex h-14 flex-col items-center justify-center px-4 text-center",
              meta ? "bg-brand-gold text-brand-navy" : "text-white",
            )}
            style={{
              width: `${top}%`,
              clipPath: `polygon(0 0, 100% 0, ${100 - inset}% 100%, ${inset}% 100%)`,
              backgroundColor: meta ? undefined : FUNNEL_SHADES[Math.min(i, FUNNEL_SHADES.length - 1)],
            }}
          >
            <span className="w-full truncate text-[13px] font-semibold leading-4">{phase.title}</span>
            <span className="mt-1 text-sm font-bold leading-4 tabular-nums">
              {fmt.format(phase.chegaram)}
              <span className={cn("mx-1.5 font-normal", meta ? "text-brand-navy/50" : "text-white/50")}>|</span>
              <span className="font-semibold">{phase.pctDoTotal}%</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function StatsRow({ funnel }: { funnel: ConversionFunnel }) {
  return (
    <dl className="grid grid-cols-3 divide-x divide-border border-b border-border pb-5">
      <div className="flex flex-col-reverse pr-4">
        <dt className="mt-1 text-sm text-muted-foreground">Leads cadastrados</dt>
        <dd className="text-[28px] font-bold leading-8 tabular-nums text-foreground">{fmt.format(funnel.total)}</dd>
      </div>
      <div className="flex flex-col-reverse px-4">
        <dt className="mt-1 text-sm text-muted-foreground">Contratos assinados</dt>
        <dd className="text-[28px] font-bold leading-8 tabular-nums text-foreground">{fmt.format(funnel.fechados)}</dd>
      </div>
      <div className="flex flex-col-reverse pl-4">
        <dt className="mt-1 text-sm text-muted-foreground">Conversão geral</dt>
        <dd className="text-[28px] font-bold leading-8 tabular-nums text-success-text">{funnel.conversaoPct}%</dd>
      </div>
    </dl>
  );
}

function PhaseTable({ funnel }: { funnel: ConversionFunnel }) {
  return (
    <div className="pt-5">
      <h3 className="text-base font-semibold text-foreground">Passagem entre fases</h3>
      <table className="mt-3 w-full table-fixed text-sm">
        <colgroup>
          <col />
          <col className="w-20" />
          <col className="w-24" />
          <col className="w-20" />
        </colgroup>
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="pb-2 text-left font-medium">
              Fase
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              Chegaram
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              Seguiram
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              Perdidos
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {funnel.phases.map((phase) => (
            <tr key={phase.key}>
              <td title={phase.title} className="truncate py-2.5 pr-3 font-medium text-foreground">
                {phase.title}
              </td>
              <td className="py-2.5 text-right font-semibold tabular-nums text-foreground">{fmt.format(phase.chegaram)}</td>
              <td className="py-2.5 text-right">
                {phase.passagemPct === null ? (
                  <span className="text-xs text-muted-foreground">meta</span>
                ) : (
                  <span
                    className="inline-block min-w-12 rounded-full bg-neutral-100 px-2 py-0.5 text-center text-xs font-medium tabular-nums text-foreground"
                    title={`${phase.passagemPct}% de quem chegou aqui passou para a próxima fase`}
                  >
                    {phase.passagemPct}%
                  </span>
                )}
              </td>
              <td
                className={cn(
                  "py-2.5 text-right tabular-nums",
                  phase.perdidos > 0 ? "font-semibold text-danger-text" : "text-muted-foreground",
                )}
              >
                {fmt.format(phase.perdidos)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
