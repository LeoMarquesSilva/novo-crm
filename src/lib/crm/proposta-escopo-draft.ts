import type { PropostaEscopoDetalhe } from "@/data/proposta-tipos-catalog";
import { normalizePracticeAreaKey } from "./area-keys-alignment";
import { getEscopoEntriesForArea } from "./proposta-escopo-entry";
import { parseEscopoJson } from "./proposta-escopo-json";

/** Draft echoes, including recalculated investment metadata, never advance this baseline. */
export function isProposalScopeAreaDirty(draft: PropostaEscopoDetalhe, savedValue: string, area: string): boolean {
  return JSON.stringify(getEscopoEntriesForArea(draft, area)) !==
    JSON.stringify(getEscopoEntriesForArea(parseEscopoJson(savedValue), area));
}

/** Mirrors the existing area-restricted PATCH: only the submitted area is acknowledged. */
export function applyProposalScopeSave(savedValue: string, submittedValue: string, restrictedArea?: string): string {
  if (!restrictedArea) return submittedValue;
  let previous: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(savedValue);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) previous = parsed as Record<string, unknown>;
  } catch {
    // The per-field API also treats an empty or invalid previous value as an empty object.
  }
  return JSON.stringify({
    ...previous,
    [normalizePracticeAreaKey(restrictedArea)]: getEscopoEntriesForArea(parseEscopoJson(submittedValue), restrictedArea),
  });
}
