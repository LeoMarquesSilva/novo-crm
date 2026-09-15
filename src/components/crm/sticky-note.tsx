import type React from "react";

import { cn } from "@/lib/utils";

const colors = {
  yellow: "bg-warning-bg",
  pink: "bg-violet-bg",
  teal: "bg-interactive-50",
} as const;

interface StickyNoteProps {
  children: React.ReactNode;
  color?: keyof typeof colors;
  className?: string;
}

export function StickyNote({
  children,
  color = "yellow",
  className,
}: StickyNoteProps) {
  return (
    <div className={cn("relative rounded-(--radius-v2-xl) border border-neutral-200 p-4", colors[color], className)}>
      <div className="absolute -top-2 right-4 h-4 w-4 rotate-45 bg-inherit" />
      <div className="relative z-10 text-sm text-foreground">{children}</div>
    </div>
  );
}
