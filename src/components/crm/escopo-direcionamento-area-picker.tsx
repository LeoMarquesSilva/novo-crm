"use client";

import { Check, Compass } from "lucide-react";
import type { TipoDef } from "@/data/proposta-tipos-catalog";
import { Label } from "@/components/ui/label";
import { AreaIconLabel } from "@/lib/crm/area-lucide-icon";
import { cn } from "@/lib/utils";

type Props = {
  area: string;
  selected: boolean;
  tipos: TipoDef[];
  tipoIds: string[];
  disabled?: boolean;
  onToggleArea: () => void;
  onTipoIdsChange: (tipoIds: string[]) => void;
};

function normalizeSelectedIds(tipoIds: string[]): string[] {
  return [...new Set(tipoIds.map((id) => id.trim()).filter(Boolean))];
}

export function EscopoDirecionamentoAreaPicker({
  area,
  selected,
  tipos,
  tipoIds,
  disabled,
  onToggleArea,
  onTipoIdsChange,
}: Props) {
  const selectedIds = normalizeSelectedIds(tipoIds);

  const toggleTipo = (tipoId: string) => {
    if (disabled) return;
    const next = selectedIds.includes(tipoId)
      ? selectedIds.filter((id) => id !== tipoId)
      : [...selectedIds, tipoId];
    onTipoIdsChange(next);
  };

  const selectedLabels = tipos
    .filter((t) => selectedIds.includes(t.tipoId))
    .map((t) => t.label);

  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border bg-white transition-all duration-200",
        selected
          ? "border-[#24615b]/40 shadow-[0_4px_24px_rgba(36,97,91,0.08)] ring-1 ring-[#24615b]/15"
          : "border-[#e8ecf1] shadow-sm hover:border-[#c5cdd8]",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <button
        type="button"
        onClick={onToggleArea}
        disabled={disabled}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors",
          selected ? "bg-gradient-to-r from-[#f0f7f6] to-white" : "hover:bg-[#fafbfc]",
        )}
      >
        <AreaIconLabel area={area} size="md" className="min-w-0 flex-1" />
        {selected && selectedIds.length > 0 ? (
          <span className="shrink-0 rounded-full bg-[#24615b]/10 px-2 py-0.5 text-[10px] font-bold text-[#24615b]">
            {selectedIds.length} tipo{selectedIds.length !== 1 ? "s" : ""}
          </span>
        ) : null}
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            selected
              ? "border-[#24615b] bg-[#24615b] text-white"
              : "border-[#d1d9e3] bg-white text-transparent",
          )}
          aria-hidden
        >
          <Check className="size-3.5 stroke-[3]" />
        </span>
      </button>

      {selected && tipos.length > 0 ? (
        <div className="space-y-3 border-t border-[#e8ecf1] bg-[#f8fafc] px-4 py-3.5">
          <div className="flex items-start gap-2">
            <Compass className="mt-0.5 size-4 shrink-0 text-[#24615b]" aria-hidden />
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <Label className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#24615b]">
                  Tipos de escopo (múltipla escolha)
                </Label>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                  Toque para marcar ou desmarcar. Quem elaborar a proposta verá um escopo por tipo
                  selecionado.
                </p>
              </div>

              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label={`Tipos de escopo para ${area}`}
              >
                {tipos.map((t) => {
                  const active = selectedIds.includes(t.tipoId);
                  return (
                    <button
                      key={t.tipoId}
                      type="button"
                      disabled={disabled}
                      aria-pressed={active}
                      onClick={() => toggleTipo(t.tipoId)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-xs font-semibold transition-all duration-150",
                        active
                          ? "border-[#24615b] bg-[#24615b] text-white shadow-sm shadow-[#24615b]/20"
                          : "border-[#dfe5ee] bg-white text-[#374151] hover:border-[#24615b]/35 hover:bg-[#f0f7f6]",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded-full border",
                          active
                            ? "border-white/40 bg-white/20"
                            : "border-[#d1d9e3] bg-[#f8fafc]",
                        )}
                        aria-hidden
                      >
                        {active ? <Check className="size-2.5 stroke-[3]" /> : null}
                      </span>
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {selectedLabels.length > 0 ? (
                <p className="text-[11px] text-slate-500">
                  <span className="font-semibold text-[#24615b]">Selecionados:</span>{" "}
                  {selectedLabels.join(" · ")}
                </p>
              ) : (
                <p className="text-[11px] font-medium text-amber-800/90">
                  Selecione pelo menos um tipo para esta área.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {selected && tipos.length === 0 ? (
        <p className="border-t border-amber-200/80 bg-amber-50/90 px-4 py-2.5 text-xs leading-relaxed text-amber-900">
          Nenhum tipo de escopo cadastrado para esta área. Configure em Admin → Catálogo de escopos.
        </p>
      ) : null}
    </article>
  );
}
