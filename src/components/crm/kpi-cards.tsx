import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  FileCheck2,
  Handshake,
  TimerReset,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CrmOverview } from "@/modules/crm/application/services/get-crm-overview";

interface KpiCardsProps {
  overview: CrmOverview;
}

export function KpiCards({ overview }: KpiCardsProps) {
  const cards: Array<{
    label: string;
    value: number;
    description: string;
    href: string;
    icon: LucideIcon;
    className: string;
    attention?: boolean;
  }> = [
    {
      label: "Oportunidades ativas",
      value: overview.totalOportunidades,
      description: "Leads em andamento no pipeline",
      href: "/crm/leads",
      icon: Handshake,
      className: "xl:col-span-4",
    },
    {
      label: "Clientes cadastrados",
      value: overview.totalClientes,
      description: "Organizações na base comercial",
      href: "/crm/clientes",
      icon: Building2,
      className: "xl:col-span-3",
    },
    {
      label: "Contratos monitorados",
      value: overview.totalContratos,
      description: "Instrumentos sob acompanhamento",
      href: "/crm/contratos",
      icon: FileCheck2,
      className: "xl:col-span-3",
    },
    {
      label: "Indicadores pendentes",
      value: overview.indicadoresPendentes,
      description:
        overview.indicadoresPendentes > 0 ? "Aguardando decisão" : "Fila em dia",
      href: "#fila-indicadores",
      icon: TimerReset,
      className: "xl:col-span-2",
      attention: overview.indicadoresPendentes > 0,
    },
  ];

  return (
    <section aria-label="Indicadores executivos" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-12">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Link
            key={card.label}
            href={card.href}
            className={cn(
              "group relative min-h-36 overflow-hidden rounded-(--radius-v2-xl) border border-border bg-white p-5 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[0_10px_30px_-18px_rgba(15,35,55,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
              card.className,
              card.attention && "border-warning-border bg-warning-bg/40",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-(--radius-v2-lg) bg-interactive-50 text-interactive-700",
                  card.attention && "bg-warning-bg text-warning-text",
                )}
              >
                <Icon className="size-4" aria-hidden />
              </span>
              <ArrowUpRight className="size-4 text-neutral-300 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-interactive-600" aria-hidden />
            </div>
            <p className="mt-4 text-3xl font-bold tabular-nums tracking-[-0.04em] text-foreground">
              {card.value}
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">{card.label}</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{card.description}</p>
          </Link>
        );
      })}
    </section>
  );
}
