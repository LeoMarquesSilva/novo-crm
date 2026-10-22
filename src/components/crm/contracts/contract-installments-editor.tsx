"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DateInputBr } from "@/components/ui/date-input-br";
import { Input } from "@/components/ui/input";
import {
  addMonthsKeepingDay,
  competencyOf,
  splitTotalCents,
} from "@/modules/contracts/domain/installment-schedule";
import type { ContractComponentDraft } from "@/modules/contracts/infrastructure/contract-queries";

import { ContractMoneyInput } from "./contract-money-percent-inputs";
import { centsToMaskedBrl, competencyLabel } from "./contract-setup-form-helpers";

type Installment = NonNullable<ContractComponentDraft["installments"]>[number];

type Props = {
  installments: Installment[];
  /** Vencimento sugerido para gerar as parcelas quando ainda não há nenhuma. */
  defaultFirstDueDate: string | null;
  disabled?: boolean;
  /** Devolve as parcelas e o total (soma) para gravar no componente. */
  onChange: (next: { installments: Installment[]; amountCents: string }) => void;
};

function totalOf(installments: Installment[]): number {
  return installments.reduce((sum, installment) => sum + (Number(installment.amountCents) || 0), 0);
}

function dueDateOf(installment: Installment): string {
  return installment.dueDate ?? installment.competency;
}

/** Parcelas do preço fechado: vencimento e valor de cada uma, e geração a partir do total. */
export function ContractInstallmentsEditor({ installments, defaultFirstDueDate, disabled, onChange }: Props) {
  const [count, setCount] = useState(String(installments.length || 1));
  const [firstDueDate, setFirstDueDate] = useState(
    installments[0] ? dueDateOf(installments[0]) : (defaultFirstDueDate ?? ""),
  );
  const [totalCents, setTotalCents] = useState<string | null>(
    installments.length ? String(totalOf(installments)) : null,
  );

  function emit(next: Installment[]) {
    const numbered = next.map((installment, index) => ({ ...installment, number: index + 1 }));
    onChange({ installments: numbered, amountCents: String(totalOf(numbered)) });
  }

  function updateAt(index: number, patch: Partial<Installment>) {
    emit(installments.map((installment, entryIndex) => (entryIndex === index ? { ...installment, ...patch } : installment)));
  }

  function generate() {
    const parts = Number(count);
    if (!Number.isInteger(parts) || parts < 1 || !firstDueDate || totalCents === null) return;
    const amounts = splitTotalCents(Number(totalCents), parts);
    emit(
      amounts.map((amount, index) => {
        const dueDate = addMonthsKeepingDay(firstDueDate, index);
        return { number: index + 1, competency: competencyOf(dueDate), dueDate, amountCents: String(amount) };
      }),
    );
  }

  function addInstallment() {
    const last = installments.at(-1);
    const dueDate = last ? addMonthsKeepingDay(dueDateOf(last), 1) : firstDueDate || defaultFirstDueDate;
    if (!dueDate) return;
    emit([
      ...installments,
      {
        number: installments.length + 1,
        competency: competencyOf(dueDate),
        dueDate,
        amountCents: last?.amountCents ?? "0",
      },
    ]);
  }

  const canGenerate = Number(count) >= 1 && Boolean(firstDueDate) && totalCents !== null;

  return (
    <div className="space-y-3 rounded-(--radius-v2-md) border border-neutral-200 bg-neutral-50 p-3 md:col-span-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-neutral-900">Parcelas</p>
        <p className="text-sm text-neutral-600 tabular-nums">
          {installments.length} parcela{installments.length === 1 ? "" : "s"} · total{" "}
          <span className="font-medium text-neutral-900">{centsToMaskedBrl(totalOf(installments)) || "R$ 0,00"}</span>
        </p>
      </div>

      {disabled ? null : (
        <div className="grid gap-2 sm:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <label className="space-y-1 text-xs font-medium text-neutral-700">
            <span>Quantidade</span>
            <Input
              inputMode="numeric"
              className="h-10 border-neutral-200 bg-white tabular-nums shadow-sm"
              value={count}
              onChange={(event) => setCount(event.target.value.replace(/\D/g, "").slice(0, 3))}
            />
          </label>
          <label className="space-y-1 text-xs font-medium text-neutral-700">
            <span>1º vencimento</span>
            <DateInputBr
              className="!h-10 border-neutral-200 bg-white shadow-sm"
              value={firstDueDate}
              onChange={(ymd) => setFirstDueDate(ymd)}
            />
          </label>
          <label className="space-y-1 text-xs font-medium text-neutral-700">
            <span>Valor total</span>
            <ContractMoneyInput cents={totalCents} onCentsChange={setTotalCents} />
          </label>
          <Button type="button" variant="outline" className="h-10" disabled={!canGenerate} onClick={generate}>
            {installments.length ? "Refazer parcelas" : "Gerar parcelas"}
          </Button>
        </div>
      )}

      {installments.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhuma parcela. Informe quantidade, 1º vencimento e valor total.</p>
      ) : (
        <ol className="space-y-2" aria-label="Parcelas do preço fechado">
          {installments.map((installment, index) => (
            <li
              key={installment.number}
              className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[2rem_minmax(0,1fr)_5.5rem_minmax(0,1fr)_2.25rem]"
            >
              <span className="text-sm font-medium text-neutral-600 tabular-nums">{installment.number}ª</span>
              <DateInputBr
                disabled={disabled}
                className="!h-10 border-neutral-200 bg-white shadow-sm"
                value={dueDateOf(installment)}
                onChange={(ymd) => {
                  if (!ymd) return;
                  updateAt(index, { dueDate: ymd, competency: competencyOf(ymd) });
                }}
              />
              <span className="text-xs text-neutral-500 tabular-nums" title="Competência em que a parcela é faturada">
                {competencyLabel(installment.competency)}
              </span>
              <ContractMoneyInput
                disabled={disabled}
                className="col-span-2 sm:col-span-1"
                cents={installment.amountCents}
                onCentsChange={(cents) => updateAt(index, { amountCents: cents ?? "0" })}
              />
              {disabled ? null : (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="text-neutral-500 hover:text-danger-text"
                  aria-label={`Remover parcela ${installment.number}`}
                  onClick={() => emit(installments.filter((_, entryIndex) => entryIndex !== index))}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}

      {disabled ? null : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!installments.length && !firstDueDate && !defaultFirstDueDate}
          onClick={addInstallment}
        >
          <Plus className="size-4" />
          Adicionar parcela
        </Button>
      )}
    </div>
  );
}
