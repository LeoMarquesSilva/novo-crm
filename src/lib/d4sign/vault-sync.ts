/**
 * Sincronização unificada do cofre D4Sign → d4sign_documents.
 * Substitui import + sync separados (1 fluxo, menos reqs duplicadas).
 *
 * Budget típico: folders(1) + listing(1–N) + client-walk( até 6) + enrich(0–2)
 * Area-walks REMOVIDOS (confirmado: não retornam docs filhos — economiza 6 req/run).
 */
import { getD4SignEnv } from "@/lib/d4sign/env";
import { safeD4SignIso } from "@/lib/d4sign/api-usage";
import {
  cronEnrichBudget,
  enrichDocuments,
  pickDocumentsToEnrich,
} from "@/lib/d4sign/enrich-documents";
import {
  assertD4SignQuota,
  isRateLimitError,
  notifyQuotaExhausted,
} from "@/lib/d4sign/quota-orchestrator";
import { D4SignConnector } from "@/modules/crm/infrastructure/integrations/d4sign-client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const STATUSID_TO_STATUS: Record<number, string> = {
  1: "processing",
  2: "sent",
  3: "3",
  4: "1",
  5: "4",
  6: "6",
  7: "7",
};

const MAX_PAGES = 5;
/** Sem area-walks, podemos caminhar mais pastas-cliente por run. */
const MAX_FOLDER_WALK = 6;
const POST_SYNC_ENRICH_MAX = 2;

const AREA_FOLDER_UUIDS = new Set([
  "3cb77b83-2b9b-494c-88ae-4345f0baabfe",
  "ceb5d98d-24a5-484c-bcc5-954d8e34176f",
  "eb116328-00d7-46f7-b12d-f87ac47ef1b5",
  "82aca827-e05f-4625-9799-03f8e7ef5104",
  "3c1b01fb-192a-493d-9332-f1993df3a46d",
  "17a2cc60-8dd6-4917-aae4-ab370f78df78",
]);

export type VaultSyncOptions = {
  maxPages?: number;
  maxFolderWalk?: number;
  enrichAfter?: number;
  /** Pular walk de pastas-cliente (sync rápido só bulk). */
  skipFolderWalk?: boolean;
  apiSource?: string;
};

export type VaultSyncResult = {
  ok: boolean;
  imported: number;
  linked: number;
  unlinked: number;
  safe_name: string | null;
  folders_total: number;
  folders_walked_this_run: number;
  folders_remaining: number;
  docs_with_name: number;
  docs_with_folder: number;
  missing_names: number;
  statusChanges: number;
  enrich?: {
    enriched: number;
    remainingWithoutSigners: number;
    last_error?: string;
  };
  quota?: Awaited<ReturnType<typeof import("@/lib/d4sign/api-usage").getD4SignQuotaStatus>>;
  error?: string;
  rateLimited?: boolean;
};

function safeIso(value: string): string | null {
  return safeD4SignIso(value);
}

