import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { digitsOnly, isCnpj, isCpf } from "@/lib/crm/normalize-document";
import { mapSioeDepartamentoToAreaKey } from "@/lib/contract-import/sioe-rateio";
import { normalizeImportedAreaKey } from "@/lib/contract-import/schemas";
import { competencyMonthStart } from "@/lib/format-datetime";
import {
  nextCompetencyMonth,
  type VariableUsageSnapshot,
} from "@/modules/contracts/domain/variable-usage-projection";

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

async function fetchPaged<T extends Record<string, unknown>>(
  loadPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await loadPage(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

function mapUsageArea(area: string | null | undefined, departamento: string | null | undefined): string | null {
  return (
    mapSioeDepartamentoToAreaKey(area) ??
    normalizeImportedAreaKey(area ?? null) ??
    mapSioeDepartamentoToAreaKey(departamento) ??
    normalizeImportedAreaKey(departamento ?? null)
  );
}

export function aggregateSioeUsage(input: {
  competency: string;
  folderRows: Array<{ id: string; area: string | null; departamento: string | null }>;
  hourRows: Array<{ id: string; area: string | null; hours: number }>;
}): VariableUsageSnapshot {
  const foldersById = new Map<string, string | null>();
  for (const row of input.folderRows) {
    if (!foldersById.has(row.id)) foldersById.set(row.id, mapUsageArea(row.area, row.departamento));
  }
  const foldersByArea: Record<string, number> = {};
  for (const areaKey of foldersById.values()) {
    if (!areaKey) continue;
    foldersByArea[areaKey] = (foldersByArea[areaKey] ?? 0) + 1;
  }

  const hoursById = new Map<string, { areaKey: string | null; hours: number }>();
  for (const row of input.hourRows) {
    if (hoursById.has(row.id)) continue;
    hoursById.set(row.id, {
      areaKey: mapUsageArea(row.area, null),
      hours: Number.isFinite(row.hours) ? row.hours : 0,
    });
  }
  const hoursByArea: Record<string, number> = {};
  let hoursTotal = 0;
  for (const row of hoursById.values()) {
    hoursTotal += row.hours;
    if (!row.areaKey) continue;
    hoursByArea[row.areaKey] = (hoursByArea[row.areaKey] ?? 0) + row.hours;
  }

  return {
    competency: input.competency,
    foldersTotal: foldersById.size,
    hoursTotal,
    foldersByArea,
    hoursByArea,
  };
}

export async function fetchSioeContractUsage(input: {
  documents?: string[];
  groupNames?: string[];
  sioePessoaIds?: string[];
  competency?: string;
}): Promise<VariableUsageSnapshot | null> {
  const client = sioeClient();
  if (!client) return null;

  const competency = input.competency ?? competencyMonthStart();
  const hourUntil = nextCompetencyMonth(competency);
  const pessoaIds = new Set<string>((input.sioePessoaIds ?? []).filter(Boolean));
  const groupNames = [...new Set((input.groupNames ?? []).map((name) => name.trim()).filter(Boolean))];
  const uniqueDocs = [...new Set((input.documents ?? []).map(digitsOnly).filter(Boolean))];

  for (const digits of uniqueDocs) {
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
    const { data, error } = await client.from("pessoas").select("id, grupo_cliente").or(filters.join(","));
    if (error) throw new Error(`Falha ao localizar pessoa no SIOE: ${error.message}`);
    for (const row of data ?? []) {
      pessoaIds.add(String((row as { id: string }).id));
      const grupo = String((row as { grupo_cliente?: string | null }).grupo_cliente ?? "").trim();
      if (grupo) groupNames.push(grupo);
    }
  }

  const uniqueGroupNames = [...new Set(groupNames.map((name) => name.trim()).filter(Boolean))];
  if (uniqueGroupNames.length && !pessoaIds.size) {
    const byGroup = await inChunks(uniqueGroupNames, 40, async (chunk) => {
      const { data, error } = await client.from("pessoas").select("id, grupo_cliente").in("grupo_cliente", chunk);
      if (error) throw new Error(`Falha ao casar grupo_cliente no SIOE: ${error.message}`);
      return (data ?? []) as Array<{ id: string; grupo_cliente: string | null }>;
    });
    for (const row of byGroup) pessoaIds.add(String(row.id));
  }

  if (!pessoaIds.size && !uniqueGroupNames.length) {
    return aggregateSioeUsage({ competency, folderRows: [], hourRows: [] });
  }

  const folderRows: Array<{ id: string; area: string | null; departamento: string | null }> = [];
  const hourRows: Array<{ id: string; area: string | null; hours: number }> = [];
  const pessoaList = [...pessoaIds];

  if (uniqueGroupNames.length) {
    folderRows.push(
      ...(await inChunks(uniqueGroupNames, 40, async (chunk) =>
        fetchPaged<{ id: string; area: string | null; departamento: string | null }>((from, to) =>
          client
            .from("processos_completo")
            .select("id, area, departamento")
            .eq("processo_encerrado", "Não")
            .eq("situacao_processo", "Ativo")
            .in("grupo_cliente", chunk)
            .range(from, to),
        ),
      )),
    );
    hourRows.push(
      ...(await inChunks(uniqueGroupNames, 40, async (chunk) =>
        fetchPaged<{ id: string; area: string | null; total_horas_decimal: number | string | null }>((from, to) =>
          client
            .from("timesheets")
            .select("id, area, total_horas_decimal")
            .gte("data", competency)
            .lt("data", hourUntil)
            .in("grupo_cliente", chunk)
            .range(from, to),
        ).then((rows) =>
          rows.map((row) => ({
            id: String(row.id),
            area: row.area,
            hours: Number(row.total_horas_decimal ?? 0),
          })),
        ),
      )),
    );
  } else if (pessoaList.length) {
    folderRows.push(
      ...(await inChunks(pessoaList, 80, async (chunk) =>
        fetchPaged<{ id: string; area: string | null; departamento: string | null }>((from, to) =>
          client
            .from("processos_completo")
            .select("id, area, departamento")
            .eq("processo_encerrado", "Não")
            .eq("situacao_processo", "Ativo")
            .in("pessoa_id", chunk)
            .range(from, to),
        ),
      )),
    );
    hourRows.push(
      ...(await inChunks(pessoaList, 80, async (chunk) =>
        fetchPaged<{ id: string; area: string | null; total_horas_decimal: number | string | null }>((from, to) =>
          client
            .from("timesheets")
            .select("id, area, total_horas_decimal")
            .gte("data", competency)
            .lt("data", hourUntil)
            .in("pessoa_id", chunk)
            .range(from, to),
        ).then((rows) =>
          rows.map((row) => ({
            id: String(row.id),
            area: row.area,
            hours: Number(row.total_horas_decimal ?? 0),
          })),
        ),
      )),
    );
  }

  return aggregateSioeUsage({
    competency,
    folderRows: folderRows.map((row) => ({
      id: String(row.id),
      area: row.area,
      departamento: row.departamento,
    })),
    hourRows,
  });
}
