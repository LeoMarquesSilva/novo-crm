import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CrmOverview } from "@/modules/crm/application/services/get-crm-overview";

interface KpiCardsProps {
  overview: CrmOverview;
}

export function KpiCards({ overview }: KpiCardsProps) {
  const cards = [
    {
      label: "Oportunidades ativas",
      value: overview.totalOportunidades,
      tone: "border-accent-teal/25 bg-accent-teal/[0.07]",
    },
    {
      label: "Clientes cadastrados",
      value: overview.totalClientes,
      tone: "border-amber-300/40 bg-amber-100/45",
    },
    {
      label: "Contratos monitorados",
      value: overview.totalContratos,
      tone: "border-blue-300/35 bg-blue-100/34",
    },
    {
      label: "Indicadores pendentes",
      value: overview.indicadoresPendentes,
      tone: "border-rose-300/35 bg-rose-100/35",
    },
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className={`glass-card-no-float border ${card.tone} p-5`}>
          <CardHeader className="px-0 pt-0">
            <CardTitle className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
              {card.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="text-4xl font-extrabold tracking-[-0.06em] text-primary-dark">
              {card.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
