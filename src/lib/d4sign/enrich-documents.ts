/**
 * Enriquecimento de signatários D4Sign — compartilhado entre API manual e cron.
 */
import {
  getD4SignQuotaStatus,
  isD4SignQuotaExhausted,
  safeD4SignIso,
  type D4SignQuotaStatus,
} from "@/lib/d4sign/api-usage";
import type { D4SignEnv } from "@/lib/d4sign/env";
import { D4SignConnector } from "@/modules/crm/infrastructure/integrations/d4sign-client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getOportunidadeIdByDocumentUuid,
  syncOportunidadeFromD4SignSigners,
  type PersistedD4SignSigner,
} from "@/lib/crm/sync-oportunidade-d4sign-signers";

export const PENDING_D4SIGN_STATUSES = new Set(["2", "3", "sent", "processing"]);

export const SIGNERS_EMPTY_FILTER =
  'signers.is.null,signers.eq.[],signers.cs.[{"email":null}]';

const STATUSID_TO_STATUS: Record<number, string> = {
  1: "processing",
  2: "sent",
  3: "3",
  4: "1",
  5: "4",
  6: "6",
  7: "7",
};

export type EnrichDocRow = {
  uuid_doc: string;
  name_document: string | null;
  d4sign_status: string | null;
};

export type EnrichDocumentsResult = {
  enriched: number;
  remaining: number;
  items: Array<{ uuid_doc: string; name_document: string | null; signers_count: number }>;
  lastError: string | null;
  quota: D4SignQuotaStatus;
};

function mapStatusId(raw: number | string | null): string | null {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  if (Number.isNaN(n)) return null;
  return STATUSID_TO_STATUS[n] ?? String(n);
}

function resolveFinalizedAt(
  signers: Array<{ signed: boolean; signed_at: string | null }>,
): string | null {
  const signedDates = signers
    .filter((s) => s.signed && s.signed_at)
    .map((s) => safeD4SignIso(s.signed_at))
    .filter((d): d is string => Boolean(d));
  if (signedDates.length === 0) return null;
  return signedDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
}

/** Documento cuja busca de signatários voltou vazia não é refeito antes disso. */
export const ENRICH_EMPTY_RETRY_MS = 6 * 60 * 60 * 1000;
/** Pendente com signatários: atualiza quem já assinou a cada 12h. */
export const ENRICH_PENDING_REFRESH_MS = 12 * 60 * 60 * 1000;

const PENDING_IN = '("2","3","sent","processing")';

/**
 * Fila da busca de signatários (`GET /documents/{uuid}/list`, 10 req/h),
 * por prioridade e, em cada faixa, do mais recente ao mais antigo:
 * 1. pendente sem signatários;
 * 2. pendente com signatários desatualizados (12h) e finalizado com
 *    signatário ainda marcado como não assinado;
 * 3. finalizado sem signatários;
 * 4. demais (cancelado, arquivado) sem signatários.
 * O que foi buscado há menos de 6h e voltou vazio fica de fora, para não
 * gastar a cota toda rodada no mesmo documento.
 */
export async function pickDocumentsToEnrich(options: {
  limit: number;
  uuidDoc?: string | null;
  now?: Date;
}): Promise<EnrichDocRow[]> {
  const supabase = createSupabaseAdminClient();
  const { limit, uuidDoc } = options;

  if (uuidDoc) {
    const { data: row, error } = await supabase
      .from("d4sign_documents")
      .select("uuid_doc, name_document, d4sign_status")
      .eq("uuid_doc", uuidDoc)
      .maybeSingle();
    if (error) throw error;
    return row ? [row] : [];
  }
  if (limit <= 0) return [];

  const now = options.now?.getTime() ?? Date.now();
  const notFetchedSince = (ms: number) =>
    `details_fetched_at.is.null,details_fetched_at.lt.${new Date(now - ms).toISOString()}`;
  const base = () =>
    supabase.from("d4sign_documents").select("uuid_doc, name_document, d4sign_status");

  const tiers = [
    () =>
      base()
        .or(SIGNERS_EMPTY_FILTER)
        .or(notFetchedSince(ENRICH_EMPTY_RETRY_MS))
        .in("d4sign_status", [...PENDING_D4SIGN_STATUSES]),
    () =>
      base()
        .not("signers", "is", null)
        .not("signers", "eq", "[]")
        .or(notFetchedSince(ENRICH_PENDING_REFRESH_MS))
        .in("d4sign_status", [...PENDING_D4SIGN_STATUSES]),
    () =>
      base()
        .contains("signers", JSON.stringify([{ signed: false }]))
        .or(notFetchedSince(ENRICH_EMPTY_RETRY_MS))
        .eq("d4sign_status", "1"),
    () =>
      base()
        .or(SIGNERS_EMPTY_FILTER)
        .or(notFetchedSince(ENRICH_EMPTY_RETRY_MS))
        .eq("d4sign_status", "1"),
    () =>
      base()
        .or(SIGNERS_EMPTY_FILTER)
        .or(notFetchedSince(ENRICH_EMPTY_RETRY_MS))
        .not("d4sign_status", "is", null)
        .neq("d4sign_status", "1")
        .not("d4sign_status", "in", PENDING_IN),
  ];

  const picked: EnrichDocRow[] = [];
  const seen = new Set<string>();
  for (const tier of tiers) {
    const missing = limit - picked.length;
    if (missing <= 0) break;
    const { data, error } = await tier()
      .order("created_at_d4sign", { ascending: false, nullsFirst: false })
      .order("name_document", { ascending: false, nullsFirst: false })
      .limit(missing);
    if (error) throw error;
    for (const row of data ?? []) {
      if (seen.has(row.uuid_doc)) continue;
      seen.add(row.uuid_doc);
      picked.push(row);
    }
  }
  return picked.slice(0, limit);
}

