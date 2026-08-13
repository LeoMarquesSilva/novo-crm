"use client";

import { Plus, Trash2 } from "lucide-react";

import { AreaIconLabel } from "@/lib/crm/area-lucide-icon";
import { CrmSelectContent, CrmSelectItem, CrmSelectValue } from "@/components/crm/crm-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateInputBr } from "@/components/ui/date-input-br";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger } from "@/components/ui/select";
import type {
  ContractComponentDraft,
  ContractConfigurationDraft,
} from "@/modules/contracts/infrastructure/contract-queries";

import { ContractMoneyInput, ContractPercentInput } from "./contract-money-percent-inputs";
import {
  BILLING_KIND_LABELS,
  TRIGGER_KINDS,
  newContractDraftId,
} from "./contract-setup-form-helpers";

type AreaDraft = ContractConfigurationDraft["areas"][number];

type Props = {
  value: ContractComponentDraft[];
  areas: AreaDraft[];
  startsAt: string | null;
  disabled?: boolean;
  onChange: (next: ContractComponentDraft[]) => void;
};

const KIND_OPTIONS = Object.keys(BILLING_KIND_LABELS);
const CHARGE_MODE_LABELS = {
  excedente: "Só excedente",
  quantidade_total: "Quantidade total",
} as const;

