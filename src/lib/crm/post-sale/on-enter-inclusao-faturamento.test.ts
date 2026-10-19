import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { resolveContractSetupAlert } from "./on-enter-inclusao-faturamento";

function recordingClient() {
  const calls: Array<[string, ...unknown[]]> = [];
  const chain = {
    update(values: unknown) {
      calls.push(["update", values]);
      return chain;
    },
    eq(column: string, value: unknown) {
      calls.push(["eq", column, value]);
      return chain;
    },
    neq(column: string, value: unknown) {
      calls.push(["neq", column, value]);
      return Promise.resolve({ error: null });
    },
  };
  const client = {
    from(table: string) {
      calls.push(["from", table]);
      return chain;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("resolveContractSetupAlert", () => {
  it("fecha o alerta de implantação aberto do contrato ativado", async () => {
    const { client, calls } = recordingClient();
    await resolveContractSetupAlert(client, {
      contractId: "cd0e50a2-b124-4bfb-8125-876924578ac9",
      actorAppUserId: "user-1",
      now: "2026-10-18T18:00:00.000Z",
    });
    expect(calls).toEqual([
      ["from", "contrato_alertas"],
      [
        "update",
        expect.objectContaining({
          status: "resolvido",
          resolvido_em: "2026-10-18T18:00:00.000Z",
          resolvido_por: "user-1",
        }),
      ],
      ["eq", "contrato_id", "cd0e50a2-b124-4bfb-8125-876924578ac9"],
      ["eq", "tipo", "contrato_implantacao_pendente"],
      ["neq", "status", "resolvido"],
    ]);
  });
});
