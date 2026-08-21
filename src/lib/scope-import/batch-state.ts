import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type AdminClient = SupabaseClient<Database>;

export async function loadScopeImportBatchState(supabase: AdminClient, batchId: string) {
  const { data: batch, error: batchError } = await supabase
    .from("scope_import_batches")
    .select("*")
    .eq("id", batchId)
    .maybeSingle();
  if (batchError) throw batchError;
  if (!batch) return null;

  const { data: documents, error: docsError } = await supabase
    .from("scope_import_documents")
    .select("*")
    .eq("batch_id", batchId)
    .order("created_at", { ascending: true });
  if (docsError) throw docsError;

  const { data: suggestions, error: sugError } = await supabase
    .from("scope_import_suggestions")
    .select("*")
    .eq("batch_id", batchId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (sugError) throw sugError;

  const suggestionsWithSources = await attachSuggestionSources(
    supabase,
    suggestions ?? [],
    documents ?? [],
  );

  return {
    batch,
    documents: documents ?? [],
    suggestions: suggestionsWithSources,
  };
}

async function attachSuggestionSources(
  supabase: AdminClient,
  suggestions: Database["public"]["Tables"]["scope_import_suggestions"]["Row"][],
  documents: Database["public"]["Tables"]["scope_import_documents"]["Row"][],
) {
  const suggestionIds = suggestions.map((s) => s.id);
  let sources: Database["public"]["Tables"]["scope_import_suggestion_sources"]["Row"][] = [];
  if (suggestionIds.length) {
    const { data: sourceRows, error: srcError } = await supabase
      .from("scope_import_suggestion_sources")
      .select("*")
      .in("suggestion_id", suggestionIds);
    if (srcError) throw srcError;
    sources = sourceRows ?? [];
  }

  const extractionIds = sources.map((s) => s.extraction_id);
  let extractions: Database["public"]["Tables"]["scope_import_extractions"]["Row"][] = [];
  if (extractionIds.length) {
    const { data: extractionRows, error: extError } = await supabase
      .from("scope_import_extractions")
      .select("*")
      .in("id", extractionIds);
    if (extError) throw extError;
    extractions = extractionRows ?? [];
  }

  const docById = new Map(documents.map((d) => [d.id, d]));
  const extractionById = new Map(extractions.map((e) => [e.id, e]));

  return suggestions.map((suggestion) => {
    const linkedSources = sources.filter((s) => s.suggestion_id === suggestion.id);
    const sourceDetails = linkedSources.map((source) => {
      const extraction = extractionById.get(source.extraction_id) ?? null;
      const document = extraction ? (docById.get(extraction.document_id) ?? null) : null;
      return { source, extraction, document };
    });
    return { ...suggestion, sources: sourceDetails };
  });
}

export async function loadScopeImportCombinedReview(supabase: AdminClient) {
  const { data: suggestions, error: sugError } = await supabase
    .from("scope_import_suggestions")
    .select("*")
    .order("created_at", { ascending: false });
  if (sugError) throw sugError;

  const rows = suggestions ?? [];
  const pending = rows.filter((s) => s.status === "pendente");
  const decided = rows.filter((s) => s.status !== "pendente");
  if (pending.length === 0) {
    return { batches: [], suggestions: [], pendingCount: 0, decidedCount: decided.length };
  }

  const batchIds = [...new Set(pending.map((s) => s.batch_id))];
  const { data: batches, error: batchError } = await supabase
    .from("scope_import_batches")
    .select("id, status, document_count, processed_count, error_count, created_at")
    .in("id", batchIds)
    .order("created_at", { ascending: false });
  if (batchError) throw batchError;

  const { data: documents, error: docsError } = await supabase
    .from("scope_import_documents")
    .select("*")
    .in("batch_id", batchIds);
  if (docsError) throw docsError;

  const suggestionsWithSources = await attachSuggestionSources(
    supabase,
    pending,
    documents ?? [],
  );

  return {
    batches: batches ?? [],
    suggestions: suggestionsWithSources,
    pendingCount: pending.length,
    decidedCount: decided.length,
  };
}

export async function refreshBatchCounters(supabase: AdminClient, batchId: string) {
  const { data: docs, error } = await supabase
    .from("scope_import_documents")
    .select("status")
    .eq("batch_id", batchId);
  if (error) throw error;

  const rows = docs ?? [];
  const processed = rows.filter((d) => d.status === "extraido").length;
  const errors = rows.filter((d) => d.status === "erro").length;

  await supabase
    .from("scope_import_batches")
    .update({
      processed_count: processed,
      error_count: errors,
      document_count: rows.length,
    })
    .eq("id", batchId);
}

export async function claimNextDocument(supabase: AdminClient, batchId: string) {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data: stuck, error: stuckError } = await supabase
    .from("scope_import_documents")
    .select("id")
    .eq("batch_id", batchId)
    .eq("status", "processando")
    .lt("processed_at", cutoff);
  if (stuckError) throw stuckError;

  if (stuck?.length) {
    await supabase
      .from("scope_import_documents")
      .update({ status: "enviado", processed_at: null })
      .in(
        "id",
        stuck.map((s) => s.id),
      );
  }

  const { data: next, error: nextError } = await supabase
    .from("scope_import_documents")
    .select("*")
    .eq("batch_id", batchId)
    .eq("status", "enviado")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (nextError) throw nextError;
  if (!next) return null;

  const { data: claimed, error: claimError } = await supabase
    .from("scope_import_documents")
    .update({ status: "processando", processed_at: new Date().toISOString() })
    .eq("id", next.id)
    .eq("status", "enviado")
    .select("*")
    .maybeSingle();
  if (claimError) throw claimError;

  return claimed;
}
