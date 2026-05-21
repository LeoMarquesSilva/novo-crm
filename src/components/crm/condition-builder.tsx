"use client";

import { useMemo } from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CrmSelectContent, CrmSelectItem } from "@/components/crm/crm-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { FieldCondition } from "./dynamic-form";

type NonNullFieldCondition = Exclude<FieldCondition, null>;

const CONDITION_TYPE_LABELS: Record<NonNullFieldCondition["type"], string> = {
  field_equals: "é igual a",
  field_contains: "contém",
  field_not_empty: "não está vazio",
  field_in: "está entre",
};

interface ConditionBuilderProps {
  value: FieldCondition;
  onChange: (condition: FieldCondition) => void;
  availableFields: Array<{ code: string; label: string }>;
}

export function ConditionBuilder({
  value,
  onChange,
  availableFields,
}: ConditionBuilderProps) {
  const hasCondition = value !== null;

  const fieldItems = useMemo(
    () => Object.fromEntries(availableFields.map((f) => [f.code, f.label])),
    [availableFields],
  );

  function clear() {
    onChange(null);
  }

  function initCondition() {
    onChange({ type: "field_equals", field: "", value: "" });
  }

  function update(patch: Partial<NonNullFieldCondition>) {
    if (!value) return;
    onChange({ ...value, ...patch } as FieldCondition);
  }

  if (!hasCondition) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={initCondition}
        className="text-xs"
      >
        + Adicionar condição
      </Button>
    );
  }

  const condition = value!;

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-primary-dark">
          Exibir quando
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={clear}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Select
          modal={false}
          items={fieldItems}
          value={condition.field}
          onValueChange={(v) => update({ field: v ?? "" })}
        >
          <SelectTrigger className="h-8 w-full min-w-0 bg-white text-xs">
            <SelectValue placeholder="Campo" />
          </SelectTrigger>
          <CrmSelectContent>
            {availableFields.map((f) => (
              <CrmSelectItem key={f.code} value={f.code} className="text-xs">
                {f.label}
              </CrmSelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          modal={false}
          items={CONDITION_TYPE_LABELS}
          value={condition.type}
          onValueChange={(v) =>
            update({
              type: (v ?? "field_equals") as NonNullFieldCondition["type"],
            })
          }
        >
          <SelectTrigger className="h-8 w-full min-w-0 bg-white text-xs">
            <SelectValue />
          </SelectTrigger>
          <CrmSelectContent>
            <CrmSelectItem value="field_equals" className="text-xs">
              é igual a
            </CrmSelectItem>
            <CrmSelectItem value="field_contains" className="text-xs">
              contém
            </CrmSelectItem>
            <CrmSelectItem value="field_not_empty" className="text-xs">
              não está vazio
            </CrmSelectItem>
          </SelectContent>
        </Select>

        {condition.type !== "field_not_empty" && (
          <Input
            className="h-8 bg-white text-xs"
            placeholder="Valor"
            value={"value" in condition ? condition.value : ""}
            onChange={(e) => update({ value: e.target.value })}
          />
        )}
      </div>
    </div>
  );
}
