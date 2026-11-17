import Link from "next/link";
import { ArrowUp, Building2, FileText, Target, Zap, type LucideIcon } from "lucide-react";
import type { PeriodDelta } from "@/lib/crm/dashboard-period";
import { cn } from "@/lib/utils";

interface KpiCardsProps {
  /** Oportunidades em andamento (todas as etapas, sem perdidos), contadas como no kanban. */
  oportunidades: { total: number; novas: PeriodDelta };
  clientes: { total: number; novos: PeriodDelta };
  contratos: { total: number; novos: PeriodDelta };
  indicadoresPendentes: number;
}

type Card = {
  label: string;
  value: number;
  href: string;
  icon: LucideIcon;
  delta?: { d: PeriodDelta; um: string; varios: string };
  note?: string;
  highlight?: boolean;
};

const fmt = new Intl.NumberFormat("pt-BR");

export function KpiCards({ oportunidades, clientes, contratos, indicadoresPendentes }: KpiCardsProps) {
  const cards: Card[] = [
    {
      label: "Oportunidades ativas",
      value: oportunidades.total,
      href: "/crm/leads",
      icon: Target,
      delta: { d: oportunidades.novas, um: "nova", varios: "novas" },
    },
    {
      label: "Clientes cadastrados",
      value: clientes.total,
      href: "/crm/clientes",
      icon: Building2,
      delta: { d: clientes.novos, um: "novo", varios: "novos" },
    },
    {
      label: "Contratos monitorados",
      value: contratos.total,
      href: "/crm/contratos",
      icon: FileText,
      delta: { d: contratos.novos, um: "novo", varios: "novos" },
    },
    {
      label: "Indicadores pendentes",
      value: indicadoresPendentes,
      href: "#fila-indicadores",
      icon: Zap,
      note: indicadoresPendentes > 0 ? "Aguardando decisão" : "Fila em dia",
      highlight: indicadoresPendentes > 0,
    },
  ];

  return (
    <section aria-label="Indicadores do período" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Link
            key={card.label}
            href={card.href}
            className={cn(
              "group flex items-start gap-4 rounded-(--radius-v2-xl) border border-border bg-white p-5 transition-[border-color,box-shadow] duration-200 hover:border-border-strong hover:shadow-[0_10px_30px_-18px_rgba(15,35,55,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
              card.highlight && "border-brand-gold/50 bg-brand-cream hover:border-brand-gold",
            )}
          >
            <span
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-full bg-interactive-50 text-interactive-700",
                card.highlight && "bg-brand-gold/15 text-brand-gold-text",
              )}
            >
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-[28px] font-bold leading-8 tabular-nums tracking-[-0.02em] text-foreground">
                {fmt.format(card.value)}
              </span>
              <span className="mt-1 block text-[15px] font-semibold leading-5 text-foreground">{card.label}</span>
              {card.delta ? (
                <DeltaLine {...card.delta} />
              ) : (
                <span className="mt-1 block text-sm text-muted-foreground">{card.note}</span>
              )}
            </span>
          </Link>
        );
      })}
    </section>
  );
}

/** Entradas no período (por data de criação); o período anterior fica no tooltip. */
function DeltaLine({ d, um, varios }: { d: PeriodDelta; um: string; varios: string }) {
  const tooltip = `Período anterior: ${d.anterior}`;
  if (d.atual === 0) {
    return (
      <span className="mt-1 block text-sm text-muted-foreground" title={tooltip}>
        {um === "nova" ? "nenhuma nova" : "nenhum novo"} no período
      </span>
    );
  }
  return (
    <span className="mt-1 flex items-center gap-1 text-sm" title={tooltip}>
      <ArrowUp className="size-3.5 text-success-text" aria-hidden />
      <span className="font-semibold tabular-nums text-success-text">{fmt.format(d.atual)}</span>
      <span className="text-muted-foreground">{d.atual === 1 ? um : varios} no período</span>
    </span>
  );
}
