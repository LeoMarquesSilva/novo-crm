/**
 * Importa contratos que estão em pasta de cliente na raiz do cofre.
 * A listagem `GET /documents/{safe}/safe` não devolve esses documentos.
 * Cada pasta é `GET /documents/{safe}/safe/{folder}` (até 500 por página).
 */
import { safeD4SignIso } from "@/lib/d4sign/api-usage";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { documentBelongsToSafe, mapPendingStatusId } from "@/lib/d4sign/pending-backfill-plan";
import { estimateD4SignCreatedAt } from "@/lib/d4sign/created-at-estimate";
import { isRateLimitError } from "@/lib/d4sign/quota-orchestrator";
import {
  VAULT_FOLDER_CURSOR_ENDPOINT,
  advanceFolderWalkCursor,
  clientFolderRefs,
  foldersLeftInWalk,
  formatFolderWalkCursor,
  mergeFolderCatalog,
  parseFolderWalkCursor,
  type FolderWalkCursor,
} from "@/lib/d4sign/vault-folder-walk-plan";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { D4SignConnector } from "@/modules/crm/infrastructure/integrations/d4sign-client";

export type VaultFolderWalkResult = {
  ok: boolean;
  imported: number;
  requests: number;
  mode: FolderWalkCursor["mode"];
  foldersLeft: number;
  rateLimited?: boolean;
  error?: string;
};

function asInt(value: string | number | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number.parseInt(value, 10);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function isEmptyFolderError(message: string): boolean {
  return /400|404/.test(message) && /nenhum|não encontrado|nao encontrado|not found|empty|não existe|nao existe/i.test(message);
}

export async function peekVaultFolderWalk(): Promise<FolderWalkCursor> {
  return readCursor();
}

async function readCursor(): Promise<FolderWalkCursor> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("d4sign_api_usage")
    .select("source")
    .eq("endpoint", VAULT_FOLDER_CURSOR_ENDPOINT)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return parseFolderWalkCursor(data?.source);
}

async function writeCursor(cursor: FolderWalkCursor): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("d4sign_api_usage").insert({
    endpoint: VAULT_FOLDER_CURSOR_ENDPOINT,
    method: "GET",
    source: formatFolderWalkCursor(cursor),
    http_status: null,
  });
  if (error) throw error;
}

function resultFrom(
  cursor: FolderWalkCursor,
  extra: Partial<VaultFolderWalkResult> & Pick<VaultFolderWalkResult, "ok" | "imported" | "requests">,
): VaultFolderWalkResult {
  return {
    mode: cursor.mode,
    foldersLeft: foldersLeftInWalk(cursor),
    ...extra,
  };
}

export async function runVaultFolderWalk(options?: {
  maxRequests?: number;
  apiSource?: string;
}): Promise<VaultFolderWalkResult> {
  const env = getD4SignEnv();
  let cursor = await readCursor();
  if (!env.tokenApi || !env.safeUuid) {
    return resultFrom(cursor, {
      ok: false,
      imported: 0,
      requests: 0,
      error: "D4SIGN_TOKEN ou D4SIGN_SAFE_UUID não configurado.",
    });
  }

  const budget = Math.max(0, options?.maxRequests ?? 1);
  if (budget < 1) {
    return resultFrom(cursor, { ok: true, imported: 0, requests: 0 });
  }

  const apiSource = options?.apiSource ?? "vault-folders";
  const connector = D4SignConnector.fromEnv(env);
  const supabase = createSupabaseAdminClient();
  let requests = 0;
  let imported = 0;

  const needsCatalog = !cursor.catalogued || cursor.refresh;
  if (needsCatalog) {
    try {
      const folders = await connector.getFoldersBySafe(env.safeUuid, { source: apiSource });
      requests += 1;
      const refs = clientFolderRefs(folders);
      cursor = cursor.catalogued
        ? mergeFolderCatalog(cursor, refs)
        : {
            mode: "walk",
            index: 0,
            page: 1,
            refresh: false,
            catalogued: true,
            folders: refs,
          };
      await writeCursor(cursor);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return resultFrom(cursor, {
        ok: false,
        imported: 0,
        requests,
        rateLimited: isRateLimitError(message),
        error: message,
      });
    }
  }

  const slotCap = cursor.mode === "steady" ? 1 : budget - requests;
  let walked = 0;

  while (walked < slotCap && cursor.folders.length > 0 && cursor.index < cursor.folders.length) {
    const folder = cursor.folders[cursor.index];
    if (!folder) break;
    try {
      const page = await connector.listDocumentsByFolderPage(env.safeUuid, folder.uuid, {
        pg: cursor.page,
        source: apiSource,
      });
      requests += 1;
      walked += 1;
      const docs = page.documents.filter((doc) =>
        documentBelongsToSafe(doc.uuidSafe ?? doc.uuid_safe, env.safeUuid),
      );
      imported += await upsertFolderDocuments(supabase, env.safeUuid, folder, docs);
      cursor = advanceFolderWalkCursor(cursor, {
        docs: page.documents.length,
        totalPages: page.totalPages,
      });
      await writeCursor(cursor);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isEmptyFolderError(message)) {
        requests += 1;
        walked += 1;
        cursor = advanceFolderWalkCursor(cursor, { docs: 0, totalPages: 1 });
        await writeCursor(cursor);
        continue;
      }
      return resultFrom(cursor, {
        ok: false,
        imported,
        requests,
        rateLimited: isRateLimitError(message),
        error: message,
      });
    }
  }

  return resultFrom(cursor, { ok: true, imported, requests });
}

