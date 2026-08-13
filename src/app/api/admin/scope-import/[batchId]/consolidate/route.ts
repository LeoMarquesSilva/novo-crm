import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadProposalCatalogAdmin } from "@/lib/crm/proposal-catalog-db";
import { loadScopeImportBatchState } from "@/lib/scope-import/batch-state";
import { callConsolidationStructured } from "@/lib/scope-import/openai";
import {
  buildConsolidationSystemPrompt,
  buildConsolidationUserPrompt,
  groupExtractionsByKindArea,
} from "@/lib/scope-import/prompts";
import { findSimilarExisting } from "@/lib/scope-import/similarity";
import {
  buildSubtypeKey,
  buildTypeKey,
  consolidationJsonSchema,
  normalizeAreaKey,
  parseConsolidationResponse,
  recomputePlaceholderKeys,
} from "@/lib/scope-import/schemas";

export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const { batchId } = await params;
    const body = (await request.json().catch(() => ({}))) as { group?: string };
    const supabase = createSupabaseAdminClient();

    const { data: pendingDocs, error: pendingError } = await supabase
      .from("scope_import_documents")
      .select("id, status")
      .eq("batch_id", batchId)
      .in("status", ["enviado", "processando"]);
    if (pendingError) throw pendingError;
    if ((pendingDocs ?? []).length > 0) {
      return NextResponse.json(
        { ok: false, error: "Ainda há documentos pendentes de processamento." },
        { status: 422 },
      );
    }

    await supabase
      .from("scope_import_suggestions")
      .delete()
      .eq("batch_id", batchId)
      .eq("status", "pendente");

    const { data: docRows, error: docError } = await supabase
      .from("scope_import_documents")
      .select("id")
      .eq("batch_id", batchId);
    if (docError) throw docError;
    const docIds = (docRows ?? []).map((d) => d.id);
    if (!docIds.length) {
      return NextResponse.json({ ok: false, error: "Lote sem documentos." }, { status: 422 });
    }

    const { data: extractionRows, error: extError } = await supabase
      .from("scope_import_extractions")
      .select("*")
      .in("document_id", docIds);
    if (extError) throw extError;

    const catalog = await loadProposalCatalogAdmin(supabase);
    const groups = groupExtractionsByKindArea(extractionRows ?? []);
    const groupEntries = [...groups.entries()].filter(([key]) => !body.group || key === body.group);

    let sortOrder = 0;
    for (const [groupKey, items] of groupEntries) {
      const [kindRaw, areaRaw] = groupKey.split("::");
      const kind = kindRaw === "investimento" ? "investimento" : "escopo";
      const areaKey = kind === "escopo" && areaRaw !== "Sem área" ? areaRaw : null;

      const system = buildConsolidationSystemPrompt(kind, catalog, areaKey);
      const user = buildConsolidationUserPrompt(items.map(({ extractionId: _e, ...rest }) => rest));
      const ai = await callConsolidationStructured(
        system,
        user,
        consolidationJsonSchema as unknown as Record<string, unknown>,
        parseConsolidationResponse,
      );

      for (const suggestion of ai.data.suggestions) {
        const template = suggestion.template.trim();
        const placeholderKeys = recomputePlaceholderKeys(template, suggestion.conceito);
        const normalizedArea = kind === "escopo" ? normalizeAreaKey(areaKey) : { areaKey: null, invalidArea: false };

        const similarCandidates =
          kind === "escopo"
            ? catalog.adminRows.scopeSubtypes.map((s) => {
                const type = catalog.adminRows.scopeTypes.find((t) => t.id === s.scopeTypeId);
                return {
                  id: s.id,
                  label: s.label,
                  typeLabel: type?.label ?? "",
                  areaKey: type?.areaKey,
                  template: s.escopoTemplate,
                };
              })
            : catalog.adminRows.investmentSubtypes.map((s) => {
                const type = catalog.adminRows.investmentTypes.find((t) => t.id === s.investmentTypeId);
                return {
                  id: s.id,
                  label: s.label,
                  typeLabel: type?.label ?? "",
                  template: s.template,
                };
              });

        const similarExisting = findSimilarExisting(template, similarCandidates);
        if (suggestion.match_existing?.subtype_id) {
          const match = similarCandidates.find((c) => c.id === suggestion.match_existing?.subtype_id);
          if (match && !similarExisting.some((s) => s.id === match.id)) {
            similarExisting.unshift({
              id: match.id,
              label: match.label,
              typeLabel: match.typeLabel,
              areaKey: "areaKey" in match ? (match.areaKey as string | undefined) : undefined,
              score: suggestion.confidence ?? 0.9,
            });
          }
        }

        const sourceItems = suggestion.source_extraction_indices
          .map((index) => items[index])
          .filter(Boolean);

        const { data: inserted, error: insertError } = await supabase
          .from("scope_import_suggestions")
          .insert({
            batch_id: batchId,
            kind,
            status: "pendente",
            area_key: normalizedArea.areaKey,
            type_label: suggestion.tipo_label.trim(),
            type_key: buildTypeKey(suggestion.tipo_label),
            subtype_label: suggestion.subtipo_label.trim(),
            subtype_key: buildSubtypeKey(suggestion.subtipo_label),
            conceito: suggestion.conceito ?? null,
            template,
            original_template: template,
            placeholder_keys: placeholderKeys,
            similar_existing: similarExisting,
            confidence: suggestion.confidence ?? null,
            sort_order: (sortOrder += 10),
          })
          .select("id")
          .single();
        if (insertError) throw insertError;

        if (sourceItems.length) {
          const { error: sourceError } = await supabase.from("scope_import_suggestion_sources").insert(
            sourceItems.map((item) => ({
              suggestion_id: inserted.id,
              extraction_id: item.extractionId,
            })),
          );
          if (sourceError) throw sourceError;
        }
      }
    }

    await supabase
      .from("scope_import_batches")
      .update({ status: "revisao" })
      .eq("id", batchId);

    const state = await loadScopeImportBatchState(supabase, batchId);
    return NextResponse.json({ ok: true, data: state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao consolidar lote.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
