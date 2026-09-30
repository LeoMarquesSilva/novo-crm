export type ContractAreaRef = {
  id: string;
  areaKey: string;
};

export function reattachAreaId(
  areaId: string | null | undefined,
  previousAreas: ContractAreaRef[],
  nextAreas: ContractAreaRef[],
): string | undefined {
  if (!areaId) return undefined;
  if (nextAreas.some((area) => area.id === areaId)) return areaId;
  const previousKey = previousAreas.find((area) => area.id === areaId)?.areaKey;
  const byKey = previousKey ? nextAreas.find((area) => area.areaKey === previousKey)?.id : undefined;
  if (byKey) return byKey;
  if (nextAreas.length === 1) return nextAreas[0]?.id;
  return undefined;
}

export function reattachOptionalAreaIds<T extends { areaId?: string | null }>(
  items: T[],
  previousAreas: ContractAreaRef[],
  nextAreas: ContractAreaRef[],
): T[] {
  return items.map((item) => {
    const nextId = reattachAreaId(item.areaId, previousAreas, nextAreas);
    if (nextId === (item.areaId ?? undefined)) return item;
    if (!nextId) {
      const next = { ...item };
      delete next.areaId;
      return next;
    }
    return { ...item, areaId: nextId };
  });
}

export function reattachRequiredAreaIds<T extends { areaId: string }>(
  items: T[],
  previousAreas: ContractAreaRef[],
  nextAreas: ContractAreaRef[],
): T[] {
  return items.map((item) => {
    const nextId = reattachAreaId(item.areaId, previousAreas, nextAreas);
    return nextId && nextId !== item.areaId ? { ...item, areaId: nextId } : item;
  });
}

/** Se só há uma área na versão, componentes/rateios órfãos passam a apontar para ela. */
export function bindOrphanedAreaIdsToSingleArea<
  T extends {
    areas: ContractAreaRef[];
    version: {
      components: Array<{ areaId?: string | null }>;
      areaAllocations: Array<{ areaId: string }>;
    };
  },
>(input: T): T {
  if (input.areas.length !== 1) return input;
  const onlyId = input.areas[0]?.id;
  if (!onlyId) return input;
  const ids = new Set(input.areas.map((area) => area.id));
  return {
    ...input,
    version: {
      ...input.version,
      components: input.version.components.map((component) =>
        component.areaId && !ids.has(component.areaId) ? { ...component, areaId: onlyId } : component,
      ),
      areaAllocations: input.version.areaAllocations.map((allocation) =>
        ids.has(allocation.areaId) ? allocation : { ...allocation, areaId: onlyId },
      ),
    },
  };
}
