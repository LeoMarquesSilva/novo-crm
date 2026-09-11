import type { ContractEngineEvent, ContractEngineEventType } from "./types";

export function appendContractEngineEvent(
  events: ContractEngineEvent[] | undefined,
  input: {
    type: ContractEngineEventType;
    actorId?: string | null;
    actorName?: string;
    payload?: Record<string, unknown>;
    at?: string;
  },
): ContractEngineEvent[] {
  return [
    ...(events ?? []),
    {
      type: input.type,
      at: input.at ?? new Date().toISOString(),
      actorId: input.actorId ?? null,
      actorName: input.actorName,
      payload: input.payload ?? {},
    },
  ];
}
