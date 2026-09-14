"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Design System V2 (§15.1): Surface — fundo branco, borda --border, raio 12px, sem sombra. */
export const crmSurfaceCardClass =
  "overflow-visible rounded-(--radius-v2-xl) border border-border bg-white";

/** Header plano, sem gradientes nem acentos nas bordas. */
export const crmSurfaceHeaderClass =
  "border-b border-border bg-white text-foreground";

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
        "flex size-8 shrink-0 items-center justify-center rounded-(--radius-v2-md) border border-border bg-neutral-50 text-muted-foreground",
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
    <p className={cn("text-xs font-medium text-muted-foreground", className)}>
      {children}
    </p>
  );
}

export const crmSurfaceHeaderTitleClass = "text-[15px] font-semibold tracking-tight text-foreground";

export const crmSurfaceHeaderSubtitleClass = "text-[13px] text-muted-foreground";

// Design System V2 (§20.1, tabs `segmented`): raio externo 10px, interno 8px.
export const crmSurfaceSegmentedRootClass =
  "inline-flex rounded-(--radius-v2-lg) border border-border bg-muted p-0.5";

export function crmSurfaceSegmentedTabClass(active: boolean) {
  return cn(
    "rounded-(--radius-v2-md) px-3 py-1.5 text-[13px] font-medium transition-colors",
    active
      ? "bg-white text-foreground shadow-sm"
      : "text-muted-foreground hover:text-foreground",
  );
}

/** Linha auxiliar (ex.: toggle RD) — sem caixa extra. */
export const crmSurfaceHeaderPanelClass = "flex items-center gap-2.5";

export const crmSurfaceMetaClass = "text-[13px] tabular-nums text-muted-foreground";
