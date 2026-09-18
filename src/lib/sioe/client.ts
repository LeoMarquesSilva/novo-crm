import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_SIOE_URL = "https://pzfxmlidwdmsqfwrxdbd.supabase.co";
const PAGE_SIZE = 1000;

export type SioePessoaResumo = {
  id: string;
  grupoCliente: string | null;
  cpfCnpj: string | null;
  nome: string;
};

export type SioeTituloResumo = {
  pessoaId: string | null;
  situacao: string;
  valor: number;
  competencia: string | null;
};

function sioeUrl(): string {
  return process.env.SIOE_SUPABASE_URL?.trim() || DEFAULT_SIOE_URL;
}

function sioeKey(): string | null {
  return process.env.SIOE_SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
}

export function isSioeConfigured(): boolean {
  return Boolean(sioeKey());
}

function sioeClient(): SupabaseClient | null {
  const key = sioeKey();
  if (!key) return null;
  return createClient(sioeUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function fetchAllRows<T extends Record<string, unknown>>(
  client: SupabaseClient,
  table: string,
  columns: string,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await client.from(table).select(columns).range(from, to);
    if (error) throw new Error(`Falha ao ler ${table} no SIOE: ${error.message}`);
    const batch = (data ?? []) as unknown as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

export async function fetchSioePessoas(): Promise<SioePessoaResumo[] | null> {
  const client = sioeClient();
  if (!client) return null;
  try {
    const rows = await fetchAllRows<Record<string, unknown>>(
      client,
      "pessoas",
      "id, nome, grupo_cliente, cpf_cnpj",
    );
    return rows.map((row) => ({
      id: String(row.id),
      nome: String(row.nome ?? ""),
      grupoCliente: (row.grupo_cliente as string | null) ?? null,
      cpfCnpj: (row.cpf_cnpj as string | null) ?? null,
    }));
  } catch {
    return null;
  }
}

export async function fetchSioeTitulos(): Promise<SioeTituloResumo[] | null> {
  const client = sioeClient();
  if (!client) return null;
  try {
    const rows = await fetchAllRows<Record<string, unknown>>(
      client,
      "financeiro_parcelas",
      "pessoa_id, situacao, valor, competencia",
    );
    return rows.map((row) => ({
      pessoaId: row.pessoa_id ? String(row.pessoa_id) : null,
      situacao: String(row.situacao ?? "").toUpperCase(),
      valor: Number(row.valor ?? 0),
      competencia: (row.competencia as string | null) ?? null,
    }));
  } catch {
    return null;
  }
}
