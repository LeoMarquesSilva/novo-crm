"use client";

import { useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CrmSelectContent, CrmSelectItem } from "@/components/crm/crm-select";
import {
  PROPOSTA_PLACEHOLDER_RESUMO_PROCESSO,
  type PropostaAreaKey,
  type PropostaEscopoDetalheEntry,
  type TipoDef,
} from "@/data/proposta-tipos-catalog";
import { scopeSubtypeFieldKeys } from "@/lib/crm/proposal-catalog-utils";
import { getPropostaPlaceholderLabel } from "@/lib/crm/proposta-placeholder-labels";
import {
  ESCOPO_PLACEHOLDER_NOME_EMPRESA,
  ESCOPO_PLACEHOLDER_UPPERCASE,
  formatHorasMesForMerge,
  isHorasMesPlaceholderKey,
  isNumeroProcessoPlaceholderKey,
  maskNumeroProcessoCNJ,
} from "@/lib/crm/proposta-escopo-preview";
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
  const seedSigRef = useRef<string>("");
  const onPatchRef = useRef(onPatch);

  useEffect(() => {
    onPatchRef.current = onPatch;
  }, [onPatch]);

  useEffect(() => {
    const sig = `${catalogArea}|${entry.id}|${entry.tipoId}|${entry.subtipoId}|${defaultNomeEmpresa ?? ""}`;
    if (!sub || !defaultNomeEmpresa) return;
    if (!placeholderKeys.some((k) => k.trim() === ESCOPO_PLACEHOLDER_NOME_EMPRESA)) return;
    if (entry.placeholders?.[ESCOPO_PLACEHOLDER_NOME_EMPRESA]?.trim()) return;
    if (seedSigRef.current === sig) return;
    seedSigRef.current = sig;
    onPatchRef.current({
      placeholders: {
        ...(entry.placeholders ?? {}),
        [ESCOPO_PLACEHOLDER_NOME_EMPRESA]: defaultNomeEmpresa,
      },
    });
  }, [catalogArea, entry.id, sub, entry.tipoId, entry.subtipoId, entry.placeholders, defaultNomeEmpresa, placeholderKeys]);

  const tipoSelectValue = (entry.tipoId ?? "").trim();
  const subtipoSelectValue = (entry.subtipoId ?? "").trim();

  return (
    <div className="min-w-0 space-y-4 rounded-[24px] border border-[#dfe5ee] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#24615b]">
            Escopo {entryIndex + 1}
            {entryCount > 1 ? ` de ${entryCount}` : ""}
          </p>
          <p className="mt-1 text-sm text-slate-500">
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
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Tipo (escopo)</Label>
          <Select
            value={tipoSelectValue ? tipoSelectValue : SELECT_EMPTY}
            onValueChange={(v) => {
              const tipoId = v === SELECT_EMPTY || v == null ? "" : v;
              onPatch({ tipoId, subtipoId: "", placeholders: {} });
            }}
          >
            <SelectTrigger className="h-10 w-full min-w-0 max-w-full border-[#dfe5ee] bg-[#fbfcfd] shadow-sm">
              <SelectValue placeholder="Selecione o tipo">
                {!tipoSelectValue ? "Selecione o tipo" : (tipo?.label ?? "Selecione o tipo")}
              </SelectValue>
            </SelectTrigger>
            <CrmSelectContent>
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
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Subtipo (escopo)</Label>
          <Select
            value={subtipoSelectValue ? subtipoSelectValue : SELECT_EMPTY}
            onValueChange={(v) => {
              const subtipoId = v === SELECT_EMPTY || v == null ? "" : v;
              onPatch({ subtipoId, placeholders: {} });
            }}
            disabled={!entry.tipoId}
          >
            <SelectTrigger className="h-10 w-full min-w-0 max-w-full border-[#dfe5ee] bg-[#fbfcfd] shadow-sm">
              <SelectValue placeholder="Selecione o subtipo">
                {!subtipoSelectValue ? "Selecione o subtipo" : (sub?.label ?? "Selecione o subtipo")}
              </SelectValue>
            </SelectTrigger>
            <CrmSelectContent>
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
        <div className="grid min-w-0 gap-3 border-t border-[#edf0f4] pt-4 sm:grid-cols-2">
          {placeholderKeys.map((key) => {
            const wide =
              key.trim() === PROPOSTA_PLACEHOLDER_RESUMO_PROCESSO || isHorasMesPlaceholderKey(key);
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
  const isNome = k === ESCOPO_PLACEHOLDER_NOME_EMPRESA;
  const isProc = isNumeroProcessoPlaceholderKey(k);
  const isHorasMes = isHorasMesPlaceholderKey(k);
  const isResumo = k === PROPOSTA_PLACEHOLDER_RESUMO_PROCESSO;
  const forceUpper = ESCOPO_PLACEHOLDER_UPPERCASE.has(k);
  const fieldLabel = getPropostaPlaceholderLabel(k);
  const horasPreview = isHorasMes && value.trim() ? formatHorasMesForMerge(value) : null;

  return (
    <div className="min-w-0 space-y-1.5">
      <Label className="text-xs font-bold leading-snug text-slate-500">{fieldLabel}</Label>
      {isResumo ? (
        <Textarea
          className="min-h-[120px] max-w-full resize-y border-[#dfe5ee] bg-[#fbfcfd] text-sm shadow-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Texto livre do resumo do processo"
          rows={5}
        />
      ) : (
        <Input
          className="h-10 max-w-full border-[#dfe5ee] bg-[#fbfcfd] shadow-sm"
          value={value}
          onChange={(e) => {
            let next = e.target.value;
            if (isHorasMes) next = next.replace(/\D/g, "").slice(0, 4);
            else if (isProc) next = maskNumeroProcessoCNJ(next);
            else if (forceUpper) next = next.toLocaleUpperCase("pt-BR");
            onChange(next);
          }}
          placeholder={
            isNome
              ? "Preenchido pela empresa principal na proposta (pode editar)"
              : isHorasMes
                ? "Ex.: 12"
                : `Texto para «${fieldLabel}»`
          }
          inputMode={isProc || isHorasMes ? "numeric" : "text"}
          autoComplete="off"
        />
      )}
      {horasPreview ? (
        <p className="text-[11px] leading-relaxed text-slate-500">
          Na proposta: <span className="font-semibold text-[#24615b]">{horasPreview}</span>
        </p>
      ) : null}
    </div>
  );
}
