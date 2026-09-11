import { CONTRACT_CLAUSE_CATALOG } from "./clause-catalog";
import { toTitleCasePt } from "./title-case";
import type { ClauseCatalogStatus, ClauseRole, ContractClauseTemplate } from "./types";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

const CLAUSE_ROLES: ClauseRole[] = [
  "object",
  "scope",
  "limitation",
  "exclusion",
  "nature",
  "contracted_obligation",
  "contracting_obligation",
  "payment",
  "default",
  "term",
  "termination",
  "expense",
  "compliance",
  "general",
  "special",
];

const CLAUSE_STATUSES: ClauseCatalogStatus[] = ["pending_legal_review", "approved", "retired"];

export type ClauseLibraryRow = {
  stable_key: string | null;
  title: string;
  content: string;
  role: string | null;
  category: string;
  version: number;
  status: string;
  sort_order: number;
  is_required: boolean;
  is_active: boolean;
  placeholders: string[] | null;
  conflicts_json: unknown;
  legal_review_note: string | null;
};

export const CLAUSE_LIBRARY_SELECT =
  "id, stable_key, title, content, role, category, sort_order, is_active, is_required, placeholders, conflicts_json, legal_review_note, version, status, area_key, scope_subtype_key, created_at, updated_at";

function asClauseRole(value: string | null): ClauseRole {
  return CLAUSE_ROLES.includes(value as ClauseRole) ? (value as ClauseRole) : "general";
}

function asClauseStatus(value: string): ClauseCatalogStatus {
  return CLAUSE_STATUSES.includes(value as ClauseCatalogStatus)
    ? (value as ClauseCatalogStatus)
    : "pending_legal_review";
}

function asConflictsList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/** Converte uma linha ativa de `contract_clause_templates` no shape usado pelo motor. */
export function rowToClauseTemplate(row: ClauseLibraryRow): ContractClauseTemplate | null {
  if (!row.stable_key) return null;
  return {
    stableKey: row.stable_key,
    title: toTitleCasePt(row.title),
    content: row.content,
    role: asClauseRole(row.role),
    category: row.category,
    version: row.version,
    status: asClauseStatus(row.status),
    sortOrder: row.sort_order,
    isRequired: row.is_required,
    placeholders: row.placeholders ?? [],
    conflictsWithSubtypeIds: asConflictsList(row.conflicts_json),
    legalReviewNote: row.legal_review_note ?? "",
  };
}

/**
 * Monta a biblioteca de cláusulas usada pelo motor a partir das linhas ativas do
 * banco. Uma stable_key presente no catálogo fixo (`clause-catalog.ts`) mas ausente
 * ou inativa no banco cai no fallback do catálogo fixo — nunca falta cláusula.
 */
export function buildClauseLibrary(rows: ClauseLibraryRow[]): Map<string, ContractClauseTemplate> {
  const map = new Map<string, ContractClauseTemplate>();
  for (const seed of CONTRACT_CLAUSE_CATALOG) {
    map.set(seed.stableKey, seed);
  }
  for (const row of rows) {
    if (!row.is_active) continue;
    const template = rowToClauseTemplate(row);
    if (template) map.set(template.stableKey, template);
  }
  return map;
}

/** Busca as cláusulas ativas do banco e monta a biblioteca (banco > catálogo fixo). */
export async function loadClauseLibrary(
  supabase: AdminClient,
): Promise<Map<string, ContractClauseTemplate>> {
  const { data, error } = await supabase
    .from("contract_clause_templates")
    .select(CLAUSE_LIBRARY_SELECT)
    .eq("is_active", true);
  if (error) throw error;
  return buildClauseLibrary((data ?? []) as ClauseLibraryRow[]);
}
