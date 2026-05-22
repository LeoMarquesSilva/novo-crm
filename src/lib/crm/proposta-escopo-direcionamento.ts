import type { PropostaTiposCatalog } from "@/data/proposta-tipos-catalog";
import { normalizePracticeAreaKey } from "@/lib/crm/area-keys-alignment";
import { findScopeTipo } from "@/lib/crm/proposal-catalog-utils";
import {
  createEmptyEscopoEntry,
  normalizeEscopoEntry,
  parseEscopoJson,
  syncEscopoToAreas,
} from "@/lib/crm/proposta-escopo-json";

/** Mapa área (label) → lista de `tipoId` indicados na reunião / confecção (um ou mais escopos). */
export type EscopoTiposByArea = Record<string, string[]>;

/** @deprecated Preferir `extractTiposByAreaFromEscopoJson` — retorna só o primeiro tipo por área. */
export type EscopoTipoByArea = Record<string, string>;

export function extractTiposByAreaFromEscopoJson(raw: string, areas: string[]): EscopoTiposByArea {
  const parsed = parseEscopoJson(raw);
  const out: EscopoTiposByArea = {};
  for (const area of areas) {
    const canonical = normalizePracticeAreaKey(area);
    const entries = parsed[canonical] ?? parsed[area];
    if (!entries?.length) {
      out[area] = [];
      continue;
    }
    const ids = entries.map((e) => e.tipoId?.trim() ?? "").filter((id) => id.length > 0);
    out[area] = ids;
  }
  return out;
}

export function extractTipoByAreaFromEscopoJson(raw: string, areas: string[]): EscopoTipoByArea {
  const multi = extractTiposByAreaFromEscopoJson(raw, areas);
  const out: EscopoTipoByArea = {};
  for (const [area, ids] of Object.entries(multi)) {
    const first = ids.find((id) => id.trim().length > 0);
    if (first) out[area] = first;
  }
  return out;
}

/** Atualiza `cp_escopo_detalhe_json` com áreas ativas e tipos de escopo pré-indicados por área. */
export function mergeEscopoJsonWithAreaTipos(
  currentJson: string,
  areas: string[],
  tiposByArea: EscopoTiposByArea,
): string {
  const current = parseEscopoJson(currentJson);
  const next = syncEscopoToAreas(current, areas);
  for (const area of areas) {
    const canonical = normalizePracticeAreaKey(area);
    const slots = tiposByArea[area] ?? tiposByArea[canonical] ?? [];
    const tipoIds = slots.map((t) => t.trim()).filter(Boolean);
    const existingList = next[canonical] ?? next[area] ?? [];

    if (tipoIds.length === 0) {
      const e0 = existingList[0]
        ? normalizeEscopoEntry(existingList[0])
        : createEmptyEscopoEntry();
      next[canonical] = [{ ...e0, tipoId: "", subtipoId: "" }];
      continue;
    }

    next[canonical] = tipoIds.map((tipoId) => {
      const existing = existingList.find((e) => e.tipoId?.trim() === tipoId);
      const base = existing ? normalizeEscopoEntry(existing) : createEmptyEscopoEntry();
      return {
        ...base,
        tipoId,
        subtipoId: base.tipoId === tipoId ? base.subtipoId : "",
      };
    });
  }
  return JSON.stringify(next);
}

export function getEscopoDirecionamentoHint(
  catalog: PropostaTiposCatalog,
  area: string,
  tipoIds: string | string[],
): string | null {
  const ids = Array.isArray(tipoIds) ? tipoIds : tipoIds ? [tipoIds] : [];
  const labels = ids
    .map((id) => findScopeTipo(catalog, area, id.trim())?.label)
    .filter((l): l is string => Boolean(l?.trim()));
  if (!labels.length) return null;
  const unique = [...new Set(labels)];
  return `Direcionamento na reunião: ${unique.join(" · ")}`;
}

export function areaHasEscopoTipoFilled(tiposByArea: EscopoTiposByArea, area: string): boolean {
  const slots = tiposByArea[area] ?? [];
  return slots.some((id) => id.trim().length > 0);
}
