import { SCOPE_IDS } from "./clause-catalog";
import type { ContractObjectCompositionProfile, ContractScope } from "./types";

export const CONTRACT_OBJECT_COMPOSITIONS: ContractObjectCompositionProfile[] = [
  {
    key: "trabalhista_full_service",
    label: "Full Service Trabalhista",
    requiredSubtypeKeys: [SCOPE_IDS.contencioso, SCOPE_IDS.consultivo],
    compositionMode: "explicit_only",
    generalObjectKey: "object.trabalhista.full_service.general",
    paragraphUniqueKey: "object.trabalhista.full_service.paragraph_unique",
    evidenceKeys: [
      "trabalhista_full_service",
      "full_service",
      "mensal_full",
      "full service",
      "full-service",
    ],
  },
];

function normalizeEvidence(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ");
}

export function hasExplicitCompositionEvidence(params: {
  composition: ContractObjectCompositionProfile;
  explicitCompositionKey?: string | null;
  fieldByCode?: Record<string, string>;
  scopes: ContractScope[];
}): boolean {
  const { composition } = params;
  if (composition.compositionMode !== "explicit_only") return false;
  if (params.explicitCompositionKey?.trim() === composition.key) return true;

  const haystacks: string[] = [
    params.explicitCompositionKey ?? "",
    params.fieldByCode?.contract_object_composition_key ?? "",
    params.fieldByCode?.cc_tipo_instrumento ?? "",
    params.fieldByCode?.cp_objeto_proposta ?? "",
    params.fieldByCode?.cp_modalidade ?? "",
    ...params.scopes.map((s) => s.typeId),
    ...params.scopes.map((s) => s.subtypeId),
  ];

  const evidence = composition.evidenceKeys.map(normalizeEvidence);
  return haystacks.some((raw) => {
    const n = normalizeEvidence(raw);
    if (!n) return false;
    return evidence.some((key) => n === key || n.includes(key));
  });
}

export function resolveApplicableComposition(params: {
  scopes: ContractScope[];
  explicitCompositionKey?: string | null;
  fieldByCode?: Record<string, string>;
}): ContractObjectCompositionProfile | null {
  const selected = new Set(
    params.scopes.filter((s) => !s.missingProfile).map((s) => s.subtypeId),
  );
  for (const composition of CONTRACT_OBJECT_COMPOSITIONS) {
    const hasAll = composition.requiredSubtypeKeys.every((key) => selected.has(key));
    if (!hasAll) continue;
    if (
      hasExplicitCompositionEvidence({
        composition,
        explicitCompositionKey: params.explicitCompositionKey,
        fieldByCode: params.fieldByCode,
        scopes: params.scopes,
      })
    ) {
      return composition;
    }
  }
  return null;
}

export function getCompositionProfile(key: string): ContractObjectCompositionProfile | undefined {
  return CONTRACT_OBJECT_COMPOSITIONS.find((c) => c.key === key);
}
