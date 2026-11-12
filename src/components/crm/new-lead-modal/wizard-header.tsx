"use client";

import { X } from "lucide-react";
import { CrmStepper } from "@/components/crm/crm-stepper";
import { Button } from "@/components/ui/button";

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

      <CrmStepper
        className="mt-3"
        label="Etapas do cadastro"
        compactLabels
        onSelect={onSelectStep ? (id) => onSelectStep(id) : () => undefined}
        steps={steps.map((step) => ({
          id: step.id,
          label: step.label,
          state: step.active ? "active" : step.done ? "done" : "pending",
          available: step.available,
        }))}
      />
    </header>
  );
}
