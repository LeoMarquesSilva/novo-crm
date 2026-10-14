import { describe, expect, it } from "vitest";
import { syncOportunidadeFromD4SignSigners } from "./sync-oportunidade-d4sign-signers";

function fakeSupabase(opportunity: Record<string, unknown>) {
  const operations: Array<{ table: string; kind: string; payload?: unknown }> = [];
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
          return {
            async eq() {
              return { error: null };
            },
          };
        },
      };
    },
    async rpc(name: string, payload: unknown) {
      operations.push({ table: name, kind: "rpc", payload });
      return { data: null, error: null };
    },
  };
  return { supabase, operations };
}

const signedSigner = {
  email: "signer@example.com",
  key_signer: "key-1",
  signed: true,
  signed_at: "2026-08-12T12:00:00.000Z",
};

describe("syncOportunidadeFromD4SignSigners", () => {
  it("copia os signatários do documento atual e avisa quando todos assinaram, sem finalizar por conta própria", async () => {
    const { supabase, operations } = fakeSupabase({
      id: "opportunity-1",
      etapa: "contrato_enviado",
      d4sign_signers: [],
      d4sign_document_uuid: "doc-1",
    });

    const result = await syncOportunidadeFromD4SignSigners(supabase as never, "opportunity-1", [signedSigner], {
      d4signStatus: "1",
      nowIso: "2026-08-12T12:00:00.000Z",
      documentUuid: "doc-1",
    });

    expect(result.applied).toBe(true);
    expect(result.allSigned).toBe(true);
    expect(operations.some((op) => op.kind === "rpc")).toBe(false);
    expect(operations).toEqual([
      {
        table: "oportunidades",
        kind: "update",
        payload: {
          d4sign_signers: [{ ...signedSigner, role: "CONTRATANTE", name: null }],
          d4sign_updated_at: "2026-08-12T12:00:00.000Z",
          updated_at: "2026-08-12T12:00:00.000Z",
          d4sign_status: "1",
        },
      },
    ]);
  });

  it("ignora documento que não é mais o atual do lead (reenvio)", async () => {
    const { supabase, operations } = fakeSupabase({
      id: "opportunity-1",
      etapa: "contrato_enviado",
      d4sign_signers: [],
      d4sign_document_uuid: "doc-novo",
    });

    const result = await syncOportunidadeFromD4SignSigners(supabase as never, "opportunity-1", [signedSigner], {
      documentUuid: "doc-antigo",
    });

    expect(result.applied).toBe(false);
    expect(operations).toEqual([]);
  });
});
