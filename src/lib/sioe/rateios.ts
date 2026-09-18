import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { digitsOnly, isCnpj, isCpf } from "@/lib/crm/normalize-document";
import {
  buildSioeRateioSnapshot,
  type SioeHonorarioItem,
  type SioeRateioSnapshot,
} from "@/lib/contract-import/sioe-rateio";

const DEFAULT_SIOE_URL = "https://pzfxmlidwdmsqfwrxdbd.supabase.co";
const PAGE_SIZE = 1000;

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

export async function fetchSioeHonorariosRateio(documents: string[]): Promise<SioeRateioSnapshot | null> {
  const client = sioeClient();
  if (!client) return null;
  const unique = [...new Set(documents.map(digitsOnly).filter(Boolean))];
  if (!unique.length) return null;

  const pessoaIds = new Set<string>();
  for (const digits of unique) {
    const filters: string[] = [];
    if (isCnpj(digits)) {
      filters.push(`cpf_cnpj.eq.${formatCnpj(digits)}`);
      filters.push(`cpf_cnpj.like.${formatCnpjRoot(digits)}%`);
    } else if (isCpf(digits)) {
      filters.push(`cpf_cnpj.eq.${formatCpf(digits)}`);
      filters.push(`cpf_cnpj.eq.${digits}`);
    } else {
      continue;
    }
    const { data, error } = await client.from("pessoas").select("id").or(filters.join(","));
    if (error) throw new Error(`Falha ao localizar pessoa no SIOE: ${error.message}`);
    for (const row of data ?? []) pessoaIds.add(String((row as { id: string }).id));
  }
  if (!pessoaIds.size) return null;

  const parcelas = await inChunks([...pessoaIds], 80, async (chunk) => {
    const { data, error } = await client
      .from("financeiro_parcelas")
      .select("ci_titulo, pessoa_id, situacao")
      .in("pessoa_id", chunk)
      .in("situacao", ["ABERTO", "PAGO"]);
    if (error) throw new Error(`Falha ao ler títulos no SIOE: ${error.message}`);
    return (data ?? []) as Array<{ ci_titulo: number | null }>;
  });
  const ciTitulos = [...new Set(parcelas.map((row) => row.ci_titulo).filter((value): value is number => value != null))];
  if (!ciTitulos.length) return null;

  const items: SioeHonorarioItem[] = [];
  for (let from = 0; from < ciTitulos.length; from += 80) {
    const chunk = ciTitulos.slice(from, from + 80);
    let offset = 0;
    for (;;) {
      const { data, error } = await client
        .from("financeiro_parcelas_itens")
        .select("ci_titulo, departamento, valor_item, competencia_titulo, situacao_titulo, plano_contas, descricao")
        .in("ci_titulo", chunk)
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(`Falha ao ler rateio no SIOE: ${error.message}`);
      const batch = (data ?? []) as Array<Record<string, unknown>>;
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
      if (batch.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  return buildSioeRateioSnapshot(items);
}
