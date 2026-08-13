"use client";

import { Plus, Trash2 } from "lucide-react";

import { CRM_PRACTICE_AREAS } from "@/lib/crm/crm-areas";
import { AreaIconLabel } from "@/lib/crm/area-lucide-icon";
import { CrmSelectContent, CrmSelectItem } from "@/components/crm/crm-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger } from "@/components/ui/select";
import type { ContractConfigurationDraft } from "@/modules/contracts/infrastructure/contract-queries";

import { ContractMoneyInput } from "./contract-money-percent-inputs";
import { newContractDraftId } from "./contract-setup-form-helpers";

type AreaDraft = ContractConfigurationDraft["areas"][number];

type Props = {
  value: AreaDraft[];
  disabled?: boolean;
  onChange: (next: AreaDraft[]) => void;
};

const AREA_LABELS = Object.fromEntries(CRM_PRACTICE_AREAS.map((area) => [area, area]));

export function ContractAreasEditor({ value, disabled, onChange }: Props) {
  function updateAt(index: number, patch: Partial<AreaDraft>) {
    onChange(value.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)));
  }

  function addArea() {
    const used = new Set(value.map((entry) => entry.areaKey));
    const nextKey = CRM_PRACTICE_AREAS.find((area) => !used.has(area)) ?? "Cível";
    onChange([
      ...value,
      {
        id: newContractDraftId(),
        areaKey: nextKey,
        includedProcesses: null,
        includedHours: null,
        processExcessRateCents: null,
        hourExcessRateCents: null,
      },
    ]);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#102033]">Áreas, franquias e preços excedentes</p>
          <p className="text-xs text-slate-500">Defina o que está incluso e o valor do excedente.</p>
        </div>
        {disabled ? null : (
          <Button type="button" size="sm" variant="outline" onClick={addArea}>
            <Plus className="size-4" />
            Adicionar área
          </Button>
        )}
      </div>

      {value.length === 0 ? (
        <EmptyState text="Nenhuma área cadastrada." />
      ) : (
        <ul className="space-y-3">
          {value.map((entry, index) => (
            <li key={entry.id} className="rounded-2xl border border-[#dfe5ee] bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-[240px] flex-1">
                  <Select
                    items={AREA_LABELS}
                    value={entry.areaKey}
                    disabled={disabled}
                    onValueChange={(next) => {
                      if (!next) return;
                      updateAt(index, { areaKey: next });
                    }}
                  >
                    <SelectTrigger className="!h-10 w-full border-[#dfe5ee] bg-white shadow-sm">
                      <AreaIconLabel area={entry.areaKey} size="xs" />
                    </SelectTrigger>
                    <CrmSelectContent>
                      {CRM_PRACTICE_AREAS.map((area) => (
                        <CrmSelectItem key={area} value={area}>
                          <AreaIconLabel area={area} size="xs" />
                        </CrmSelectItem>
                      ))}
                      {!CRM_PRACTICE_AREAS.includes(entry.areaKey as (typeof CRM_PRACTICE_AREAS)[number]) ? (
                        <CrmSelectItem value={entry.areaKey}>
                          <AreaIconLabel area={entry.areaKey} size="xs" />
                        </CrmSelectItem>
                      ) : null}
                    </CrmSelectContent>
                  </Select>
                </div>
                {disabled ? null : (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="text-slate-500 hover:text-rose-700"
                    onClick={() => onChange(value.filter((_, entryIndex) => entryIndex !== index))}
                    aria-label={`Remover área ${entry.areaKey}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Processos inclusos">
                  <Input
                    inputMode="numeric"
                    disabled={disabled}
                    className="h-10 border-[#dfe5ee] bg-white tabular-nums shadow-sm"
                    value={entry.includedProcesses ?? ""}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, "");
                      updateAt(index, {
                        includedProcesses: digits === "" ? null : Number(digits),
                      });
                    }}
                  />
                </Field>
                <Field label="Horas inclusas">
                  <Input
                    inputMode="numeric"
                    disabled={disabled}
                    className="h-10 border-[#dfe5ee] bg-white tabular-nums shadow-sm"
                    value={entry.includedHours ?? ""}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, "");
                      updateAt(index, {
                        includedHours: digits === "" ? null : Number(digits),
                      });
                    }}
                  />
                </Field>
                <Field label="Excedente processo">
                  <ContractMoneyInput
                    disabled={disabled}
                    cents={entry.processExcessRateCents}
                    onCentsChange={(cents) => updateAt(index, { processExcessRateCents: cents })}
                  />
                </Field>
                <Field label="Excedente hora">
                  <ContractMoneyInput
                    disabled={disabled}
                    cents={entry.hourExcessRateCents}
                    onCentsChange={(cents) => updateAt(index, { hourExcessRateCents: cents })}
                  />
                </Field>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 text-sm font-medium text-[#102033]">
      <span>{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#dfe5ee] bg-[#f8f9fb] px-4 py-8 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}
