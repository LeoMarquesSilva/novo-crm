"use client";

import { useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger } from "@/components/ui/select";
import { CrmSelectContent, CrmSelectItem, CrmSelectValue } from "@/components/crm/crm-select";
import { PropostaBrlCurrencyInput } from "@/components/crm/proposta-brl-currency-input";
import {
  type PropostaAreaKey,
  type PropostaEscopoDetalheEntry,
  type TipoDef,
} from "@/data/proposta-tipos-catalog";
import { scopeSubtypeFieldKeys } from "@/lib/crm/proposal-catalog-utils";
import { getPropostaPlaceholderFieldConfig } from "@/lib/crm/proposta-placeholder-labels";
import {
  ESCOPO_PLACEHOLDER_UPPERCASE,
  formatHorasMesForMerge,
  isHorasMesPlaceholderKey,
  maskNumeroProcessoCNJ,
} from "@/lib/crm/proposta-escopo-preview";
import { maskCnpj } from "@/lib/crm/br-document-mask";
import { cn } from "@/lib/utils";

const SELECT_EMPTY = "__crm_escopo_none__";

type Props = {
  entryIndex: number;
  entryCount: number;
  entry: PropostaEscopoDetalheEntry;
  catalogArea: PropostaAreaKey;
  tipos: TipoDef[];
  defaultNomeEmpresa: string | null;
  canRemove: boolean;
  onPatch: (patch: Partial<PropostaEscopoDetalheEntry>) => void;
  onRemove: () => void;
};

