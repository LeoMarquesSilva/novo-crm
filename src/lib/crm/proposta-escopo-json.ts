import type {
  PropostaEscopoDetalhe,
  PropostaEscopoDetalheEntry,
  PropostaInvestimentoEntry,
} from "@/data/proposta-tipos-catalog";
import { normalizePracticeAreaKey } from "@/lib/crm/area-keys-alignment";

export function createEscopoEntryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `esc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyEscopoEntry(): PropostaEscopoDetalheEntry {
  return { id: createEscopoEntryId(), tipoId: "", subtipoId: "", placeholders: {} };
}

export function parseAreasList(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
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

export function normalizeEscopoEntry(raw: unknown): PropostaEscopoDetalheEntry {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return createEmptyEscopoEntry();
  }
  const e = raw as Record<string, unknown>;
  const id =
    typeof e.id === "string" && e.id.trim() ? e.id.trim() : createEscopoEntryId();
  const tipoId = typeof e.tipoId === "string" ? e.tipoId : "";
  const subtipoId = typeof e.subtipoId === "string" ? e.subtipoId : "";
  const placeholders = normalizePlaceholdersRecord(e.placeholders);
  const investimento = normalizeInvestimento(e.investimento);
  const base: PropostaEscopoDetalheEntry = {
    id,
    tipoId,
    subtipoId,
    ...(Object.keys(placeholders).length ? { placeholders } : {}),
  };
  return investimento ? { ...base, investimento } : base;
}

/** Aceita array (novo) ou objeto único (legado) por área. */
export function normalizeEntriesForArea(raw: unknown): PropostaEscopoDetalheEntry[] {
  if (Array.isArray(raw)) {
    const items = raw.map((item) => normalizeEscopoEntry(item));
    return items.length > 0 ? items : [createEmptyEscopoEntry()];
  }
  if (raw && typeof raw === "object") {
    return [normalizeEscopoEntry(raw)];
  }
  return [createEmptyEscopoEntry()];
}

export function parseEscopoJson(raw: string): PropostaEscopoDetalhe {
  if (!raw.trim()) return {};
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    const result: PropostaEscopoDetalhe = {};
    for (const [key, val] of Object.entries(o as Record<string, unknown>)) {
      result[key] = normalizeEntriesForArea(val);
    }
    return result;
  } catch {
    return {};
  }
}

function entryScore(entry: PropostaEscopoDetalheEntry): number {
  let score = 0;
  if (entry.tipoId.trim()) score += 2;
  if (entry.subtipoId.trim()) score += 2;
  score += Object.values(entry.placeholders ?? {}).filter((value) => value.trim()).length;
  if (entry.investimento?.tipoId?.trim()) score += 2;
  if (entry.investimento?.subtipoId?.trim()) score += 2;
  score += Object.values(entry.investimento?.placeholders ?? {}).filter((value) => value.trim())
    .length;
  return score;
}

function bestEntriesForArea(current: PropostaEscopoDetalhe, area: string): PropostaEscopoDetalheEntry[] {
  const canonical = normalizePracticeAreaKey(area);
  const candidates = Object.entries(current).filter(
    ([key]) => key === area || key === canonical || normalizePracticeAreaKey(key) === canonical,
  );
  if (candidates.length === 0) return [];
  candidates.sort(([, a], [, b]) => {
    const scoreA = (Array.isArray(a) ? a : normalizeEntriesForArea(a)).reduce(
      (acc, e) => acc + entryScore(e),
      0,
    );
    const scoreB = (Array.isArray(b) ? b : normalizeEntriesForArea(b)).reduce(
      (acc, e) => acc + entryScore(e),
      0,
    );
    return scoreB - scoreA;
  });
  const raw = candidates[0]![1];
  return Array.isArray(raw) ? raw.map(normalizeEscopoEntry) : normalizeEntriesForArea(raw);
}

/** Mantém só áreas selecionadas; preserva entradas existentes ou cria uma vazia. */
export function syncEscopoToAreas(
  current: PropostaEscopoDetalhe,
  areasOrdered: string[],
): PropostaEscopoDetalhe {
  const next: PropostaEscopoDetalhe = {};
  for (const area of areasOrdered) {
    const prev = bestEntriesForArea(current, area);
    next[area] =
      prev.length > 0 ? prev.map((e) => normalizeEscopoEntry(e)) : [createEmptyEscopoEntry()];
  }
  return next;
}

export function escopoJsonEqual(a: PropostaEscopoDetalhe, b: PropostaEscopoDetalhe): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
