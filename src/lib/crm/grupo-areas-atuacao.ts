import { CRM_PRACTICE_AREAS, type CrmPracticeArea } from "@/lib/crm/crm-areas";
import { mapSioeDepartamentoToAreaKey } from "@/lib/contract-import/sioe-rateio";

export const GRUPO_AREA_SOURCES = ["rateio", "pasta", "manual"] as const;
export type GrupoAreaSource = (typeof GRUPO_AREA_SOURCES)[number];

export type GrupoAreaAtuacao = {
  areaKey: CrmPracticeArea;
  sources: GrupoAreaSource[];
};

export type GrupoAreaSignals = {
  rateioDepartamentos: Array<string | null | undefined>;
  pastaAreas: Array<string | null | undefined>;
  pastaDepartamentos: Array<string | null | undefined>;
};

function asPracticeArea(value: string | null | undefined): CrmPracticeArea | null {
  const mapped = mapSioeDepartamentoToAreaKey(value);
  if (mapped && (CRM_PRACTICE_AREAS as readonly string[]).includes(mapped)) {
    return mapped as CrmPracticeArea;
  }
  return null;
}

function uniqueSources(sources: GrupoAreaSource[]): GrupoAreaSource[] {
  return GRUPO_AREA_SOURCES.filter((source) => sources.includes(source));
}

export function deriveGrupoAreasFromSignals(signals: GrupoAreaSignals): GrupoAreaAtuacao[] {
  const byArea = new Map<CrmPracticeArea, Set<GrupoAreaSource>>();
  const add = (raw: string | null | undefined, source: Exclude<GrupoAreaSource, "manual">) => {
    const areaKey = asPracticeArea(raw);
    if (!areaKey) return;
    const current = byArea.get(areaKey) ?? new Set<GrupoAreaSource>();
    current.add(source);
    byArea.set(areaKey, current);
  };

  for (const departamento of signals.rateioDepartamentos) add(departamento, "rateio");
  for (const area of signals.pastaAreas) add(area, "pasta");
  for (const departamento of signals.pastaDepartamentos) add(departamento, "pasta");

  return CRM_PRACTICE_AREAS.filter((area) => byArea.has(area)).map((areaKey) => ({
    areaKey,
    sources: uniqueSources([...(byArea.get(areaKey) ?? [])]),
  }));
}

export function parseAreasAtuacao(value: unknown): GrupoAreaAtuacao[] {
  if (!Array.isArray(value)) return [];
  const byArea = new Map<CrmPracticeArea, GrupoAreaSource[]>();
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const record = row as { areaKey?: unknown; sources?: unknown };
    const areaKey = asPracticeArea(typeof record.areaKey === "string" ? record.areaKey : null);
    if (!areaKey) continue;
    const sources = Array.isArray(record.sources)
      ? record.sources.filter((source): source is GrupoAreaSource =>
          GRUPO_AREA_SOURCES.includes(source as GrupoAreaSource),
        )
      : [];
    byArea.set(areaKey, uniqueSources([...(byArea.get(areaKey) ?? []), ...sources]));
  }
  return CRM_PRACTICE_AREAS.filter((area) => byArea.has(area)).map((areaKey) => ({
    areaKey,
    sources: byArea.get(areaKey) ?? ["manual"],
  }));
}

/** União da área responsável OrquestrAI com áreas SIOE/públicas. Tudo é Área, não Categoria. */
export function mergeGrupoPracticeAreas(input: {
  responsibleArea?: string | null;
  areasAtuacao?: unknown;
}): CrmPracticeArea[] {
  const keys = new Set<CrmPracticeArea>(
    parseAreasAtuacao(input.areasAtuacao).map((row) => row.areaKey),
  );
  const responsible = asPracticeArea(input.responsibleArea);
  if (responsible) keys.add(responsible);
  return CRM_PRACTICE_AREAS.filter((area) => keys.has(area));
}

export function parseSelectedAreaKeys(value: unknown): CrmPracticeArea[] {
  if (!Array.isArray(value)) return [];
  const selected = new Set<CrmPracticeArea>();
  for (const item of value) {
    const areaKey = asPracticeArea(typeof item === "string" ? item : null);
    if (areaKey) selected.add(areaKey);
  }
  return CRM_PRACTICE_AREAS.filter((area) => selected.has(area));
}

/** União rateio ∪ pastas + manuais selecionadas. Áreas derivadas desmarcadas saem da lista. */
export function mergeSelectedGrupoAreas(input: {
  selectedAreaKeys: readonly string[];
  derived: readonly GrupoAreaAtuacao[];
}): GrupoAreaAtuacao[] {
  const selected = parseSelectedAreaKeys([...input.selectedAreaKeys]);
  const derivedByArea = new Map(input.derived.map((row) => [row.areaKey, row]));
  return selected.map((areaKey) => {
    const derived = derivedByArea.get(areaKey);
    if (derived) return derived;
    return { areaKey, sources: ["manual"] satisfies GrupoAreaSource[] };
  });
}

export function prefillGrupoAreaKeys(input: {
  derived: readonly GrupoAreaAtuacao[];
  saved: readonly GrupoAreaAtuacao[];
}): CrmPracticeArea[] {
  const keys = new Set<CrmPracticeArea>();
  for (const row of input.derived) keys.add(row.areaKey);
  for (const row of input.saved) keys.add(row.areaKey);
  return CRM_PRACTICE_AREAS.filter((area) => keys.has(area));
}

export function describeGrupoAreaSources(sources: readonly GrupoAreaSource[]): string {
  const labels: Record<GrupoAreaSource, string> = {
    rateio: "Rateio SIOE",
    pasta: "Pasta ativa SIOE",
    manual: "Manual",
  };
  return uniqueSources([...sources]).map((source) => labels[source]).join(" · ") || "Manual";
}
