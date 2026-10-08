import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getFirmSigners } from "@/lib/d4sign/firm-signers";
import { openPartnerSignAssumptions, type PartnerSignAssumption } from "@/lib/d4sign/partner-sign-assumption";
import {
  classifyPartnerDoc,
  parseSigners,
  resolvePartnerEmail,
  signerIsPending,
  toPartnerSigners,
  type ClassifiedPartnerDoc,
} from "@/lib/d4sign/partner-signatures";

/** Marca em `d4sign_api_usage` (http_status nulo, fora da cota). */
export const PARTNER_SIGN_REFRESH_ENDPOINT = "cursor/partner-sign-refresh";

/** Pedidos mais velhos que isso saem da fila. */
export const PARTNER_SIGN_REFRESH_TTL_MS = 48 * 60 * 60 * 1000;

export type PartnerSignRefreshRequest = {
  uuid: string;
  requestedAt: string;
  /** E-mail canônico. Ausente nas marcas antigas, que só têm o uuid. */
  partnerEmail: string | null;
};

/** `source` da marca: uuid, ou `uuid|e-mail` quando o clique identifica o sócio. */
export function encodePartnerSignRefreshSource(uuid: string, partnerEmail: string): string {
  return `${uuid}|${partnerEmail}`;
}

export function parsePartnerSignRefreshSource(source: string): { uuid: string; partnerEmail: string | null } {
  const sep = source.indexOf("|");
  if (sep === -1) return { uuid: source, partnerEmail: null };
  const uuid = source.slice(0, sep);
  const partnerEmail = source.slice(sep + 1);
  if (!uuid || !partnerEmail) return { uuid: source, partnerEmail: null };
  return { uuid, partnerEmail };
}

export type PriorityRefreshDoc = {
  uuid_doc: string;
  name_document: string | null;
  d4sign_status: string | null;
  details_fetched_at: string | null;
};

function time(value: string | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Contratos cujo clique em Assinar ainda não teve uma leitura de signatários
 * posterior. O mais antigo na frente.
 */
export function orderPendingPriorityRefresh(
  docs: PriorityRefreshDoc[],
  requests: PartnerSignRefreshRequest[],
): PriorityRefreshDoc[] {
  const latestRequest = new Map<string, number>();
  for (const request of requests) {
    const requested = time(request.requestedAt);
    if (requested === null) continue;
    const prev = latestRequest.get(request.uuid);
    if (prev === undefined || requested > prev) latestRequest.set(request.uuid, requested);
  }

  const pending: Array<{ doc: PriorityRefreshDoc; requestedAt: number }> = [];
  for (const doc of docs) {
    const requestedAt = latestRequest.get(doc.uuid_doc);
    if (requestedAt === undefined) continue;
    const fetched = time(doc.details_fetched_at);
    if (fetched !== null && fetched >= requestedAt) continue;
    pending.push({ doc, requestedAt });
  }

  pending.sort((a, b) => a.requestedAt - b.requestedAt);
  return pending.map((item) => item.doc);
}

export async function enqueuePartnerSignerRefresh(uuid: string, partnerEmail: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("d4sign_api_usage").insert({
    endpoint: PARTNER_SIGN_REFRESH_ENDPOINT,
    method: "GET",
    source: encodePartnerSignRefreshSource(uuid, partnerEmail),
    http_status: null,
  });
  if (error) console.warn("[D4Sign] fila de assinatura do sócio não gravada", error.message);
}

/** Enfileira só se o e-mail é de um sócio ainda pendente nesse documento. */
export async function enqueuePartnerSignRefreshIfPending(
  uuid: string,
  userEmail: string | null | undefined,
  signers: unknown,
): Promise<boolean> {
  const partners = toPartnerSigners(getFirmSigners());
  const me = resolvePartnerEmail(userEmail, partners);
  if (!me) return false;
  const pending = parseSigners(signers).some(
    (signer) => resolvePartnerEmail(signer.email, partners) === me && signerIsPending(signer),
  );
  if (!pending) return false;
  await enqueuePartnerSignerRefresh(uuid, me);
  return true;
}

export async function loadPartnerSignerRefreshRequests(now = new Date()): Promise<PartnerSignRefreshRequest[]> {
  const supabase = createSupabaseAdminClient();
  const since = new Date(now.getTime() - PARTNER_SIGN_REFRESH_TTL_MS).toISOString();
  const { data, error } = await supabase
    .from("d4sign_api_usage")
    .select("source, created_at")
    .eq("endpoint", PARTNER_SIGN_REFRESH_ENDPOINT)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  const requests: PartnerSignRefreshRequest[] = [];
  for (const row of data ?? []) {
    if (!row.source) continue;
    const parsed = parsePartnerSignRefreshSource(row.source);
    requests.push({
      uuid: parsed.uuid,
      partnerEmail: parsed.partnerEmail,
      requestedAt: row.created_at,
    });
  }
  return requests;
}

/** Baixas provisórias ainda abertas, para o painel de qualquer pessoa com acesso. */
export async function loadSharedPartnerSignAssumptions(): Promise<PartnerSignAssumption[]> {
  const requests = await loadPartnerSignerRefreshRequests();
  const uuids = [...new Set(requests.map((request) => request.uuid))];
  if (uuids.length === 0) return [];

  const { data, error } = await createSupabaseAdminClient()
    .from("d4sign_documents")
    .select(
      "uuid_doc, name_document, d4sign_status, signers, details_fetched_at, created_at_d4sign, finalized_at, folder_area, folder_name",
    )
    .in("uuid_doc", uuids);
  if (error) throw error;

  const partners = toPartnerSigners(getFirmSigners());
  const docs: ClassifiedPartnerDoc[] = [];
  for (const row of data ?? []) {
    const doc = classifyPartnerDoc({ ...row, client_name: null }, partners);
    if (doc) docs.push(doc);
  }
  return openPartnerSignAssumptions(docs, requests);
}
