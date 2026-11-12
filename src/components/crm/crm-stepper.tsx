"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Indicador de etapas de um processo (12/11/2026): número em círculo, rótulo e um fio até a
 * próxima etapa. Nasceu no cabeçalho do Novo lead (`WizardHeader`) e passou a servir também ao
 * andamento do contrato (Elaboração → Revisão → Envio → Assinatura), para o CRM ter uma linguagem
 * só de etapas. Com `onSelect`, cada etapa disponível é um botão; sem, é só leitura.
 */

export type CrmStepperState = "done" | "active" | "pending";

export type CrmStepperStep = {
  id: string;
  label: string;
  /** Linha de apoio abaixo do rótulo (ex.: "Versão v2", "Aguardando"). */
  detail?: string;
  state: CrmStepperState;
  /** Só com `onSelect`: etapa que ainda não pode ser aberta fica desativada. */
  available?: boolean;
};

const STATE_SR: Record<CrmStepperState, string> = {
  done: "concluída",
  active: "etapa atual",
  pending: "pendente",
};

export function CrmStepper({
  steps,
  label,
  onSelect,
  compactLabels = false,
  className,
}: {
  steps: CrmStepperStep[];
  label: string;
  onSelect?: (id: string) => void;
  /** No mobile, mostra o rótulo só da etapa atual (os outros ficam no número). */
  compactLabels?: boolean;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={className}>
      <ol className="flex items-center gap-0.5 sm:gap-2">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          const available = step.available ?? true;
          const interactive = typeof onSelect === "function";
          const content = (
            <>
              <span
                aria-hidden
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums transition-colors duration-150",
                  step.state === "active"
                    ? "border-primary bg-primary text-white"
                    : step.state === "done"
                      ? "border-interactive-300 bg-interactive-50 text-interactive-700"
                      : available
                        ? "border-border-strong bg-white text-muted-foreground"
                        : "border-border bg-surface-subtle text-text-disabled-v2",
                )}
              >
                {step.state === "done" ? <Check className="size-3.5" strokeWidth={2.5} /> : index + 1}
              </span>
              <span
                className={cn(
                  "min-w-0",
                  compactLabels && step.state !== "active" && "hidden md:block",
                )}
              >
                <span
                  className={cn(
                    "block whitespace-nowrap text-[13px] leading-5",
                    step.state === "active"
                      ? "font-semibold text-foreground"
                      : available
                        ? "font-medium text-text-secondary-v2"
                        : "font-medium text-text-disabled-v2",
                    interactive && available && step.state !== "active" && "group-hover:text-foreground",
                  )}
                >
                  {step.label}
                </span>
                {step.detail ? (
                  <span className="block whitespace-nowrap text-xs leading-4 text-muted-foreground">{step.detail}</span>
                ) : null}
              </span>
              <span className="sr-only">, {STATE_SR[step.state]}</span>
            </>
          );

          return (
            <li
              key={step.id}
              // flex-auto: o fio entre as etapas ocupa a sobra da linha.
              className={cn("flex min-w-0 items-center gap-0.5 sm:gap-2", !isLast && "flex-auto")}
            >
              {interactive ? (
                <button
                  type="button"
                  disabled={!available}
                  aria-current={step.state === "active" ? "step" : undefined}
                  onClick={() => onSelect(step.id)}
                  className={cn(
                    "group flex shrink-0 items-center gap-2 rounded-(--radius-v2-md) p-0.5 text-left transition-colors duration-150 sm:py-1 sm:pr-1.5 sm:pl-1",
                    available && step.state !== "active" && "hover:bg-surface-hover",
                    !available && "cursor-not-allowed",
                  )}
                >
                  {content}
                </button>
              ) : (
                <div
                  aria-current={step.state === "active" ? "step" : undefined}
                  className="flex shrink-0 items-center gap-2 p-0.5 sm:py-1 sm:pr-1.5 sm:pl-1"
                >
                  {content}
                </div>
              )}
              {!isLast ? (
                <span
                  aria-hidden
                  className={cn("h-px min-w-2 flex-1", step.state === "done" ? "bg-interactive-300" : "bg-border")}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
