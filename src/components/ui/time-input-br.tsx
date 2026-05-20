"use client";

import * as React from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { normalizeTimeToHm } from "@/lib/format-datetime";
import { cn } from "@/lib/utils";

function formatTimeBr(hm: string) {
  const normalized = normalizeTimeToHm(hm);
  if (!normalized) return "";
  const [hour, minute] = normalized.split(":");
  return `${hour}h${minute}`;
}

/**
 * Horário com o mesmo padrão visual do `DateInputBr` (popover + controlo nativos).
 * Valor externo: `HH:mm` (compatível com `<input type="time">`).
 */
export function TimeInputBr({
  value,
  onChange,
  className,
  disabled,
  id,
  name,
  step = 300,
  suggestions,
  required,
  placeholder = "--h--",
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: {
  value: string;
  onChange: (hm: string) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  /** Segundos entre passos (ex.: 300 = 5 min). */
  step?: number;
  /** Atalhos opcionais (ex.: `["09:00", "14:00"]`). */
  suggestions?: string[];
  required?: boolean;
  placeholder?: string;
  "aria-invalid"?: React.ComponentProps<"button">["aria-invalid"];
  "aria-describedby"?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const hm = React.useMemo(() => normalizeTimeToHm(value), [value]);
  const display = hm ? formatTimeBr(hm) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {name ? <input type="hidden" name={name} value={hm} readOnly aria-hidden /> : null}
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-required={required ?? false}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          className={cn(
            "h-8 w-full min-w-0 justify-start border-input bg-white px-2.5 py-1 font-mono text-base tabular-nums font-normal md:text-sm",
            !display && "text-muted-foreground",
            className,
          )}
        >
          <Clock className="mr-2 size-4 shrink-0 opacity-70" aria-hidden />
          {display ?? placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto min-w-[12rem] p-0"
        align="start"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          queueMicrotask(() => inputRef.current?.focus());
        }}
      >
        <div className="flex flex-col gap-2 p-2">
          <input
            ref={inputRef}
            type="time"
            lang="pt-BR"
            step={step}
            value={hm}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {suggestions && suggestions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 border-t border-border pt-2">
              {suggestions.map((t) => {
                const norm = normalizeTimeToHm(t);
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onChange(norm || t);
                      setOpen(false);
                    }}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                      hm === (norm || t)
                        ? "border-primary-medium/50 bg-primary-light/25 text-primary-dark"
                        : "border-border bg-muted/50 text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {formatTimeBr(norm || t) || norm || t}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
