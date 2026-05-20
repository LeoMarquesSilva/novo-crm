import type {
  PropostaEscopoDetalhe,
  PropostaEscopoDetalheEntry,
  PropostaInvestimentoEntry,
} from "@/data/proposta-tipos-catalog";
import { normalizePracticeAreaKey } from "@/lib/crm/area-keys-alignment";

export function parseAreasList(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseEscopoJson(raw: string): PropostaEscopoDetalhe {
  if (!raw.trim()) return {};
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    return o as PropostaEscopoDetalhe;
  } catch {
    return {};
  }
}

function normalizePlaceholdersRecord(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(
      ([, v]) => typeof v === "string",
    ) as [string, string][],
  );
}

function normalizeInvestimento(raw: unknown): PropostaInvestimentoEntry | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const e = raw as Record<string, unknown>;
  const tipoId = typeof e.tipoId === "string" ? e.tipoId : "";
  const subtipoId = typeof e.subtipoId === "string" ? e.subtipoId : "";
  const placeholders = normalizePlaceholdersRecord(e.placeholders);
  if (!tipoId.trim() && !subtipoId.trim() && Object.keys(placeholders).length === 0) {
    return undefined;
  }
  const out: PropostaInvestimentoEntry = { tipoId, subtipoId };
  if (Object.keys(placeholders).length) out.placeholders = placeholders;
  return out;
}

function normalizeEntry(raw: unknown): PropostaEscopoDetalheEntry {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { tipoId: "", subtipoId: "", placeholders: {} };
  }
  const e = raw as Record<string, unknown>;
  const tipoId = typeof e.tipoId === "string" ? e.tipoId : "";
  const subtipoId = typeof e.subtipoId === "string" ? e.subtipoId : "";
  const placeholders = normalizePlaceholdersRecord(e.placeholders);
  const investimento = normalizeInvestimento(e.investimento);
  const base: PropostaEscopoDetalheEntry = {
    tipoId,
    subtipoId,
    ...(Object.keys(placeholders).length ? { placeholders } : {}),
  };
  return investimento ? { ...base, investimento } : base;
}

function entryScore(raw: unknown): number {
  const entry = normalizeEntry(raw);
  let score = 0;
  if (entry.tipoId.trim()) score += 2;
  if (entry.subtipoId.trim()) score += 2;
  score += Object.values(entry.placeholders ?? {}).filter((value) => value.trim()).length;
  if (entry.investimento?.tipoId?.trim()) score += 2;
  if (entry.investimento?.subtipoId?.trim()) score += 2;
  score += Object.values(entry.investimento?.placeholders ?? {}).filter((value) => value.trim()).length;
  return score;
}

function bestEntryForArea(
  current: PropostaEscopoDetalhe,
  area: string,
): PropostaEscopoDetalheEntry | undefined {
  const canonical = normalizePracticeAreaKey(area);
  const candidates = Object.entries(current).filter(
    ([key]) => key === area || key === canonical || normalizePracticeAreaKey(key) === canonical,
  );
  if (candidates.length === 0) return undefined;
  candidates.sort(([, a], [, b]) => entryScore(b) - entryScore(a));
  return normalizeEntry(candidates[0]![1]);
}

/** Mantém só áreas atualmente selecionadas; adiciona entradas vazias para áreas novas. */
export function syncEscopoToAreas(
  current: PropostaEscopoDetalhe,
  areasOrdered: string[],
): PropostaEscopoDetalhe {
  const next: PropostaEscopoDetalhe = {};
  for (const area of areasOrdered) {
    const prev = bestEntryForArea(current, area);
    next[area] = prev ? normalizeEntry(prev) : { tipoId: "", subtipoId: "", placeholders: {} };
  }
  return next;
}

export function escopoJsonEqual(a: PropostaEscopoDetalhe, b: PropostaEscopoDetalhe): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
