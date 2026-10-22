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
  variant = "card",
  headingId,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  /** `plain`: seção sem moldura, separada por título e descrição (§17.4) — usada no corpo branco do cadastro em etapas. */
  variant?: "card" | "plain";
  /** Id do título; com `tabIndex=-1` permite mover o foco para a seção ao trocar de etapa. */
  headingId?: string;
}) {
  if (variant === "plain") {
    return (
      <section aria-labelledby={headingId} className={className}>
        <header className="mb-4 flex items-start gap-3">
          <ModalHeaderIcon icon={icon} />
          <div className="min-w-0 flex-1">
            <h3
              id={headingId}
              tabIndex={headingId ? -1 : undefined}
              className="text-v2-heading-md text-foreground outline-none"
            >
              {title}
            </h3>
            {subtitle ? (
              <p className="text-v2-body-sm text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
        </header>
        <div className="space-y-4">{children}</div>
      </section>
    );
  }

  return (
    <section
      className={cn(
        "rounded-(--radius-v2-xl) border border-border bg-white p-5 sm:p-6",
        className,
      )}
    >
      <header className="mb-5 flex items-start gap-3 border-b border-border pb-4">
        <ModalHeaderIcon icon={icon} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h3>
          {subtitle ? (
            <p className="mt-1.5 text-xs font-normal leading-relaxed text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
