"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  basisPointsToMaskedPercent,
  centsToMaskedBrl,
  maskPercentFromInput,
  maskedBrlToCents,
  maskedPercentToBasisPoints,
} from "./contract-setup-form-helpers";
import { maskBrlCurrencyFromInput } from "@/lib/crm/proposta-valor-brl-extenso";

type MoneyProps = {
  cents: string | number | null | undefined;
  onCentsChange: (cents: string | null) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  id?: string;
};

/** Campo monetário com máscara pt-BR (`R$ 0,00`), valor em centavos. */
export function ContractMoneyInput({
  cents,
  onCentsChange,
  disabled,
  className,
  placeholder = "R$ 0,00",
  id,
}: MoneyProps) {
  return (
    <Input
      id={id}
      disabled={disabled}
      value={centsToMaskedBrl(cents)}
      onChange={(event) => {
        const masked = maskBrlCurrencyFromInput(event.target.value);
        onCentsChange(masked ? maskedBrlToCents(masked) : null);
      }}
      className={cn(
        "h-10 border-[#dfe5ee] bg-white font-mono tabular-nums tracking-tight shadow-sm",
        className,
      )}
      placeholder={placeholder}
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
    />
  );
}

type PercentProps = {
  basisPoints: number | null | undefined;
  onBasisPointsChange: (basisPoints: number | null) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  id?: string;
};

/** Campo percentual com máscara (`15,00%`), valor em basis points. */
export function ContractPercentInput({
  basisPoints,
  onBasisPointsChange,
  disabled,
  className,
  placeholder = "0,00%",
  id,
}: PercentProps) {
  return (
    <Input
      id={id}
      disabled={disabled}
      value={basisPointsToMaskedPercent(basisPoints)}
      onChange={(event) => {
        const masked = maskPercentFromInput(event.target.value);
        onBasisPointsChange(masked ? maskedPercentToBasisPoints(masked) : null);
      }}
      className={cn(
        "h-10 border-[#dfe5ee] bg-white font-mono tabular-nums tracking-tight shadow-sm",
        className,
      )}
      placeholder={placeholder}
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
    />
  );
}
