export type CarteiraGrupoIdentity = {
  id: string;
  chave_estavel: string;
  orqestrai_id: string | null;
};

export function planCarteiraGrupoWrites<T extends {
  id: string;
  chave_estavel: string;
  orqestrai_id: string;
}>(incoming: T[], existing: CarteiraGrupoIdentity[]): { inserts: T[]; updates: T[] } {
  const byOrqestrai = new Map<string, string>();
  const byKey = new Map<string, string>();
  for (const row of existing) {
    if (row.orqestrai_id) byOrqestrai.set(row.orqestrai_id, row.id);
    byKey.set(row.chave_estavel, row.id);
  }

  const inserts: T[] = [];
  const updates: T[] = [];
  const usedLocalIds = new Set<string>();

  for (const row of incoming) {
    const localId = byOrqestrai.get(row.orqestrai_id) ?? byKey.get(row.chave_estavel);
    if (!localId) {
      inserts.push(row);
      continue;
    }
    if (usedLocalIds.has(localId)) continue;
    usedLocalIds.add(localId);
    updates.push({ ...row, id: localId });
  }

  return { inserts, updates };
}
