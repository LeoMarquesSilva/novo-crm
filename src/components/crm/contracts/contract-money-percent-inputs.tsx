"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  basisPointsToMaskedPercent,
  basisPointsToPercentText,
  centsToMaskedBrl,
  maskedBrlToCents,
  percentTextToBasisPoints,
  sanitizePercentTyping,
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

/**
 * Campo percentual, valor em basis points. Digita-se o próprio percentual (`5` = 5%,
 * `12,5` = 12,5%); fora do foco mostra `15,00%`.
 */
export function ContractPercentInput({
  basisPoints,
  onBasisPointsChange,
  disabled,
  className,
  placeholder = "0,00%",
  id,
}: PercentProps) {
  // Texto em edição: "12," ainda não é número, então não dá para derivar do valor salvo.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input
      id={id}
      disabled={disabled}
      value={draft ?? basisPointsToMaskedPercent(basisPoints)}
      onFocus={() => setDraft(basisPointsToPercentText(basisPoints))}
      onBlur={() => setDraft(null)}
      onChange={(event) => {
        const text = sanitizePercentTyping(event.target.value);
        if (text === null) return;
        setDraft(text);
        onBasisPointsChange(percentTextToBasisPoints(text));
      }}
      className={cn(
        "h-10 border-[#dfe5ee] bg-white font-mono tabular-nums tracking-tight shadow-sm",
        className,
      )}
      placeholder={placeholder}
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
    />
  );
}
