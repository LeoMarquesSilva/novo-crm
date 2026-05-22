"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  displayBrlCurrencyField,
  maskBrlCurrencyFromInput,
} from "@/lib/crm/proposta-valor-brl-extenso";

type Props = {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  placeholder?: string;
  id?: string;
};

export function PropostaBrlCurrencyInput({
  value,
  onChange,
  className,
  placeholder = "R$ 0,00",
  id,
}: Props) {
  return (
    <Input
      id={id}
      value={displayBrlCurrencyField(value)}
      onChange={(e) => onChange(maskBrlCurrencyFromInput(e.target.value))}
      className={cn("h-10 border-[#dfe5ee] bg-white font-mono tabular-nums tracking-tight shadow-sm", className)}
      placeholder={placeholder}
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
    />
  );
}
