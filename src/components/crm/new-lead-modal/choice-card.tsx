"use client";

import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

/**
 * Opção de rádio em formato de cartão. Usa `<input type="radio">` nativo (oculto
 * visualmente), então setas, Tab e leitores de tela funcionam como num radiogroup comum.
 * Selecionado = borda azul + marcador preenchido (o estado não depende só da cor).
 */
export function ChoiceCard({
  name,
  value,
  checked,
  onChange,
  icon: Icon,
  title,
  description,
  className,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "relative flex cursor-pointer items-start gap-3 rounded-(--radius-v2-xl) border p-3 transition-colors duration-150 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/20",
        checked
          ? "border-primary bg-interactive-50"
          : "border-border bg-white hover:border-border-strong hover:bg-surface-hover",
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="sr-only"
      />
      <span
        aria-hidden
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-(--radius-v2-md) border transition-colors duration-150",
          checked
            ? "border-interactive-300 bg-white text-interactive-700"
            : "border-border bg-surface-subtle text-muted-foreground",
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block pr-5 text-v2-body-md font-semibold text-foreground">{title}</span>
        {description ? (
          <span className="mt-0.5 block text-v2-caption text-muted-foreground">{description}</span>
        ) : null}
      </span>
      <span
        aria-hidden
        className={cn(
          "absolute top-3 right-3 flex size-4 items-center justify-center rounded-full border transition-colors duration-150",
          checked ? "border-primary bg-primary" : "border-border-strong bg-white",
        )}
      >
        {checked ? <span className="size-1.5 rounded-full bg-white" /> : null}
      </span>
    </label>
  );
}