export function ContractComponentsEditor({ value, areas, startsAt, disabled, onChange }: Props) {
  const areaLabels = Object.fromEntries(areas.map((area) => [area.id, area.areaKey]));

  function updateAt(index: number, patch: Partial<ContractComponentDraft>) {
    onChange(value.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)));
  }

  function addComponent() {
    const kind = "mensal_fixo";
    onChange([
      ...value,
      {
        id: newContractDraftId(),
        kind,
        description: BILLING_KIND_LABELS[kind] ?? "Novo componente",
        effectiveFrom: startsAt ?? new Date().toISOString().slice(0, 10),
        effectiveTo: null,
        ...(areas[0] ? { areaId: areas[0].id } : {}),
        amountCents: "0",
        requiresManualRelease: false,
        areaAllocationEligible: true,
        partnerShareEligible: true,
        commissionEligible: true,
      },
    ]);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#102033]">Componentes e condições</p>
          <p className="text-xs text-slate-500">
            Mensalidades, variáveis e gatilhos de êxito/condicionado.
          </p>
        </div>
        {disabled ? null : (
          <Button type="button" size="sm" variant="outline" onClick={addComponent}>
            <Plus className="size-4" />
            Adicionar componente
          </Button>
        )}
      </div>

      {value.length === 0 ? (
        <EmptyState text="Nenhum componente de cobrança cadastrado." />
      ) : (
        <ul className="space-y-3">
          {value.map((entry, index) => {
            const isTrigger = TRIGGER_KINDS.has(entry.kind) || Boolean(entry.requiresManualRelease);
            const isPercent = entry.kind === "exito_percentual";
            const isVariable =
              entry.kind === "variavel_processo" ||
              entry.kind === "variavel_hora" ||
              entry.kind === "despesa_km";
            const selectedArea = entry.areaId ? areaLabels[entry.areaId] : null;
            return (
              <li key={entry.id} className="rounded-2xl border border-[#dfe5ee] bg-white p-4 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-[#dfe5ee]">
                      {BILLING_KIND_LABELS[entry.kind] ?? entry.kind}
                    </Badge>
                    {isTrigger ? (
                      <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Gatilho</Badge>
                    ) : null}
                    {selectedArea ? <AreaIconLabel area={selectedArea} size="sm" /> : null}
                  </div>
                  {disabled ? null : (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="text-slate-500 hover:text-rose-700"
                      onClick={() => onChange(value.filter((_, entryIndex) => entryIndex !== index))}
                      aria-label={`Remover ${entry.description}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Tipo">
                    <Select
                      items={BILLING_KIND_LABELS}
                      value={entry.kind}
                      disabled={disabled}
                      onValueChange={(nextKind) => {
                        if (!nextKind) return;
                        const needsRelease = TRIGGER_KINDS.has(nextKind);
                        updateAt(index, {
                          kind: nextKind,
                          requiresManualRelease: needsRelease ? true : entry.requiresManualRelease,
                          description:
                            entry.description.trim() === "" ||
                            entry.description === (BILLING_KIND_LABELS[entry.kind] ?? "")
                              ? BILLING_KIND_LABELS[nextKind] ?? entry.description
                              : entry.description,
                        });
                      }}
                    >
                      <SelectTrigger className="!h-10 w-full border-[#dfe5ee] bg-white shadow-sm">
                        <CrmSelectValue value={entry.kind} labels={BILLING_KIND_LABELS} placeholder="Tipo" />
                      </SelectTrigger>
                      <CrmSelectContent>
                        {KIND_OPTIONS.map((kind) => (
                          <CrmSelectItem key={kind} value={kind}>
                            {BILLING_KIND_LABELS[kind]}
                          </CrmSelectItem>
                        ))}
                      </CrmSelectContent>
                    </Select>
                  </Field>

                  <Field label="Área">
                    <Select
                      items={areaLabels}
                      value={entry.areaId ?? ""}
                      disabled={disabled || areas.length === 0}
                      onValueChange={(nextArea) => updateAt(index, { areaId: nextArea || undefined })}
                    >
                      <SelectTrigger className="!h-10 w-full border-[#dfe5ee] bg-white shadow-sm">
                        {selectedArea ? (
                          <AreaIconLabel area={selectedArea} size="xs" />
                        ) : (
                          <span className="text-slate-400">Sem área</span>
                        )}
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

                  <Field label="Descrição">
                    <Input
                      disabled={disabled}
                      className="h-10 border-[#dfe5ee] bg-white shadow-sm"
                      value={entry.description}
                      onChange={(event) => updateAt(index, { description: event.target.value })}
                    />
                  </Field>

                  <Field label="Início da vigência">
                    <DateInputBr
                      disabled={disabled}
                      className="!h-10 border-[#dfe5ee] bg-white shadow-sm"
                      value={entry.effectiveFrom}
                      onChange={(ymd) => updateAt(index, { effectiveFrom: ymd })}
                    />
                  </Field>

                  {isPercent ? (
                    <Field label="Percentual de êxito">
                      <ContractPercentInput
                        disabled={disabled}
                        basisPoints={entry.percentageBasisPoints}
                        onBasisPointsChange={(basisPoints) =>
                          updateAt(index, { percentageBasisPoints: basisPoints ?? undefined })
                        }
                      />
                    </Field>
                  ) : isVariable ? (
                    <>
                      <Field label="Modo de cobrança">
                        <Select
                          items={CHARGE_MODE_LABELS}
                          value={entry.chargeMode ?? "excedente"}
                          disabled={disabled}
                          onValueChange={(next) => {
                            if (next !== "excedente" && next !== "quantidade_total") return;
                            updateAt(index, { chargeMode: next });
                          }}
                        >
                          <SelectTrigger className="!h-10 w-full border-[#dfe5ee] bg-white shadow-sm">
                            <CrmSelectValue
                              value={entry.chargeMode ?? "excedente"}
                              labels={CHARGE_MODE_LABELS}
                              placeholder="Modo"
                            />
                          </SelectTrigger>
                          <CrmSelectContent>
                            <CrmSelectItem value="excedente">Só excedente</CrmSelectItem>
                            <CrmSelectItem value="quantidade_total">Quantidade total</CrmSelectItem>
                          </CrmSelectContent>
                        </Select>
                      </Field>
                      <Field label="Quantidade inclusa">
                        <Input
                          inputMode="numeric"
                          disabled={disabled}
                          className="h-10 border-[#dfe5ee] bg-white tabular-nums shadow-sm"
                          value={entry.includedQuantity ?? ""}
                          onChange={(event) => {
                            const digits = event.target.value.replace(/\D/g, "");
                            updateAt(index, {
                              includedQuantity: digits === "" ? undefined : Number(digits),
                            });
                          }}
                        />
                      </Field>
                      <Field label="Valor unitário">
                        <ContractMoneyInput
                          disabled={disabled}
                          cents={entry.unitAmountCents}
                          onCentsChange={(cents) => updateAt(index, { unitAmountCents: cents })}
                        />
                      </Field>
                    </>
                  ) : (
                    <Field label="Valor">
                      <ContractMoneyInput
                        disabled={disabled}
                        cents={entry.amountCents}
                        onCentsChange={(cents) => updateAt(index, { amountCents: cents ?? "0" })}
                      />
                    </Field>
                  )}

                  <label className="flex items-center gap-2 self-end rounded-xl border border-[#dfe5ee] bg-[#f8f9fb] p-3 text-sm text-[#102033]">
                    <input
                      type="checkbox"
                      checked={Boolean(entry.requiresManualRelease)}
                      disabled={disabled}
                      onChange={(event) => updateAt(index, { requiresManualRelease: event.target.checked })}
                    />
                    Exige liberação manual (gatilho)
                  </label>

                  {isTrigger || entry.requiresManualRelease ? (
                    <Field label="Condição do gatilho">
                      <Input
                        disabled={disabled}
                        className="h-10 border-[#dfe5ee] bg-white shadow-sm"
                        placeholder="Ex.: liberar após trânsito em julgado"
                        value={entry.reason ?? ""}
                        onChange={(event) => updateAt(index, { reason: event.target.value || undefined })}
                      />
                    </Field>
                  ) : null}
                </div>
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
