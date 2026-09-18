import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

const BASE_COLUMNS = "id, nome, chave_estavel, orqestrai_id, last_synced_at";
const CATEGORIA_COLUMN = "categoria";
const INTAKE_COLUMNS =
  "tipo_lead, tipo_indicacao, nome_indicacao, areas_atuacao, intake_filled_at, intake_updated_at";

export type GrupoEconomicoCarteiraRow = {
  id: string;
  nome: string;
  chave_estavel: string;
  orqestrai_id: string | null;
  last_synced_at: string | null;
  categoria: string | null;
  tipo_lead: string | null;
  tipo_indicacao: string | null;
  nome_indicacao: string | null;
  areas_atuacao: Json;
  intake_filled_at: string | null;
};

type GrupoBaseRow = {
  id: string;
  nome: string;
  chave_estavel: string;
  orqestrai_id: string | null;
  last_synced_at: string | null;
  categoria?: string | null;
};

function withEmptyExtras(rows: GrupoBaseRow[]): GrupoEconomicoCarteiraRow[] {
  return rows.map((row) => ({
    ...row,
    categoria: row.categoria ?? null,
    tipo_lead: null,
    tipo_indicacao: null,
    nome_indicacao: null,
    areas_atuacao: [] as Json,
    intake_filled_at: null,
  }));
}

function isMissingColumnError(message: string, columns: string[]): boolean {
  return columns.some((column) => message.includes(column));
}

export async function fetchGruposEconomicosCarteira(
  supabase: SupabaseClient<Database>,
): Promise<{ data: GrupoEconomicoCarteiraRow[]; error: { message: string } | null }> {
  const selects = [
    `${BASE_COLUMNS}, ${CATEGORIA_COLUMN}, ${INTAKE_COLUMNS}`,
    `${BASE_COLUMNS}, ${INTAKE_COLUMNS}`,
    `${BASE_COLUMNS}, ${CATEGORIA_COLUMN}`,
    BASE_COLUMNS,
  ];

  let lastError: { message: string } | null = null;
  for (const columns of selects) {
    const result = await supabase.from("grupos_economicos").select(columns).order("nome");
    if (!result.error) {
      const rows = (result.data ?? []) as unknown as GrupoBaseRow[];
      if (columns.includes("tipo_lead")) {
        return {
          data: rows.map((row) => ({
            ...(row as GrupoEconomicoCarteiraRow),
            categoria: row.categoria ?? null,
          })),
          error: null,
        };
      }
      return { data: withEmptyExtras(rows), error: null };
    }
    lastError = result.error;
    const missingOptional = isMissingColumnError(result.error.message, [
      "categoria",
      "tipo_lead",
      "tipo_indicacao",
      "nome_indicacao",
      "areas_atuacao",
      "intake_filled",
    ]);
    if (!missingOptional) return { data: [], error: result.error };
  }
  return { data: [], error: lastError };
}
