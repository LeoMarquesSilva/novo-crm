import type { Json } from "@/lib/supabase/database.types";
import type {
  CanonicalContractBuildResult,
  ContractEngineEvent,
  ContractObjectOverride,
  ContractScopeAdjustment,
} from "./types";
import type { ProposalContractSnapshot } from "./proposal-snapshot";

export const CONTRACT_ENGINE_JSON_KEYS = {
  snapshot: "proposal_contract_snapshot",
  canonical: "canonical_contract",
  alignment: "canonical_alignment",
  pendencias: "canonical_pendencias",
  objectFields: "contract_object_fields",
  objectOverrides: "contract_object_overrides",
  scopeAdjustment: "contract_scope_adjustments",
  events: "contract_engine_events",
  compositionKey: "explicit_composition_key",
} as const;

export type ContractObjectDraft = {
  objectFieldValues: Record<string, string>;
  objectOverrides: ContractObjectOverride[];
  scopeAdjustment: ContractScopeAdjustment | null;
  engineEvents: ContractEngineEvent[];
  explicitCompositionKey: string | null;
};

export function readStoredEngine(dataJson: Record<string, unknown> | null): {
  snapshot: ProposalContractSnapshot | null;
  build: CanonicalContractBuildResult | null;
} {
  if (!dataJson) return { snapshot: null, build: null };
  const snapshot = dataJson[CONTRACT_ENGINE_JSON_KEYS.snapshot];
  const canonical = dataJson[CONTRACT_ENGINE_JSON_KEYS.canonical];
  const alignment = dataJson[CONTRACT_ENGINE_JSON_KEYS.alignment];
  const pendencias = dataJson[CONTRACT_ENGINE_JSON_KEYS.pendencias];
  if (!snapshot || !canonical) return { snapshot: null, build: null };
  return {
    snapshot: snapshot as ProposalContractSnapshot,
    build: {
      data: canonical as CanonicalContractBuildResult["data"],
      alignment: (alignment ?? { ok: true, blockers: [], warnings: [] }) as CanonicalContractBuildResult["alignment"],
      pendencias: (pendencias ?? []) as CanonicalContractBuildResult["pendencias"],
    },
  };
}

export function hasStructuredContractObject(build: CanonicalContractBuildResult | null): boolean {
  return Array.isArray(build?.data.contractObject?.blocks);
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export function readObjectDraft(dataJson: Record<string, unknown> | null): ContractObjectDraft {
  if (!dataJson) {
    return {
      objectFieldValues: {},
      objectOverrides: [],
      scopeAdjustment: null,
      engineEvents: [],
      explicitCompositionKey: null,
    };
  }
  const composition = dataJson[CONTRACT_ENGINE_JSON_KEYS.compositionKey];
  return {
    objectFieldValues: asStringRecord(dataJson[CONTRACT_ENGINE_JSON_KEYS.objectFields]),
    objectOverrides: Array.isArray(dataJson[CONTRACT_ENGINE_JSON_KEYS.objectOverrides])
      ? (dataJson[CONTRACT_ENGINE_JSON_KEYS.objectOverrides] as ContractObjectOverride[])
      : [],
    scopeAdjustment:
      dataJson[CONTRACT_ENGINE_JSON_KEYS.scopeAdjustment] &&
      typeof dataJson[CONTRACT_ENGINE_JSON_KEYS.scopeAdjustment] === "object"
        ? (dataJson[CONTRACT_ENGINE_JSON_KEYS.scopeAdjustment] as ContractScopeAdjustment)
        : null,
    engineEvents: Array.isArray(dataJson[CONTRACT_ENGINE_JSON_KEYS.events])
      ? (dataJson[CONTRACT_ENGINE_JSON_KEYS.events] as ContractEngineEvent[])
      : [],
    explicitCompositionKey: typeof composition === "string" && composition.trim() ? composition : null,
  };
}

export function engineToDataJsonPatch(
  build: CanonicalContractBuildResult,
  snapshot: ProposalContractSnapshot,
  draft?: Partial<ContractObjectDraft>,
) {
  const objectFields = Object.fromEntries(
    build.data.contractObject.fieldValues
      .filter((f) => f.value.trim())
      .map((f) => [f.key, f.value]),
  );
  return {
    [CONTRACT_ENGINE_JSON_KEYS.snapshot]: snapshot as unknown as Json,
    [CONTRACT_ENGINE_JSON_KEYS.canonical]: build.data as unknown as Json,
    [CONTRACT_ENGINE_JSON_KEYS.alignment]: build.alignment as unknown as Json,
    [CONTRACT_ENGINE_JSON_KEYS.pendencias]: build.pendencias as unknown as Json,
    [CONTRACT_ENGINE_JSON_KEYS.objectFields]: (draft?.objectFieldValues ?? objectFields) as unknown as Json,
    [CONTRACT_ENGINE_JSON_KEYS.objectOverrides]: (draft?.objectOverrides ??
      build.data.contractObject.overrides) as unknown as Json,
    [CONTRACT_ENGINE_JSON_KEYS.scopeAdjustment]: (draft?.scopeAdjustment ??
      build.data.scopeAdjustment) as unknown as Json,
    [CONTRACT_ENGINE_JSON_KEYS.events]: (draft?.engineEvents ?? build.data.engineEvents) as unknown as Json,
    [CONTRACT_ENGINE_JSON_KEYS.compositionKey]: (draft?.explicitCompositionKey ??
      build.data.contractObject.compositionKey) as unknown as Json,
    clausulas_selecionadas: build.data.clauses.map((clause, index) => ({
      id: `${clause.stableKey}-${index}`,
      title: clause.title,
      content: clause.content,
      order: index + 1,
      origin: clause.origin,
      sourceLabel: clause.sourceLabel,
    })),
  };
}
