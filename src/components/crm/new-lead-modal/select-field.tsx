"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SelectField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#65758f]">{label}</p>
      {children}
    </div>
  );
}
