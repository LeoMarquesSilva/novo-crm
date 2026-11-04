import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const includeLeadContract = vi.fn();
vi.mock("./include-lead-contract", () => ({ includeLeadContract: (...args: unknown[]) => includeLeadContract(...args) }));

import { autoIncludeLeadContract } from "./auto-include";

/** Supabase de mentira: contrato, versão 1 (com snapshot) e contagem de componentes. */
function client(state: { snapshot?: unknown; components?: number }) {
  return {
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () =>
          table === "contratos"
            ? { data: { id: "c1" } }
            : { data: { id: "v1", origem_snapshot: state.snapshot ?? {} } },
        then: (resolve: (v: unknown) => void) => resolve({ count: state.components ?? 0 }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  includeLeadContract.mockReset();
  includeLeadContract.mockResolvedValue({ contractId: "c1", prefilled: true });
});

describe("autoIncludeLeadContract (03/11/2026)", () => {
  it("rascunho vazio: inclui sem usuário (modo automático)", async () => {
    await expect(autoIncludeLeadContract(client({}), "l1")).resolves.toMatchObject({ prefilled: true });
    expect(includeLeadContract).toHaveBeenCalledWith(expect.anything(), { opportunityId: "l1", actor: null, mode: "initial" });
  });

  it("já incluído (lead que volta à etapa) não relê o PDF", async () => {
    await expect(
      autoIncludeLeadContract(client({ snapshot: { leadInclusion: { prefilledAt: "2026-11-03T18:00:00Z" } } }), "l1"),
    ).resolves.toBeNull();
    expect(includeLeadContract).not.toHaveBeenCalled();
  });

  it("contrato já configurado à mão (com cobranças) não é sobrescrito", async () => {
    await expect(autoIncludeLeadContract(client({ components: 2 }), "l1")).resolves.toBeNull();
    expect(includeLeadContract).not.toHaveBeenCalled();
  });

  it("falha na inclusão vira log e não derruba quem chamou", async () => {
    includeLeadContract.mockRejectedValueOnce(new Error("PDF fora do ar"));
    await expect(autoIncludeLeadContract(client({}), "l1")).resolves.toBeNull();
  });
});
