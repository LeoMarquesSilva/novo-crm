import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;

export type OrqestraiClientGroup = {
  id: string;
  name: string;
  nameNormalized: string | null;
  gestorAtividade: string | null;
};

export type OrqestraiCompany = {
  id: string;
  name: string;
  cnpj: string | null;
  city: string | null;
  state: string | null;
  clientGroupId: string | null;
  sioePessoaId: string | null;
};

export type OrqestraiPerson = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpfCnpj: string | null;
  clientGroupId: string | null;
  sioePessoaId: string | null;
};

export type OrqestraiCarteiraSnapshot = {
  groups: OrqestraiClientGroup[];
  companies: OrqestraiCompany[];
  people: OrqestraiPerson[];
};

function orqestraiUrl(): string | null {
  return process.env.ORQESTRAI_SUPABASE_URL?.trim() || null;
}

function orqestraiKey(): string | null {
  return process.env.ORQESTRAI_SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
}

export function isOrqestraiConfigured(): boolean {
  return Boolean(orqestraiUrl() && orqestraiKey());
}

function orqestraiClient(): SupabaseClient | null {
  const url = orqestraiUrl();
  const key = orqestraiKey();
  if (!url || !key) return null;
  return createClient(url, key, {
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
    if (error) throw new Error(`Falha ao ler ${table} no ORQESTRAI: ${error.message}`);
    const batch = (data ?? []) as unknown as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

/**
 * Identidade de grupos/pessoas no ORQESTRAI (marketing-system):
 * `email_client_groups`, `email_companies`, `email_people`.
 * Origem original é SIOE `pessoas.grupo_cliente`, já consolidada lá.
 */
export async function fetchOrqestraiCarteira(): Promise<OrqestraiCarteiraSnapshot | null> {
  const client = orqestraiClient();
  if (!client) return null;

  try {
    const [groupRows, companyRows, peopleRows] = await Promise.all([
      fetchAllRows<Record<string, unknown>>(
        client,
        "email_client_groups",
        "id, name, name_normalized, gestor_atividade",
      ),
      fetchAllRows<Record<string, unknown>>(
        client,
        "email_companies",
        "id, name, cnpj, city, state, client_group_id, sioe_pessoa_id",
      ),
      fetchAllRows<Record<string, unknown>>(
        client,
        "email_people",
        "id, name, email, phone, cpf_cnpj, client_group_id, sioe_pessoa_id",
      ),
    ]);

    return {
      groups: groupRows.map((row) => ({
        id: String(row.id),
        name: String(row.name ?? ""),
        nameNormalized: (row.name_normalized as string | null) ?? null,
        gestorAtividade: (row.gestor_atividade as string | null) ?? null,
      })),
      companies: companyRows.map((row) => ({
        id: String(row.id),
        name: String(row.name ?? ""),
        cnpj: (row.cnpj as string | null) ?? null,
        city: (row.city as string | null) ?? null,
        state: (row.state as string | null) ?? null,
        clientGroupId: (row.client_group_id as string | null) ?? null,
        sioePessoaId: row.sioe_pessoa_id ? String(row.sioe_pessoa_id) : null,
      })),
      people: peopleRows.map((row) => ({
        id: String(row.id),
        name: String(row.name ?? ""),
        email: (row.email as string | null) ?? null,
        phone: (row.phone as string | null) ?? null,
        cpfCnpj: (row.cpf_cnpj as string | null) ?? null,
        clientGroupId: (row.client_group_id as string | null) ?? null,
        sioePessoaId: row.sioe_pessoa_id ? String(row.sioe_pessoa_id) : null,
      })),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao ler a carteira no ORQESTRAI.";
    throw new Error(message);
  }
}
