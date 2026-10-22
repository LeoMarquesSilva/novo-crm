"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CalendarBr } from "@/components/ui/calendar-br";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  maskBrDateDigitsInput,
  parseBrDateDigitsToYmd,
  ymdToBrDateDigitString,
} from "@/lib/format-datetime";
import { cn } from "@/lib/utils";

function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function localDateToYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function ymdToMasked(ymd: string): string {
  return ymd ? maskBrDateDigitsInput(ymdToBrDateDigitString(ymd)) : "";
}

/**
 * Data em português: digita-se `dd/mm/aaaa` (máscara enquanto digita) ou escolhe no calendário do botão.
 * Antes o campo era só o calendário e não dava para digitar a data (teste ponta a ponta 4).
 * Valor externo: `yyyy-mm-dd`. Data inexistente ou incompleta fica no campo com aviso e o valor externo
 * vira vazio, para a validação de obrigatório do formulário barrar o avanço.
 */
export function DateInputBr({
  value,
  onChange,
  className,
  disabled,
  id,
  name,
  required,
  minYmd,
  maxYmd,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  onInvalidChange,
}: {
  value: string;
  onChange: (ymd: string) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  required?: boolean;
  minYmd?: string;
  maxYmd?: string;
  "aria-invalid"?: React.ComponentProps<"input">["aria-invalid"];
  "aria-describedby"?: string;
  /** Avisado quando o texto digitado deixa de ser (ou volta a ser) uma data válida; serve para barrar campo opcional. */
  onInvalidChange?: (invalid: boolean) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const messageId = React.useId();
  const validValue = value && YMD.test(value.trim()) ? value.trim() : "";
  const [text, setText] = React.useState(() => ymdToMasked(validValue));
  const [syncedValue, setSyncedValue] = React.useState(validValue);
  // Último valor que este campo mandou para fora: a volta dele não reescreve o que está digitado.
  const [emitted, setEmitted] = React.useState<string | null>(null);
  const [blurred, setBlurred] = React.useState(false);

  if (validValue !== syncedValue) {
    setSyncedValue(validValue);
    if (validValue !== emitted) {
      setText(ymdToMasked(validValue));
      setBlurred(false);
    }
  }

  const emit = (next: string) => {
    setEmitted(next);
    if (next !== validValue) onChange(next);
  };

  const clamp = React.useCallback(
    (ymd: string) => {
      let out = ymd;
      if (minYmd && YMD.test(minYmd) && out < minYmd) out = minYmd;
      if (maxYmd && YMD.test(maxYmd) && out > maxYmd) out = maxYmd;
      return out;
    },
    [minYmd, maxYmd],
  );

  const selectedDate = validValue ? ymdToLocalDate(validValue) : undefined;

  const disabledMatcher = React.useMemo(() => {
    if (!minYmd && !maxYmd) return undefined;
    return (date: Date) => {
      const t = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
      if (minYmd && YMD.test(minYmd)) {
        const min = ymdToLocalDate(minYmd);
        const minT = new Date(min.getFullYear(), min.getMonth(), min.getDate()).getTime();
        if (t < minT) return true;
      }
      if (maxYmd && YMD.test(maxYmd)) {
        const max = ymdToLocalDate(maxYmd);
        const maxT = new Date(max.getFullYear(), max.getMonth(), max.getDate()).getTime();
        if (t > maxT) return true;
      }
      return false;
    };
  }, [minYmd, maxYmd]);

  const typedDigits = text.replace(/\D/g, "");
  const problem =
    typedDigits.length === 8 && !parseBrDateDigitsToYmd(typedDigits)
      ? "Data inválida: esse dia não existe."
      : blurred && typedDigits.length > 0 && typedDigits.length < 8
        ? "Data incompleta: use dd/mm/aaaa."
        : null;
  const describedBy = [ariaDescribedBy, problem ? messageId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="w-full min-w-0 space-y-1">
      <div
        data-slot="date-input-br"
        data-disabled={disabled || undefined}
        className={cn(
          "flex h-10 w-full min-w-0 items-center gap-1 rounded-(--radius-v2-md) border border-input bg-white pl-3 pr-1 text-base transition-colors md:text-sm",
          "focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/20",
          "has-[input[aria-invalid=true]]:border-destructive has-[input[aria-invalid=true]]:ring-3 has-[input[aria-invalid=true]]:ring-destructive/20",
          "data-[disabled]:cursor-not-allowed data-[disabled]:bg-muted data-[disabled]:text-text-disabled-v2",
          className,
        )}
      >
        {name ? <input type="hidden" name={name} value={validValue} readOnly aria-hidden /> : null}
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="dd/mm/aaaa"
          maxLength={10}
          value={text}
          disabled={disabled}
          required={required}
          aria-invalid={Boolean(problem) || ariaInvalid || undefined}
          aria-describedby={describedBy}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
            setBlurred(false);
            const ymd = digits.length === 8 ? parseBrDateDigitsToYmd(digits) : null;
            onInvalidChange?.(digits.length > 0 && !ymd);
            if (ymd) {
              const clamped = clamp(ymd);
              setText(maskBrDateDigitsInput(clamped === ymd ? digits : ymdToBrDateDigitString(clamped)));
              emit(clamped);
              return;
            }
            setText(maskBrDateDigitsInput(digits));
            // Vazio, incompleto ou inexistente: não deixa a data anterior valendo por trás do que está digitado.
            emit("");
          }}
          onBlur={() => setBlurred(true)}
          className="h-full min-w-0 flex-1 bg-transparent tabular-nums outline-none placeholder:text-text-placeholder-v2 disabled:cursor-not-allowed"
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              aria-label="Abrir calendário"
              className="shrink-0 text-muted-foreground"
            >
              <CalendarIcon className="size-4" aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <CalendarBr
              mode="single"
              selected={selectedDate}
              onSelect={(d) => {
                setBlurred(false);
                onInvalidChange?.(false);
                if (!d) {
                  setText("");
                  emit("");
                  setOpen(false);
                  return;
                }
                const ymd = clamp(localDateToYmd(d));
                setText(ymdToMasked(ymd));
                emit(ymd);
                setOpen(false);
              }}
              disabled={disabledMatcher}
              defaultMonth={selectedDate ?? new Date()}
            />
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
