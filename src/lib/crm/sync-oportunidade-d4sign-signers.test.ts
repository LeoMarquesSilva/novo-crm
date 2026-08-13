import { describe, expect, it } from "vitest";
import { syncOportunidadeFromD4SignSigners } from "./sync-oportunidade-d4sign-signers";

describe("syncOportunidadeFromD4SignSigners", () => {
  it("finalizes all-signed opportunities through the atomic RPC only", async () => {
    const operations: Array<{ table: string; kind: string; payload?: unknown }> = [];
    const opportunity = {
      id: "opportunity-1",
      etapa: "contrato_enviado",
      d4sign_signers: [],
    };

    const supabase = {
      from(table: string) {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: opportunity, error: null };
                  },
                };
              },
            };
          },
          update(payload: Record<string, unknown>) {
            operations.push({ table, kind: "update", payload });
            return { async eq() { return { error: null }; } };
          },
          async insert(payload: unknown) {
            operations.push({ table, kind: "insert", payload });
            return { error: null };
          },
        };
      },
      async rpc(name: string, payload: unknown) {
        operations.push({ table: name, kind: "rpc", payload });
        return { data: "transition-1", error: null };
      },
    };

    await syncOportunidadeFromD4SignSigners(
      supabase as never,
      opportunity.id,
      [
        {
          email: "signer@example.com",
          key_signer: "key-1",
          signed: true,
          signed_at: "2026-08-12T12:00:00.000Z",
        },
      ],
      {
        advanceStageIfAllSigned: true,
        d4signStatus: "finalized",
        nowIso: "2026-08-12T12:00:00.000Z",
      },
    );

    expect(operations).toEqual([
      {
        table: "finalize_d4sign_opportunity",
        kind: "rpc",
        payload: {
          p_opportunity_id: "opportunity-1",
          p_signers: [
            {
              email: "signer@example.com",
              key_signer: "key-1",
              signed: true,
              signed_at: "2026-08-12T12:00:00.000Z",
              role: "CONTRATANTE",
              name: null,
            },
          ],
          p_now: "2026-08-12T12:00:00.000Z",
        },
      },
      {
        table: "oportunidades",
        kind: "update",
        payload: { d4sign_status: "finalized" },
      },
    ]);
  });
});
