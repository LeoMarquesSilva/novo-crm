"use client";

import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ModalHeaderIcon } from "./modal-header";

export function SectionCard({
  icon,
  title,
  subtitle,
  children,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[18px] border border-[#dfe5ee] bg-white p-5 shadow-[0_1px_2px_rgba(16,31,46,0.035),0_12px_30px_rgba(16,31,46,0.045)] sm:p-6",
        className,
      )}
    >
      <header className="mb-5 flex items-start gap-3 border-b border-[#eef1f5] pb-4">
        <ModalHeaderIcon icon={icon} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold tracking-[-0.02em] text-[#111827]">{title}</h3>
          {subtitle ? (
            <p className="mt-1.5 text-xs font-normal leading-relaxed text-[#6b7280]">{subtitle}</p>
          ) : null}
        </div>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
