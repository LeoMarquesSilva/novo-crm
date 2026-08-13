export type SimilarMatch = {
  id: string;
  label: string;
  typeLabel: string;
  areaKey?: string;
  score: number;
};

function trigrams(value: string): Set<string> {
  const normalized = value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const padded = `  ${normalized} `;
  const set = new Set<string>();
  for (let i = 0; i < padded.length - 2; i += 1) {
    set.add(padded.slice(i, i + 3));
  }
  return set;
}

/** Similaridade Dice entre conjuntos de trigramas (0–1). */
export function diceSimilarity(a: string, b: string): number {
  if (!a.trim() || !b.trim()) return 0;
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;

  let intersection = 0;
  for (const t of ta) {
    if (tb.has(t)) intersection += 1;
  }
  return (2 * intersection) / (ta.size + tb.size);
}

export function findSimilarExisting(
  template: string,
  candidates: Array<{
    id: string;
    label: string;
    typeLabel: string;
    areaKey?: string;
    template: string;
  }>,
  threshold = 0.55,
  limit = 3,
): SimilarMatch[] {
  return candidates
    .map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      typeLabel: candidate.typeLabel,
      areaKey: candidate.areaKey,
      score: diceSimilarity(template, candidate.template),
    }))
    .filter((item) => item.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
