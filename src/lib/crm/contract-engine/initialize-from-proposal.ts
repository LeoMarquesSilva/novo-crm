import { buildCanonicalContract } from "./build-canonical";
import { applyInheritedContractAreaToggles } from "./inherit-areas";
import { appendContractEngineEvent } from "./object-events";
import {
  engineToDataJsonPatch,
  hasStructuredContractObject,
  readObjectDraft,
  readStoredEngine,
} from "./persist";
import { createProposalContractSnapshot } from "./proposal-snapshot";
import {
  buildContratoDocumentSnapshot,
  loadDefaultContratoTemplate,
} from "@/lib/crm/proposta-document-data";
import { parseEmpresasIntakeFromRecord } from "@/lib/crm/parse-lead-intake-empresas";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import type { CanonicalContractBuildResult, ContractClauseTemplate } from "./types";
import type { ProposalContractSnapshot } from "./proposal-snapshot";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export async function initializeContractFromProposal(params: {
  supabase: AdminClient;
  oportunidadeId: string;
  createdBy: string | null;
  force?: boolean;
  /** Biblioteca de cláusulas já carregada pelo chamador (evita buscar 2x por request). */
  clauseLibrary?: Map<string, ContractClauseTemplate>;
}): Promise<{
  reused: boolean;
  build: CanonicalContractBuildResult;
  snapshot: ProposalContractSnapshot | null;
  instance: Record<string, unknown>;
}> {
  const { supabase, oportunidadeId, createdBy, force = false, clauseLibrary } = params;

  const template = await loadDefaultContratoTemplate(supabase);
  if (!template) {
    throw new Error("Modelo de contrato não encontrado.");
  }

  const { data: existing, error: existingErr } = await supabase
    .from("document_instances")
    .select("*")
    .eq("oportunidade_id", oportunidadeId)
    .eq("template_id", template.id)
    .maybeSingle();
  if (existingErr) throw existingErr;

  const currentData =
    existing?.data_json && typeof existing.data_json === "object" && !Array.isArray(existing.data_json)
      ? (existing.data_json as Record<string, unknown>)
      : {};
  const stored = readStoredEngine(currentData);
  if (stored.build && stored.snapshot && !force) {
    if (hasStructuredContractObject(stored.build)) {
      return {
        reused: true,
        build: stored.build,
        snapshot: stored.snapshot,
        instance: existing as Record<string, unknown>,
      };
    }
    const draft = readObjectDraft(currentData);
    const rebuilt = buildCanonicalContract({
      snapshot: stored.snapshot,
      objectFieldValues: draft.objectFieldValues,
      objectOverrides: draft.objectOverrides,
      scopeAdjustment: draft.scopeAdjustment,
      explicitCompositionKey: draft.explicitCompositionKey,
      engineEvents: appendContractEngineEvent(draft.engineEvents, {
        type: "contract_object_resolved",
        actorId: createdBy,
        payload: { migrated: true },
      }),
      clauseLibrary,
    });
    const nextJson = {
      ...currentData,
      ...engineToDataJsonPatch(rebuilt, stored.snapshot, {
        ...draft,
        engineEvents: rebuilt.data.engineEvents,
      }),
    } as Record<string, Json>;
    if (!existing) {
      throw new Error("Rascunho do contrato não encontrado para migração do objeto.");
    }
    const migrated = await supabase
      .from("document_instances")
      .update({ data_json: nextJson, status: existing.status ?? "draft" })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (migrated.error) throw migrated.error;
    return {
      reused: false,
      build: rebuilt,
      snapshot: stored.snapshot,
      instance: migrated.data as Record<string, unknown>,
    };
  }

  const { fieldByCode: loadedFields } = await buildContratoDocumentSnapshot({
    supabase,
    oportunidadeId,
    template,
    generatedAt: new Date(),
  });
  const fieldByCode = await applyInheritedContractAreaToggles({
    supabase,
    oportunidadeId,
    fieldByCode: loadedFields,
    updatedBy: createdBy,
  });
  const { data: intake, error: intakeErr } = await supabase
    .from("lead_intakes")
    .select("*")
    .eq("oportunidade_id", oportunidadeId)
    .maybeSingle();
  if (intakeErr) throw intakeErr;

  const empresasIntake = parseEmpresasIntakeFromRecord(
    intake && typeof intake === "object" ? (intake as Record<string, unknown>) : null,
  );

  const snapshot = createProposalContractSnapshot({
    opportunityId: oportunidadeId,
    fieldByCode,
    empresasIntake,
  });
  const existingDraft = readObjectDraft(currentData);
  const build = buildCanonicalContract({
    snapshot,
    generatedAt: new Date(),
    fieldByCode,
    objectFieldValues: existingDraft.objectFieldValues,
    objectOverrides: existingDraft.objectOverrides,
    scopeAdjustment: existingDraft.scopeAdjustment,
    explicitCompositionKey: existingDraft.explicitCompositionKey,
    engineEvents: appendContractEngineEvent(existingDraft.engineEvents, {
      type: "contract_object_resolved",
      actorId: createdBy,
      payload: { source: "proposal" },
    }),
    clauseLibrary,
  });
  const nextJson = {
    ...currentData,
    ...engineToDataJsonPatch(build, snapshot, {
      ...existingDraft,
      engineEvents: build.data.engineEvents,
    }),
  } as Record<string, Json>;

  const persist = existing
    ? await supabase
        .from("document_instances")
        .update({ data_json: nextJson, status: existing.status ?? "draft" })
        .eq("id", existing.id)
        .select("*")
        .single()
    : await supabase
        .from("document_instances")
        .insert({
          oportunidade_id: oportunidadeId,
          template_id: template.id,
          status: "draft",
          current_version: 0,
          data_json: nextJson,
          created_by: createdBy,
        })
        .select("*")
        .single();

  if (persist.error) throw persist.error;
  if (!persist.data) {
    throw new Error("Falha ao gravar o rascunho do contrato.");
  }

  return {
    reused: false,
    build,
    snapshot,
    instance: persist.data as Record<string, unknown>,
  };
}