export async function runVaultSync(options: VaultSyncOptions = {}): Promise<VaultSyncResult> {
  const env = getD4SignEnv();
  if (!env.tokenApi || !env.safeUuid) {
    return {
      ok: false,
      imported: 0,
      linked: 0,
      unlinked: 0,
      safe_name: null,
      folders_total: 0,
      folders_walked_this_run: 0,
      folders_remaining: 0,
      docs_with_name: 0,
      docs_with_folder: 0,
      missing_names: 0,
      statusChanges: 0,
      error: "D4SIGN_TOKEN ou D4SIGN_SAFE_UUID não configurado.",
    };
  }

  const maxPages = options.maxPages ?? MAX_PAGES;
  const maxFolderWalk = options.skipFolderWalk ? 0 : (options.maxFolderWalk ?? MAX_FOLDER_WALK);
  const enrichAfter = options.enrichAfter ?? POST_SYNC_ENRICH_MAX;
  const apiSource = options.apiSource ?? "vault-sync";

  // Mínimo: folders + 1 página listing
  const quotaCheck = await assertD4SignQuota(2, "atualizar cofre");
  if (!quotaCheck.ok) {
    await notifyQuotaExhausted({ operation: "atualizar cofre" });
    return {
      ok: false,
      imported: 0,
      linked: 0,
      unlinked: 0,
      safe_name: null,
      folders_total: 0,
      folders_walked_this_run: 0,
      folders_remaining: 0,
      docs_with_name: 0,
      docs_with_folder: 0,
      missing_names: 0,
      statusChanges: 0,
      error: quotaCheck.message,
      quota: quotaCheck.quota,
      rateLimited: true,
    };
  }

  const connector = D4SignConnector.fromEnv(env);
  const supabase = createSupabaseAdminClient();
  let rateLimitHit = false;

  // Nome do cofre (cache no banco)
  let safeName: string | null = null;
  const { data: existingSafe } = await supabase
    .from("d4sign_documents")
    .select("safe_name")
    .not("safe_name", "is", null)
    .limit(1)
    .maybeSingle();
  safeName = existingSafe?.safe_name ?? null;

  if (!safeName) {
    try {
      const safes = await connector.getSafes();
      safeName = safes.find((s) => s.uuid_safe === env.safeUuid)?.name_safe ?? null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isRateLimitError(msg)) rateLimitHit = true;
    }
  }

  const folderNameByUuid = new Map<string, string>();
  const folderParentByUuid = new Map<string, string | undefined>();

  if (!rateLimitHit) {
    try {
      const folders = await connector.getFoldersBySafe(env.safeUuid);
      for (const f of folders) {
        if (f.uuid_folder) {
          folderNameByUuid.set(f.uuid_folder, f.name);
          folderParentByUuid.set(f.uuid_folder, f.parent_uuid ?? undefined);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isRateLimitError(msg)) rateLimitHit = true;
    }
  }

  function buildFolderPath(folderUuid: string): string {
    const segments: string[] = [];
    let uuid: string | undefined = folderUuid;
    for (let depth = 0; depth < 6 && uuid; depth++) {
      segments.unshift(folderNameByUuid.get(uuid) ?? uuid.slice(0, 8));
      uuid = folderParentByUuid.get(uuid);
    }
    return segments.join(" / ");
  }

  type Doc = {
    uuid_doc: string;
    name_document?: string;
    statusId?: number | string;
    statusName?: string;
    statusComment?: string;
    type?: string;
    size?: string | number;
    pages?: string | number;
    uuidFolder?: string;
    created_at?: string;
    finalized_at?: string;
    whoCanceled?: unknown;
  };

  const allDocs: Doc[] = [];
  let listingError: string | null = null;

  if (!rateLimitHit) {
    for (let pg = 1; pg <= maxPages; pg++) {
      try {
        const docs = await connector.listDocumentsBySafe(env.safeUuid, {
          pg,
          source: apiSource,
        });
        if (!docs?.length) break;
        for (const d of docs) {
          const uuid = String(d.uuid_doc ?? "").trim();
          if (!uuid) continue;
          allDocs.push({
            uuid_doc: uuid,
            name_document: d.name_document,
            statusId: d.statusId,
            statusName: d.statusName,
            statusComment: d.statusComment,
            type: d.type,
            size: d.size,
            pages: d.pages,
            uuidFolder: d.uuidFolder ?? d.uuid_folder,
            created_at: d.created_at,
            finalized_at: d.finalized_at,
            whoCanceled: d.whoCanceled ?? d.who_canceled,
          });
        }
        if (docs.length < 500) break;
      } catch (e) {
        listingError = e instanceof Error ? e.message : String(e);
        if (isRateLimitError(listingError)) rateLimitHit = true;
        break;
      }
    }
  }

  if (allDocs.length === 0) {
    if (rateLimitHit || (listingError && isRateLimitError(listingError))) {
      await notifyQuotaExhausted({ operation: "listagem do cofre" });
    }
    const { getD4SignQuotaStatus } = await import("@/lib/d4sign/api-usage");
    return {
      ok: false,
      imported: 0,
      linked: 0,
      unlinked: 0,
      safe_name: safeName,
      folders_total: folderNameByUuid.size,
      folders_walked_this_run: 0,
      folders_remaining: 0,
      docs_with_name: 0,
      docs_with_folder: 0,
      missing_names: 0,
      statusChanges: 0,
      error: rateLimitHit
        ? `Rate-limit D4Sign. Aguarde ~1h. (${listingError ?? ""})`
        : listingError ?? "Nenhum documento retornado.",
      rateLimited: rateLimitHit,
      quota: await getD4SignQuotaStatus(),
    };
  }

  type FolderAssignment = { folder_uuid: string; folder_name: string | null };
  const docFolderMap = new Map<string, FolderAssignment>();

  const { data: existingRows } = await supabase
    .from("d4sign_documents")
    .select("uuid_doc, folder_uuid, folder_name, d4sign_status")
    .or("folder_uuid.not.is.null,folder_area.not.is.null");

  const dbByUuid = new Map(
    (existingRows ?? []).map((r) => [r.uuid_doc, r] as const),
  );

  for (const row of existingRows ?? []) {
    if (row.folder_uuid) {
      docFolderMap.set(row.uuid_doc, {
        folder_uuid: row.folder_uuid,
        folder_name: row.folder_name,
      });
    }
  }

  for (const doc of allDocs) {
    if (doc.uuidFolder && !AREA_FOLDER_UUIDS.has(doc.uuidFolder)) {
      docFolderMap.set(doc.uuid_doc, {
        folder_uuid: doc.uuidFolder,
        folder_name: folderNameByUuid.get(doc.uuidFolder) ?? null,
      });
    }
  }

  // Client folder walk only (area-walks skipped — não recursivos)
  const processedFolderUuids = new Set([...docFolderMap.values()].map((v) => v.folder_uuid));
  const unprocessedClientFolders = [...folderNameByUuid.keys()].filter(
    (uuid) => !processedFolderUuids.has(uuid) && !AREA_FOLDER_UUIDS.has(uuid),
  );
  const toWalk = rateLimitHit ? [] : unprocessedClientFolders.slice(0, maxFolderWalk);
  let folderWalkDone = 0;

  for (const folderUuid of toWalk) {
    try {
      const folderDocs = await connector.listDocumentsByFolder(env.safeUuid, folderUuid);
      folderWalkDone += 1;
      const folderName = folderNameByUuid.get(folderUuid) ?? null;
      for (const doc of folderDocs) {
        if (doc.uuid_doc) {
          docFolderMap.set(doc.uuid_doc, { folder_uuid: folderUuid, folder_name: folderName });
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isRateLimitError(msg)) {
        rateLimitHit = true;
        break;
      }
    }
  }

  const { data: opps } = await supabase
    .from("oportunidades")
    .select("id, d4sign_document_uuid, link_contrato")
    .not("d4sign_document_uuid", "is", null);

  const oppByUuid = Object.fromEntries(
    (opps ?? []).map((o) => [o.d4sign_document_uuid ?? "", o]),
  );

  const nowIso = new Date().toISOString();
  const seen = new Set<string>();
  let statusChanges = 0;

  const records = allDocs
    .filter((d) => {
      if (seen.has(d.uuid_doc)) return false;
      seen.add(d.uuid_doc);
      return true;
    })
    .map((doc) => {
      const rawId =
        typeof doc.statusId === "number"
          ? doc.statusId
          : parseInt(String(doc.statusId ?? ""), 10);
      const d4signStatus = Number.isNaN(rawId)
        ? null
        : (STATUSID_TO_STATUS[rawId] ?? String(rawId));

      const prev = dbByUuid.get(doc.uuid_doc);
      if (prev && prev.d4sign_status !== d4signStatus) statusChanges += 1;

      const sizeBytes =
        typeof doc.size === "number"
          ? doc.size
          : typeof doc.size === "string" && doc.size.trim()
            ? Number.parseInt(doc.size, 10) || null
            : null;
      const pages =
        typeof doc.pages === "number"
          ? doc.pages
          : typeof doc.pages === "string" && doc.pages.trim()
            ? Number.parseInt(doc.pages, 10) || null
            : null;

      const folderAssignment = docFolderMap.get(doc.uuid_doc);
      const folderUuid = folderAssignment?.folder_uuid ?? doc.uuidFolder ?? null;
      const folderName = folderUuid
        ? (folderAssignment?.folder_name ?? folderNameByUuid.get(folderUuid) ?? null)
        : null;

      const opp = oppByUuid[doc.uuid_doc];

      return {
        uuid_doc: doc.uuid_doc,
        name_document: doc.name_document ?? null,
        safe_uuid: env.safeUuid,
        safe_name: safeName,
        folder_uuid: folderUuid,
        folder_name: folderName,
        folder_path: folderUuid ? buildFolderPath(folderUuid) : null,
        d4sign_status: d4signStatus,
        status_name: doc.statusName ?? null,
        status_comment: doc.statusComment ?? null,
        mime_type: doc.type ?? null,
        size_bytes: sizeBytes,
        pages,
        who_canceled: (doc.whoCanceled ?? null) as never,
        oportunidade_id: opp?.id ?? null,
        link_contrato: opp?.link_contrato ?? null,
        created_at_d4sign: doc.created_at ? safeIso(doc.created_at) : null,
        finalized_at: doc.finalized_at ? safeIso(doc.finalized_at) : null,
        details_fetched_at: doc.name_document ? nowIso : null,
        last_synced_at: nowIso,
        updated_at: nowIso,
      };
    });

  let imported = 0;
  for (let i = 0; i < records.length; i += 100) {
    const batch = records.slice(i, i + 100);
    const { error } = await supabase
      .from("d4sign_documents")
      .upsert(batch as never, { onConflict: "uuid_doc", ignoreDuplicates: false });
    if (error) throw error;
    imported += batch.length;
  }

  const linked = records.filter((r) => r.oportunidade_id !== null).length;
  const docsWithFolder = records.filter((r) => r.folder_uuid).length;
  const foldersRemaining = Math.max(
    0,
    folderNameByUuid.size -
      [...new Set(records.map((r) => r.folder_uuid).filter(Boolean))].length,
  );

  // Enrich automático se sobrar quota
  let enrichResult: VaultSyncResult["enrich"];
  if (enrichAfter > 0 && !rateLimitHit) {
    const budget = await cronEnrichBudget(enrichAfter);
    if (budget > 0) {
      const toEnrich = await pickDocumentsToEnrich({ limit: budget });
      if (toEnrich.length > 0) {
        const er = await enrichDocuments(env, toEnrich, { apiSource: "vault-sync" });
        enrichResult = {
          enriched: er.enriched,
          remainingWithoutSigners: er.remaining,
          ...(er.lastError ? { last_error: er.lastError } : {}),
        };
      }
    }
  }

  const { getD4SignQuotaStatus } = await import("@/lib/d4sign/api-usage");

  return {
    ok: true,
    imported,
    linked,
    unlinked: imported - linked,
    safe_name: safeName,
    folders_total: folderNameByUuid.size,
    folders_walked_this_run: folderWalkDone,
    folders_remaining: foldersRemaining,
    docs_with_name: records.filter((r) => r.name_document).length,
    docs_with_folder: docsWithFolder,
    missing_names: records.filter((r) => !r.name_document).length,
    statusChanges,
    enrich: enrichResult,
    quota: await getD4SignQuotaStatus(),
  };
}
