"use client";

import { useMemo } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger } from "@/components/ui/select";
import { CrmSelectContent, CrmSelectItem, CrmSelectValue } from "@/components/crm/crm-select";
import { PropostaBrlCurrencyInput } from "@/components/crm/proposta-brl-currency-input";
import {
  PROPOSTA_INVESTIMENTO_TIPOS_CATALOG,
  type InvestimentoTipoDef,
} from "@/data/proposta-investimento-catalog";
import type { PropostaInvestimentoDocumentoItem } from "@/data/proposta-tipos-catalog";
import { findInvestmentSubtype } from "@/lib/crm/proposal-catalog-utils";
import { investmentSubtypeHasParcelas } from "@/lib/crm/proposta-investimento-parcelas";
import {
  filterInvestimentoPlaceholderKeys,
  isInvestimentoCurrencyKey,
  PropostaInvestimentoParcelasFields,
} from "@/components/crm/proposta-investimento-parcelas-fields";
import { getPropostaPlaceholderLabel } from "@/lib/crm/proposta-placeholder-labels";
import {
  collectDistinctInvestimentoSubtipos,
  createEmptyInvestimentoDocumentoItem,
  documentoFromItems,
  getInvestimentoDocumentoItems,
  getPrimarySumKeyForSubtipo,
  resolveInvestimentoDocumento,
  sumInvestimentoAreas,
} from "@/lib/crm/proposta-investimento-consolidado";
import {
  parseEscopoJsonWithMeta,
  parseAreasList,
  stringifyEscopoJsonWithMeta,
} from "@/lib/crm/proposta-escopo-json";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const SELECT_EMPTY = "__crm_inv_doc_none__";

type Props = {
  escopoJson: string;
  areasDisplay: string;
  investmentCatalog?: InvestimentoTipoDef[];
  disabled?: boolean;
  onEscopoJsonChange: (json: string) => void;
};

