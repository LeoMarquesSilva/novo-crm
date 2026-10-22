"use client";

import * as React from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { maskHmDigitsInput, normalizeTimeToHm, parseHmDigits } from "@/lib/format-datetime";
import { cn } from "@/lib/utils";

function formatTimeBr(hm: string) {
  const normalized = normalizeTimeToHm(hm);
  if (!normalized) return "";
  const [hour, minute] = normalized.split(":");
  return `${hour}h${minute}`;
}

/**
 * Horário com o mesmo padrão do `DateInputBr`: digita-se `hh:mm` (máscara enquanto digita; "930" vira 09:30
 * ao sair do campo) ou escolhe no botão do relógio (atalhos e seletor nativo).
 * Valor externo: `HH:mm` (compatível com `<input type="time">`). Horário fora de 00:00–23:59 ou incompleto
 * fica no campo com aviso e o valor externo vira vazio, para a validação do formulário barrar o avanço.
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
  placeholder = "hh:mm",
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  onInvalidChange,
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
  "aria-invalid"?: React.ComponentProps<"input">["aria-invalid"];
  "aria-describedby"?: string;
  /** Avisado quando o texto digitado deixa de ser (ou volta a ser) um horário válido; serve para barrar campo opcional. */
  onInvalidChange?: (invalid: boolean) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const pickerRef = React.useRef<HTMLInputElement>(null);
  const messageId = React.useId();

  const hm = React.useMemo(() => normalizeTimeToHm(value), [value]);
  const [text, setText] = React.useState(hm);
  const [syncedValue, setSyncedValue] = React.useState(hm);
  // Último valor que este campo mandou para fora: a volta dele não reescreve o que está digitado.
  const [emitted, setEmitted] = React.useState<string | null>(null);
  const [blurred, setBlurred] = React.useState(false);

  if (hm !== syncedValue) {
    setSyncedValue(hm);
    if (hm !== emitted) {
      setText(hm);
      setBlurred(false);
    }
  }

  const emit = (next: string) => {
    setEmitted(next);
    if (next !== hm) onChange(next);
  };

  function pick(next: string) {
    const norm = normalizeTimeToHm(next);
    setBlurred(false);
    setText(norm);
    emit(norm);
    onInvalidChange?.(false);
  }

  const typedDigits = text.replace(/\D/g, "");
  const problem =
    (typedDigits.length === 4 || (blurred && typedDigits.length === 3)) && !parseHmDigits(typedDigits)
      ? "Horário inválido: use de 00:00 a 23:59."
      : blurred && typedDigits.length > 0 && typedDigits.length < 3
        ? "Horário incompleto: use hh:mm."
        : null;
  const describedBy = [ariaDescribedBy, problem ? messageId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="w-full min-w-0 space-y-1">
      <div
        data-slot="time-input-br"
        data-disabled={disabled || undefined}
        className={cn(
          "flex h-10 w-full min-w-0 items-center gap-1 rounded-(--radius-v2-md) border border-input bg-white pl-3 pr-1 text-base transition-colors md:text-sm",
          "focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/20",
          "has-[input[aria-invalid=true]]:border-destructive has-[input[aria-invalid=true]]:ring-3 has-[input[aria-invalid=true]]:ring-destructive/20",
          "data-[disabled]:cursor-not-allowed data-[disabled]:bg-muted data-[disabled]:text-text-disabled-v2",
          className,
        )}
      >
        {name ? <input type="hidden" name={name} value={hm} readOnly aria-hidden /> : null}
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          maxLength={5}
          value={text}
          disabled={disabled}
          required={required}
          aria-invalid={Boolean(problem) || ariaInvalid || undefined}
          aria-describedby={describedBy}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
            setBlurred(false);
            setText(maskHmDigitsInput(digits));
            // Só horário completo e válido vale; o resto não deixa o horário anterior valendo por trás.
            const parsed = digits.length === 4 ? parseHmDigits(digits) : null;
            emit(parsed ?? "");
            onInvalidChange?.(digits.length > 0 && !parsed);
          }}
          onBlur={() => {
            setBlurred(true);
            // "930" vira 09:30.
            if (typedDigits.length === 3) {
              const parsed = parseHmDigits(typedDigits);
              if (parsed) {
                setText(parsed);
                emit(parsed);
                onInvalidChange?.(false);
              }
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent tabular-nums outline-none placeholder:text-text-placeholder-v2 disabled:cursor-not-allowed"
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              aria-label="Escolher horário"
              className="shrink-0 text-muted-foreground"
            >
              <Clock className="size-4" aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto min-w-[12rem] p-0"
            align="end"
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              queueMicrotask(() => pickerRef.current?.focus());
            }}
          >
            <div className="flex flex-col gap-2 p-2">
              <input
                ref={pickerRef}
                type="time"
                lang="pt-BR"
                step={step}
                value={hm}
                disabled={disabled}
                aria-label="Horário"
                onChange={(e) => pick(e.target.value)}
                className="h-9 w-full rounded-(--radius-v2-md) border border-input bg-white px-2 text-sm tabular-nums focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/20"
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
                          pick(norm || t);
                          setOpen(false);
                        }}
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                          hm === (norm || t)
                            ? "border-interactive-300 bg-accent text-accent-foreground"
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
      </div>
      {problem ? (
        <p id={messageId} role="alert" className="text-v2-caption text-danger-text">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
