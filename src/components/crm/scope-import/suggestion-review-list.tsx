"use client";

import { useMemo } from "react";
import type { ProposalCatalogAdminData } from "@/lib/crm/proposal-catalog-db";
import type { ScopeImportBatchState } from "./scope-import-shell";
import { SuggestionCard } from "./suggestion-card";

type Props = {
  batchId?: string;
  state: ScopeImportBatchState;
  catalog: ProposalCatalogAdminData;
  onUpdated: () => void;
  combined?: boolean;
  batchCount?: number;
  decidedCount?: number;
};

export function SuggestionReviewList({
  state,
  catalog,
  onUpdated,
  combined = false,
  batchCount = 0,
  decidedCount = 0,
}: Props) {
  const pending = state.suggestions.filter((s) => s.status === "pendente");
  const decided = state.suggestions.filter((s) => s.status !== "pendente");

  const grouped = useMemo(() => {
    const map = new Map<string, typeof pending>();
    for (const item of pending) {
      const batchPrefix = combined ? `${item.batch_id.slice(0, 8)} · ` : "";
      const key = `${batchPrefix}${item.kind}::${item.area_key ?? "—"}`;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [pending, combined]);

  const totalDecided = combined ? decidedCount + decided.length : decided.length;

  return (
    <section className="space-y-4 rounded-[24px] border border-white/55 bg-white/72 p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-bold text-primary-dark">
          {combined ? "Revisão combinada — todos os lotes" : "3. Revisão e aprovação"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {pending.length} pendente(s), {totalDecided} já revisada(s).
          {combined && batchCount > 0 ? ` ${batchCount} lote(s) com sugestões.` : null}{" "}
          Aprovados entram no catálogo imediatamente.
        </p>
      </div>

      {grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {combined
            ? "Nenhuma sugestão pendente em todos os lotes."
            : "Nenhuma sugestão pendente neste lote."}
        </p>
      ) : (
        grouped.map(([groupKey, items]) => (
          <div key={groupKey} className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-primary-dark/70">{groupKey}</h3>
            {items.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                catalog={catalog}
                showBatchLabel={combined}
                onUpdated={onUpdated}
              />
            ))}
          </div>
        ))
      )}
    </section>
  );
}
