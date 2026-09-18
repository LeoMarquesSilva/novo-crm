import type { OrqestraiClientGroup } from "@/lib/orqestrai/client-groups";
import { normalizeGroupKey } from "@/lib/crm/normalize-document";
import { legacyCategoriaAsResponsibleArea } from "@/lib/crm/grupo-categoria";
import {
  carteiraClienteStatus,
  type CarteiraClienteStatus,
} from "@/lib/orqestrai/gestor-atividade";

export function persistGestorAtividade(value: string | null | undefined): "ativo" | "inativo" | null {
  if (value === "ativo" || value === "inativo") return value;
  return null;
}

export type CarteiraGrupoOrqestraiFields = {
  orqestrai_id?: string | null;
  chave_estavel?: string | null;
  gestor_atividade?: string | null;
  responsible_area?: string | null;
  legal_areas?: string[] | null;
  categoria?: string | null;
};

export type OrqestraiGroupLookup = {
  byId: Map<string, OrqestraiClientGroup>;
  byKey: Map<string, OrqestraiClientGroup>;
};

export function buildOrqestraiGroupLookup(
  groups: readonly OrqestraiClientGroup[] | null | undefined,
): OrqestraiGroupLookup {
  const byId = new Map<string, OrqestraiClientGroup>();
  const byKey = new Map<string, OrqestraiClientGroup>();
  for (const group of groups ?? []) {
    byId.set(group.id, group);
    const key = normalizeGroupKey(group.nameNormalized || group.name);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, group);
  }
  return { byId, byKey };
}

export function findOrqestraiGroup(
  lookup: OrqestraiGroupLookup,
  input: { orqestraiId?: string | null; groupKey?: string | null },
): OrqestraiClientGroup | null {
  if (input.orqestraiId) {
    const byId = lookup.byId.get(input.orqestraiId);
    if (byId) return byId;
  }
  if (input.groupKey) return lookup.byKey.get(input.groupKey) ?? null;
  return null;
}

export function persistedClienteStatus(
  value: string | null | undefined,
): CarteiraClienteStatus | null {
  const persisted = persistGestorAtividade(value);
  return persisted ? carteiraClienteStatus(persisted) : null;
}

export function enrichCarteiraGrupoOrqestrai(
  grupo: CarteiraGrupoOrqestraiFields,
  lookup: OrqestraiGroupLookup,
): {
  clienteStatus: CarteiraClienteStatus | null;
  responsibleArea: string | null;
  legalAreas: string[];
} {
  const live = findOrqestraiGroup(lookup, {
    orqestraiId: grupo.orqestrai_id,
    groupKey: grupo.chave_estavel,
  });
  const clienteStatus = live
    ? carteiraClienteStatus(live.gestorAtividade)
    : persistedClienteStatus(grupo.gestor_atividade);
  const responsibleArea =
    live?.responsibleArea?.trim() ||
    grupo.responsible_area?.trim() ||
    legacyCategoriaAsResponsibleArea(grupo.categoria);
  const liveLegal = (live?.legalAreas ?? []).map((area) => area.trim()).filter(Boolean);
  const persistedLegal = (grupo.legal_areas ?? []).map((area) => area.trim()).filter(Boolean);
  return {
    clienteStatus,
    responsibleArea,
    legalAreas: liveLegal.length ? liveLegal : persistedLegal,
  };
}
