"use client";

import type { ComponentType, MouseEvent, PointerEvent, ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

function stopDialogRowCapture(event: MouseEvent | PointerEvent) {
  event.stopPropagation();
}

export function TagSelectable({
  checked,
  onToggle,
  icon: Icon,
  children,
  hint,
  className,
}: {
  checked: boolean;
  onToggle: () => void;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
  /** Texto auxiliar dentro do botão (não bloqueia o clique). */
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onPointerDown={stopDialogRowCapture}
      onClick={(event) => {
        stopDialogRowCapture(event);
        onToggle();
      }}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }
      }}
      className={cn(
        "relative z-[1] flex w-full cursor-pointer items-center gap-3 rounded-(--radius-v2-xl) border px-3 py-3 text-left text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20",
        checked
          ? "border-primary bg-interactive-50"
          : "border-border bg-white hover:border-border-strong hover:bg-surface-hover",
        className,
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-(--radius-v2-md) border transition-colors",
          checked
            ? "border-interactive-300 bg-white text-interactive-700"
            : "border-border bg-surface-subtle text-muted-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium leading-snug text-foreground">{children}</span>
        {hint ? (
          <span className="pointer-events-none mt-0.5 block text-v2-caption font-normal text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </span>
      {/* Marcador de checkbox (§19.1): o estado marcado não depende só da cor do cartão. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
          checked ? "border-primary bg-primary text-white" : "border-border-strong bg-white",
        )}
      >
        {checked ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
    </button>
  );
}