export async function countPendingDocumentsNeedingEnrich(): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const { count, error } = await supabase
    .from("d4sign_documents")
    .select("uuid_doc", { count: "exact", head: true })
    .or(SIGNERS_EMPTY_FILTER)
    .in("d4sign_status", [...PENDING_D4SIGN_STATUSES]);
  if (error) throw error;
  return count ?? 0;
}

export async function countDocumentsNeedingEnrich(): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const { count } = await supabase
    .from("d4sign_documents")
    .select("uuid_doc", { count: "exact", head: true })
    .or(SIGNERS_EMPTY_FILTER);
  return count ?? 0;
}

/** Busca signatários via `/list` e persiste no banco (1 req/doc). */
export async function enrichDocuments(
  env: D4SignEnv,
  rows: EnrichDocRow[],
  options?: { apiSource?: string },
): Promise<EnrichDocumentsResult> {
  const supabase = createSupabaseAdminClient();
  const connector = D4SignConnector.fromEnv(env);
  const apiSource = options?.apiSource ?? "enrich";
  const nowIso = new Date().toISOString();

  let enriched = 0;
  const items: EnrichDocumentsResult["items"] = [];
  let lastError: string | null = null;

  for (const row of rows) {
    const quotaNow = await getD4SignQuotaStatus("documents/list");
    if (isD4SignQuotaExhausted(quotaNow)) {
      lastError = "Quota esgotada durante o enriquecimento.";
      break;
    }

    try {
      const detail = await connector.listSignersByDocument(row.uuid_doc, { source: apiSource });

        const signers = detail.signers.map((s) => ({
          email: s.email,
          key_signer: s.key_signer,
          act: s.act ?? "1",
          signed: s.signed,
          signed_at: safeD4SignIso(s.signed_at),
          name: s.user_name,
          user_document: s.user_document,
          foreign: s.foreign,
          sign_info: s.sign_info
            ? {
                ip: typeof s.sign_info.ip === "string" ? s.sign_info.ip : undefined,
                geolocation: typeof s.sign_info.geolocation === "string" ? s.sign_info.geolocation : undefined,
                date_signed: typeof s.sign_info.date_signed === "string" ? s.sign_info.date_signed : undefined,
              }
            : null,
        }));

      const newStatus = mapStatusId(detail.statusId) ?? row.d4sign_status;
      const allSigned = signers.length > 0 && signers.every((s) => s.signed);
      const finalizedAt =
        newStatus === "1" || allSigned ? resolveFinalizedAt(signers) : null;

      const { error: updErr } = await supabase
        .from("d4sign_documents")
        .update({
          signers: signers as never,
          d4sign_status: newStatus,
          status_name: detail.statusName ?? undefined,
          details_fetched_at: nowIso,
          ...(finalizedAt ? { finalized_at: finalizedAt } : {}),
          updated_at: nowIso,
        })
        .eq("uuid_doc", row.uuid_doc);

      if (updErr) throw updErr;

      const oportunidadeId = await getOportunidadeIdByDocumentUuid(row.uuid_doc);
      if (oportunidadeId) {
        await syncOportunidadeFromD4SignSigners(
          supabase,
          oportunidadeId,
          signers as PersistedD4SignSigner[],
          {
            d4signStatus: newStatus,
            nowIso,
            advanceStageIfAllSigned: true,
          },
        );
      }

      enriched += 1;
      items.push({
        uuid_doc: row.uuid_doc,
        name_document: row.name_document ?? detail.name_document ?? null,
        signers_count: signers.length,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastError = msg;
      console.warn(`[D4Sign enrich] ${row.uuid_doc} falhou:`, msg);
      if (/401|429|tempo limite|rate/i.test(msg)) break;
    }
  }

  const remaining = await countDocumentsNeedingEnrich();
  const quota = await getD4SignQuotaStatus("documents/list");

  return { enriched, remaining, items, lastError, quota };
}

/** Quantos docs o cron pode enriquecer após sync (máx. 2, respeitando quota). */
export async function cronEnrichBudget(maxDocs = 2): Promise<number> {
  const quota = await getD4SignQuotaStatus("documents/list");
  return Math.min(maxDocs, quota.remaining);
}
