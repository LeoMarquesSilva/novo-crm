import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type HeaderBadge = {
  label: string;
  icon?: LucideIcon;
};

type HeaderStat = {
  label: string;
  value: string | number;
  detail?: string;
  icon?: LucideIcon;
};

type CrmPageHeaderProps = {
  eyebrow?: string;
  title: string;
  description: string;
  icon: LucideIcon;
  badges?: HeaderBadge[];
  stats?: HeaderStat[];
  actions?: React.ReactNode;
  className?: string;
};

function CrmPageHeaderStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight text-zinc-900">{value}</p>
      {detail ? <p className="mt-1 text-xs leading-snug text-zinc-500">{detail}</p> : null}
    </div>
  );
}

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
    <section
      className={cn(
        "overflow-hidden rounded-[28px] border border-white/55 bg-white/70 shadow-sm shadow-primary-dark/10",
        className,
      )}
    >
      <div
        className={cn("grid gap-0", hasStats && "lg:grid-cols-[1.15fr_0.85fr]")}
      >
        <div className="px-6 py-6 md:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-zinc-200/90 bg-white text-zinc-700 shadow-sm">
                <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </div>
              <div className="min-w-0">
                {eyebrow ? (
                  <p className="text-xs font-medium text-zinc-500">{eyebrow}</p>
                ) : null}
                <h1 className="mt-0.5 text-2xl font-bold leading-tight tracking-tight text-zinc-900 md:text-[1.65rem]">
                  {title}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">{description}</p>
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
                    className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700"
                  >
                    {BadgeIcon ? <BadgeIcon className="h-3.5 w-3.5 text-zinc-500" /> : null}
                    {badge.label}
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>

        {hasStats ? (
          <div className="grid gap-3 border-t border-zinc-200/70 bg-zinc-50/50 p-5 sm:grid-cols-2 lg:border-l lg:border-t-0">
            {stats.map((stat) => (
              <CrmPageHeaderStat
                key={stat.label}
                label={stat.label}
                value={stat.value}
                detail={stat.detail}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
