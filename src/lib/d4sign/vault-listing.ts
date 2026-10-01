/**
 * Listagem em lote do cofre D4Sign → `d4sign_documents`.
 *
 * Cada chamada é `GET /documents/{safe}/safe` (até 500 documentos).
 * Não chama enrich (`GET /documents/{uuid}/list`), pastas nem download de PDF.
 * O cursor fica em `d4sign_api_usage` com `http_status` nulo, fora da cota.
 */
import { getD4SignQuotaStatus, safeD4SignIso } from "@/lib/d4sign/api-usage";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { mapPendingStatusId } from "@/lib/d4sign/pending-backfill-plan";
import { isRateLimitError } from "@/lib/d4sign/quota-orchestrator";
import {
  VAULT_LISTING_MAX_REQUESTS,
  VAULT_SAFE_CURSOR_ENDPOINT,
  formatVaultPageCursor,
  nextVaultListingPage,
  parseVaultPageCursor,
} from "@/lib/d4sign/vault-listing-plan";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { D4SignConnector } from "@/modules/crm/infrastructure/integrations/d4sign-client";

const AREA_FOLDER_UUIDS = new Set([
  "3cb77b83-2b9b-494c-88ae-4345f0baabfe",
  "ceb5d98d-24a5-484c-bcc5-954d8e34176f",
  "eb116328-00d7-46f7-b12d-f87ac47ef1b5",
  "82aca827-e05f-4625-9799-03f8e7ef5104",
  "3c1b01fb-192a-493d-9332-f1993df3a46d",
  "17a2cc60-8dd6-4917-aae4-ab370f78df78",
]);

export type VaultSafeListingResult = {
  ok: boolean;
  imported: number;
  requests: number;
  page: number;
  nextPage: number;
  finishedCycle: boolean;
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

function emptyResult(
  page: number,
  extra: Partial<VaultSafeListingResult> = {},
): VaultSafeListingResult {
  return {
    ok: false,
    imported: 0,
    requests: 0,
    page,
    nextPage: page,
    finishedCycle: false,
    ...extra,
  };
}

async function readCursor(): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("d4sign_api_usage")
    .select("source")
    .eq("endpoint", VAULT_SAFE_CURSOR_ENDPOINT)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return parseVaultPageCursor(data?.source);
}

async function writeCursor(page: number): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("d4sign_api_usage").insert({
    endpoint: VAULT_SAFE_CURSOR_ENDPOINT,
    method: "GET",
    source: formatVaultPageCursor(page),
    http_status: null,
  });
  if (error) throw error;
}

function isEmptyPageError(message: string): boolean {
  return /400|404/.test(message) && /nenhum|não encontrado|nao encontrado|not found|empty/i.test(message);
}

