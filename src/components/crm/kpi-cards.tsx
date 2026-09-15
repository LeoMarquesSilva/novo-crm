import { CrmOverview } from "@/modules/crm/application/services/get-crm-overview";

interface KpiCardsProps {
  overview: CrmOverview;
}

export function KpiCards({ overview }: KpiCardsProps) {
  const cards = [
    { label: "Oportunidades ativas", value: overview.totalOportunidades },
    { label: "Clientes cadastrados", value: overview.totalClientes },
    { label: "Contratos monitorados", value: overview.totalContratos },
    { label: "Indicadores pendentes", value: overview.indicadoresPendentes },
  ];

  return (
    <section className="grid grid-cols-1 divide-y divide-neutral-200 rounded-(--radius-v2-xl) border border-neutral-200 bg-white sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="p-5">
          <p className="text-v2-body-sm-medium uppercase tracking-[0.08em] text-muted-foreground">
            {card.label}
          </p>
          <p className="mt-2 text-v2-display-sm text-foreground">{card.value}</p>
        </div>
      ))}
    </section>
  );
}
