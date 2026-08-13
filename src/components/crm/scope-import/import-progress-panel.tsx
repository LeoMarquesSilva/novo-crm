"use client";

import { useState } from "react";
import { Loader2, Pause, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ScopeImportBatchState } from "./scope-import-shell";

type Props = {
  batchId: string;
  state: ScopeImportBatchState;
  loading: boolean;
  onRefresh: () => void;
  onConsolidated: () => void;
};

export function ImportProgressPanel({ batchId, state, loading, onRefresh, onConsolidated }: Props) {
  const [processing, setProcessing] = useState(false);
  const [paused, setPaused] = useState(false);
  const [consolidating, setConsolidating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const total = state.documents.length;
  const doneCount = state.documents.filter((d) => d.status === "extraido" || d.status === "erro").length;
  const progressPct = total ? Math.round((doneCount / total) * 100) : 0;
  const canConsolidate =
    total > 0 &&
    state.documents.every((d) => d.status === "extraido" || d.status === "erro") &&
    state.batch.status !== "revisao";

  async function processLoop() {
    setProcessing(true);
    setPaused(false);
    setFeedback(null);
    try {
      let keepGoing = true;
      while (keepGoing && !paused) {
        const res = await fetch(`/api/admin/scope-import/${encodeURIComponent(batchId)}/process`, {
          method: "POST",
        });
        const json = (await res.json()) as {
          ok?: boolean;
          data?: { done: boolean };
          error?: string;
        };
        if (!res.ok || !json.ok) {
          throw new Error(json.error ?? "Falha ao processar documento.");
        }
        onRefresh();
        keepGoing = !json.data?.done;
        if (paused) break;
      }
      setFeedback("Processamento concluído ou pausado.");
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Erro no processamento.");
    } finally {
      setProcessing(false);
    }
  }

  async function consolidate() {
    setConsolidating(true);
    setFeedback(null);
    try {
      const res = await fetch(
        `/api/admin/scope-import/${encodeURIComponent(batchId)}/consolidate`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      );
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Falha ao consolidar.");
      }
      setFeedback("Consolidação concluída. Revise as sugestões abaixo.");
      onConsolidated();
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Erro na consolidação.");
    } finally {
      setConsolidating(false);
    }
  }

  return (
    <section className="space-y-4 rounded-[24px] border border-white/55 bg-white/72 p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-primary-dark">2. Processar e consolidar</h2>
          <p className="text-sm text-muted-foreground">
            Extração de texto + IA por documento; depois consolida escopos semelhantes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="teal"
            className="gap-2"
            disabled={processing || loading || doneCount >= total}
            onClick={() => void processLoop()}
          >
            {processing ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Play className="size-4" aria-hidden />
            )}
            Processar documentos
          </Button>
          {processing ? (
            <Button type="button" variant="outline" className="gap-2" onClick={() => setPaused(true)}>
              <Pause className="size-4" aria-hidden />
              Pausar
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={!canConsolidate || consolidating}
            onClick={() => void consolidate()}
          >
            {consolidating ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-4" aria-hidden />
            )}
            Consolidar
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs font-semibold text-primary-dark">
          <span>
            {doneCount}/{total} documentos
          </span>
          <span>{progressPct}%</span>
        </div>
        <Progress value={progressPct} className="h-2" />
      </div>

      <ul className="divide-y divide-primary-dark/10 rounded-xl border border-primary-dark/10 bg-white/80">
        {state.documents.map((doc) => (
          <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <span className="font-medium text-primary-dark">{doc.original_filename}</span>
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{doc.status}</span>
            {doc.error_message ? (
              <span className="w-full text-xs text-rose-600">{doc.error_message}</span>
            ) : null}
          </li>
        ))}
      </ul>

      {feedback ? <p className="text-sm font-semibold text-primary-dark">{feedback}</p> : null}
    </section>
  );
}
