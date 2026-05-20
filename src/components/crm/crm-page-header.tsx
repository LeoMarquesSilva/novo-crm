import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  badges?: HeaderBadge[];
  stats?: HeaderStat[];
  actions?: React.ReactNode;
  className?: string;
};

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
  const hasAside = stats.length > 0 || actions;

  return (
    <section
      className={cn(
        "overflow-hidden rounded-[28px] border border-white/55 bg-white/70 shadow-sm shadow-primary-dark/10",
        className,
      )}
    >
      <div className={cn("grid gap-0", hasAside && "lg:grid-cols-[1.15fr_0.85fr]")}>
        <div className="relative overflow-hidden bg-[#0b1724] px-6 py-6 text-white md:px-8">
          <div className="absolute inset-0 bg-crm-gradient-dark opacity-85" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(45,200,183,0.28),transparent_34%),linear-gradient(135deg,rgba(8,22,36,0.15),rgba(4,13,22,0.92))]" />
          <div className="absolute -right-16 -top-24 h-56 w-56 rounded-full border border-white/10 bg-white/8 blur-2xl" />

          <div className="relative flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/15 shadow-lg shadow-black/20 backdrop-blur">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="inline-flex rounded-full border border-accent-green/35 bg-accent-green/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-100">
                  {eyebrow}
                </p>
                <h1 className="mt-2 text-2xl font-bold leading-tight tracking-[-0.03em] text-white md:text-3xl">
                  {title}
                </h1>
              </div>
            </div>

            <p className="max-w-2xl text-sm leading-6 text-slate-100/90">{description}</p>

            {badges.length ? (
              <div className="flex flex-wrap gap-2">
                {badges.map((badge) => {
                  const BadgeIcon = badge.icon;
                  return (
                    <Badge
                      key={badge.label}
                      className="h-7 rounded-full border-white/25 bg-white/15 px-3 text-white shadow-sm backdrop-blur"
                    >
                      {BadgeIcon ? <BadgeIcon className="h-3.5 w-3.5" /> : null}
                      {badge.label}
                    </Badge>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        {hasAside ? (
          <div className="grid grid-cols-1 divide-y divide-primary-dark/10 bg-white/55 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {stats.map((stat) => {
              const StatIcon = stat.icon;
              return (
                <div key={stat.label} className="flex min-h-32 flex-col justify-between p-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {stat.label}
                    </span>
                    {StatIcon ? <StatIcon className="h-4 w-4 text-accent-teal" /> : null}
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-primary-dark">{stat.value}</p>
                    {stat.detail ? <p className="mt-1 text-xs text-muted-foreground">{stat.detail}</p> : null}
                  </div>
                </div>
              );
            })}
            {actions ? <div className="flex min-h-32 items-center justify-end p-5">{actions}</div> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
