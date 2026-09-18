import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isOwnLawFirmRoot } from "@/lib/contract-import/constants";
import {
  buildSioeRateioSnapshot,
  type SioeHonorarioItem,
  type SioeRateioSnapshot,
} from "@/lib/contract-import/sioe-rateio";
import { cnpjRoot, digitsOnly, isCnpj, isCpf } from "@/lib/crm/normalize-document";

const DEFAULT_SIOE_URL = "https://pzfxmlidwdmsqfwrxdbd.supabase.co";
const PAGE_SIZE = 1000;
const IN_FILTER_SIZE = 80;

function sioeUrl(): string {
  return process.env.SIOE_SUPABASE_URL?.trim() || DEFAULT_SIOE_URL;
}

function sioeKey(): string | null {
  return process.env.SIOE_SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
}

function sioeClient(): SupabaseClient | null {
  const key = sioeKey();
  if (!key) return null;
  return createClient(sioeUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function formatCnpj(digits: string): string {
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function formatCnpjRoot(digits: string): string {
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}`;
}

function formatCpf(digits: string): string {
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function documentsForSioeRateio(documents: Array<string | null | undefined>): string[] {
  return [...new Set(documents.map(digitsOnly).filter(Boolean))].filter(
    (digits) => !isOwnLawFirmRoot(cnpjRoot(digits)),
  );
}

async function inChunks<T, R>(
  values: T[],
  size: number,
  load: (chunk: T[]) => Promise<R[]>,
): Promise<R[]> {
  const rows: R[] = [];
  for (let index = 0; index < values.length; index += size) {
    rows.push(...(await load(values.slice(index, index + size))));
  }
  return rows;
}

async function fetchPaged<T extends Record<string, unknown>>(
  loadPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  errorLabel: string,
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await loadPage(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`${errorLabel}: ${error.message}`);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

type SioePessoaRow = { id: string; grupo_cliente: string | null; cpf_cnpj: string | null };

function keepClientPessoa(row: SioePessoaRow): boolean {
  return !isOwnLawFirmRoot(cnpjRoot(row.cpf_cnpj));
}

async function fetchPessoasByDocuments(
  client: SupabaseClient,
  documents: string[],
): Promise<SioePessoaRow[]> {
  const exactValues = new Set<string>();
  const likePrefixes = new Set<string>();
  for (const digits of documents) {
    if (isCnpj(digits)) {
      exactValues.add(formatCnpj(digits));
      exactValues.add(digits);
      likePrefixes.add(formatCnpjRoot(digits));
      likePrefixes.add(digits.slice(0, 8));
    } else if (isCpf(digits)) {
      exactValues.add(formatCpf(digits));
      exactValues.add(digits);
    }
  }

  const queries: Array<Promise<SioePessoaRow[]>> = [
    ...[...exactValues].map((value) =>
      fetchPaged<SioePessoaRow>(
        (from, to) =>
          client.from("pessoas").select("id, grupo_cliente, cpf_cnpj").eq("cpf_cnpj", value).range(from, to),
        "Falha ao localizar pessoa no SIOE",
      ),
    ),
    ...[...likePrefixes].map((prefix) =>
      fetchPaged<SioePessoaRow>(
        (from, to) =>
          client.from("pessoas").select("id, grupo_cliente, cpf_cnpj").like("cpf_cnpj", `${prefix}%`).range(from, to),
        "Falha ao localizar pessoa no SIOE",
      ),
    ),
  ];
  return (await Promise.all(queries)).flat();
}

async function fetchPessoasByGroups(client: SupabaseClient, groupNames: string[]): Promise<SioePessoaRow[]> {
  const unique = [...new Set(groupNames.map((name) => name.trim()).filter(Boolean))];
  if (!unique.length) return [];
  return inChunks(unique, 40, async (chunk) =>
    fetchPaged<SioePessoaRow>(
      (from, to) =>
        client.from("pessoas").select("id, grupo_cliente, cpf_cnpj").in("grupo_cliente", chunk).range(from, to),
      "Falha ao casar grupo_cliente no SIOE",
    ),
  );
}

export async function fetchSioeHonorariosRateio(
  documents: string[],
  options?: { groupNames?: string[] },
): Promise<SioeRateioSnapshot | null> {
  const client = sioeClient();
  if (!client) return null;
  const uniqueDocs = documentsForSioeRateio(documents);
  const seedGroups = [...new Set((options?.groupNames ?? []).map((name) => name.trim()).filter(Boolean))];
  if (!uniqueDocs.length && !seedGroups.length) return null;

  const pessoaById = new Map<string, SioePessoaRow>();
  const addPessoas = (rows: SioePessoaRow[]) => {
    for (const row of rows) {
      if (!keepClientPessoa(row)) continue;
      pessoaById.set(String(row.id), {
        id: String(row.id),
        grupo_cliente: row.grupo_cliente ?? null,
        cpf_cnpj: row.cpf_cnpj ?? null,
      });
    }
  };

  if (uniqueDocs.length) addPessoas(await fetchPessoasByDocuments(client, uniqueDocs));
  const groupNames = [
    ...seedGroups,
    ...[...pessoaById.values()].map((row) => String(row.grupo_cliente ?? "").trim()).filter(Boolean),
  ];
  addPessoas(await fetchPessoasByGroups(client, groupNames));
  if (!pessoaById.size) return null;

  const parcelas = await inChunks([...pessoaById.keys()], IN_FILTER_SIZE, async (chunk) =>
    fetchPaged<{ ci_titulo: number | null }>(
      (from, to) =>
        client
          .from("financeiro_parcelas")
          .select("ci_titulo, pessoa_id, situacao")
          .in("pessoa_id", chunk)
          .in("situacao", ["ABERTO", "PAGO"])
          .range(from, to),
      "Falha ao ler títulos no SIOE",
    ),
  );
  const ciTitulos = [
    ...new Set(parcelas.map((row) => row.ci_titulo).filter((value): value is number => value != null)),
  ];
  if (!ciTitulos.length) return null;

  const items: SioeHonorarioItem[] = [];
  for (let from = 0; from < ciTitulos.length; from += IN_FILTER_SIZE) {
    const chunk = ciTitulos.slice(from, from + IN_FILTER_SIZE);
    const batch = await fetchPaged<Record<string, unknown>>(
      (offset, to) =>
        client
          .from("financeiro_parcelas_itens")
          .select("ci_titulo, departamento, valor_item, competencia_titulo, situacao_titulo, plano_contas, descricao")
          .in("ci_titulo", chunk)
          .range(offset, to),
      "Falha ao ler rateio no SIOE",
    );
    for (const row of batch) {
      items.push({
        ciTitulo: Number(row.ci_titulo),
        departamento: (row.departamento as string | null) ?? null,
        valorItem: Number(row.valor_item ?? 0),
        competencia: (row.competencia_titulo as string | null) ?? null,
        situacao: (row.situacao_titulo as string | null) ?? null,
        planoContas: (row.plano_contas as string | null) ?? null,
        descricao: (row.descricao as string | null) ?? null,
      });
    }
  }

  return buildSioeRateioSnapshot(items);
}
