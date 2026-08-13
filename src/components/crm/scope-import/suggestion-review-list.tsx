"use client";

import { useMemo } from "react";
import type { ProposalCatalogAdminData } from "@/lib/crm/proposal-catalog-db";
import type { ScopeImportBatchState } from "./scope-import-shell";
import { SuggestionCard } from "./suggestion-card";

type Props = {
  batchId: string;
  state: ScopeImportBatchState;
  catalog: ProposalCatalogAdminData;
  onUpdated: () => void;
};

export function SuggestionReviewList({ state, catalog, onUpdated }: Props) {
  const pending = state.suggestions.filter((s) => s.status === "pendente");
  const decided = state.suggestions.filter((s) => s.status !== "pendente");

  const grouped = useMemo(() => {
    const map = new Map<string, typeof pending>();
    for (const item of pending) {
      const key = `${item.kind}::${item.area_key ?? "—"}`;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [pending]);

  return (
    <section className="space-y-4 rounded-[24px] border border-white/55 bg-white/72 p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-bold text-primary-dark">3. Revisão e aprovação</h2>
        <p className="text-sm text-muted-foreground">
          {pending.length} pendente(s), {decided.length} já revisada(s). Aprovados entram no catálogo
          imediatamente.
        </p>
      </div>

      {grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma sugestão pendente neste lote.</p>
      ) : (
        grouped.map(([groupKey, items]) => (
          <div key={groupKey} className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-primary-dark/70">{groupKey}</h3>
            {items.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                catalog={catalog}
                onUpdated={onUpdated}
              />
            ))}
          </div>
        ))
      )}
    </section>
  );
}
