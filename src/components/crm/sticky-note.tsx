import type React from "react";

import { cn } from "@/lib/utils";

const colors = {
  yellow: "bg-accent-yellow",
  pink: "bg-accent-pink",
  teal: "bg-accent-teal/20",
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
    <div className={cn("relative rounded-xl p-4 shadow-sm", colors[color], className)}>
      <div className="absolute -top-2 right-4 h-4 w-4 rotate-45 bg-inherit" />
      <div className="relative z-10 text-sm text-primary-dark">{children}</div>
    </div>
  );
}
