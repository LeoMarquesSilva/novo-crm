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
      return "border-[#d8bf82]/40 bg-[#fff7df] text-[#73531c]";
    }
    if (normalized.includes("tipo")) {
      return "border-[#bfd2f6] bg-[#eef5ff] text-[#173a6a]";
    }
    if (normalized.includes("progresso")) {
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    }
    return "border-white/15 bg-white/10 text-white";
  }

  return (
    <header
      className={cn(
        "relative shrink-0 overflow-hidden border-b border-white/20 bg-[#0b1724] px-5 py-5 text-white sm:px-7 sm:py-6",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-crm-gradient-dark opacity-85" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(45,200,183,0.28),transparent_34%),linear-gradient(135deg,rgba(8,22,36,0.15),rgba(4,13,22,0.92))]" />
        <div className="absolute -right-16 -top-24 h-56 w-56 rounded-full border border-white/10 bg-white/8 blur-2xl" />
      </div>
      {onRequestClose ? (
        <button
          type="button"
          onClick={onRequestClose}
          className="absolute right-4 top-4 z-10 rounded-xl border border-white/10 p-2 text-white/70 transition-colors duration-150 hover:border-white/20 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          aria-label="Fechar cadastro"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}

      <div className="relative z-[1] space-y-5 lg:pr-14">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="inline-flex items-center rounded-full border border-accent-green/35 bg-accent-green/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-100">
              {badge}
            </div>
            <h2 className="max-w-2xl text-2xl font-extrabold tracking-[-0.045em] text-white sm:text-[1.85rem]">
              {title}
            </h2>
            <div className="max-w-2xl text-sm font-normal leading-relaxed text-slate-100/90">
              {subtitle}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 lg:max-w-md lg:justify-end">
            {pills.map((pill) => (
              <div
                key={pill.label}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs shadow-sm",
                  pillClass(pill.label),
                )}
              >
                <span className="font-medium opacity-75">{pill.label}:</span>
                <span className="font-bold">{pill.value}</span>
              </div>
            ))}
          </div>
        </div>

        {steps?.length ? (
          <div className="rounded-[18px] border border-white/15 bg-white/10 p-2 shadow-sm backdrop-blur">
            <div className="grid gap-1 md:grid-cols-3 xl:grid-cols-6">
              {steps.map((step, index) => (
                <button
                  key={step.id}
                  type="button"
                  disabled={!step.available}
                  onClick={() => onSelectStep?.(step.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-[14px] px-2.5 py-2 text-left transition-colors",
                    step.active
                      ? "bg-white text-primary-dark shadow-sm"
                      : step.available
                        ? "text-white/80 hover:bg-white/10 hover:text-white"
                        : "cursor-not-allowed text-white/35",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-black",
                      step.active
                        ? "border-primary-dark/15 bg-primary-dark text-white"
                        : step.done
                          ? "border-emerald-200 bg-emerald-100 text-emerald-900"
                          : "border-white/20 bg-white/10 text-current",
                    )}
                  >
                    {step.done ? "✓" : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-bold">{step.label}</span>
                    <span className={cn("block text-[10px]", step.active ? "text-primary-dark/60" : "text-current/65")}>
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
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#dfe5ee] bg-[#f8f9fb] text-[#1b2d42]",
        className,
      )}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}