export function PropostaInvestimentoConsolidadoForm({
  escopoJson,
  areasDisplay,
  investmentCatalog = PROPOSTA_INVESTIMENTO_TIPOS_CATALOG,
  disabled = false,
  onEscopoJsonChange,
}: Props) {
  const areas = useMemo(() => parseAreasList(areasDisplay), [areasDisplay]);
  const parsed = useMemo(() => parseEscopoJsonWithMeta(escopoJson), [escopoJson]);
  const escopo = parsed.escopo;

  const resolved = useMemo(
    () => resolveInvestimentoDocumento(escopo, areas, parsed.investimentoDocumento, investmentCatalog),
    [escopo, areas, parsed.investimentoDocumento, investmentCatalog],
  );

  const sumTotal = useMemo(
    () => sumInvestimentoAreas(escopo, areas, investmentCatalog),
    [escopo, areas, investmentCatalog],
  );

  const distinctSubtipos = useMemo(
    () => collectDistinctInvestimentoSubtipos(escopo, areas),
    [escopo, areas],
  );

  const items = useMemo(() => {
    const list = getInvestimentoDocumentoItems(resolved);
    return list.length > 0 ? list : [createEmptyInvestimentoDocumentoItem()];
  }, [resolved]);

  function persistItems(nextItems: PropostaInvestimentoDocumentoItem[]) {
    const raw =
      documentoFromItems(nextItems.length > 0 ? nextItems : [createEmptyInvestimentoDocumentoItem()]) ??
      documentoFromItems([createEmptyInvestimentoDocumentoItem()]);
    if (!raw) return;
    const resolvedDoc = resolveInvestimentoDocumento(escopo, areas, raw, investmentCatalog) ?? raw;
    onEscopoJsonChange(stringifyEscopoJsonWithMeta(escopo, resolvedDoc));
  }

  function patchItem(itemId: string, patch: Partial<PropostaInvestimentoDocumentoItem>) {
    persistItems(items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
  }

  if (areas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Selecione ao menos uma área em «Objeto» para configurar o investimento consolidado.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {distinctSubtipos.length > 1 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          As áreas usam subtipos de investimento diferentes ({distinctSubtipos.join(", ")}). Cada
          forma abaixo entra no documento.
        </p>
      ) : null}

      <div className="rounded-xl border border-[#dfe5ee] bg-[#f8fafc] px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Soma das áreas</p>
        <p className="mt-1 text-lg font-bold text-primary-dark">
          {sumTotal > 0
            ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(sumTotal)
            : "—"}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Usada no valor da primeira forma com campo monetário principal, quando a soma automática
          estiver ligada.
        </p>
      </div>

      <div className="space-y-3 border-t border-[#edf0f4] pt-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#24615b]">
            Forma de pagamento
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Pode haver mais de uma. Tipo e subtipo vêm do catálogo de investimento. As alterações
            entram no rascunho — use Salvar, Gerar Word ou Gerar PDF para gravar.
          </p>
        </div>

        {investmentCatalog.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum modelo de investimento no catálogo. Cadastre tipos e subtipos em Escopo e
            investimento.
          </p>
        ) : (
          <div className="space-y-4">
            {items.map((item, index) => (
              <InvestimentoFormaCard
                key={item.id}
                index={index}
                item={item}
                canRemove={items.length > 1}
                investmentCatalog={investmentCatalog}
                disabled={disabled}
                onPatch={(patch) => patchItem(item.id, patch)}
                onRemove={() => persistItems(items.filter((entry) => entry.id !== item.id))}
                onRecalcAutoSum={() =>
                  patchItem(item.id, {
                    autoSum: true,
                    placeholders: { ...item.placeholders },
                  })
                }
              />
            ))}
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2 border-dashed border-[#24615b]/35 text-[#24615b] hover:bg-[#24615b]/5"
              disabled={disabled}
              onClick={() => persistItems([...items, createEmptyInvestimentoDocumentoItem()])}
            >
              <Plus className="size-4" aria-hidden />
              Adicionar outra forma de pagamento
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function InvestimentoFormaCard({
  index,
  item,
  canRemove,
  investmentCatalog,
  disabled,
  onPatch,
  onRemove,
  onRecalcAutoSum,
}: {
  index: number;
  item: PropostaInvestimentoDocumentoItem;
  canRemove: boolean;
  investmentCatalog: InvestimentoTipoDef[];
  disabled: boolean;
  onPatch: (patch: Partial<PropostaInvestimentoDocumentoItem>) => void;
  onRemove: () => void;
  onRecalcAutoSum: () => void;
}) {
  const invTipoSel = investmentCatalog.find((t) => t.tipoId === item.tipoId);
  const invSubDef =
    item.tipoId && item.subtipoId
      ? findInvestmentSubtype(investmentCatalog, item.tipoId, item.subtipoId)
      : undefined;
  const invPlaceholderKeys = invSubDef?.placeholderKeys ?? [];
  const invKeysGeneric = filterInvestimentoPlaceholderKeys(invPlaceholderKeys);
  const primarySumKey = item.subtipoId ? getPrimarySumKeyForSubtipo(item.subtipoId) : null;
  const extraPaymentKeys = invKeysGeneric.filter((key) => key !== primarySumKey);
  const showParcelasBlock = investmentSubtypeHasParcelas(invPlaceholderKeys);
  const autoSum = item.autoSum !== false;
  const tipoSelectValue = item.tipoId ? item.tipoId : SELECT_EMPTY;
  const subtipoSelectValue = item.subtipoId ? item.subtipoId : SELECT_EMPTY;
  const tipoLabels = {
    [SELECT_EMPTY]: "Selecione o tipo",
    ...Object.fromEntries(investmentCatalog.map((t) => [t.tipoId, t.label])),
  };
  const subtipoLabels = {
    [SELECT_EMPTY]: "Selecione o subtipo",
    ...Object.fromEntries((invTipoSel?.subtipos ?? []).map((s) => [s.subtipoId, s.label])),
  };

  return (
    <div className="space-y-3 rounded-xl border border-[#dfe5ee] bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Forma {index + 1}
        </p>
        {canRemove ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-xs text-rose-600 hover:text-rose-700"
            disabled={disabled}
            onClick={onRemove}
          >
            <Trash2 className="size-3.5" aria-hidden />
            Remover
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Tipo</Label>
          <Select
            value={tipoSelectValue}
            disabled={disabled}
            onValueChange={(v) => {
              const tipoId = v === SELECT_EMPTY || v == null ? "" : v;
              onPatch({ tipoId, subtipoId: "", placeholders: {}, autoSum: true });
            }}
          >
            <SelectTrigger className="h-10 border-[#dfe5ee] bg-white shadow-sm">
              <CrmSelectValue
                value={tipoSelectValue}
                labels={tipoLabels}
                placeholder="Selecione o tipo"
              />
            </SelectTrigger>
            <CrmSelectContent inModal>
              <CrmSelectItem value={SELECT_EMPTY}>Selecione o tipo</CrmSelectItem>
              {investmentCatalog.map((t) => (
                <CrmSelectItem key={t.tipoId} value={t.tipoId}>
                  {t.label}
                </CrmSelectItem>
              ))}
            </CrmSelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Subtipo</Label>
          <Select
            value={subtipoSelectValue}
            disabled={disabled || !item.tipoId}
            onValueChange={(v) => {
              const subtipoId = v === SELECT_EMPTY || v == null ? "" : v;
              onPatch({ subtipoId, placeholders: {}, autoSum: true });
            }}
          >
            <SelectTrigger className="h-10 border-[#dfe5ee] bg-white shadow-sm">
              <CrmSelectValue
                value={subtipoSelectValue}
                labels={subtipoLabels}
                placeholder="Selecione o subtipo"
              />
            </SelectTrigger>
            <CrmSelectContent inModal>
              <CrmSelectItem value={SELECT_EMPTY}>Selecione o subtipo</CrmSelectItem>
              {(invTipoSel?.subtipos ?? []).map((s) => (
                <CrmSelectItem key={s.subtipoId} value={s.subtipoId}>
                  {s.label}
                </CrmSelectItem>
              ))}
            </CrmSelectContent>
          </Select>
        </div>
      </div>

      {invSubDef?.conceito ? (
        <p className="rounded-2xl border border-[#edf0f4] bg-[#f8fafc] p-3 text-xs leading-relaxed text-slate-600">
          {invSubDef.conceito}
        </p>
      ) : null}

      {primarySumKey && invSubDef ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label className="text-xs font-bold text-slate-500">
              {getPropostaPlaceholderLabel(primarySumKey)}
            </Label>
            {!autoSum ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                disabled={disabled}
                onClick={onRecalcAutoSum}
              >
                <RefreshCw className="size-3.5" aria-hidden />
                Recalcular da soma das áreas
              </Button>
            ) : null}
          </div>
          <PropostaBrlCurrencyInput
            value={item.placeholders[primarySumKey] ?? ""}
            disabled={disabled}
            onChange={(next) =>
              onPatch({
                placeholders: { ...item.placeholders, [primarySumKey]: next },
                autoSum: false,
              })
            }
            className="h-10 border-[#dfe5ee] bg-white shadow-sm"
          />
        </div>
      ) : null}

      {extraPaymentKeys.map((key) => (
        <div key={key} className={cn("space-y-1.5", key.length > 20 && "sm:col-span-2")}>
          <Label className="text-xs font-bold text-slate-500">
            {getPropostaPlaceholderLabel(key)}
          </Label>
          {isInvestimentoCurrencyKey(key) ? (
            <PropostaBrlCurrencyInput
              value={item.placeholders[key] ?? ""}
              disabled={disabled}
              onChange={(next) =>
                onPatch({
                  placeholders: { ...item.placeholders, [key]: next },
                  autoSum: item.autoSum,
                })
              }
              className="h-10 border-[#dfe5ee] bg-white shadow-sm"
            />
          ) : key.includes("CONDIC") || key.includes("DETALHE") || key.includes("PRAZO") ? (
            <Textarea
              value={item.placeholders[key] ?? ""}
              disabled={disabled}
              rows={2}
              onChange={(e) =>
                onPatch({
                  placeholders: { ...item.placeholders, [key]: e.target.value },
                  autoSum: item.autoSum,
                })
              }
              className="min-h-[72px] border-[#dfe5ee] bg-white shadow-sm"
            />
          ) : (
            <Input
              value={item.placeholders[key] ?? ""}
              disabled={disabled}
              onChange={(e) =>
                onPatch({
                  placeholders: { ...item.placeholders, [key]: e.target.value },
                  autoSum: item.autoSum,
                })
              }
              className="h-10 border-[#dfe5ee] bg-white shadow-sm"
            />
          )}
        </div>
      ))}
      {showParcelasBlock ? (
        <PropostaInvestimentoParcelasFields
          placeholders={item.placeholders}
          onChange={(next) => onPatch({ placeholders: next, autoSum: item.autoSum })}
        />
      ) : null}
    </div>
  );
}
