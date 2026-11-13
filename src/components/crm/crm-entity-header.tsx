import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type CrmEntityHeaderContextItem = {
  label?: string;
  value: ReactNode;
};

type CrmEntityHeaderProps = {
  breadcrumb?: ReactNode;
  title: string;
  icon?: LucideIcon;
  /** No lugar do ícone, ao lado do título (ex.: logo do cliente, 24px). */
  leading?: ReactNode;
  subtitle?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  context?: CrmEntityHeaderContextItem[];
  className?: string;
};

/**
 * Design System V2 (§29.4): header de registro claro — sem card, sem sombra,
 * sem hero navy. Linguagem visual alinhada ao CrmPageHeader.
 */
export function CrmEntityHeader({
  breadcrumb,
  title,
  icon: Icon,
  leading,
  subtitle,
  badges,
  actions,
  context = [],
  className,
}: CrmEntityHeaderProps) {
  return (
    <header className={cn(className)}>
      {breadcrumb ? <div className="mb-3">{breadcrumb}</div> : null}

      {/* Título e ações lado a lado só em tela larga: no tablet o título longo ficava espremido. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {badges ? <div className="mb-2 flex flex-wrap items-center gap-2">{badges}</div> : null}
          <div className="flex min-w-0 items-start gap-2.5">
            {leading ? (
              <span className="mt-0.5 flex shrink-0">{leading}</span>
            ) : Icon ? (
              <Icon
                className="mt-1 h-5 w-5 shrink-0 text-muted-foreground"
                strokeWidth={1.75}
                aria-hidden
              />
            ) : null}
            <h1 className="min-w-0 break-words text-2xl font-bold leading-tight tracking-tight text-foreground">
              {title}
            </h1>
          </div>
          {subtitle ? (
            <div className="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground">{subtitle}</div>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 lg:pt-1">{actions}</div> : null}
      </div>

      {context.length > 0 ? (
        // Linha única de contexto (12/11/2026): rótulo em texto comum, sem caixa alta, e valor em
        // seguida. É o único lugar da ficha com origem e datas do registro.
        <dl className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
          {context.map((item, index) => (
            <div key={`${item.label ?? "ctx"}-${index}`} className="inline-flex min-w-0 items-center gap-1.5">
              {item.label ? <dt className="text-muted-foreground">{item.label}</dt> : null}
              <dd className="min-w-0 truncate font-medium text-foreground tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </header>
  );
}
