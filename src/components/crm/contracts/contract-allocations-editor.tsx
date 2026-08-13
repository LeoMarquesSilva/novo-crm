"use client";

import { Plus, Trash2 } from "lucide-react";

import { AreaIconLabel } from "@/lib/crm/area-lucide-icon";
import { CrmSelectContent, CrmSelectItem, CrmSelectValue } from "@/components/crm/crm-select";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger } from "@/components/ui/select";
import type { ContractConfigurationDraft } from "@/modules/contracts/infrastructure/contract-queries";

import { ContractMoneyInput, ContractPercentInput } from "./contract-money-percent-inputs";
import { newContractDraftId } from "./contract-setup-form-helpers";

type Allocation = ContractConfigurationDraft["version"]["areaAllocations"][number];
type Area = ContractConfigurationDraft["areas"][number];
type Component = ContractConfigurationDraft["version"]["components"][number];

type Props = {
  value: Allocation[];
  areas: Area[];
  components: Component[];
  disabled?: boolean;
  onChange: (next: Allocation[]) => void;
};

const MODE_LABELS = { percentual: "Percentual", valor: "Valor fixo" } as const;

export function ContractAllocationsEditor({ value, areas, components, disabled, onChange }: Props) {
  const areaLabels = Object.fromEntries(areas.map((area) => [area.id, area.areaKey]));
  const componentLabels = Object.fromEntries(
    components.map((component) => [component.id, component.description]),
  );

  function updateAt(index: number, next: Allocation) {
    onChange(value.map((entry, entryIndex) => (entryIndex === index ? next : entry)));
  }

  function addAllocation() {
    if (!areas[0]) return;
    onChange([
      ...value,
      {
        id: newContractDraftId(),
        areaId: areas[0].id,
        ...(components[0] ? { componentId: components[0].id } : {}),
        mode: "percentual",
        percentageBasisPoints: 10000,
      },
    ]);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#102033]">Rateios por área</p>
          <p className="text-xs text-slate-500">Distribua o valor do componente entre as áreas.</p>
        </div>
        {disabled ? null : (
          <Button type="button" size="sm" variant="outline" onClick={addAllocation} disabled={areas.length === 0}>
            <Plus className="size-4" />
            Adicionar rateio
          </Button>
        )}
      </div>

      {value.length === 0 ? (
        <EmptyState text="Nenhum rateio cadastrado." />
      ) : (
        <ul className="space-y-3">
          {value.map((entry, index) => {
            const areaName = areaLabels[entry.areaId] ?? "Área";
            return (
              <li key={entry.id} className="rounded-2xl border border-[#dfe5ee] bg-white p-4 shadow-sm">
                <div className="mb-3">
                  <AreaIconLabel area={areaName} size="sm" />
                </div>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                  <Field label="Área">
                    <Select
                      items={areaLabels}
                      value={entry.areaId}
                      disabled={disabled}
                      onValueChange={(next) => {
                        if (!next) return;
                        updateAt(index, { ...entry, areaId: next });
                      }}
                    >
                      <SelectTrigger className="!h-10 w-full border-[#dfe5ee] bg-white shadow-sm">
                        <AreaIconLabel area={areaName} size="xs" />
                      </SelectTrigger>
                      <CrmSelectContent>
                        {areas.map((area) => (
                          <CrmSelectItem key={area.id} value={area.id}>
                            <AreaIconLabel area={area.areaKey} size="xs" />
                          </CrmSelectItem>
                        ))}
                      </CrmSelectContent>
                    </Select>
                  </Field>

                  <Field label="Componente (opcional)">
                    <Select
                      items={componentLabels}
                      value={entry.componentId ?? ""}
                      disabled={disabled}
                      onValueChange={(next) => {
                        const { componentId: _removed, ...rest } = entry;
                        updateAt(index, next ? { ...rest, componentId: next } : rest);
                      }}
                    >
                      <SelectTrigger className="!h-10 w-full border-[#dfe5ee] bg-white shadow-sm">
                        <CrmSelectValue
                          value={entry.componentId}
                          labels={componentLabels}
                          placeholder="Todos elegíveis"
                        />
                      </SelectTrigger>
                      <CrmSelectContent>
                        {components.map((component) => (
                          <CrmSelectItem key={component.id} value={component.id}>
                            {component.description}
                          </CrmSelectItem>
                        ))}
                      </CrmSelectContent>
                    </Select>
                  </Field>

                  <Field label="Modo">
                    <Select
                      items={MODE_LABELS}
                      value={entry.mode}
                      disabled={disabled}
                      onValueChange={(next) => {
                        if (next === "percentual") {
                          updateAt(index, {
                            id: entry.id,
                            areaId: entry.areaId,
                            ...(entry.componentId ? { componentId: entry.componentId } : {}),
                            mode: "percentual",
                            percentageBasisPoints:
                              entry.mode === "percentual" ? entry.percentageBasisPoints : 10000,
                          });
                          return;
                        }
                        if (next === "valor") {
                          updateAt(index, {
                            id: entry.id,
                            areaId: entry.areaId,
                            ...(entry.componentId ? { componentId: entry.componentId } : {}),
                            mode: "valor",
                            amountCents: entry.mode === "valor" ? entry.amountCents : "0",
                          });
                        }
                      }}
                    >
                      <SelectTrigger className="!h-10 w-full border-[#dfe5ee] bg-white shadow-sm">
                        <CrmSelectValue value={entry.mode} labels={MODE_LABELS} placeholder="Modo" />
                      </SelectTrigger>
                      <CrmSelectContent>
                        <CrmSelectItem value="percentual">Percentual</CrmSelectItem>
                        <CrmSelectItem value="valor">Valor fixo</CrmSelectItem>
                      </CrmSelectContent>
                    </Select>
                  </Field>

                  {entry.mode === "percentual" ? (
                    <Field label="Percentual">
                      <ContractPercentInput
                        disabled={disabled}
                        basisPoints={entry.percentageBasisPoints}
                        onBasisPointsChange={(basisPoints) =>
                          updateAt(index, {
                            ...entry,
                            percentageBasisPoints: basisPoints ?? 0,
                          })
                        }
                      />
                    </Field>
                  ) : (
                    <Field label="Valor">
                      <ContractMoneyInput
                        disabled={disabled}
                        cents={entry.amountCents}
                        onCentsChange={(cents) =>
                          updateAt(index, {
                            ...entry,
                            amountCents: cents ?? "0",
                          })
                        }
                      />
                    </Field>
                  )}
                </div>

                {disabled ? null : (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="mt-3 text-slate-500 hover:text-rose-700"
                    onClick={() => onChange(value.filter((_, entryIndex) => entryIndex !== index))}
                  >
                    <Trash2 className="size-4" />
                    Remover rateio
                  </Button>
                )}
              </li>
            );
          })}
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
