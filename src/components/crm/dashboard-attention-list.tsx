import Link from "next/link";
import {
  ArrowRightLeft,
  ChevronRight,
  CircleCheck,
  Database,
  FileSignature,
  Hourglass,
  Presentation,
  TriangleAlert,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import type { DashboardPipelineSummary } from "@/lib/crm/dashboard-pipeline-summary";
import { cn } from "@/lib/utils";

interface DashboardAttentionListProps {
  atencao: DashboardPipelineSummary["atencao"];
  indicadoresPendentes: number;
  /** Due diligence só aparece para quem tem a página no menu (admin e comercial). */
  canViewDueDiligence: boolean;
}

type AttentionItem = {
  key: string;
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  tone: "danger" | "warning" | "neutral";
};

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

function buildItems({ atencao, indicadoresPendentes, canViewDueDiligence }: DashboardAttentionListProps): AttentionItem[] {
  const items: AttentionItem[] = [];
  const { parados } = atencao;

  if (parados.total > 0) {
    items.push({
      key: "parados",
      href: "/crm/leads",
      icon: Hourglass,
      title: `${parados.total} ${plural(parados.total, "lead além do prazo", "leads além do prazo")} da etapa`,
      description: parados.pior
        ? `Mais antigo: ${parados.pior.dias} ${plural(parados.pior.dias, "dia", "dias")} em ${parados.pior.title}`
        : "Vermelho no quadro de leads",
      tone: "danger",
    });
  }
  if (atencao.aguardandoAssinatura > 0) {
    items.push({
      key: "assinatura",
      href: "/crm/contratos",
      icon: FileSignature,
      title: `${atencao.aguardandoAssinatura} ${plural(atencao.aguardandoAssinatura, "contrato aguardando", "contratos aguardando")} assinatura`,
      description: "Enviados pelo D4Sign, ainda sem todas as assinaturas",
      tone: "warning",
    });
  }
  if (canViewDueDiligence && atencao.dueComAjustes > 0) {
    items.push({
      key: "due",
      href: "/crm/due-diligence",
      icon: Presentation,
      title: `${atencao.dueComAjustes} ${plural(atencao.dueComAjustes, "due com ajuste pedido", "dues com ajuste pedido")}`,
      description: "Uma área pediu correção na compilação",
      tone: "warning",
    });
  }
  if (indicadoresPendentes > 0) {
    items.push({
      key: "indicadores",
      href: "#fila-indicadores",
      icon: UserCheck,
      title: `${indicadoresPendentes} ${plural(indicadoresPendentes, "indicador aguardando", "indicadores aguardando")} aprovação`,
      description: "Quem indicou e ainda não está na base",
      tone: "warning",
    });
  }
  if (atencao.rdSemMovimento > 0) {
    items.push({
      key: "rd-parados",
      href: "/crm/migracao-rd",
      icon: Database,
      title: `${atencao.rdSemMovimento} ${plural(atencao.rdSemMovimento, "negócio do RD", "negócios do RD")} sem movimento`,
      description: "Parados no RD; aqui são só consulta",
      tone: "neutral",
    });
  }
  if (atencao.rdMigracaoPendente > 0) {
    items.push({
      key: "rd",
      href: "/crm/migracao-rd",
      icon: ArrowRightLeft,
      title: `${atencao.rdMigracaoPendente} ${plural(atencao.rdMigracaoPendente, "lead do RD", "leads do RD")} com migração pendente`,
      description: "Convertidos sem tudo o que o CRM pede: não avançam até completar",
      tone: "neutral",
    });
  }
  return items;
}

/** Card "Pontos de atenção": o que pede ação agora, contado com as regras do quadro de leads. */
export function DashboardAttentionList(props: DashboardAttentionListProps) {
  const items = buildItems(props);

  return (
    <section className="rounded-(--radius-v2-xl) border border-border bg-white" aria-labelledby="pontos-de-atencao">
      <header className="flex items-center gap-2.5 px-5 pb-3 pt-5">
        <TriangleAlert className="size-5 text-warning-text" aria-hidden />
        <h2 id="pontos-de-atencao" className="text-lg font-semibold leading-7 text-foreground">
          Pontos de atenção
        </h2>
        {items.length > 0 ? (
          <span className="ml-auto inline-flex min-w-7 items-center justify-center rounded-full bg-warning-bg px-2 py-0.5 text-xs font-semibold tabular-nums text-warning-text">
            {items.length}
          </span>
        ) : null}
      </header>

      {items.length === 0 ? (
        <div className="flex items-center gap-3 px-5 pb-5">
          <CircleCheck className="size-5 text-success-text" aria-hidden />
          <span>
            <span className="block text-sm font-semibold text-foreground">Nada pedindo atenção</span>
            <span className="block text-xs text-muted-foreground">Leads no prazo e filas em dia</span>
          </span>
        </div>
      ) : (
        <ul className="space-y-1 px-3 pb-3">
          {items.map((item, index) => {
            const Icon = item.icon;
            const destaque = index === 0 && item.tone !== "neutral";
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-3 rounded-(--radius-v2-lg) px-3 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                    destaque ? "bg-warning-bg/70 hover:bg-warning-bg" : "hover:bg-surface-hover",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-5 shrink-0",
                      item.tone === "danger" && "text-danger-text",
                      item.tone === "warning" && "text-warning-text",
                      item.tone === "neutral" && "text-muted-foreground",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">{item.title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{item.description}</span>
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
