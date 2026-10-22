"use client";

import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Ids estáveis de controle, ajuda e erro para um campo do cadastro. */
export function newLeadFieldIds(key: string) {
  const id = `new-lead-${key}`;
  return { id, hintId: `${id}-hint`, errorId: `${id}-error` };
}

/** Junta ids de ajuda/erro presentes para o `aria-describedby` do controle. */
export function describedBy(...ids: Array<string | false | null | undefined>) {
  const value = ids.filter(Boolean).join(" ");
  return value || undefined;
}

export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-v2-caption text-danger-text">
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/**
 * Label (13px/600) + controle + ajuda + erro, com associação acessível (§17.3).
 * Campos sem marcação são obrigatórios; os opcionais levam "Opcional".
 */
export function FormField({
  label,
  htmlFor,
  optional = false,
  hint,
  hintId,
  hintTone = "muted",
  error,
  errorId,
  labelAction,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  optional?: boolean;
  hint?: ReactNode;
  hintId?: string;
  /** `warning`/`info`: orientação que não bloqueia o avanço (o erro continua sendo `error`). */
  hintTone?: "muted" | "warning" | "info";
  error?: string | null;
  errorId?: string;
  labelAction?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <div className="flex min-h-5 items-center justify-between gap-2">
        {/* Tamanho explícito: o `cn` do Label descartaria `text-v2-body-sm` ao lado de `text-foreground`. */}
        <Label htmlFor={htmlFor} className="gap-1.5 text-[13px] leading-5 font-semibold text-foreground">
          {label}
          {optional ? (
            <span className="text-v2-caption font-normal text-muted-foreground">Opcional</span>
          ) : null}
        </Label>
        {labelAction}
      </div>
      {children}
      {hint && !error ? (
        <p
          id={hintId}
          // Sem `cn`: o twMerge trata `text-v2-caption` como cor e o descartaria ao lado do tom.
          className={`text-v2-caption ${
            hintTone === "warning"
              ? "text-warning-text"
              : hintTone === "info"
                ? "text-info-text"
                : "text-muted-foreground"
          }`}
        >
          {hint}
        </p>
      ) : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}
