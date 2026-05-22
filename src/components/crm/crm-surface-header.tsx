"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Cartão neutro (referência: Vercel / Supabase / Notion). */
export const crmSurfaceCardClass =
  "overflow-visible rounded-xl border border-zinc-200/90 bg-white shadow-sm";

/** Header plano, sem gradientes nem acentos nas bordas. */
export const crmSurfaceHeaderClass =
  "border-b border-zinc-200 bg-white text-zinc-900";

/** @deprecated Decorativo removido — manter import sem efeito visual. */
export function CrmSurfaceHeaderBackdrop() {
  return null;
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
        "flex size-8 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-600",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function CrmSurfaceHeaderEyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("text-xs font-medium text-zinc-500", className)}>
      {children}
    </p>
  );
}

export const crmSurfaceHeaderTitleClass = "text-[15px] font-semibold tracking-tight text-zinc-900";

export const crmSurfaceHeaderSubtitleClass = "text-[13px] text-zinc-500";

export const crmSurfaceSegmentedRootClass =
  "inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5";

export function crmSurfaceSegmentedTabClass(active: boolean) {
  return cn(
    "rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
    active
      ? "bg-white text-zinc-900 shadow-sm"
      : "text-zinc-600 hover:text-zinc-900",
  );
}

/** Linha auxiliar (ex.: toggle RD) — sem caixa extra. */
export const crmSurfaceHeaderPanelClass = "flex items-center gap-2.5";

export const crmSurfaceMetaClass = "text-[13px] tabular-nums text-zinc-500";
