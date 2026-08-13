"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProposalCatalogAdminData } from "@/lib/crm/proposal-catalog-db";
import { ImportUploadPanel } from "./import-upload-panel";
import { ImportProgressPanel } from "./import-progress-panel";
import { SuggestionReviewList } from "./suggestion-review-list";

export type ScopeImportDocument = {
  id: string;
  original_filename: string;
  status: string;
  error_message: string | null;
  page_count: number | null;
  extracted_chars: number | null;
};

export type ScopeImportSuggestionSource = {
  source: { id: string; extraction_id: string; suggestion_id: string };
  extraction: {
    id: string;
    raw_excerpt: string | null;
    normalized_template: string | null;
  } | null;
  document: { id: string; original_filename: string } | null;
};

export type ScopeImportSuggestion = {
  id: string;
  kind: string;
  status: string;
  area_key: string | null;
  type_label: string | null;
  subtype_label: string | null;
  conceito: string | null;
  template: string | null;
  original_template: string | null;
  placeholder_keys: string[];
  similar_existing: Array<{
    id: string;
    label: string;
    typeLabel: string;
    areaKey?: string;
    score: number;
  }>;
  confidence: number | null;
  sources: ScopeImportSuggestionSource[];
};

export type ScopeImportBatchState = {
  batch: {
    id: string;
    status: string;
    document_count: number;
    processed_count: number;
    error_count: number;
  };
  documents: ScopeImportDocument[];
  suggestions: ScopeImportSuggestion[];
};

type ScopeImportBatchSummary = {
  id: string;
  status: string;
  document_count: number;
  processed_count: number;
  error_count: number;
  created_at: string;
};

type Step = "upload" | "process" | "review";

type Props = {
  catalog: ProposalCatalogAdminData;
};

export function ScopeImportShell({ catalog }: Props) {
  const [batchId, setBatchId] = useState<string | null>(null);
  const [state, setState] = useState<ScopeImportBatchState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pastBatches, setPastBatches] = useState<ScopeImportBatchSummary[] | null>(null);

  const step: Step = useMemo(() => {
    if (!batchId || !state) return "upload";
    if (state.batch.status === "revisao" || state.batch.status === "concluido") return "review";
    if (["extraindo", "consolidando"].includes(state.batch.status)) return "process";
    if (state.documents.some((d) => d.status === "extraido" || d.status === "erro")) return "process";
    return "upload";
  }, [batchId, state]);

  const refreshBatch = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/scope-import/${encodeURIComponent(id)}`);
      const json = (await res.json()) as {
        ok?: boolean;
        data?: ScopeImportBatchState;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.error ?? "Falha ao carregar lote.");
      }
      setState(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar lote.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!batchId) return;
    if (step !== "review") return;
    const timer = setInterval(() => {
      void refreshBatch(batchId);
    }, 8000);
    return () => clearInterval(timer);
  }, [batchId, step, refreshBatch]);

  const loadPastBatches = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/scope-import");
      const json = (await res.json()) as {
        ok?: boolean;
        data?: ScopeImportBatchSummary[];
        error?: string;
      };
      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.error ?? "Falha ao listar lotes.");
      }
      setPastBatches(json.data);
    } catch {
      setPastBatches([]);
    }
  }, []);

  useEffect(() => {
    if (batchId) return;
    void loadPastBatches();
  }, [batchId, loadPastBatches]);

  function handleBatchCreated(id: string) {
    setBatchId(id);
    void refreshBatch(id);
  }

  function openBatch(id: string) {
    setBatchId(id);
    void refreshBatch(id);
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}

      {batchId ? (
        <button
          type="button"
          className="text-xs font-semibold text-primary-dark underline underline-offset-2"
          onClick={() => {
            setBatchId(null);
            setState(null);
            void loadPastBatches();
          }}
        >
          ← Ver todos os lotes
        </button>
      ) : null}

      {step === "upload" && !batchId && pastBatches && pastBatches.length > 0 ? (
        <section className="rounded-[24px] border border-white/55 bg-white/72 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-primary-dark">Lotes existentes</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Retome um lote já criado (upload, extração ou revisão em andamento).
          </p>
          <ul className="mt-4 space-y-2">
            {pastBatches.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => openBatch(b.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-primary-dark/10 bg-slate-50/80 px-4 py-3 text-left text-sm hover:bg-slate-100"
                >
                  <span className="font-semibold text-primary-dark">
                    Lote {b.id.slice(0, 8)} · {b.status}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {b.document_count} documento(s) · {b.processed_count} processado(s)
                    {b.error_count ? ` · ${b.error_count} erro(s)` : ""} ·{" "}
                    {new Date(b.created_at).toLocaleString("pt-BR")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {step === "upload" ? (
        <ImportUploadPanel
          batchId={batchId}
          state={state}
          loading={loading}
          onBatchCreated={handleBatchCreated}
          onConfirmed={(id) => {
            setBatchId(id);
            void refreshBatch(id);
          }}
        />
      ) : null}

      {step === "process" && batchId && state ? (
        <ImportProgressPanel
          batchId={batchId}
          state={state}
          loading={loading}
          onRefresh={() => void refreshBatch(batchId)}
          onConsolidated={() => void refreshBatch(batchId)}
        />
      ) : null}

      {step === "review" && batchId && state ? (
        <SuggestionReviewList
          batchId={batchId}
          state={state}
          catalog={catalog}
          onUpdated={() => void refreshBatch(batchId)}
        />
      ) : null}
    </div>
  );
}
