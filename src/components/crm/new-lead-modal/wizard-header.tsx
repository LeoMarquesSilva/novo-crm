"use client";

import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface WizardStepItem {
  id: string;
  label: string;
  done: boolean;
  active: boolean;
  available: boolean;
}

/**
 * Cabeçalho compacto dos cadastros em etapas: título, fechar e stepper em ~100px.
 * No mobile o stepper mostra só os números e o rótulo da etapa atual.
 */
export function WizardHeader({
  title,
  titleId,
  steps,
  onSelectStep,
  onRequestClose,
  closeLabel = "Fechar",
}: {
  title: string;
  titleId?: string;
  steps: WizardStepItem[];
  onSelectStep?: (id: string) => void;
  onRequestClose?: () => void;
  closeLabel?: string;
}) {
  const activeIndex = Math.max(
    steps.findIndex((step) => step.active),
    0,
  );

  return (
    <header className="shrink-0 border-b border-border bg-white px-4 pt-3.5 pb-3 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 id={titleId} className="truncate text-v2-heading-lg text-foreground">
            {title}
          </h2>
          <p className="shrink-0 text-v2-body-sm text-muted-foreground tabular-nums">
            Etapa {activeIndex + 1} de {steps.length}
          </p>
        </div>
        {onRequestClose ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRequestClose}
            aria-label={closeLabel}
            className="-mr-1 text-muted-foreground hover:text-foreground"
          >
            <X aria-hidden />
          </Button>
        ) : null}
      </div>

      <nav aria-label="Etapas do cadastro" className="mt-3">
        <ol className="flex items-center gap-0.5 sm:gap-2">
          {steps.map((step, index) => {
            const isLast = index === steps.length - 1;
            return (
              <li
                key={step.id}
                // flex-auto: o item ativo (com rótulo no mobile) ganha a largura do conteúdo.
                className={cn("flex items-center gap-0.5 sm:gap-2", !isLast && "flex-auto")}
              >
                <button
                  type="button"
                  disabled={!step.available}
                  aria-current={step.active ? "step" : undefined}
                  onClick={() => onSelectStep?.(step.id)}
                  className={cn(
                    "group flex shrink-0 items-center gap-2 rounded-(--radius-v2-md) p-0.5 text-left outline-none transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/20 sm:py-1 sm:pr-1.5 sm:pl-1",
                    step.available && !step.active && "hover:bg-surface-hover",
                    !step.available && "cursor-not-allowed",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      // Tamanhos explícitos (caption-medium / body-sm): o `cn` descartaria `text-v2-*` ao lado das cores.
                      "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums transition-colors duration-150",
                      step.active
                        ? "border-primary bg-primary text-white"
                        : step.done
                          ? "border-interactive-300 bg-interactive-50 text-interactive-700"
                          : step.available
                            ? "border-border-strong bg-white text-muted-foreground"
                            : "border-border bg-surface-subtle text-text-disabled-v2",
                    )}
                  >
                    {step.done && !step.active ? <Check className="size-3.5" strokeWidth={2.5} /> : index + 1}
                  </span>
                  <span
                    className={cn(
                      "whitespace-nowrap text-[13px] leading-5",
                      step.active
                        ? "font-semibold text-foreground"
                        : step.available
                          ? "hidden font-medium text-muted-foreground group-hover:text-foreground md:inline"
                          : "hidden font-medium text-text-disabled-v2 md:inline",
                    )}
                  >
                    {step.label}
                  </span>
                  <span className="sr-only">
                    {step.active ? ", etapa atual" : step.done ? ", concluída" : ", pendente"}
                  </span>
                </button>
                {!isLast ? (
                  <span
                    aria-hidden
                    className={cn(
                      "h-px min-w-2 flex-1",
                      step.done ? "bg-interactive-300" : "bg-border",
                    )}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>
    </header>
  );
}
