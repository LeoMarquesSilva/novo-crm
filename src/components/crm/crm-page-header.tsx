import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type HeaderBadge = {
  label: string;
  icon?: LucideIcon;
};

export type HeaderStatTone = "default" | "danger" | "warning";

export type HeaderStat = {
  label: string;
  value: string | number;
  detail?: string;
  icon?: LucideIcon;
  tone?: HeaderStatTone;
  href?: string;
  extra?: ReactNode;
  span?: 1 | 2;
};

type CrmPageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  icon: LucideIcon;
  badges?: HeaderBadge[];
  stats?: HeaderStat[];
  actions?: React.ReactNode;
  className?: string;
};

function statsGridClass(count: number) {
  if (count <= 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-2";
  if (count === 3) return "grid-cols-2 sm:grid-cols-3";
  return "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4";
}

const toneCardClass: Record<HeaderStatTone, string> = {
  default: "border-border bg-surface-subtle",
  warning: "border-warning-border bg-warning-bg",
  danger: "border-danger-border bg-danger-bg",
};

const toneValueClass: Record<HeaderStatTone, string> = {
  default: "text-foreground",
  warning: "text-warning-text",
  danger: "text-danger-text",
};

function CrmPageHeaderStat({
  label,
  value,
  detail,
  tone = "default",
  href,
  extra,
  span = 1,
}: HeaderStat) {
  const card = (
    <div
      className={cn(
        "min-w-0 rounded-(--radius-v2-lg) border px-3.5 py-3",
        toneCardClass[tone],
        span === 2 && "sm:col-span-2",
        href && "transition-colors hover:border-interactive-300",
      )}
    >
      <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 truncate text-xl font-bold tabular-nums tracking-tight sm:text-2xl",
          toneValueClass[tone],
        )}
      >
        {value}
      </p>
      {detail ? <p className="mt-0.5 truncate text-xs leading-snug text-muted-foreground">{detail}</p> : null}
      {extra}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className={cn("block min-w-0", span === 2 && "sm:col-span-2")}>
        {card}
      </Link>
    );
  }
  return card;
}

// Design System V2 (§14.4): PageHeader deixa de ser um card gigante — sem fundo próprio,
// sem raio de 28px, sem sombra, sem ícone encaixotado por padrão, título de 24px.
export function CrmPageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  badges = [],
  stats = [],
  actions,
  className,
}: CrmPageHeaderProps) {
  const hasStats = stats.length > 0;

  return (
    <section className={cn(className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <Icon className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          <div className="min-w-0">
            {eyebrow ? <p className="text-xs font-medium text-muted-foreground">{eyebrow}</p> : null}
            <h1 className="mt-0.5 text-2xl font-bold leading-tight tracking-tight text-foreground">
              {title}
            </h1>
            {description ? (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="shrink-0 sm:pt-1">{actions}</div> : null}
      </div>

      {badges.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {badges.map((badge) => {
            const BadgeIcon = badge.icon;
            return (
              <span
                key={badge.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground"
              >
                {BadgeIcon ? <BadgeIcon className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                {badge.label}
              </span>
            );
          })}
        </div>
      ) : null}

      {hasStats ? (
        <div className={cn("mt-5 grid gap-3", statsGridClass(stats.length))}>
          {stats.map((stat) => (
            <CrmPageHeaderStat key={stat.label} {...stat} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
