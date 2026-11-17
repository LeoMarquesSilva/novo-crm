import Link from "next/link";
import { Building2, ChevronRight, FileText, FolderKanban, Plus, Zap, type LucideIcon } from "lucide-react";

interface DashboardQuickActionsProps {
  /** Admin e comercial criam lead (mesma regra do kanban). */
  podeCriarLead: boolean;
}

type Action = { href: string; icon: LucideIcon; label: string };

/** Atalhos do Dashboard: ações frequentes, uma por linha. */
export function DashboardQuickActions({ podeCriarLead }: DashboardQuickActionsProps) {
  const actions: Action[] = [
    ...(podeCriarLead ? [{ href: "/crm/leads?novo=1", icon: Plus, label: "Cadastrar novo lead" }] : []),
    { href: "/crm/leads", icon: FolderKanban, label: "Abrir pipeline" },
    { href: "/crm/clientes", icon: Building2, label: "Consultar clientes" },
    { href: "/crm/contratos", icon: FileText, label: "Ver contratos" },
  ];

  return (
    <section className="rounded-(--radius-v2-xl) border border-border bg-white" aria-labelledby="acoes-rapidas">
      <header className="flex items-center gap-2.5 px-5 pb-3 pt-5">
        <Zap className="size-5 text-brand-gold-text" aria-hidden />
        <h2 id="acoes-rapidas" className="text-lg font-semibold leading-7 text-foreground">
          Ações rápidas
        </h2>
      </header>
      <ul className="space-y-2 px-5 pb-5">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <li key={action.href}>
              <Link
                href={action.href}
                className="group flex h-11 items-center gap-3 rounded-(--radius-v2-lg) border border-border px-3 text-sm font-medium text-foreground transition-colors hover:border-border-strong hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                <Icon className="size-4 shrink-0 text-foreground" aria-hidden />
                <span className="flex-1 truncate">{action.label}</span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
