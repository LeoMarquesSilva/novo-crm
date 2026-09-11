"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CrmSelectContent, CrmSelectItem } from "@/components/crm/crm-select";
import { PropostaBrlCurrencyInput } from "@/components/crm/proposta-brl-currency-input";
import {
  PROPOSTA_INVESTIMENTO_TIPOS_CATALOG,
  type InvestimentoTipoDef,
} from "@/data/proposta-investimento-catalog";
import type { PropostaInvestimentoDocumento } from "@/data/proposta-tipos-catalog";
import { findInvestmentSubtype, investmentSubtypeFieldKeys } from "@/lib/crm/proposal-catalog-utils";
import { investmentSubtypeHasParcelas } from "@/lib/crm/proposta-investimento-parcelas";
import {
  filterInvestimentoPlaceholderKeys,
  isInvestimentoCurrencyKey,
  PropostaInvestimentoParcelasFields,
} from "@/components/crm/proposta-investimento-parcelas-fields";
import { getPropostaPlaceholderLabel } from "@/lib/crm/proposta-placeholder-labels";
import {
  collectDistinctInvestimentoSubtipos,
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
  fieldDefinitionId: string;
  leadId: string;
  investmentCatalog?: InvestimentoTipoDef[];
  disabled?: boolean;
  onEscopoJsonChange: (json: string) => void;
};

