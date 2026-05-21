"use client";

import type { ReactNode } from "react";
import { AlertCircle, Check, ChevronDown, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export type KanbanPanelTone = "violet" | "indigo" | "sky" | "amber" | "emerald" | "slate";

const TONE: Record<
  KanbanPanelTone,
  {
    shell: string;
    icon: string;
    badge: string;
    progress: string;
    summaryHover: string;
  }
> = {
  violet: {
    shell: "border-violet-300/50 bg-gradient-to-b from-violet-50/90 to-white/80",
    icon: "border-violet-200/80 bg-violet-500/10 text-violet-800",
    badge: "bg-violet-500/15 text-violet-950",
    progress: "bg-violet-500",
    summaryHover: "hover:bg-violet-500/[0.04]",
  },
  indigo: {
    shell: "border-indigo-300/50 bg-gradient-to-b from-indigo-50/90 to-white/80",
    icon: "border-indigo-200/80 bg-indigo-500/10 text-indigo-800",
    badge: "bg-indigo-500/15 text-indigo-950",
    progress: "bg-indigo-500",
    summaryHover: "hover:bg-indigo-500/[0.04]",
  },
  sky: {
    shell: "border-sky-300/50 bg-gradient-to-b from-sky-50/90 to-white/80",
    icon: "border-sky-200/80 bg-sky-500/10 text-sky-800",
    badge: "bg-sky-500/15 text-sky-950",
    progress: "bg-sky-500",
    summaryHover: "hover:bg-sky-500/[0.04]",
  },
  amber: {
    shell: "border-amber-300/50 bg-gradient-to-b from-amber-50/90 to-white/80",
    icon: "border-amber-200/80 bg-amber-500/10 text-amber-900",
    badge: "bg-amber-500/15 text-amber-950",
    progress: "bg-amber-500",
    summaryHover: "hover:bg-amber-500/[0.04]",
  },
  emerald: {
    shell: "border-emerald-300/55 bg-gradient-to-b from-emerald-50/95 to-white/85",
    icon: "border-emerald-200/80 bg-emerald-500/10 text-emerald-700",
    badge: "bg-emerald-500/15 text-emerald-900",
    progress: "bg-emerald-500",
    summaryHover: "hover:bg-emerald-500/[0.04]",
  },
  slate: {
    shell: "border-primary-dark/10 bg-gradient-to-b from-[#f8f9fb] to-white/80",
    icon: "border-primary-dark/10 bg-primary-dark/[0.04] text-primary-dark/75",
    badge: "bg-primary-dark/[0.06] text-primary-dark",
    progress: "bg-primary-dark/40",
    summaryHover: "hover:bg-primary-dark/[0.03]",
  },
};

type KanbanPanelShellProps = {
  tone: KanbanPanelTone;
  icon: ReactNode;
  title: string;
  subtitle?: string | null;
  badge?: ReactNode;
  progressPct?: number | null;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export function KanbanPanelShell({
  tone,
  icon,
  title,
  subtitle,
  badge,
  progressPct,
  footer,
  children,
  className,
}: KanbanPanelShellProps) {
  const styles = TONE[tone];
  const showProgress = progressPct != null;

  return (
    <div
      className={cn(
        "mt-2 overflow-hidden rounded-xl border text-[10px] shadow-sm shadow-primary-dark/[0.03]",
        styles.shell,
        className,
      )}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className={cn("px-2.5 py-2", children || footer ? "border-b border-primary-dark/[0.06]" : null)}>
        <div className="flex items-start gap-2">
          <span
            className={cn(
              "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border",
              styles.icon,
            )}
            aria-hidden
          >
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-bold tracking-tight text-primary-dark">{title}</p>
                {subtitle ? (
                  <p className="mt-0.5 text-[9px] font-medium text-primary-dark/55">{subtitle}</p>
                ) : null}
              </div>
              {badge ? (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold tabular-nums",
                    styles.badge,
                  )}
                >
                  {badge}
                </span>
              ) : null}
            </div>
            {showProgress ? (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary-dark/[0.06]">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", styles.progress)}
                  style={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {children}
      {footer ? (
        <div className="border-t border-primary-dark/[0.06] px-2.5 py-1.5">{footer}</div>
      ) : null}
    </div>
  );
}

type KanbanPanelDetailsProps = {
  tone: KanbanPanelTone;
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
};

export function KanbanPanelDetails({
  tone,
  label,
  children,
  defaultOpen = false,
}: KanbanPanelDetailsProps) {
  const styles = TONE[tone];

  return (
    <details
      className="kanban-panel-details group/details"
      open={defaultOpen}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-1.5 text-[10px] font-semibold text-primary-dark/70 outline-none transition-colors [&::-webkit-details-marker]:hidden",
          styles.summaryHover,
        )}
      >
        <span>{label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open/details:rotate-180" />
      </summary>
      {children}
    </details>
  );
}

type KanbanPanelInfoRowProps = {
  icon: ReactNode;
  label: string;
  value: string;
  muted?: boolean;
};

export function KanbanPanelInfoRow({ icon, label, value, muted }: KanbanPanelInfoRowProps) {
  return (
    <div className="flex items-start gap-2 rounded-[10px] border border-primary-dark/[0.06] bg-white/50 px-2 py-1.5">
      <span className="mt-0.5 shrink-0 text-primary-dark/45" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-primary-dark/45">{label}</p>
        <p
          className={cn(
            "truncate text-[11px] font-semibold leading-tight",
            muted ? "text-primary-dark/45" : "text-primary-dark",
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

type KanbanAreaRowProps = {
  areaKey: string;
  done: boolean;
  doneLabel: string;
  pendingLabel: string;
  extra?: string | null;
  tone?: "default" | "warning" | "danger";
};

export function KanbanAreaRow({
  areaKey,
  done,
  doneLabel,
  pendingLabel,
  extra,
  tone = "default",
}: KanbanAreaRowProps) {
  return (
    <li
      className={cn(
        "flex items-start gap-2 rounded-[10px] border px-2 py-1.5 text-[10px] font-medium leading-snug",
        done
          ? "border-emerald-200/80 bg-emerald-50/55 text-primary-dark/85"
          : tone === "danger"
            ? "border-rose-200/70 bg-rose-50/40 text-primary-dark/85"
            : tone === "warning"
              ? "border-amber-200/70 bg-amber-50/40 text-primary-dark/85"
              : "border-primary-dark/[0.08] bg-white/55 text-primary-dark/85",
      )}
    >
      <span className="mt-0.5 shrink-0" aria-hidden>
        {done ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
        ) : tone === "danger" ? (
          <AlertCircle className="h-3.5 w-3.5 text-rose-600" strokeWidth={2.5} />
        ) : (
          <Clock className="h-3.5 w-3.5 text-amber-600" strokeWidth={2.5} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-bold text-primary-dark">{areaKey}</span>
        <span
          className={
            done ? " text-emerald-900/85" : tone === "danger" ? " text-rose-900/85" : " text-amber-950/80"
          }
        >
          {" "}
          — {done ? doneLabel : pendingLabel}
        </span>
        {extra ? (
          <span className="block pt-0.5 font-normal text-primary-dark/65">{extra}</span>
        ) : null}
      </span>
    </li>
  );
}
