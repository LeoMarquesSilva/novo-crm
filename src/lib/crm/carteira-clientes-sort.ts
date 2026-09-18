import type { CarteiraClienteStatus } from "@/lib/orqestrai/gestor-atividade";

export type CarteiraGruposSortKey = "nome" | "status";
export type CarteiraGruposSortDirection = "asc" | "desc";

export type CarteiraGruposSort = {
  key: CarteiraGruposSortKey;
  direction: CarteiraGruposSortDirection;
};

export const CARTEIRA_GRUPOS_DEFAULT_SORT: CarteiraGruposSort = {
  key: "nome",
  direction: "asc",
};

export function carteiraStatusSortRank(status: CarteiraClienteStatus | null): number {
  if (status === "ativo") return 0;
  if (status === "inativo") return 1;
  return 2;
}

function compareNome(left: string, right: string): number {
  return left.localeCompare(right, "pt-BR", { sensitivity: "base", numeric: true });
}

function compareStatus(
  left: CarteiraClienteStatus | null,
  right: CarteiraClienteStatus | null,
  direction: CarteiraGruposSortDirection,
): number {
  const leftRank = carteiraStatusSortRank(left);
  const rightRank = carteiraStatusSortRank(right);
  const leftUnknown = leftRank === 2;
  const rightUnknown = rightRank === 2;
  if (leftUnknown !== rightUnknown) return leftUnknown ? 1 : -1;
  const delta = leftRank - rightRank;
  return direction === "asc" ? delta : -delta;
}

export function compareCarteiraGrupos<T extends { nome: string; clienteStatus: CarteiraClienteStatus | null }>(
  left: T,
  right: T,
  sort: CarteiraGruposSort = CARTEIRA_GRUPOS_DEFAULT_SORT,
): number {
  if (sort.key === "status") {
    const byStatus = compareStatus(left.clienteStatus, right.clienteStatus, sort.direction);
    if (byStatus !== 0) return byStatus;
    return compareNome(left.nome, right.nome);
  }

  const byNome = compareNome(left.nome, right.nome);
  const nomeDelta = sort.direction === "asc" ? byNome : -byNome;
  if (nomeDelta !== 0) return nomeDelta;
  return compareStatus(left.clienteStatus, right.clienteStatus, "asc");
}

export function sortCarteiraGrupos<T extends { nome: string; clienteStatus: CarteiraClienteStatus | null }>(
  rows: readonly T[],
  sort: CarteiraGruposSort = CARTEIRA_GRUPOS_DEFAULT_SORT,
): T[] {
  return [...rows].sort((left, right) => compareCarteiraGrupos(left, right, sort));
}

export function toggleCarteiraGruposSort(
  current: CarteiraGruposSort,
  nextKey: CarteiraGruposSortKey,
): CarteiraGruposSort {
  if (current.key === nextKey) {
    return { key: nextKey, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key: nextKey, direction: "asc" };
}
