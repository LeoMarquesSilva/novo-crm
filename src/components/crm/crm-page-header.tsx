import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  CrmSurfaceHeaderBackdrop,
  CrmSurfaceHeaderEyebrow,
  CrmSurfaceHeaderIcon,
  crmSurfaceHeaderClass,
  crmSurfaceHeaderSubtitleClass,
  crmSurfaceHeaderTitleClass,
} from "@/components/crm/crm-surface-header";
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
        <div className={cn(crmSurfaceHeaderClass, "px-6 py-6 md:px-8")}>
          <CrmSurfaceHeaderBackdrop />

          <div className="relative flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <CrmSurfaceHeaderIcon className="size-11 rounded-2xl">
                <Icon className="h-5 w-5" />
              </CrmSurfaceHeaderIcon>
              <div className="min-w-0">
                <CrmSurfaceHeaderEyebrow className="text-[11px]">{eyebrow}</CrmSurfaceHeaderEyebrow>
                <h1
                  className={cn(
                    "mt-2 text-2xl font-bold leading-tight md:text-3xl",
                    crmSurfaceHeaderTitleClass,
                  )}
                >
                  {title}
                </h1>
              </div>
            </div>

            <p className={cn("max-w-2xl text-sm leading-6", crmSurfaceHeaderSubtitleClass)}>
              {description}
            </p>

            {badges.length ? (
              <div className="flex flex-wrap gap-2">
                {badges.map((badge) => {
                  const BadgeIcon = badge.icon;
                  return (
                    <Badge
                      key={badge.label}
                      className="h-7 rounded-full border-[#e2e8f0] bg-white px-3 text-[#102033] shadow-sm"
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
