"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StickyFooter({
  left,
  actions,
  className,
}: {
  left: ReactNode;
  actions: ReactNode;
  className?: string;
}) {
  return (
    <footer
      className={cn(
        "shrink-0 border-t border-[#dfe5ee] bg-white px-5 py-4 shadow-[0_-10px_30px_rgba(16,31,46,0.04)] sm:px-7",
        className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">{left}</div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
          {actions}
        </div>
      </div>
    </footer>
  );
}
