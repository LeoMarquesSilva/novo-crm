"use client";

import type { AiProvenanceItem } from "@/lib/contract-import/ai-provenance";
import { provenanceFieldStep } from "@/lib/contract-import/ai-provenance";

export const PROVENANCE_FIELD_LABELS: Record<string, string> = {
  groupName: "Grupo",
  clientId: "Cliente",
  startsAt: "Início da vigência",
  signedAt: "Data de assinatura",
  indefinite: "Prazo indeterminado",
  dueDay: "Dia de vencimento",
  firstInvoiceAt: "Primeiro vencimento",
  firstInvoiceConditioned: "Vencimento condicionado",
  adjustmentIndex: "Índice de reajuste",
  taxMode: "Tributos",
  areas: "Áreas",
  components: "Componentes de cobrança",
  allocations: "Rateio por área",
};

export function uniqueProvenanceForStep(items: AiProvenanceItem[], step: number): AiProvenanceItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (provenanceFieldStep(item.field) !== step) return false;
    if (seen.has(item.field)) return false;
    seen.add(item.field);
    return true;
  });
}

export function uniqueProvenance(items: AiProvenanceItem[]): AiProvenanceItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.field)) return false;
    seen.add(item.field);
    return true;
  });
}

export function AiFieldHint({
  item,
  altered,
}: {
  item?: AiProvenanceItem;
  altered?: boolean;
}) {
  if (!item?.quote) return null;
  const sourceLabel = item.source === "sioe" ? "SIOE" : "IA a partir do PDF";
  return (
    <p className="mt-1 rounded-(--radius-v2-md) border border-info-border bg-info-bg px-2.5 py-1.5 text-xs font-normal leading-snug text-info-text">
      <span className="font-medium">
        {sourceLabel}
        {altered ? " · alterado na revisão" : ""}
      </span>
      {item.clause ? <span className="text-neutral-600"> · {item.clause}</span> : null}
      <span className="mt-0.5 block italic">“{item.quote}”</span>
    </p>
  );
}

export function ConferirEtapaPanel({
  items,
  reviewedFieldKeys,
  disabled,
  onToggle,
}: {
  items: AiProvenanceItem[];
  reviewedFieldKeys: string[];
  disabled?: boolean;
  onToggle: (field: string, reviewed: boolean) => void;
}) {
  if (items.length === 0) return null;
  const reviewed = new Set(reviewedFieldKeys);
  return (
    <section className="mt-5 rounded-(--radius-v2-lg) border border-neutral-200 bg-neutral-50 p-4">
      <h4 className="text-sm font-semibold text-neutral-900">Conferir etapa</h4>
      <p className="mt-1 text-xs text-neutral-500">
        Marque o que conferiu no PDF. Isso não bloqueia salvar nem ativar.
      </p>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.field}>
            <label className="flex items-start gap-2 text-sm text-neutral-800">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={reviewed.has(item.field)}
                disabled={disabled}
                onChange={(event) => onToggle(item.field, event.target.checked)}
              />
              <span>
                <span className="font-medium">{PROVENANCE_FIELD_LABELS[item.field] ?? item.field}</span>
                <span className="text-neutral-500">
                  {item.source === "sioe" ? " · SIOE" : " · IA"}
                  {reviewed.has(item.field) ? " · conferido" : ""}
                </span>
                <span className="mt-0.5 block italic text-neutral-600">“{item.quote}”</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function UnreviewedSummary({
  items,
  reviewedFieldKeys,
  onGoToStep,
}: {
  items: AiProvenanceItem[];
  reviewedFieldKeys: string[];
  onGoToStep: (step: number) => void;
}) {
  const pending = uniqueProvenance(items).filter((item) => !reviewedFieldKeys.includes(item.field));
  if (items.length === 0) return null;
  if (pending.length === 0) {
    return (
      <p className="rounded-(--radius-v2-lg) border border-success-border bg-success-bg px-3 py-2 text-sm text-success-text">
        Todos os campos importados foram conferidos. A ativação continua opcional.
      </p>
    );
  }
  return (
    <section className="rounded-(--radius-v2-lg) border border-amber-200 bg-amber-50 p-4">
      <h4 className="text-sm font-semibold text-amber-950">Ainda não conferido</h4>
      <p className="mt-1 text-xs text-amber-800">
        {pending.length} campo(s) sem visto. Isso não impede ativar.
      </p>
      <ul className="mt-2 space-y-1 text-sm text-amber-950">
        {pending.map((item) => (
          <li key={item.field}>
            <button
              type="button"
              className="underline-offset-2 hover:underline"
              onClick={() => onGoToStep(provenanceFieldStep(item.field))}
            >
              {PROVENANCE_FIELD_LABELS[item.field] ?? item.field}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
