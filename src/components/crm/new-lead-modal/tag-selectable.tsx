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
        "flex w-full cursor-pointer items-center gap-3 rounded-[14px] border px-3 py-3 text-left text-sm transition-[border-color,background-color,box-shadow,transform] duration-150 outline-none focus-visible:border-[#101f2e]/45 focus-visible:ring-[3px] focus-visible:ring-[#101f2e]/15",
        checked
          ? "border-[#101f2e] bg-[#f3f5f8] shadow-[0_1px_3px_rgba(16,31,46,0.08)]"
          : "border-[#dfe5ee] bg-white hover:border-[#cbd5e1] hover:shadow-sm active:scale-[0.99]",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors duration-150",
          checked
            ? "border-[#101f2e]/25 bg-white text-[#101f2e]"
            : "border-[#dfe5ee] bg-[#f8f9fb] text-[#6b7280]",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="font-semibold leading-snug tracking-[-0.01em] text-[#111827]">{children}</span>
    </button>
  );
}
