"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CalendarBr } from "@/components/ui/calendar-br";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateYmdBr } from "@/lib/format-datetime";
import { cn } from "@/lib/utils";

function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function localDateToYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Data com **calendário visual** em português (react-day-picker + locale pt-BR).
 * Valor externo: `yyyy-mm-dd`.
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
  "aria-invalid"?: React.ComponentProps<"button">["aria-invalid"];
  "aria-describedby"?: string;
}) {
  const [open, setOpen] = React.useState(false);

  const clamp = React.useCallback(
    (ymd: string) => {
      let out = ymd;
      if (minYmd && /^\d{4}-\d{2}-\d{2}$/.test(minYmd) && out < minYmd) out = minYmd;
      if (maxYmd && /^\d{4}-\d{2}-\d{2}$/.test(maxYmd) && out > maxYmd) out = maxYmd;
      return out;
    },
    [minYmd, maxYmd],
  );

  const selectedDate =
    value && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? ymdToLocalDate(value.trim()) : undefined;

  const disabledMatcher = React.useMemo(() => {
    if (!minYmd && !maxYmd) return undefined;
    return (date: Date) => {
      const t = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
      if (minYmd && /^\d{4}-\d{2}-\d{2}$/.test(minYmd)) {
        const min = ymdToLocalDate(minYmd);
        const minT = new Date(min.getFullYear(), min.getMonth(), min.getDate()).getTime();
        if (t < minT) return true;
      }
      if (maxYmd && /^\d{4}-\d{2}-\d{2}$/.test(maxYmd)) {
        const max = ymdToLocalDate(maxYmd);
        const maxT = new Date(max.getFullYear(), max.getMonth(), max.getDate()).getTime();
        if (t > maxT) return true;
      }
      return false;
    };
  }, [minYmd, maxYmd]);

  const labelText =
    value && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
      ? formatDateYmdBr(value.trim()) || value
      : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {name ? <input type="hidden" name={name} value={value} readOnly aria-hidden /> : null}
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
            "h-8 w-full min-w-0 justify-start border-input bg-white px-2.5 py-1 font-normal text-base md:text-sm",
            !labelText && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 size-4 shrink-0 opacity-70" aria-hidden />
          {labelText ?? "dd/mm/aaaa"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <CalendarBr
          mode="single"
          selected={selectedDate}
          onSelect={(d) => {
            if (!d) {
              onChange("");
              setOpen(false);
              return;
            }
            onChange(clamp(localDateToYmd(d)));
            setOpen(false);
          }}
          disabled={disabledMatcher}
          defaultMonth={selectedDate ?? new Date()}
        />
      </PopoverContent>
    </Popover>
  );
}
