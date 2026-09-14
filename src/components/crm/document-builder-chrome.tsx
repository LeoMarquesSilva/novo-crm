"use client";

import type { ReactNode } from "react";
import { Check, Loader2, X, type LucideIcon } from "lucide-react";
import { crmSurfaceCardClass, crmSurfaceSegmentedRootClass, crmSurfaceSegmentedTabClass } from "@/components/crm/crm-surface-header";
import { cn } from "@/lib/utils";

/** Surface do hub na tab — §15.1, sem card decorativo nem sombra. */
export const documentBuilderHubClass = cn(crmSurfaceCardClass, "overflow-hidden");

/** Dialog fullscreen do builder — raio 16px, sombra de overlay, sem glass. */
export const documentBuilderDialogClass = cn(
  "flex h-[95vh] w-[98vw] max-w-[98vw] flex-col gap-0 overflow-hidden p-0",
  "fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]",
  "z-(--z-nested-dialog) rounded-(--radius-v2-2xl) border border-border bg-white shadow-(--shadow-v2-lg)",
);

export function DocumentSaveStatus({
  saving,
  dirty,
  className,
}: {
  saving: boolean;
  dirty: boolean;
  className?: string;
}) {
  if (saving) {
    return (
      <span
        role="status"
        className={cn(
          "inline-flex items-center gap-1.5 text-v2-caption-medium text-text-secondary-v2",
          className,
        )}
      >
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Salvando…
      </span>
    );
  }

  if (dirty) {
    return (
      <span
        role="status"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-(--radius-v2-full) border border-warning-border bg-warning-bg px-2 py-0.5 text-v2-caption-medium text-warning-text",
          className,
        )}
      >
        Alterações não salvas
      </span>
    );
  }

  return (
    <span
      role="status"
      className={cn("inline-flex items-center gap-1.5 text-v2-caption-medium text-success-text", className)}
    >
      <Check className="size-3.5" aria-hidden />
      Salvo
    </span>
  );
}

export function DocumentBuilderHubHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-border bg-white px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
      <div className="min-w-0">
        <p className="text-v2-caption-medium uppercase tracking-wide text-text-muted-v2">{eyebrow}</p>
        <h2 className="mt-1 text-v2-heading-lg text-foreground">{title}</h2>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export type DocumentBuilderPane = "edit" | "preview";

export function DocumentMobilePaneToggle({
  value,
  onChange,
  className,
}: {
  value: DocumentBuilderPane;
  onChange: (next: DocumentBuilderPane) => void;
  className?: string;
}) {
  return (
    // Achado da Codex (revisão Fase 5): isto é um segmented control, não uma tablist de
    // verdade (sem aria-controls/tabpanel/navegação por setas) — role="group" + aria-pressed
    // descreve o comportamento real sem prometer o contrato completo de tabs.
    <div className={cn(crmSurfaceSegmentedRootClass, "md:hidden", className)} role="group" aria-label="Painel">
      <button
        type="button"
        aria-pressed={value === "edit"}
        className={crmSurfaceSegmentedTabClass(value === "edit")}
        onClick={() => onChange("edit")}
      >
        Editar
      </button>
      <button
        type="button"
        aria-pressed={value === "preview"}
        className={crmSurfaceSegmentedTabClass(value === "preview")}
        onClick={() => onChange("preview")}
      >
        Visualizar
      </button>
    </div>
  );
}

export function DocumentBuilderDialogHeader({
  icon,
  title,
  description,
  saving,
  dirty,
  actions,
  onClose,
  closeDisabled,
  mobilePane,
  onMobilePaneChange,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  saving: boolean;
  dirty: boolean;
  actions: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
  mobilePane: DocumentBuilderPane;
  onMobilePaneChange: (next: DocumentBuilderPane) => void;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-3 border-b border-border bg-white px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-(--radius-v2-md) border border-border bg-interactive-50 text-interactive-700">
              {icon}
            </span>
            <h2 className="text-v2-heading-md text-foreground">{title}</h2>
            <p className="sr-only">{description}</p>
            <DocumentSaveStatus saving={saving} dirty={dirty} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <button
            type="button"
            onClick={onClose}
            className="ml-0.5 flex size-8 shrink-0 items-center justify-center rounded-(--radius-v2-md) border border-border text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            disabled={closeDisabled}
            aria-label="Fechar"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      <DocumentMobilePaneToggle value={mobilePane} onChange={onMobilePaneChange} />
    </div>
  );
}

export function DocumentStatusCard({
  title,
  icon: Icon,
  tone,
  children,
}: {
  title: string;
  icon: LucideIcon;
  tone: "ok" | "warn" | "neutral";
  children: ReactNode;
}) {
  return (
    <div className="rounded-(--radius-v2-xl) border border-border bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-(--radius-v2-md)",
            tone === "ok" && "bg-success-bg text-success-text",
            tone === "warn" && "bg-warning-bg text-warning-text",
            tone === "neutral" && "bg-surface-subtle text-text-secondary-v2",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <h3 className="text-v2-heading-md text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

/** Origem discreta de conteúdo herdado da proposta (§29.9). */
export function DocumentInheritedBadge({ children = "Da proposta" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-(--radius-v2-full) border border-info-border bg-info-bg px-2 py-0.5 text-v2-caption-medium text-info-text">
      {children}
    </span>
  );
}

export const documentFieldGroupClass =
  "space-y-4 border-t border-border pt-5 first:border-t-0 first:pt-0";

export const documentEmptyStateClass =
  "flex flex-col items-center rounded-(--radius-v2-xl) border border-dashed border-border bg-surface-subtle px-5 py-9 text-center";
