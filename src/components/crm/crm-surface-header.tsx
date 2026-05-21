"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Cartão com moldura mais definida (referência visual do kanban). */
export const crmSurfaceCardClass =
  "overflow-visible rounded-[18px] border border-primary-dark/14 bg-white p-0 shadow-[0_1px_2px_rgba(16,31,46,0.07),0_12px_32px_-6px_rgba(16,31,46,0.12)] ring-1 ring-primary-dark/[0.05]";

/** Header de cartão CRM: superfície clara, bordas e sombra discretas. */
export const crmSurfaceHeaderClass =
  "relative overflow-hidden border-b border-primary-dark/12 bg-[linear-gradient(180deg,#ffffff_0%,#f1f3f7_100%)] text-[#102033] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.95),inset_0_-1px_0_0_rgba(16,31,46,0.08)]";

export function CrmSurfaceHeaderBackdrop({ className }: { className?: string }) {
  return (
    <>
      <div
        className={cn("pointer-events-none absolute inset-x-0 top-0 h-px bg-primary-dark/14", className)}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-3 left-0 top-3 w-[3px] rounded-r-full bg-gradient-to-b from-primary-dark/30 via-accent-teal/50 to-primary-dark/22"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_65%_at_100%_-10%,rgba(23,32,51,0.05),transparent_50%),radial-gradient(ellipse_55%_50%_at_0%_100%,rgba(15,159,143,0.06),transparent_48%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-primary-dark/[0.05] to-transparent"
        aria-hidden
      />
    </>
  );
}

export function CrmSurfaceHeaderIcon({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-[14px] border border-primary-dark/12 bg-white text-[#102033] shadow-[0_2px_6px_rgba(16,31,46,0.08)] ring-1 ring-primary-dark/[0.04]",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Opcional em páginas com eyebrow; evitar no kanban. */
export function CrmSurfaceHeaderEyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "inline-flex rounded-full border border-[#cceee8] bg-[#eefaf8] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#0d6b5f]",
        className,
      )}
    >
      {children}
    </p>
  );
}

export const crmSurfaceHeaderTitleClass =
  "font-extrabold tracking-[-0.04em] text-[#102033]";

export const crmSurfaceHeaderSubtitleClass = "text-[#5c6b7e]";

/** Segmented control (tabs Vendas / Pós-venda). */
export const crmSurfaceSegmentedRootClass =
  "inline-flex rounded-[14px] border border-primary-dark/12 bg-[#e8ecf2]/60 p-1 shadow-[inset_0_1px_2px_rgba(16,31,46,0.06),0_1px_3px_rgba(16,31,46,0.05)]";

export function crmSurfaceSegmentedTabClass(active: boolean) {
  return cn(
    "rounded-[11px] px-3 py-1.5 text-[13px] font-bold transition-colors duration-150",
    active
      ? "bg-white text-[#102033] shadow-[0_2px_6px_rgba(16,31,46,0.1)] ring-1 ring-primary-dark/10"
      : "text-[#5c6b7e] hover:bg-white/80 hover:text-[#102033]",
  );
}

/** Bloco auxiliar (toggle RD, chips) no header. */
export const crmSurfaceHeaderPanelClass =
  "rounded-[14px] border border-primary-dark/12 bg-white px-3 py-2 shadow-[0_2px_8px_rgba(16,31,46,0.07)] ring-1 ring-primary-dark/[0.04]";
