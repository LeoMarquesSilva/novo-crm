"use client";

import type { ComponentType, ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NewLeadModalPill {
  label: string;
  value: string;
}

export interface NewLeadModalStep {
  id: string;
  label: string;
  done: boolean;
  active: boolean;
  available: boolean;
}

export function ModalHeader({
  badge = "NOVO LEAD",
  title,
  subtitle,
  pills,
  steps,
  onSelectStep,
  onRequestClose,
  className,
}: {
  badge?: string;
  title: string;
  subtitle: ReactNode;
  pills: NewLeadModalPill[];
  steps?: NewLeadModalStep[];
  onSelectStep?: (id: string) => void;
  onRequestClose?: () => void;
  className?: string;
}) {
  function pillClass(label: string) {
    const normalized = label.toLowerCase();
    if (normalized.includes("entrada")) {
      return "border-warning-border bg-warning-bg text-warning-text";
    }
    if (normalized.includes("tipo")) {
      return "border-info-border bg-info-bg text-info-text";
    }
    if (normalized.includes("progresso")) {
      return "border-success-border bg-success-bg text-success-text";
    }
    return "border-border bg-surface-subtle text-foreground";
  }

  return (
    <header
      className={cn(
        "relative shrink-0 border-b border-border bg-white px-5 py-5 sm:px-7 sm:py-6",
        className,
      )}
    >
      {onRequestClose ? (
        <button
          type="button"
          onClick={onRequestClose}
          className="absolute right-4 top-4 z-10 rounded-(--radius-v2-md) border border-border p-2 text-muted-foreground transition-colors duration-150 hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          aria-label="Fechar cadastro"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}

      <div className="space-y-5 lg:pr-14">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="inline-flex items-center rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {badge}
            </div>
            <h2 className="max-w-2xl text-2xl font-bold tracking-tight text-foreground">
              {title}
            </h2>
            <div className="max-w-2xl text-sm font-normal leading-relaxed text-muted-foreground">
              {subtitle}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 lg:max-w-md lg:justify-end">
            {pills.map((pill) => (
              <div
                key={pill.label}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs",
                  pillClass(pill.label),
                )}
              >
                <span className="font-medium text-muted-foreground">{pill.label}:</span>
                <span className="font-semibold tabular-nums">{pill.value}</span>
              </div>
            ))}
          </div>
        </div>

        {steps?.length ? (
          <div className="rounded-(--radius-v2-lg) border border-border bg-surface-subtle p-1.5">
            <div className="grid gap-1 md:grid-cols-3 xl:grid-cols-6">
              {steps.map((step, index) => (
                <button
                  key={step.id}
                  type="button"
                  disabled={!step.available}
                  onClick={() => onSelectStep?.(step.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-(--radius-v2-md) px-2.5 py-2 text-left transition-colors",
                    step.active
                      ? "bg-white text-foreground shadow-sm"
                      : step.available
                        ? "text-muted-foreground hover:bg-white hover:text-foreground"
                        : "cursor-not-allowed text-text-disabled-v2",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                      step.active
                        ? "border-interactive-300 bg-interactive-600 text-white"
                        : step.done
                          ? "border-success-border bg-success-bg text-success-text"
                          : "border-border bg-white text-muted-foreground",
                    )}
                  >
                    {step.done ? "✓" : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold">{step.label}</span>
                    <span className={cn("block text-[10px]", step.active ? "text-muted-foreground" : "text-current/70")}>
                      {step.done ? "Concluído" : step.active ? "Atual" : "Pendente"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}

export function ModalHeaderIcon({
  icon: Icon,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-(--radius-v2-md) border border-border bg-surface-subtle text-muted-foreground",
        className,
      )}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}
