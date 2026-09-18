import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { digitsOnly, isCnpj, isCpf } from "@/lib/crm/normalize-document";
import { isSioeHonorariosItem } from "@/lib/contract-import/sioe-rateio";
import type { GrupoAreaSignals } from "@/lib/crm/grupo-areas-atuacao";

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

export async function fetchSioeGrupoAreaSignals(input: {
  documents: string[];
  sioePessoaIds?: string[];
  groupNames?: string[];
}): Promise<GrupoAreaSignals> {
  const empty: GrupoAreaSignals = { rateioDepartamentos: [], pastaAreas: [], pastaDepartamentos: [] };
  const client = sioeClient();
  if (!client) return empty;

  const pessoaIds = new Set<string>((input.sioePessoaIds ?? []).filter(Boolean));
  const groupNames = [...new Set((input.groupNames ?? []).map((name) => name.trim()).filter(Boolean))];
  const uniqueDocs = [...new Set(input.documents.map(digitsOnly).filter(Boolean))];

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

  if (input.sioePessoaIds?.length) {
    const known = await inChunks([...new Set(input.sioePessoaIds.filter(Boolean))], 80, async (chunk) => {
      const { data, error } = await client.from("pessoas").select("id, grupo_cliente").in("id", chunk);
      if (error) throw new Error(`Falha ao ler pessoas no SIOE: ${error.message}`);
      return (data ?? []) as Array<{ id: string; grupo_cliente: string | null }>;
    });
    for (const row of known) {
      pessoaIds.add(String(row.id));
      const grupo = (row.grupo_cliente ?? "").trim();
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

  const rateioDepartamentos: string[] = [];
  if (pessoaIds.size) {
    const parcelas = await inChunks([...pessoaIds], 80, async (chunk) => {
      const { data, error } = await client
        .from("financeiro_parcelas")
        .select("ci_titulo")
        .in("pessoa_id", chunk)
        .in("situacao", ["ABERTO", "PAGO"]);
      if (error) throw new Error(`Falha ao ler títulos no SIOE: ${error.message}`);
      return (data ?? []) as Array<{ ci_titulo: number | null }>;
    });
    const ciTitulos = [...new Set(parcelas.map((row) => row.ci_titulo).filter((value): value is number => value != null))];
    for (let from = 0; from < ciTitulos.length; from += 80) {
      const chunk = ciTitulos.slice(from, from + 80);
      const items = await fetchPaged<Record<string, unknown>>((from, to) =>
        client
          .from("financeiro_parcelas_itens")
          .select("departamento, plano_contas, descricao")
          .in("ci_titulo", chunk)
          .range(from, to),
      );
      for (const row of items) {
        if (
          !isSioeHonorariosItem({
            planoContas: (row.plano_contas as string | null) ?? null,
            descricao: (row.descricao as string | null) ?? null,
          })
        ) {
          continue;
        }
        const departamento = String(row.departamento ?? "").trim();
        if (departamento) rateioDepartamentos.push(departamento);
      }
    }
  }

  const pastaAreas: string[] = [];
  const pastaDepartamentos: string[] = [];
  const pessoaList = [...pessoaIds];
  const pastaRows: Array<{ area: string | null; departamento: string | null }> = [];

  if (pessoaList.length) {
    pastaRows.push(
      ...(await inChunks(pessoaList, 80, async (chunk) => {
        return fetchPaged<{ area: string | null; departamento: string | null }>((from, to) =>
          client
            .from("processos_completo")
            .select("area, departamento")
            .eq("processo_encerrado", "Não")
            .eq("situacao_processo", "Ativo")
            .in("pessoa_id", chunk)
            .range(from, to),
        );
      })),
    );
  }

  if (uniqueGroupNames.length) {
    pastaRows.push(
      ...(await inChunks(uniqueGroupNames, 40, async (chunk) => {
        return fetchPaged<{ area: string | null; departamento: string | null }>((from, to) =>
          client
            .from("processos_completo")
            .select("area, departamento")
            .eq("processo_encerrado", "Não")
            .eq("situacao_processo", "Ativo")
            .in("grupo_cliente", chunk)
            .range(from, to),
        );
      })),
    );
  }

  for (const row of pastaRows) {
    if (row.area?.trim()) pastaAreas.push(row.area.trim());
    if (row.departamento?.trim()) pastaDepartamentos.push(row.departamento.trim());
  }

  return { rateioDepartamentos, pastaAreas, pastaDepartamentos };
}

function emptyGrupoAreaSignals(): GrupoAreaSignals {
  return { rateioDepartamentos: [], pastaAreas: [], pastaDepartamentos: [] };
}

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string) {
  const current = map.get(key) ?? new Set<string>();
  current.add(value);
  map.set(key, current);
}

export async function fetchSioeGrupoAreaSignalsByGroups(
  groups: Array<{ id: string; nome: string; documents: string[]; sioePessoaIds?: string[] }>,
): Promise<Map<string, GrupoAreaSignals>> {
  const result = new Map(groups.map((group) => [group.id, emptyGrupoAreaSignals()]));
  const client = sioeClient();
  if (!client || groups.length === 0) return result;

  const pessoaToGrupos = new Map<string, Set<string>>();
  const nameToGrupos = new Map<string, Set<string>>();
  const digitToGrupos = new Map<string, Set<string>>();

  for (const group of groups) {
    addToSetMap(nameToGrupos, group.nome.trim(), group.id);
    for (const pessoaId of group.sioePessoaIds ?? []) {
      if (pessoaId) addToSetMap(pessoaToGrupos, pessoaId, group.id);
    }
    for (const document of group.documents) {
      const digits = digitsOnly(document);
      if (digits) addToSetMap(digitToGrupos, digits, group.id);
    }
  }

  const knownIds = [...pessoaToGrupos.keys()];
  if (knownIds.length) {
    const known = await inChunks(knownIds, 80, async (chunk) => {
      const { data, error } = await client.from("pessoas").select("id, grupo_cliente").in("id", chunk);
      if (error) throw new Error(`Falha ao ler pessoas no SIOE: ${error.message}`);
      return (data ?? []) as Array<{ id: string; grupo_cliente: string | null }>;
    });
    for (const row of known) {
      const grupoCliente = (row.grupo_cliente ?? "").trim();
      const grupos = pessoaToGrupos.get(String(row.id));
      if (!grupoCliente || !grupos) continue;
      for (const grupoId of grupos) addToSetMap(nameToGrupos, grupoCliente, grupoId);
    }
  }

  for (const [digits, grupoIds] of digitToGrupos) {
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
      for (const grupoId of grupoIds) {
        addToSetMap(pessoaToGrupos, String(row.id), grupoId);
        const grupo = String((row as { grupo_cliente?: string | null }).grupo_cliente ?? "").trim();
        if (grupo) addToSetMap(nameToGrupos, grupo, grupoId);
      }
    }
  }

  const uniqueGroupNames = [...nameToGrupos.keys()].filter(Boolean);
  if (uniqueGroupNames.length) {
    const byGroup = await inChunks(uniqueGroupNames, 40, async (chunk) => {
      const { data, error } = await client.from("pessoas").select("id, grupo_cliente").in("grupo_cliente", chunk);
      if (error) throw new Error(`Falha ao casar grupo_cliente no SIOE: ${error.message}`);
      return (data ?? []) as Array<{ id: string; grupo_cliente: string | null }>;
    });
    for (const row of byGroup) {
      const name = (row.grupo_cliente ?? "").trim();
      const grupos = nameToGrupos.get(name);
      if (!grupos) continue;
      for (const grupoId of grupos) addToSetMap(pessoaToGrupos, String(row.id), grupoId);
    }
  }

  const pessoaIds = [...pessoaToGrupos.keys()];
  if (pessoaIds.length) {
    const parcelas = await inChunks(pessoaIds, 80, async (chunk) => {
      const { data, error } = await client
        .from("financeiro_parcelas")
        .select("ci_titulo, pessoa_id")
        .in("pessoa_id", chunk)
        .in("situacao", ["ABERTO", "PAGO"]);
      if (error) throw new Error(`Falha ao ler títulos no SIOE: ${error.message}`);
      return (data ?? []) as Array<{ ci_titulo: number | null; pessoa_id: string }>;
    });
    const tituloToPessoas = new Map<string, Set<string>>();
    for (const row of parcelas) {
      if (row.ci_titulo == null) continue;
      addToSetMap(tituloToPessoas, String(row.ci_titulo), String(row.pessoa_id));
    }
    const ciTitulos = [...tituloToPessoas.keys()].map(Number);
    for (let offset = 0; offset < ciTitulos.length; offset += 80) {
      const chunk = ciTitulos.slice(offset, offset + 80);
      const items = await fetchPaged<Record<string, unknown>>((from, to) =>
        client
          .from("financeiro_parcelas_itens")
          .select("departamento, plano_contas, descricao, ci_titulo")
          .in("ci_titulo", chunk)
          .range(from, to),
      );
      for (const row of items) {
        if (
          !isSioeHonorariosItem({
            planoContas: (row.plano_contas as string | null) ?? null,
            descricao: (row.descricao as string | null) ?? null,
          })
        ) {
          continue;
        }
        const departamento = String(row.departamento ?? "").trim();
        if (!departamento) continue;
        const pessoas = tituloToPessoas.get(String(row.ci_titulo)) ?? new Set<string>();
        for (const pessoaId of pessoas) {
          const grupos = pessoaToGrupos.get(pessoaId);
          if (!grupos) continue;
          for (const grupoId of grupos) {
            result.get(grupoId)?.rateioDepartamentos.push(departamento);
          }
        }
      }
    }
  }

  if (pessoaIds.length) {
    const pastaRows = await inChunks(pessoaIds, 80, async (chunk) =>
      fetchPaged<{ pessoa_id: string | null; area: string | null; departamento: string | null }>((from, to) =>
        client
          .from("processos_completo")
          .select("pessoa_id, area, departamento")
          .eq("processo_encerrado", "Não")
          .eq("situacao_processo", "Ativo")
          .in("pessoa_id", chunk)
          .range(from, to),
      ),
    );
    for (const row of pastaRows) {
      const grupos = row.pessoa_id ? pessoaToGrupos.get(String(row.pessoa_id)) : null;
      if (!grupos) continue;
      for (const grupoId of grupos) {
        const current = result.get(grupoId);
        if (!current) continue;
        if (row.area?.trim()) current.pastaAreas.push(row.area.trim());
        if (row.departamento?.trim()) current.pastaDepartamentos.push(row.departamento.trim());
      }
    }
  }

  if (uniqueGroupNames.length) {
    const pastaRows = await inChunks(uniqueGroupNames, 40, async (chunk) =>
      fetchPaged<{ grupo_cliente: string | null; area: string | null; departamento: string | null }>((from, to) =>
        client
          .from("processos_completo")
          .select("grupo_cliente, area, departamento")
          .eq("processo_encerrado", "Não")
          .eq("situacao_processo", "Ativo")
          .in("grupo_cliente", chunk)
          .range(from, to),
      ),
    );
    for (const row of pastaRows) {
      const grupos = nameToGrupos.get((row.grupo_cliente ?? "").trim());
      if (!grupos) continue;
      for (const grupoId of grupos) {
        const current = result.get(grupoId);
        if (!current) continue;
        if (row.area?.trim()) current.pastaAreas.push(row.area.trim());
        if (row.departamento?.trim()) current.pastaDepartamentos.push(row.departamento.trim());
      }
    }
  }

  return result;
}
