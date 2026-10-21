import { describe, expect, it } from "vitest";
import { ensureDocumentInstance } from "./document-instance";

type Row = { id: string };

/** Supabase mínimo: `select` devolve a fila de leituras na ordem; `insert` devolve `insertResult`. */
function fakeSupabase(reads: Array<Row | null>, insertResult: { data: Row | null; error: { code: string } | null }) {
  const calls = { inserts: 0, selects: 0 };
  const selectChain = {
    eq: () => selectChain,
    maybeSingle: async () => ({ data: reads[calls.selects++] ?? null, error: null }),
  };
  const client = {
    from: () => ({
      select: () => selectChain,
      insert: () => {
        calls.inserts += 1;
        return { select: () => ({ single: async () => insertResult }) };
      },
    }),
  };
  return { client: client as never, calls };
}

const params = { oportunidadeId: "opp-1", templateId: "tpl-1", appUserId: null };

describe("ensureDocumentInstance", () => {
  it("devolve o rascunho que já existe sem inserir", async () => {
    const { client, calls } = fakeSupabase([{ id: "inst-1" }], { data: null, error: null });
    await expect(ensureDocumentInstance({ supabase: client, ...params })).resolves.toEqual({ id: "inst-1" });
    expect(calls.inserts).toBe(0);
  });

  it("cria o rascunho quando ainda não existe", async () => {
    const { client } = fakeSupabase([null], { data: { id: "inst-new" }, error: null });
    await expect(ensureDocumentInstance({ supabase: client, ...params })).resolves.toEqual({ id: "inst-new" });
  });

  it("em corrida, lê o rascunho que a outra requisição criou em vez de falhar", async () => {
    const { client, calls } = fakeSupabase([null, { id: "inst-other" }], {
      data: null,
      error: { code: "23505" },
    });
    await expect(ensureDocumentInstance({ supabase: client, ...params })).resolves.toEqual({ id: "inst-other" });
    expect(calls.selects).toBe(2);
  });

  it("outros erros de gravação continuam subindo", async () => {
    const { client } = fakeSupabase([null], { data: null, error: { code: "42501" } });
    await expect(ensureDocumentInstance({ supabase: client, ...params })).rejects.toEqual({ code: "42501" });
  });
});
