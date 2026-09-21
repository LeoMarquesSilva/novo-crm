"use client";

import { Input } from "@/components/ui/input";
import { Select, SelectTrigger } from "@/components/ui/select";
import { CrmSelectContent, CrmSelectItem, CrmSelectValue } from "@/components/crm/crm-select";
import {
  NEW_INDICATION_LABEL,
  NEW_INDICATION_VALUE,
  collaboratorSelectItems,
  indicationNameSelectItems,
  isCollaboratorIndicationType,
  type IndicationNameMode,
  type IndicationNameOptions,
} from "@/lib/crm/indication-name-options";
import { cn } from "@/lib/utils";

export function IndicationNamePicker({
  tipoIndicacao,
  nome,
  mode,
  options,
  onChange,
  size = "default",
  inModal = false,
  disabled = false,
  id,
  className,
}: {
  tipoIndicacao: string;
  nome: string;
  mode: IndicationNameMode;
  options: IndicationNameOptions;
  onChange: (next: { nome: string; mode: IndicationNameMode }) => void;
  size?: "sm" | "default";
  inModal?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  const triggerClass =
    size === "sm"
      ? "h-9 w-full justify-between font-normal"
      : "h-10 w-full justify-between font-normal";
  const inputClass = size === "sm" ? "mt-2 h-9" : "mt-2 h-10";

  if (isCollaboratorIndicationType(tipoIndicacao)) {
    const items = { ...collaboratorSelectItems(options.collaborators) };
    if (nome && !items[nome]) items[nome] = nome;
    return (
      <Select
        modal={false}
        items={items}
        value={nome || null}
        disabled={disabled}
        onValueChange={(value) => onChange({ nome: value ?? "", mode: "colaborador" })}
      >
        <SelectTrigger id={id} size={size} className={cn(triggerClass, className)}>
          <CrmSelectValue value={nome} labels={items} placeholder="Selecione o colaborador" />
        </SelectTrigger>
        <CrmSelectContent inModal={inModal} className="max-h-[min(280px,50dvh)]">
          {Object.keys(items).map((name) => (
            <CrmSelectItem key={name} value={name}>
              {name}
            </CrmSelectItem>
          ))}
        </CrmSelectContent>
      </Select>
    );
  }

  const items = indicationNameSelectItems(options.approvedIndicators);
  if (nome && mode !== "new" && !items[nome]) items[nome] = nome;
  const selectValue = mode === "new" ? NEW_INDICATION_VALUE : nome || null;

  return (
    <div className="min-w-0">
      <Select
        modal={false}
        items={items}
        value={selectValue}
        disabled={disabled}
        onValueChange={(value) => {
          if (value === NEW_INDICATION_VALUE) {
            onChange({ nome: "", mode: "new" });
            return;
          }
          onChange({ nome: value ?? "", mode: "existing" });
        }}
      >
        <SelectTrigger id={id} size={size} className={cn(triggerClass, className)}>
          <CrmSelectValue
            value={selectValue}
            labels={items}
            placeholder="Selecione na base aprovada"
          />
        </SelectTrigger>
        <CrmSelectContent inModal={inModal} className="max-h-[min(280px,50dvh)]">
          {options.approvedIndicators.map((name) => (
            <CrmSelectItem key={name} value={name}>
              {name}
            </CrmSelectItem>
          ))}
          {nome && mode !== "new" && !options.approvedIndicators.includes(nome) ? (
            <CrmSelectItem value={nome}>{nome}</CrmSelectItem>
          ) : null}
          <CrmSelectItem value={NEW_INDICATION_VALUE}>{NEW_INDICATION_LABEL}</CrmSelectItem>
        </CrmSelectContent>
      </Select>
      {mode === "new" ? (
        <Input
          value={nome}
          disabled={disabled}
          onChange={(event) => onChange({ nome: event.target.value, mode: "new" })}
          placeholder="Nome para enviar à aprovação no admin"
          className={inputClass}
        />
      ) : null}
    </div>
  );
}
