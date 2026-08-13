import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadProposalCatalogAdmin } from "@/lib/crm/proposal-catalog-db";
import {
  claimNextDocument,
  loadScopeImportBatchState,
  refreshBatchCounters,
} from "@/lib/scope-import/batch-state";
import { extractDocumentText } from "@/lib/scope-import/text-extraction";
import { callExtractionStructured } from "@/lib/scope-import/openai";
import {
  buildExtractionSystemPrompt,
  buildExtractionUserPrompt,
} from "@/lib/scope-import/prompts";
import {
  extractionJsonSchema,
  normalizeAreaKey,
  parseExtractionResponse,
} from "@/lib/scope-import/schemas";

export const maxDuration = 120;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const { batchId } = await params;
    const supabase = createSupabaseAdminClient();

    const doc = await claimNextDocument(supabase, batchId);
    if (!doc) {
      const state = await loadScopeImportBatchState(supabase, batchId);
      const total = state?.documents.length ?? 0;
      const processed = state?.documents.filter((d) => d.status === "extraido").length ?? 0;
      const errors = state?.documents.filter((d) => d.status === "erro").length ?? 0;
      const pending =
        state?.documents.filter((d) => ["enviado", "processando", "aguardando_upload"].includes(d.status))
          .length ?? 0;

      return NextResponse.json({
        ok: true,
        data: {
          done: pending === 0,
          processed,
          total,
          errors,
          document: null,
        },
      });
    }

    try {
      const { data: blob, error: downloadError } = await supabase.storage
        .from(doc.storage_bucket)
        .download(doc.storage_path);
      if (downloadError || !blob) {
        throw new Error(downloadError?.message ?? "Falha ao baixar documento.");
      }

      const buffer = Buffer.from(await blob.arrayBuffer());
      const extracted = await extractDocumentText(buffer, doc.content_type ?? "");

      if (!extracted.text.trim()) {
        throw new Error("Nenhum texto extraído. PDF escaneado ou documento vazio.");
      }
      if (extracted.isLikelyScanned) {
        throw new Error(
          `PDF provavelmente escaneado (${Math.round(extracted.charsPerPage)} chars/página; mínimo ~200).`,
        );
      }

      const catalog = await loadProposalCatalogAdmin(supabase);
      const system = buildExtractionSystemPrompt(catalog);
      const user = buildExtractionUserPrompt(doc.original_filename, extracted.text);
      const ai = await callExtractionStructured(
        system,
        user,
        extractionJsonSchema as unknown as Record<string, unknown>,
        parseExtractionResponse,
      );

      const rows = [
        ...ai.data.escopos.map((item) => ({ kind: "escopo" as const, item })),
        ...ai.data.investimentos.map((item) => ({ kind: "investimento" as const, item })),
      ];

      if (rows.length) {
        const { error: insertError } = await supabase.from("scope_import_extractions").insert(
          rows.map(({ kind, item }) => {
            const area = normalizeAreaKey(item.suggested_area_key);
            return {
              document_id: doc.id,
              kind,
              raw_excerpt: item.raw_excerpt,
              normalized_template: item.normalized_template,
              suggested_area_key: area.areaKey,
              suggested_type_label: item.suggested_type_label,
              suggested_subtype_label: item.suggested_subtype_label,
              conceito: item.conceito ?? null,
              replaced_values: item.replaced_values,
              model: ai.model,
              input_tokens: ai.inputTokens,
              output_tokens: ai.outputTokens,
            };
          }),
        );
        if (insertError) throw insertError;
      }

      await supabase
        .from("scope_import_documents")
        .update({
          status: "extraido",
          page_count: extracted.pageCount,
          extracted_chars: extracted.text.length,
          processed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", doc.id);
    } catch (docError) {
      const message = docError instanceof Error ? docError.message : "Erro ao processar documento.";
      await supabase
        .from("scope_import_documents")
        .update({
          status: "erro",
          error_message: message,
          processed_at: new Date().toISOString(),
        })
        .eq("id", doc.id);
    }

    await refreshBatchCounters(supabase, batchId);
    const state = await loadScopeImportBatchState(supabase, batchId);
    const total = state?.documents.length ?? 0;
    const processed = state?.documents.filter((d) => d.status === "extraido").length ?? 0;
    const errors = state?.documents.filter((d) => d.status === "erro").length ?? 0;
    const pending =
      state?.documents.filter((d) => ["enviado", "processando"].includes(d.status)).length ?? 0;

    return NextResponse.json({
      ok: true,
      data: {
        done: pending === 0,
        processed,
        total,
        errors,
        document: state?.documents.find((d) => d.id === doc.id) ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao processar lote.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