export function PropostaEscopoEntryForm({
  entryIndex,
  entryCount,
  entry,
  catalogArea,
  tipos,
  defaultNomeEmpresa,
  canRemove,
  onPatch,
  onRemove,
}: Props) {
  const tipo = tipos?.find((t) => t.tipoId === entry.tipoId);
  const subtipos = tipo?.subtipos ?? [];
  const sub = subtipos.find((s) => s.subtipoId === entry.subtipoId);
  const placeholderKeys = scopeSubtypeFieldKeys(sub);
  const companyPlaceholderKeys = placeholderKeys.filter(
    (key) => getPropostaPlaceholderFieldConfig(key).autoFillFromCompany,
  );
  const seedSigRef = useRef<string>("");
  const onPatchRef = useRef(onPatch);

  useEffect(() => {
    onPatchRef.current = onPatch;
  }, [onPatch]);

  useEffect(() => {
    const sig = `${catalogArea}|${entry.id}|${entry.tipoId}|${entry.subtipoId}|${defaultNomeEmpresa ?? ""}`;
    if (!sub || !defaultNomeEmpresa) return;
    if (companyPlaceholderKeys.length === 0) return;
    if (companyPlaceholderKeys.every((key) => entry.placeholders?.[key]?.trim())) return;
    if (seedSigRef.current === sig) return;
    seedSigRef.current = sig;
    const seededPlaceholders = { ...(entry.placeholders ?? {}) };
    for (const key of companyPlaceholderKeys) {
      if (!seededPlaceholders[key]?.trim()) seededPlaceholders[key] = defaultNomeEmpresa;
    }
    onPatchRef.current({
      placeholders: seededPlaceholders,
    });
  }, [catalogArea, entry.id, sub, entry.tipoId, entry.subtipoId, entry.placeholders, defaultNomeEmpresa, companyPlaceholderKeys]);

  const tipoSelectValue = (entry.tipoId ?? "").trim();
  const subtipoSelectValue = (entry.subtipoId ?? "").trim();
  const tipoLabels = {
    [SELECT_EMPTY]: "Selecione o tipo",
    ...Object.fromEntries((tipos ?? []).map((item) => [item.tipoId, item.label])),
  };
  const subtipoLabels = {
    [SELECT_EMPTY]: "Selecione o subtipo",
    ...Object.fromEntries(subtipos.map((item) => [item.subtipoId, item.label])),
  };

  return (
    <div className="min-w-0 space-y-4 rounded-(--radius-v2-xl) border border-border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-v2-caption-medium text-text-muted-v2">
            Escopo {entryIndex + 1}
            {entryCount > 1 ? ` de ${entryCount}` : ""}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Tipo, subtipo e variáveis deste bloco na proposta.
          </p>
        </div>
        {canRemove ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0 gap-1.5 border-rose-200 text-rose-700 hover:bg-rose-50"
            onClick={onRemove}
          >
            <Trash2 className="size-3.5" aria-hidden />
            Remover
          </Button>
        ) : null}
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label className="text-xs font-semibold text-slate-600">Tipo do escopo</Label>
          <Select
            value={tipoSelectValue ? tipoSelectValue : SELECT_EMPTY}
            onValueChange={(v) => {
              const tipoId = v === SELECT_EMPTY || v == null ? "" : v;
              onPatch({ tipoId, subtipoId: "", placeholders: {} });
            }}
          >
            <SelectTrigger className="h-10 w-full min-w-0 max-w-full rounded-(--radius-v2-md) border-border bg-white">
              <CrmSelectValue
                value={tipoSelectValue || SELECT_EMPTY}
                labels={tipoLabels}
                placeholder="Selecione o tipo"
              />
            </SelectTrigger>
            <CrmSelectContent inModal>
              <CrmSelectItem value={SELECT_EMPTY}>Selecione o tipo</CrmSelectItem>
              {(tipos ?? []).map((t) => (
                <CrmSelectItem key={t.tipoId} value={t.tipoId}>
                  {t.label}
                </CrmSelectItem>
              ))}
            </CrmSelectContent>
          </Select>
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label className="text-xs font-semibold text-slate-600">Subtipo do escopo</Label>
          <Select
            value={subtipoSelectValue ? subtipoSelectValue : SELECT_EMPTY}
            onValueChange={(v) => {
              const subtipoId = v === SELECT_EMPTY || v == null ? "" : v;
              onPatch({ subtipoId, placeholders: {} });
            }}
            disabled={!entry.tipoId}
          >
            <SelectTrigger className="h-10 w-full min-w-0 max-w-full rounded-(--radius-v2-md) border-border bg-white">
              <CrmSelectValue
                value={subtipoSelectValue || SELECT_EMPTY}
                labels={subtipoLabels}
                placeholder="Selecione o subtipo"
              />
            </SelectTrigger>
            <CrmSelectContent inModal>
              <CrmSelectItem value={SELECT_EMPTY}>Selecione o subtipo</CrmSelectItem>
              {subtipos.map((s) => (
                <CrmSelectItem key={s.subtipoId} value={s.subtipoId}>
                  {s.label}
                </CrmSelectItem>
              ))}
            </CrmSelectContent>
          </Select>
        </div>
      </div>

      {placeholderKeys.length > 0 && sub ? (
        <div className="grid min-w-0 gap-3 border-t border-border pt-4 sm:grid-cols-2">
          {placeholderKeys.map((key) => {
            const wide = getPropostaPlaceholderFieldConfig(key).wide;
            return (
              <div key={key} className={cn("min-w-0", wide && "sm:col-span-2")}>
                <PlaceholderField
                  phKey={key}
                  value={entry.placeholders?.[key] ?? ""}
                  onChange={(next) =>
                    onPatch({
                      placeholders: { ...(entry.placeholders ?? {}), [key]: next },
                    })
                  }
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function PlaceholderField({
  phKey,
  value,
  onChange,
}: {
  phKey: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const k = phKey.trim();
  const config = getPropostaPlaceholderFieldConfig(k);
  const isHorasMes = isHorasMesPlaceholderKey(k);
  const forceUpper = ESCOPO_PLACEHOLDER_UPPERCASE.has(k);
  const horasPreview = isHorasMes && value.trim() ? formatHorasMesForMerge(value) : null;
  const selectValue = value || SELECT_EMPTY;
  const selectLabels = {
    [SELECT_EMPTY]: config.placeholder,
    ...Object.fromEntries((config.options ?? []).map((option) => [option, option])),
  };

  return (
    <div className="min-w-0 space-y-1.5">
      <Label className="text-xs font-bold leading-snug text-slate-600">{config.label}</Label>
      {config.control === "textarea" ? (
        <Textarea
          className="min-h-[104px] max-w-full resize-y rounded-(--radius-v2-md) border-border bg-white text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={config.placeholder}
          rows={5}
        />
      ) : config.control === "currency" ? (
        <PropostaBrlCurrencyInput
          value={value}
          onChange={onChange}
          placeholder={config.placeholder}
          className="h-10 max-w-full rounded-(--radius-v2-md) border-border bg-white"
        />
      ) : config.control === "select" && config.options ? (
        <Select
          value={selectValue}
          onValueChange={(next) => onChange(next === SELECT_EMPTY || next == null ? "" : next)}
        >
          <SelectTrigger className="h-10 w-full min-w-0 max-w-full rounded-(--radius-v2-md) border-border bg-white">
            <CrmSelectValue
              value={selectValue}
              labels={selectLabels}
              placeholder={config.placeholder}
            />
          </SelectTrigger>
          <CrmSelectContent inModal>
            <CrmSelectItem value={SELECT_EMPTY}>{config.placeholder}</CrmSelectItem>
            {config.options.map((option) => (
              <CrmSelectItem key={option} value={option}>
                {option}
              </CrmSelectItem>
            ))}
          </CrmSelectContent>
        </Select>
      ) : (
        <Input
          className="h-10 max-w-full rounded-(--radius-v2-md) border-border bg-white"
          type={config.control === "date" ? "date" : "text"}
          value={value}
          onChange={(e) => {
            let next = e.target.value;
            if (config.control === "integer") next = next.replace(/\D/g, "").slice(0, 5);
            else if (config.control === "process") next = maskNumeroProcessoCNJ(next);
            else if (config.control === "cnpj") next = maskCnpj(next);
            else if (forceUpper) next = next.toLocaleUpperCase("pt-BR");
            onChange(next);
          }}
          placeholder={config.placeholder}
          inputMode={
            config.control === "integer" ||
            config.control === "process" ||
            config.control === "cnpj"
              ? "numeric"
              : "text"
          }
          autoComplete="off"
        />
      )}
      {horasPreview ? (
        <p className="text-[11px] leading-relaxed text-slate-500">
          Na proposta: <span className="font-semibold text-interactive-700">{horasPreview}</span>
        </p>
      ) : null}
    </div>
  );
}
