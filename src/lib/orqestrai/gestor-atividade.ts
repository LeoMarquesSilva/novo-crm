import { normalizeGroupKey } from "@/lib/crm/normalize-document";

export type CarteiraClienteStatus = "ativo" | "inativo";

export const CARTEIRA_CLIENTE_STATUS_LABEL: Record<CarteiraClienteStatus, string> = {
  ativo: "Cliente ativo",
  inativo: "Cliente inativo",
};

export function carteiraClienteStatus(
  gestorAtividade: string | null | undefined,
): CarteiraClienteStatus {
  const value = (gestorAtividade ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z]+/g, " ")
    .trim();
  if (value === "ativo" || value === "ativa" || value.startsWith("ativo ")) return "ativo";
  return "inativo";
}

export type ClienteAtividadeIndex = {
  byOrqestraiId: Map<string, CarteiraClienteStatus>;
  byGroupKey: Map<string, CarteiraClienteStatus>;
};

export function buildClienteAtividadeIndex(
  groups: Array<{
    id: string;
    name: string;
    nameNormalized?: string | null;
    gestorAtividade: string | null;
  }>,
): ClienteAtividadeIndex {
  const byOrqestraiId = new Map<string, CarteiraClienteStatus>();
  const byGroupKey = new Map<string, CarteiraClienteStatus>();
  for (const group of groups) {
    const status = carteiraClienteStatus(group.gestorAtividade);
    byOrqestraiId.set(group.id, status);
    const key = normalizeGroupKey(group.nameNormalized || group.name);
    if (!key) continue;
    if (status === "ativo" || !byGroupKey.has(key)) byGroupKey.set(key, status);
  }
  return { byOrqestraiId, byGroupKey };
}

export function lookupClienteAtividade(
  index: ClienteAtividadeIndex,
  input: { orqestraiId?: string | null; groupKey?: string | null },
): CarteiraClienteStatus | null {
  if (input.orqestraiId) {
    const byId = index.byOrqestraiId.get(input.orqestraiId);
    if (byId) return byId;
  }
  if (input.groupKey) {
    return index.byGroupKey.get(input.groupKey) ?? null;
  }
  return null;
}
