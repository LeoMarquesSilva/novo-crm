/**
 * Cursor da varredura de pastas-cliente do cofre.
 * Pastas de área não entram: a listagem delas não devolve os documentos filhos.
 * Os contratos dessas pastas de cliente ficam na raiz do cofre, fora da pasta da área.
 */

export const VAULT_FOLDER_CURSOR_ENDPOINT = "cursor/vault-folders";

/** Pastas de área do cofre Contratos de Honorários. A listagem delas não é recursiva. */
export const D4SIGN_AREA_FOLDER_UUIDS = [
  "3cb77b83-2b9b-494c-88ae-4345f0baabfe",
  "ceb5d98d-24a5-484c-bcc5-954d8e34176f",
  "eb116328-00d7-46f7-b12d-f87ac47ef1b5",
  "82aca827-e05f-4625-9799-03f8e7ef5104",
  "3c1b01fb-192a-493d-9332-f1993df3a46d",
  "17a2cc60-8dd6-4917-aae4-ab370f78df78",
] as const;

const AREA_IDS = new Set<string>(D4SIGN_AREA_FOLDER_UUIDS);

export type FolderWalkMode = "walk" | "steady";

export type FolderRef = {
  uuid: string;
  name: string | null;
};

export type FolderWalkCursor = {
  mode: FolderWalkMode;
  index: number;
  page: number;
  /** Próxima hora atualiza o catálogo de pastas (pastas novas no fim da lista). */
  refresh: boolean;
  catalogued: boolean;
  folders: FolderRef[];
};

export function initialFolderWalkCursor(): FolderWalkCursor {
  return {
    mode: "walk",
    index: 0,
    page: 1,
    refresh: false,
    catalogued: false,
    folders: [],
  };
}

export function clientFolderRefs(
  folders: Array<{ uuid_folder: string; name?: string | null }>,
): FolderRef[] {
  const seen = new Set<string>();
  const out: FolderRef[] = [];
  for (const folder of folders) {
    const uuid = folder.uuid_folder.trim().toLowerCase();
    if (!uuid || AREA_IDS.has(uuid) || seen.has(uuid)) continue;
    seen.add(uuid);
    const name = folder.name?.trim() ? folder.name.trim() : null;
    out.push({ uuid, name });
  }
  return out;
}

function asIndex(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function asPage(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

function parseFolderList(value: unknown): FolderRef[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: FolderRef[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const uuid = String((item as { uuid?: unknown }).uuid ?? "").trim().toLowerCase();
    if (!uuid || AREA_IDS.has(uuid) || seen.has(uuid)) continue;
    seen.add(uuid);
    const nameRaw = (item as { name?: unknown }).name;
    const name = typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : null;
    out.push({ uuid, name });
  }
  return out;
}

export function parseFolderWalkCursor(source: string | null | undefined): FolderWalkCursor {
  if (!source?.trim()?.startsWith("{")) return initialFolderWalkCursor();
  try {
    const raw = JSON.parse(source) as Partial<FolderWalkCursor>;
    const folders = parseFolderList(raw.folders);
    let mode: FolderWalkMode = raw.mode === "steady" ? "steady" : "walk";
    let index = asIndex(raw.index);
    if (folders.length === 0 || index >= folders.length) {
      mode = folders.length === 0 ? mode : "steady";
      index = 0;
    }
    return {
      mode,
      index,
      page: asPage(raw.page),
      refresh: raw.refresh === true,
      catalogued: raw.catalogued === true,
      folders,
    };
  } catch {
    return initialFolderWalkCursor();
  }
}

export function formatFolderWalkCursor(cursor: FolderWalkCursor): string {
  return JSON.stringify({
    mode: cursor.mode,
    index: cursor.index >= 0 ? Math.floor(cursor.index) : 0,
    page: cursor.page >= 1 ? Math.floor(cursor.page) : 1,
    refresh: cursor.refresh,
    catalogued: cursor.catalogued,
    folders: cursor.folders,
  });
}

/**
 * Atualiza nomes, tira pasta que saiu do cofre e acrescenta pasta nova no fim.
 * No modo steady, pasta nova reabre a varredura só a partir dela.
 */
export function mergeFolderCatalog(
  cursor: FolderWalkCursor,
  incoming: FolderRef[],
): FolderWalkCursor {
  const incomingIds = new Set(incoming.map((folder) => folder.uuid));
  const names = new Map(incoming.map((folder) => [folder.uuid, folder.name]));
  const kept = cursor.folders
    .filter((folder) => incomingIds.has(folder.uuid))
    .map((folder) => ({ uuid: folder.uuid, name: names.get(folder.uuid) ?? folder.name }));
  const known = new Set(kept.map((folder) => folder.uuid));
  const added = incoming.filter((folder) => !known.has(folder.uuid));
  const folders = [...kept, ...added];

  if (added.length > 0 && cursor.mode === "steady") {
    return {
      mode: "walk",
      index: kept.length,
      page: 1,
      refresh: false,
      catalogued: true,
      folders,
    };
  }

  const index = folders.length === 0 ? 0 : Math.min(cursor.index, folders.length);
  return {
    ...cursor,
    index,
    refresh: false,
    catalogued: true,
    folders,
  };
}

/**
 * Página cheia (499 docs, ou totalPages maior) continua na mesma pasta.
 * Página curta avança. No fim da lista, `walk` vira `steady`.
 * Uma volta completa em `steady` pede atualização do catálogo na hora seguinte.
 */
export function advanceFolderWalkCursor(
  cursor: FolderWalkCursor,
  info: { docs: number; totalPages: number | null },
): FolderWalkCursor {
  const hasMore =
    info.totalPages != null && info.totalPages >= 1
      ? cursor.page < info.totalPages
      : info.docs >= 499;
  if (hasMore) {
    return { ...cursor, page: cursor.page + 1 };
  }
  const nextIndex = cursor.index + 1;
  if (nextIndex >= cursor.folders.length) {
    return {
      mode: "steady",
      index: 0,
      page: 1,
      refresh: cursor.mode === "steady",
      catalogued: true,
      folders: cursor.folders,
    };
  }
  return { ...cursor, index: nextIndex, page: 1 };
}

export function foldersLeftInWalk(cursor: FolderWalkCursor): number {
  if (cursor.mode !== "walk") return 0;
  return Math.max(0, cursor.folders.length - cursor.index);
}