export async function runVaultSafeListing(options?: {
  maxRequests?: number;
  apiSource?: string;
}): Promise<VaultSafeListingResult> {
  const env = getD4SignEnv();
  const cursor = await readCursor();
  if (!env.tokenApi || !env.safeUuid) {
    return emptyResult(cursor, {
      error: "D4SIGN_TOKEN ou D4SIGN_SAFE_UUID não configurado.",
    });
  }

  const quota = await getD4SignQuotaStatus("documents/safe");
  if (quota.remaining < 1) {
    return emptyResult(cursor, {
      rateLimited: true,
      error: "Quota D4Sign esgotada. A próxima janela libera em cerca de 1 hora.",
    });
  }

  const cap = Math.max(1, options?.maxRequests ?? 1);
  const budget = Math.min(cap, VAULT_LISTING_MAX_REQUESTS, quota.remaining);
  const apiSource = options?.apiSource ?? "vault-listing";
  const connector = D4SignConnector.fromEnv(env);
  const supabase = createSupabaseAdminClient();

  const { data: cachedSafe } = await supabase
    .from("d4sign_documents")
    .select("safe_name")
    .not("safe_name", "is", null)
    .limit(1)
    .maybeSingle();

  let page = cursor;
  let requests = 0;
  let imported = 0;
  let finishedCycle = false;

  while (requests < budget) {
    let listed: Awaited<ReturnType<D4SignConnector["listDocumentsBySafePage"]>>;
    try {
      listed = await connector.listDocumentsBySafePage(env.safeUuid, {
        pg: page,
        source: apiSource,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isRateLimitError(message)) {
        return {
          ok: requests > 0,
          imported,
          requests,
          page,
          nextPage: page,
          finishedCycle: false,
          rateLimited: true,
          error: message,
        };
      }
      if (isEmptyPageError(message)) {
        await writeCursor(1);
        return {
          ok: true,
          imported,
          requests: requests + 1,
          page,
          nextPage: 1,
          finishedCycle: true,
        };
      }
      throw error;
    }
    requests += 1;

    const docs = listed.documents.filter((doc) => doc.uuid_doc);
    const uuids = [...new Set(docs.map((doc) => doc.uuid_doc as string))];
    const existingByUuid = new Map<
      string,
      {
        name_document: string | null;
        folder_uuid: string | null;
        folder_name: string | null;
        folder_path: string | null;
        safe_name: string | null;
        created_at_d4sign: string | null;
        finalized_at: string | null;
        details_fetched_at: string | null;
      }
    >();
    const folderMeta = new Map<string, { folder_name: string | null; folder_path: string | null }>();
    const oppByUuid = new Map<string, { id: string; link_contrato: string | null }>();

    for (let i = 0; i < uuids.length; i += 150) {
      const slice = uuids.slice(i, i + 150);
      const [{ data: rows, error }, { data: opps, error: oppError }] = await Promise.all([
        supabase
          .from("d4sign_documents")
          .select(
            "uuid_doc, name_document, folder_uuid, folder_name, folder_path, safe_name, created_at_d4sign, finalized_at, details_fetched_at",
          )
          .in("uuid_doc", slice),
        supabase
          .from("oportunidades")
          .select("id, d4sign_document_uuid, link_contrato")
          .in("d4sign_document_uuid", slice),
      ]);
      if (error) throw error;
      if (oppError) throw oppError;
      for (const row of rows ?? []) {
        existingByUuid.set(row.uuid_doc, row);
        if (row.folder_uuid && (row.folder_name || row.folder_path)) {
          folderMeta.set(row.folder_uuid, {
            folder_name: row.folder_name,
            folder_path: row.folder_path,
          });
        }
      }
      for (const opp of opps ?? []) {
        if (opp.d4sign_document_uuid) {
          oppByUuid.set(opp.d4sign_document_uuid, {
            id: opp.id,
            link_contrato: opp.link_contrato,
          });
        }
      }
    }

    const nowIso = new Date().toISOString();
    const seen = new Set<string>();
    const records = docs
      .filter((doc) => {
        const uuid = doc.uuid_doc as string;
        if (seen.has(uuid)) return false;
        seen.add(uuid);
        return true;
      })
      .map((doc) => {
        const uuid = doc.uuid_doc as string;
        const prev = existingByUuid.get(uuid);
        const rawFolder = doc.uuidFolder ?? doc.uuid_folder ?? null;
        const folderUuid =
          rawFolder && !AREA_FOLDER_UUIDS.has(rawFolder)
            ? rawFolder
            : (prev?.folder_uuid ?? rawFolder);
        const known = folderUuid ? folderMeta.get(folderUuid) : undefined;
        const folderName =
          known?.folder_name ?? (folderUuid && folderUuid === prev?.folder_uuid ? prev?.folder_name : null);
        const folderPath =
          known?.folder_path ?? (folderUuid && folderUuid === prev?.folder_uuid ? prev?.folder_path : null);
        const opp = oppByUuid.get(uuid);
        const createdAt = doc.created_at ? safeD4SignIso(doc.created_at) : null;
        const finalizedAt = doc.finalized_at ? safeD4SignIso(doc.finalized_at) : null;
        const safeName = doc.safeName ?? doc.safe_name ?? prev?.safe_name ?? cachedSafe?.safe_name ?? null;

        const nameDocument = doc.name_document ?? prev?.name_document ?? null;
        return {
          uuid_doc: uuid,
          name_document: nameDocument,
          safe_uuid: doc.uuidSafe ?? doc.uuid_safe ?? env.safeUuid,
          safe_name: safeName,
          folder_uuid: folderUuid,
          folder_name: folderName,
          folder_path: folderPath,
          d4sign_status: mapPendingStatusId(doc.statusId ?? null),
          status_name: doc.statusName ?? null,
          status_comment: doc.statusComment ?? null,
          mime_type: doc.type ?? null,
          size_bytes: asInt(doc.size),
          pages: asInt(doc.pages),
          who_canceled: (doc.whoCanceled ?? null) as never,
          oportunidade_id: opp?.id ?? null,
          link_contrato: opp?.link_contrato ?? null,
          created_at_d4sign: createdAt ?? prev?.created_at_d4sign ?? null,
          finalized_at: finalizedAt ?? prev?.finalized_at ?? null,
          details_fetched_at: nameDocument ? nowIso : (prev?.details_fetched_at ?? null),
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
    imported += records.length;

    const step = nextVaultListingPage(page, {
      docs: listed.documents.length,
      totalPages: listed.totalPages,
    });
    page = step.nextPage;
    finishedCycle = step.finishedCycle;
    await writeCursor(page);
    if (finishedCycle) break;
  }

  return {
    ok: true,
    imported,
    requests,
    page: cursor,
    nextPage: page,
    finishedCycle,
  };
}
