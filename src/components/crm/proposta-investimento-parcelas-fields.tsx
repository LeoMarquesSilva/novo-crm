"use client";

import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PropostaBrlCurrencyInput } from "@/components/crm/proposta-brl-currency-input";
import { displayBrlCurrencyField } from "@/lib/crm/proposta-valor-brl-extenso";
import {
  buildParcelasPlaceholdersPatch,
  getParcelaValues,
  getParcelaVencimentos,
  getParcelasModo,
  parseParcelasCount,
} from "@/lib/crm/proposta-investimento-parcelas";
import { PROPOSTA_INVESTIMENTO_PLACEHOLDER_CURRENCY } from "@/lib/crm/proposta-escopo-preview";

type Props = {
  placeholders: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
};

export function PropostaInvestimentoParcelasFields({ placeholders, onChange }: Props) {
  const count = parseParcelasCount(placeholders);
  const modo = getParcelasModo(placeholders);
  const valores = useMemo(() => getParcelaValues(placeholders), [placeholders]);
  const vencimentos = useMemo(() => getParcelaVencimentos(placeholders), [placeholders]);

  function patch(p: Parameters<typeof buildParcelasPlaceholdersPatch>[1]) {
    onChange(buildParcelasPlaceholdersPatch(placeholders, p));
  }

  return (
    <div className="col-span-full space-y-4 rounded-2xl border border-[#dfe5ee] bg-[#f8fafc] p-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#24615b]">Parcelas</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Preencha primeiro o valor total (SPOT) acima. Depois informe quantas parcelas, os valores e
          quando cada uma será paga (ex.: na data de assinatura do Contrato).
        </p>
      </div>

      <div className="grid gap-3 sm:max-w-xs">
        <Label className="text-xs font-bold text-slate-500">Número de parcelas</Label>
        <Input
          type="number"
          min={0}
          max={60}
          value={placeholders.PARCELAS ?? ""}
          onChange={(e) => {
            const n = Math.max(0, Math.min(60, Number(e.target.value) || 0));
            const nextCount = n;
            const curV = getParcelaVencimentos(placeholders);
            const sizedV = Array.from({ length: nextCount }, (_, i) => curV[i] ?? "");
            if (modo === "distintas") {
              const cur = getParcelaValues(placeholders);
              const sized = Array.from({ length: nextCount }, (_, i) => cur[i] ?? "");
              patch({ count: nextCount, modo: "distintas", valoresDistintos: sized, vencimentos: sizedV });
            } else {
              patch({ count: nextCount, modo: "iguais", vencimentos: sizedV });
            }
          }}
          className="h-10 border-[#dfe5ee] bg-white shadow-sm"
          placeholder="0 = só à vista"
        />
      </div>

      {count > 0 ? (
        <>
          <div className="flex flex-wrap gap-2">
            <ModoButton
              active={modo === "iguais"}
              onClick={() => {
                const cur = getParcelaValues(placeholders);
                patch({
                  modo: "iguais",
                  count,
                  valorIgual: placeholders.VALORPARCELA?.trim() || cur[0] || "",
                  vencimentos,
                });
              }}
            >
              Valores iguais
            </ModoButton>
            <ModoButton
              active={modo === "distintas"}
              onClick={() => {
                const cur =
                  getParcelasModo(placeholders) === "iguais"
                    ? Array.from({ length: count }, () => placeholders.VALORPARCELA ?? "")
                    : getParcelaValues(placeholders);
                patch({ modo: "distintas", count, valoresDistintos: cur, vencimentos });
              }}
            >
              Valor por parcela
            </ModoButton>
          </div>

          {modo === "iguais" ? (
            <div className="space-y-1.5 sm:max-w-sm">
              <Label className="text-xs font-bold text-slate-500">Valor de cada parcela</Label>
              <PropostaBrlCurrencyInput
                value={placeholders.VALORPARCELA ?? ""}
                onChange={(next) => patch({ modo: "iguais", count, valorIgual: next, vencimentos })}
              />
            </div>
          ) : null}

          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-600">Vencimento / condição de cada parcela</p>
            <div className="grid gap-4">
              {Array.from({ length: count }, (_, i) => (
                <div
                  key={i}
                  className="grid gap-3 rounded-xl border border-[#e8ecf1] bg-white p-3 sm:grid-cols-2"
                >
                  {modo === "distintas" ? (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-500">{i + 1}ª parcela — valor</Label>
                      <PropostaBrlCurrencyInput
                        value={valores[i] ?? ""}
                        onChange={(next) => {
                          const nextValores = [...valores];
                          nextValores[i] = next;
                          patch({ modo: "distintas", count, valoresDistintos: nextValores, vencimentos });
                        }}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center text-xs text-slate-500 sm:col-span-1">
                      <span>
                        <span className="font-bold text-slate-700">{i + 1}ª parcela</span>
                        {valores[i]?.trim()
                          ? ` — ${displayBrlCurrencyField(valores[i])}`
                          : " — mesmo valor informado acima"}
                      </span>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-500">
                      {i + 1}ª parcela — quando / condição
                    </Label>
                    <Textarea
                      value={vencimentos[i] ?? ""}
                      rows={2}
                      onChange={(e) => {
                        const next = [...vencimentos];
                        next[i] = e.target.value;
                        patch({
                          modo,
                          count,
                          ...(modo === "distintas" ? { valoresDistintos: valores } : {}),
                          vencimentos: next,
                        });
                      }}
                      className="min-h-[4.5rem] resize-y border-[#dfe5ee] bg-white text-sm leading-relaxed shadow-sm"
                      placeholder={
                        i === 0
                          ? "Ex.: na data de assinatura do Contrato"
                          : "Ex.: na data de entrega dos documentos"
                      }
                      spellCheck
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Com 0 parcelas, o texto da proposta considera apenas pagamento à vista (sem trecho de parcelas).
        </p>
      )}
    </div>
  );
}

function ModoButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
        active
          ? "border-[#24615b] bg-[#24615b] text-white shadow-sm"
          : "border-[#dfe5ee] bg-white text-slate-600 hover:border-[#24615b]/30",
      )}
    >
      {children}
    </button>
  );
}

/** Chaves de investimento que o bloco de parcelas substitui na grelha genérica. */
export function filterInvestimentoPlaceholderKeys(keys: string[]): string[] {
  return keys.filter((k) => {
    const key = k.trim();
    if (key === "PARCELAS" || key === "VALORPARCELA") return false;
    if (key === "PARCELAS_IGUAIS" || key === "PARCELAS_VALORES" || key === "PARCELAS_VENCIMENTOS")
      return false;
    if (key === "DETALHEPARCELAS") return false;
    return true;
  });
}

export function isInvestimentoCurrencyKey(key: string): boolean {
  return PROPOSTA_INVESTIMENTO_PLACEHOLDER_CURRENCY.has(key);
}
