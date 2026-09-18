import { CRM_PRACTICE_AREAS } from "@/lib/crm/crm-areas";
import { normalizePracticeAreaKey } from "@/lib/crm/area-keys-alignment";
import { normalizeGroupKey } from "@/lib/crm/normalize-document";
import { carteiraClienteStatus } from "@/lib/orqestrai/gestor-atividade";

export type HubOrphanGroup = {
  orqestraiId: string;
  name: string;
  localGroupId: string | null;
};

export type ActiveGroupCoverage = {
  activeCount: number;
  inactiveCount: number;
  coveredCount: number;
  orphans: HubOrphanGroup[];
};

export type AreaContractCount = {
  area: string;
  count: number;
};

export function countContractsByArea(items: Array<{ areas: string[] }>): AreaContractCount[] {
  const counts = new Map<string, number>();
  for (const area of CRM_PRACTICE_AREAS) counts.set(area, 0);
  for (const item of items) {
    const seen = new Set<string>();
    for (const raw of item.areas) {
      const key = normalizePracticeAreaKey(raw);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const extras = [...counts.keys()]
    .filter((key) => !(CRM_PRACTICE_AREAS as readonly string[]).includes(key))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  return [...CRM_PRACTICE_AREAS, ...extras].map((area) => ({ area, count: counts.get(area) ?? 0 }));
}

export function collectContractGroupIds(input: {
  contracts: Array<{ grupoId: string | null; clienteId: string | null }>;
  clients: Array<{ id: string; grupoId: string | null }>;
}): Set<string> {
  const clientGrupoById = new Map(
    input.clients
      .filter((client) => client.grupoId)
      .map((client) => [client.id, client.grupoId as string]),
  );
  const ids = new Set<string>();
  for (const contract of input.contracts) {
    if (contract.grupoId) ids.add(contract.grupoId);
    if (contract.clienteId) {
      const fromClient = clientGrupoById.get(contract.clienteId);
      if (fromClient) ids.add(fromClient);
    }
  }
  return ids;
}

export function computeActiveGroupCoverage(input: {
  orqestraiGroups: Array<{
    id: string;
    name: string;
    nameNormalized?: string | null;
    gestorAtividade: string | null;
  }>;
  localGroups: Array<{
    id: string;
    nome: string;
    chaveEstavel: string;
    orqestraiId: string | null;
  }>;
  contractGroupIds: Iterable<string>;
}): ActiveGroupCoverage {
  const coveredIds = new Set(input.contractGroupIds);
  const localByOrqestrai = new Map<string, (typeof input.localGroups)[number]>();
  const localByKey = new Map<string, (typeof input.localGroups)[number]>();
  for (const group of input.localGroups) {
    if (group.orqestraiId) localByOrqestrai.set(group.orqestraiId, group);
    const key = normalizeGroupKey(group.chaveEstavel || group.nome);
    if (key && !localByKey.has(key)) localByKey.set(key, group);
  }

  let activeCount = 0;
  let inactiveCount = 0;
  let coveredCount = 0;
  const orphans: HubOrphanGroup[] = [];

  for (const group of input.orqestraiGroups) {
    const status = carteiraClienteStatus(group.gestorAtividade);
    if (status !== "ativo") {
      inactiveCount += 1;
      continue;
    }
    activeCount += 1;
    const key = normalizeGroupKey(group.nameNormalized || group.name);
    const local = localByOrqestrai.get(group.id) ?? (key ? localByKey.get(key) : undefined);
    if (local && coveredIds.has(local.id)) {
      coveredCount += 1;
    } else {
      orphans.push({
        orqestraiId: group.id,
        name: group.name.trim() || "Grupo sem nome",
        localGroupId: local?.id ?? null,
      });
    }
  }

  orphans.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return { activeCount, inactiveCount, coveredCount, orphans };
}
