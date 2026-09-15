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
  subtitle,
  badges,
  actions,
  context = [],
  className,
}: CrmEntityHeaderProps) {
  return (
    <header className={cn(className)}>
      {breadcrumb ? <div className="mb-3">{breadcrumb}</div> : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {badges ? <div className="mb-2 flex flex-wrap items-center gap-2">{badges}</div> : null}
          <div className="flex min-w-0 items-start gap-2.5">
            {Icon ? (
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
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-1">{actions}</div> : null}
      </div>

      {context.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          {context.map((item, index) => (
            <span key={`${item.label ?? "ctx"}-${index}`} className="inline-flex min-w-0 items-center gap-1.5">
              {item.label ? (
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {item.label}
                </span>
              ) : null}
              <span className="min-w-0 truncate font-medium text-foreground tabular-nums">{item.value}</span>
            </span>
          ))}
        </div>
      ) : null}
    </header>
  );
}
