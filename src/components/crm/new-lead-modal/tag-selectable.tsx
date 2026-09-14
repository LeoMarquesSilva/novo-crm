"use client";

import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function TagSelectable({
  checked,
  onToggle,
  icon: Icon,
  children,
  className,
}: {
  checked: boolean;
  onToggle: () => void;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onToggle()}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onToggle();
        }
      }}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-(--radius-v2-xl) border px-3 py-3 text-left text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20",
        checked
          ? "border-interactive-300 bg-interactive-50"
          : "border-border bg-white hover:border-border-strong hover:bg-surface-hover",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-(--radius-v2-md) border transition-colors",
          checked
            ? "border-interactive-300 bg-white text-interactive-700"
            : "border-border bg-surface-subtle text-muted-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="font-medium leading-snug text-foreground">{children}</span>
    </button>
  );
}