export function PropostaInvestimentoConsolidadoForm({
  escopoJson,
  areasDisplay,
  fieldDefinitionId,
  leadId,
  investmentCatalog = PROPOSTA_INVESTIMENTO_TIPOS_CATALOG,
  disabled = false,
  onEscopoJsonChange,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPersistRef = useRef<PropostaInvestimentoDocumento | null>(null);
  const escopoJsonRef = useRef(escopoJson);

  useEffect(() => {
    escopoJsonRef.current = escopoJson;
  }, [escopoJson]);

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

  const doc = resolved ?? {
    tipoId: "",
    subtipoId: "",
    placeholders: {},
    autoSum: true as const,
  };

  const invTipoSel = investmentCatalog.find((t) => t.tipoId === doc.tipoId);
  const invSubDef =
    doc.tipoId && doc.subtipoId
      ? findInvestmentSubtype(investmentCatalog, doc.tipoId, doc.subtipoId)
      : undefined;
  const invPlaceholderKeys = investmentSubtypeFieldKeys(invSubDef);
  const invKeysGeneric = filterInvestimentoPlaceholderKeys(invPlaceholderKeys);
  const primarySumKey = doc.subtipoId ? getPrimarySumKeyForSubtipo(doc.subtipoId) : null;
  const showParcelasBlock = investmentSubtypeHasParcelas(invPlaceholderKeys);
  const autoSum = doc.autoSum !== false;

  function applyDoc(next: PropostaInvestimentoDocumento) {
    const json = stringifyEscopoJsonWithMeta(escopo, next);
    onEscopoJsonChange(json);
    return json;
  }

  async function flushPersistDoc(next: PropostaInvestimentoDocumento) {
    const { escopo: latestEscopo } = parseEscopoJsonWithMeta(escopoJsonRef.current);
    const json = stringifyEscopoJsonWithMeta(latestEscopo, next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipelineField: { fieldDefinitionId, value: json },
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Não foi possível salvar o investimento.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
      pendingPersistRef.current = null;
    }
  }

  function schedulePersistDoc(next: PropostaInvestimentoDocumento) {
    pendingPersistRef.current = next;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      const pending = pendingPersistRef.current;
      if (pending) void flushPersistDoc(pending);
    }, 650);
  }

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, []);

  function persistDoc(next: PropostaInvestimentoDocumento) {
    applyDoc(next);
    schedulePersistDoc(next);
  }

  function patchDoc(patch: Partial<PropostaInvestimentoDocumento>) {
    const merged: PropostaInvestimentoDocumento = {
      tipoId: patch.tipoId ?? doc.tipoId,
      subtipoId: patch.subtipoId ?? doc.subtipoId,
      placeholders: patch.placeholders ?? { ...doc.placeholders },
      autoSum: patch.autoSum ?? doc.autoSum,
    };
    persistDoc(merged);
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
          As áreas usam subtipos de investimento diferentes ({distinctSubtipos.join(", ")}). O
          documento usará o subtipo selecionado abaixo.
        </p>
      ) : null}

      <div className="rounded-xl border border-[#dfe5ee] bg-[#f8fafc] px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Soma das áreas</p>
        <p className="mt-1 text-lg font-bold text-primary-dark">
          {sumTotal > 0
            ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(sumTotal)
            : "—"}
        </p>
        {autoSum ? (
          <p className="mt-1 text-xs text-slate-500">
            O valor total no documento acompanha esta soma automaticamente.
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-500">Valor manual — não acompanha alterações nas áreas.</p>
        )}
      </div>

      <div className="grid gap-3">
        <div className="min-w-0 space-y-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Tipo</Label>
          <Select
            value={doc.tipoId ? doc.tipoId : SELECT_EMPTY}
            disabled={disabled || saving}
            onValueChange={(v) => {
              const tipoId = v === SELECT_EMPTY || v == null ? "" : v;
              patchDoc({ tipoId, subtipoId: "", placeholders: {}, autoSum: true });
            }}
          >
            <SelectTrigger className="h-10 w-full min-w-0 border-[#dfe5ee] bg-white shadow-sm">
              <SelectValue placeholder="Tipo de investimento">
                {!doc.tipoId ? "Tipo de investimento" : (invTipoSel?.label ?? doc.tipoId)}
              </SelectValue>
            </SelectTrigger>
            <CrmSelectContent>
              <CrmSelectItem value={SELECT_EMPTY}>Selecione</CrmSelectItem>
              {investmentCatalog.map((t) => (
                <CrmSelectItem key={t.tipoId} value={t.tipoId}>
                  {t.label}
                </CrmSelectItem>
              ))}
            </CrmSelectContent>
          </Select>
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Subtipo</Label>
          <Select
            value={doc.subtipoId ? doc.subtipoId : SELECT_EMPTY}
            disabled={disabled || saving || !doc.tipoId}
            onValueChange={(v) => {
              const subtipoId = v === SELECT_EMPTY || v == null ? "" : v;
              patchDoc({ subtipoId, placeholders: {}, autoSum: true });
            }}
          >
            <SelectTrigger className="h-10 w-full min-w-0 border-[#dfe5ee] bg-white shadow-sm">
              <SelectValue placeholder="Selecione o subtipo">
                {!doc.subtipoId
                  ? "Selecione o subtipo"
                  : (invTipoSel?.subtipos.find((s) => s.subtipoId === doc.subtipoId)?.label ??
                    doc.subtipoId)}
              </SelectValue>
            </SelectTrigger>
            <CrmSelectContent>
              <CrmSelectItem value={SELECT_EMPTY}>Selecione</CrmSelectItem>
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
        <p className="rounded-2xl border border-[#edf0f4] bg-white p-3 text-xs leading-relaxed text-slate-600">
          {invSubDef.conceito}
        </p>
      ) : null}

      {primarySumKey && invSubDef ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label className="text-xs font-bold text-slate-500">
              {getPropostaPlaceholderLabel(primarySumKey)} (total no documento)
            </Label>
            {!autoSum ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                disabled={disabled || saving}
                onClick={() => {
                  const recalc = resolveInvestimentoDocumento(escopo, areas, {
                    ...doc,
                    autoSum: true,
                  }, investmentCatalog);
                  if (recalc) void persistDoc(recalc);
                }}
              >
                <RefreshCw className="size-3.5" aria-hidden />
                Recalcular da soma das áreas
              </Button>
            ) : null}
          </div>
          <PropostaBrlCurrencyInput
            value={doc.placeholders[primarySumKey] ?? ""}
            disabled={disabled || saving}
            onChange={(next) => {
              const manual = resolveInvestimentoDocumento(escopo, areas, {
                ...doc,
                placeholders: { ...doc.placeholders, [primarySumKey]: next },
                autoSum: false,
              }, investmentCatalog);
              if (manual) void persistDoc(manual);
            }}
            className="h-10 border-[#dfe5ee] bg-white shadow-sm"
          />
        </div>
      ) : null}

      {invSubDef && (showParcelasBlock || invKeysGeneric.length > 0) ? (
        <div className="space-y-3 border-t border-[#edf0f4] pt-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#24615b]">
            Forma de pagamento
          </p>
          {invKeysGeneric
            .filter((key) => key !== primarySumKey)
            .map((key) => (
              <div key={key} className={cn("space-y-1.5", key.length > 20 && "sm:col-span-2")}>
                <Label className="text-xs font-bold text-slate-500">
                  {getPropostaPlaceholderLabel(key)}
                </Label>
                {isInvestimentoCurrencyKey(key) ? (
                  <PropostaBrlCurrencyInput
                    value={doc.placeholders[key] ?? ""}
                    disabled={disabled || saving}
                    onChange={(next) =>
                      patchDoc({
                        placeholders: { ...doc.placeholders, [key]: next },
                        autoSum: doc.autoSum,
                      })
                    }
                    className="h-10 border-[#dfe5ee] bg-white shadow-sm"
                  />
                ) : key.includes("CONDIC") || key.includes("DETALHE") || key.includes("PRAZO") ? (
                  <Textarea
                    value={doc.placeholders[key] ?? ""}
                    disabled={disabled || saving}
                    rows={2}
                    onChange={(e) =>
                      patchDoc({
                        placeholders: { ...doc.placeholders, [key]: e.target.value },
                        autoSum: doc.autoSum,
                      })
                    }
                    className="min-h-[72px] border-[#dfe5ee] bg-white shadow-sm"
                  />
                ) : (
                  <Input
                    value={doc.placeholders[key] ?? ""}
                    disabled={disabled || saving}
                    onChange={(e) =>
                      patchDoc({
                        placeholders: { ...doc.placeholders, [key]: e.target.value },
                        autoSum: doc.autoSum,
                      })
                    }
                    className="h-10 border-[#dfe5ee] bg-white shadow-sm"
                  />
                )}
              </div>
            ))}
          {showParcelasBlock ? (
            <PropostaInvestimentoParcelasFields
              placeholders={doc.placeholders}
              onChange={(next) =>
                patchDoc({ placeholders: next, autoSum: doc.autoSum })
              }
            />
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {saving ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Salvando investimento…
        </p>
      ) : null}
    </div>
  );
}
