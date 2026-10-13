import type { SupabaseClient } from "@supabase/supabase-js";

import { isCounterpartyOnly, onlyCnpjDigits, type IcpCnpjRecord } from "@/modules/icp/domain/cnpj";
import { fetchCnpj } from "@/modules/icp/infrastructure/cnpj-provider";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { sioeClient } from "@/lib/sioe/client";

const PAGE_SIZE = 1000;
/** Cadastro da Receita muda pouco: renova a cada 6 meses; erros de rede, no dia seguinte. */
const STALE_DAYS = 180;
const RETRY_ERROR_HOURS = 20;
/** Pausa entre consultas para não estourar o limite das APIs públicas. */
const DELAY_MS = 350;

type CrmClient = SupabaseClient<Database>;

export function requireSioeClient(): SupabaseClient {
  const client = sioeClient();
  if (!client) throw new Error("SIOE_SUPABASE_SERVICE_ROLE_KEY não configurada: o ICP lê os dados do VIOS pelo SIOE.");
  return client;
}

/**
 * CNPJs a consultar: empresas de algum grupo de cliente e clientes com CNPJ ainda sem
 * grupo no VIOS/SIOE (a receita deles entra no ICP pelo nome do cliente). Parte
 * contrária fica de fora, mesmo quando está cadastrada dentro de um grupo.
 */
export async function listGroupCnpjs(): Promise<Map<string, string>> {
  const sioe = requireSioeClient();
  const byCnpj = new Map<string, string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await sioe
      .from("pessoas")
      .select("id, cpf_cnpj, grupo_cliente, nome, categoria")
      .not("cpf_cnpj", "is", null)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    for (const p of data ?? []) {
      const cnpj = onlyCnpjDigits(p.cpf_cnpj);
      if (isCounterpartyOnly(p.categoria)) continue;
      const grupo = (p.grupo_cliente ?? "").trim();
      const semGrupo = !grupo && /cliente/i.test(p.categoria ?? "");
      const chave = grupo || (semGrupo ? (p.nome ?? "").trim() : "");
      if (cnpj && chave && !byCnpj.has(cnpj)) byCnpj.set(cnpj, chave);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }
  return byCnpj;
}

/** Lê o cadastro gravado (todas as páginas). */
export async function loadCnpjRecords(crm: CrmClient = createSupabaseAdminClient()): Promise<IcpCnpjRecord[]> {
  const rows: IcpCnpjRecord[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await crm
      .from("icp_cnpj_cadastro")
      .select("*")
      .order("cnpj")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as unknown as IcpCnpjRecord[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

export interface CnpjSyncResult {
  total: number;
  pending: number;
  fetched: number;
  ok: number;
  notFound: number;
  errors: number;
  remaining: number;
}

/**
 * Consulta na OpenCNPJ/BrasilAPI os CNPJs sem cadastro (primeiro) e os vencidos, até `limit`
 * por execução ou até `deadlineMs`, e grava na tabela icp_cnpj_cadastro.
 */
export async function syncIcpCnpjs({
  limit = 250,
  deadlineMs = 240_000,
}: { limit?: number; deadlineMs?: number } = {}): Promise<CnpjSyncResult> {
  const started = Date.now();
  const crm = createSupabaseAdminClient();
  const [cnpjs, existing] = await Promise.all([listGroupCnpjs(), loadCnpjRecords(crm)]);
  const known = new Map(existing.map((r) => [r.cnpj, r]));
  const now = Date.now();
  const isDue = (r: IcpCnpjRecord) => {
    const age = now - new Date(r.fetched_at).getTime();
    return r.status === "error" ? age > RETRY_ERROR_HOURS * 3_600_000 : age > STALE_DAYS * 86_400_000;
  };

  const missing = [...cnpjs.keys()].filter((c) => !known.has(c));
  const due = [...cnpjs.keys()]
    .filter((c) => known.has(c) && isDue(known.get(c)!))
    .sort((a, b) => known.get(a)!.fetched_at.localeCompare(known.get(b)!.fetched_at));
  const queue = [...missing, ...due];

  const result: CnpjSyncResult = {
    total: cnpjs.size,
    pending: queue.length,
    fetched: 0,
    ok: 0,
    notFound: 0,
    errors: 0,
    remaining: queue.length,
  };

  for (const cnpj of queue.slice(0, limit)) {
    if (Date.now() - started > deadlineMs) break;
    const record = await fetchCnpj(cnpj);
    const { error } = await crm.from("icp_cnpj_cadastro").upsert(record, { onConflict: "cnpj" });
    if (error) throw new Error(error.message);
    result.fetched++;
    if (record.status === "ok") result.ok++;
    else if (record.status === "not_found") result.notFound++;
    else result.errors++;
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }
  result.remaining = queue.length - result.fetched;
  return result;
}