async function upsertFolderDocuments(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  safeUuid: string,
  folder: { uuid: string; name: string | null },
  docs: Array<{
    uuid_doc?: string;
    name_document?: string;
    statusId?: number | string;
    statusName?: string;
    statusComment?: string;
    type?: string;
    size?: string | number;
    pages?: string | number;
    uuidSafe?: string;
    uuid_safe?: string;
    safeName?: string;
    safe_name?: string;
    whoCanceled?: unknown;
    created_at?: string;
    finalized_at?: string;
  }>,
): Promise<number> {
  const uuids = [...new Set(docs.map((doc) => doc.uuid_doc).filter((id): id is string => Boolean(id)))];
  if (uuids.length === 0) return 0;

  const prevByUuid = new Map<
    string,
    {
      name_document: string | null;
      safe_name: string | null;
      folder_name: string | null;
      created_at_d4sign: string | null;
      finalized_at: string | null;
      oportunidade_id: string | null;
      link_contrato: string | null;
    }
  >();
  const oppByUuid = new Map<string, { id: string; link_contrato: string | null }>();

  for (let i = 0; i < uuids.length; i += 150) {
    const slice = uuids.slice(i, i + 150);
    const [{ data: rows, error }, { data: opps, error: oppError }] = await Promise.all([
      supabase
        .from("d4sign_documents")
        .select(
          "uuid_doc, name_document, safe_name, folder_name, created_at_d4sign, finalized_at, oportunidade_id, link_contrato",
        )
        .in("uuid_doc", slice),
      supabase
        .from("oportunidades")
        .select("id, d4sign_document_uuid, link_contrato")
        .in("d4sign_document_uuid", slice),
    ]);
    if (error) throw error;
    if (oppError) throw oppError;
    for (const row of rows ?? []) prevByUuid.set(row.uuid_doc, row);
    for (const opp of opps ?? []) {
      if (opp.d4sign_document_uuid) {
        oppByUuid.set(opp.d4sign_document_uuid, { id: opp.id, link_contrato: opp.link_contrato });
      }
    }
  }

  const nowIso = new Date().toISOString();
  const records = uuids.map((uuid) => {
    const doc = docs.find((item) => item.uuid_doc === uuid);
    const prev = prevByUuid.get(uuid);
    const opp = oppByUuid.get(uuid);
    const createdAt = doc?.created_at ? safeD4SignIso(doc.created_at) : null;
    const finalizedAt = doc?.finalized_at ? safeD4SignIso(doc.finalized_at) : null;
    const folderName = folder.name ?? prev?.folder_name ?? null;
    return {
      uuid_doc: uuid,
      name_document: doc?.name_document ?? prev?.name_document ?? null,
      safe_uuid: doc?.uuidSafe ?? doc?.uuid_safe ?? safeUuid,
      safe_name: doc?.safeName ?? doc?.safe_name ?? prev?.safe_name ?? null,
      folder_uuid: folder.uuid,
      folder_name: folderName,
      folder_path: folderName,
      d4sign_status: mapPendingStatusId(doc?.statusId ?? null),
      status_name: doc?.statusName ?? null,
      status_comment: doc?.statusComment ?? null,
      mime_type: doc?.type ?? null,
      size_bytes: asInt(doc?.size),
      pages: asInt(doc?.pages),
      who_canceled: (doc?.whoCanceled ?? null) as never,
      // Upsert em lote grava NULL em coluna ausente: colunas sempre presentes.
      oportunidade_id: opp?.id ?? prev?.oportunidade_id ?? null,
      link_contrato: opp?.link_contrato ?? prev?.link_contrato ?? null,
      created_at_d4sign:
        createdAt ??
        prev?.created_at_d4sign ??
        estimateD4SignCreatedAt(uuid, doc?.name_document ?? prev?.name_document),
      finalized_at: finalizedAt ?? prev?.finalized_at ?? null,
      last_synced_at: nowIso,
      updated_at: nowIso,
    };
  });

  for (let i = 0; i < records.length; i += 100) {
    const batch = records.slice(i, i + 100);
    const { error } = await supabase
      .from("d4sign_documents")
      .upsert(batch as never, { onConflict: "uuid_doc", ignoreDuplicates: false });
    if (error) throw error;
  }
  return records.length;
}
