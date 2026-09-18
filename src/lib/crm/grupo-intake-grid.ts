import type { CrmPracticeArea } from "@/lib/crm/crm-areas";
import {
  mergeSelectedGrupoAreas,
  type GrupoAreaAtuacao,
} from "@/lib/crm/grupo-areas-atuacao";
import {
  parseGrupoIntakeIndication,
  type GrupoIntakeIndication,
} from "@/lib/crm/grupo-intake-indication";
import { sortCarteiraGrupos } from "@/lib/crm/carteira-clientes-sort";
import type { CarteiraClienteStatus } from "@/lib/orqestrai/gestor-atividade";

export const GRUPO_INTAKE_GRID_STATUS_FILTERS = ["ativos", "inativos", "todos"] as const;
export type GrupoIntakeGridStatusFilter = (typeof GRUPO_INTAKE_GRID_STATUS_FILTERS)[number];

export type GrupoIntakeGridRow = {
  id: string;
  nome: string;
  clienteStatus: CarteiraClienteStatus | null;
  alreadyFilled: boolean;
  indication: GrupoIntakeIndication | null;
  derivedAreas: GrupoAreaAtuacao[];
  prefilledAreaKeys: CrmPracticeArea[];
};

export type GrupoIntakeRowDraft = {
  grupoId: string;
  tipoLead: string;
  tipoIndicacao?: string | null;
  nomeIndicacao?: string | null;
  selectedAreaKeys: string[];
};

export type GrupoIntakeSavedRow = {
  id: string;
  tipoLead: string;
  tipoIndicacao: string | null;
  nomeIndicacao: string | null;
  areas: GrupoAreaAtuacao[];
  intakeFilledAt: string;
  intakeUpdatedAt: string;
};

export function filterGrupoIntakeGridRows<
  T extends { nome: string; clienteStatus: CarteiraClienteStatus | null },
>(
  rows: readonly T[],
  input: { query?: string; status?: GrupoIntakeGridStatusFilter } = {},
): T[] {
  const query = (input.query ?? "").trim().toLocaleLowerCase("pt-BR");
  const status = input.status ?? "ativos";
  return rows.filter((row) => {
    if (status === "ativos" && row.clienteStatus !== "ativo") return false;
    if (status === "inativos" && row.clienteStatus !== "inativo") return false;
    if (!query) return true;
    return row.nome.toLocaleLowerCase("pt-BR").includes(query);
  });
}

export function listGrupoIntakeGridRows<T extends GrupoIntakeGridRow>(
  rows: readonly T[],
  input: { query?: string; status?: GrupoIntakeGridStatusFilter } = {},
): T[] {
  return sortCarteiraGrupos(filterGrupoIntakeGridRows(rows, input));
}

export function prepareGrupoIntakeRowSave(input: {
  draft: GrupoIntakeRowDraft;
  derived: readonly GrupoAreaAtuacao[];
  previousFilledAt?: string | null;
  now: string;
}): { ok: true; value: GrupoIntakeSavedRow } | { ok: false; error: string } {
  const grupoId = input.draft.grupoId?.trim();
  if (!grupoId) return { ok: false, error: "Grupo econômico não informado." };

  const indication = parseGrupoIntakeIndication({
    tipoLead: input.draft.tipoLead,
    tipoIndicacao: input.draft.tipoIndicacao,
    nomeIndicacao: input.draft.nomeIndicacao,
  });
  if (!indication.ok) return indication;

  return {
    ok: true,
    value: {
      id: grupoId,
      tipoLead: indication.value.tipoLead,
      tipoIndicacao: indication.value.tipoIndicacao,
      nomeIndicacao: indication.value.nomeIndicacao,
      areas: mergeSelectedGrupoAreas({
        selectedAreaKeys: input.draft.selectedAreaKeys,
        derived: input.derived,
      }),
      intakeFilledAt: input.previousFilledAt ?? input.now,
      intakeUpdatedAt: input.now,
    },
  };
}

export function applyGrupoIntakeGridSaves(
  store: Record<string, GrupoIntakeSavedRow>,
  saves: Array<{ ok: true; value: GrupoIntakeSavedRow } | { ok: false; error: string }>,
): { store: Record<string, GrupoIntakeSavedRow>; savedIds: string[]; errors: string[] } {
  const next = { ...store };
  const savedIds: string[] = [];
  const errors: string[] = [];
  for (const save of saves) {
    if (!save.ok) {
      errors.push(save.error);
      continue;
    }
    next[save.value.id] = save.value;
    savedIds.push(save.value.id);
  }
  return { store: next, savedIds, errors };
}
