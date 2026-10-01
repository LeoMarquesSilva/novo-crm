/**
 * Importa contratos D4Sign que ainda não finalizaram a assinatura
 * (fase 3 e, em seguida, fase 2), inclusive os que estão em pasta.
 * Continua de onde parou: o cursor fica em `d4sign_api_usage` com
 * http_status nulo, para não consumir a cota de 10 req/h.
 */
import { getD4SignQuotaStatus } from "@/lib/d4sign/api-usage";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { isRateLimitError } from "@/lib/d4sign/quota-orchestrator";
import {
  PENDING_BACKFILL_CURSOR_ENDPOINT,
  PENDING_BACKFILL_MAX_REQUESTS,
  advancePendingCursor,
  documentBelongsToSafe,
  formatPendingCursor,
  initialPendingCursor,
  mapPendingStatusId,
  parsePendingCursor,
  type PendingBackfillCursor,
} from "@/lib/d4sign/pending-backfill-plan";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { D4SignConnector } from "@/modules/crm/infrastructure/integrations/d4sign-client";

export type PendingBackfillResult = {
  ok: boolean;
  imported: number;
  created: number;
  updated: number;
  skippedOtherSafe: number;
  requests: number;
  cursor: string;
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

export async function peekPendingPhaseCursor(): Promise<PendingBackfillCursor | "done"> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("d4sign_api_usage")
    .select("source")
    .eq("endpoint", PENDING_BACKFILL_CURSOR_ENDPOINT)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return initialPendingCursor();
  return parsePendingCursor(data.source);
}

async function writeCursor(cursor: PendingBackfillCursor | "done"): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("d4sign_api_usage").insert({
    endpoint: PENDING_BACKFILL_CURSOR_ENDPOINT,
    method: "GET",
    source: formatPendingCursor(cursor),
    http_status: null,
  });
  if (error) throw error;
}

export async function runPendingSignatureBackfill(options?: {
  maxRequests?: number;
  apiSource?: string;
  /**
   * Com o ciclo já fechado, baixa só a página 1 da fase 3 (os pendentes que
   * a D4Sign devolve primeiro) e não reabre as páginas seguintes, a menos
   * que essa página venha cheia.
   */
  refreshFirstPage?: boolean;
}): Promise<PendingBackfillResult> {
  const env = getD4SignEnv();
  if (!env.tokenApi || !env.safeUuid) {
    return {
      ok: false,
      imported: 0,
      created: 0,
      updated: 0,
      skippedOtherSafe: 0,
      requests: 0,
      cursor: formatPendingCursor(initialPendingCursor()),
      finishedCycle: false,
      error: "D4SIGN_TOKEN ou D4SIGN_SAFE_UUID não configurado.",
    };
  }

  const quota = await getD4SignQuotaStatus("documents/status");
  if (quota.remaining < 1) {
    return {
      ok: false,
      imported: 0,
      created: 0,
      updated: 0,
      skippedOtherSafe: 0,
      requests: 0,
      cursor: formatPendingCursor(await peekPendingPhaseCursor()),
      finishedCycle: false,
      rateLimited: true,
      error: "Quota D4Sign esgotada. A próxima janela libera em cerca de 1 hora.",
    };
  }

  const cap = Math.max(1, options?.maxRequests ?? PENDING_BACKFILL_MAX_REQUESTS);
  const budget = Math.min(cap, PENDING_BACKFILL_MAX_REQUESTS, quota.remaining);
  const connector = D4SignConnector.fromEnv(env);
  const supabase = createSupabaseAdminClient();
  const stored = await peekPendingPhaseCursor();
  const refreshing = stored === "done" && options?.refreshFirstPage === true;
  let cursor: PendingBackfillCursor = stored === "done" ? { phase: 3, page: 1 } : stored;
  let requests = 0;
  let imported = 0;
  let created = 0;
  let updated = 0;
  let skippedOtherSafe = 0;
  let finishedCycle = false;

  while (requests < budget) {
    let page: Awaited<ReturnType<D4SignConnector["listDocumentsByPhase"]>>;
    try {
      page = await connector.listDocumentsByPhase(cursor.phase, {
        pg: cursor.page,
        source: options?.apiSource ?? "pending-backfill",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isRateLimitError(message)) {
        return {
          ok: false,
          imported,
          created,
          updated,
          skippedOtherSafe,
          requests,
          cursor: formatPendingCursor(cursor),
          finishedCycle: false,
          rateLimited: true,
          error: message,
        };
      }
      throw error;
    }
    requests += 1;

    const ours = page.documents.filter((doc) =>
      documentBelongsToSafe(doc.uuidSafe, env.safeUuid),
    );
    skippedOtherSafe += page.documents.length - ours.length;

    const uuids = [...new Set(ours.map((doc) => doc.uuid_doc).filter((id): id is string => Boolean(id)))];
    const existing = new Set<string>();
    const oppByUuid = new Map<string, { id: string; link_contrato: string | null }>();
    for (let i = 0; i < uuids.length; i += 150) {
      const slice = uuids.slice(i, i + 150);
      const [{ data: rows, error }, { data: opps, error: oppError }] = await Promise.all([
        supabase.from("d4sign_documents").select("uuid_doc").in("uuid_doc", slice),
        supabase
          .from("oportunidades")
          .select("id, d4sign_document_uuid, link_contrato")
          .in("d4sign_document_uuid", slice),
      ]);
      if (error) throw error;
      if (oppError) throw oppError;
      for (const row of rows ?? []) existing.add(row.uuid_doc);
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
    const records = ours
      .filter((doc) => doc.uuid_doc)
      .map((doc) => {
        const uuid = doc.uuid_doc as string;
        const opp = oppByUuid.get(uuid);
        return {
          uuid_doc: uuid,
          name_document: doc.name_document ?? null,
          safe_uuid: doc.uuidSafe ?? env.safeUuid,
          safe_name: doc.safeName ?? null,
          d4sign_status: mapPendingStatusId(doc.statusId),
          status_name: doc.statusName ?? null,
          status_comment: doc.statusComment ?? null,
          mime_type: doc.type ?? null,
          size_bytes: asInt(doc.size),
          pages: asInt(doc.pages),
          who_canceled: (doc.whoCanceled ?? null) as never,
          last_synced_at: nowIso,
          updated_at: nowIso,
          ...(opp
            ? {
                oportunidade_id: opp.id,
                ...(opp.link_contrato ? { link_contrato: opp.link_contrato } : {}),
              }
            : {}),
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
    created += records.filter((row) => !existing.has(row.uuid_doc)).length;
    updated += records.filter((row) => existing.has(row.uuid_doc)).length;

    const next = advancePendingCursor(cursor, {
      docs: page.documents.length,
      totalPages: page.totalPages,
    });
    if (refreshing) {
      if (next === "done") {
        await writeCursor("done");
        finishedCycle = true;
      } else {
        await writeCursor(next);
        cursor = next;
      }
      break;
    }
    if (next === "done") {
      await writeCursor("done");
      finishedCycle = true;
      cursor = initialPendingCursor();
      break;
    }
    cursor = next;
    await writeCursor(cursor);
  }

  return {
    ok: true,
    imported,
    created,
    updated,
    skippedOtherSafe,
    requests,
    cursor: finishedCycle ? "done" : formatPendingCursor(cursor),
    finishedCycle,
  };
}
