import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

const order: string[] = [];
const notifyAudience = vi.fn(async () => void order.push("notify"));
const autoIncludeLeadContract = vi.fn(async () => {
  order.push("include");
  return { contractId: "c1", prefilled: true };
});
vi.mock("@/lib/crm/notifications/crm-notify", () => ({ notifyAudience: (...a: unknown[]) => notifyAudience(...(a as [])) }));
vi.mock("@/lib/crm/contract-inclusion/auto-include", () => ({
  autoIncludeLeadContract: (...a: unknown[]) => autoIncludeLeadContract(...(a as [])),
}));

import { onEnteredInclusaoFaturamento, resolveContractSetupAlert } from "./on-enter-inclusao-faturamento";

/** Contrato do lead + alerta + responsável operacional (nenhum). */
function stageClient() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    or: () => chain,
    not: () => chain,
    limit: () => chain,
    upsert: async () => ({ error: null }),
    maybeSingle: async () => ({ data: { id: "c1", titulo: "Contrato ACME" } }),
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

describe("onEnteredInclusaoFaturamento (03/11/2026)", () => {
  it("inclui o contrato e só então avisa o Financeiro, com link para a configuração", async () => {
    order.length = 0;
    await onEnteredInclusaoFaturamento(stageClient(), { opportunityId: "l1", leadName: "ACME" });
    await vi.waitFor(() => expect(notifyAudience).toHaveBeenCalled());
    expect(order).toEqual(["include", "notify"]);
    expect(notifyAudience).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ path: "/crm/contratos/c1?setup=1&returnTo=%2Fcrm%2Fleads%2Fl1" }),
    );
  });

  it("conversão em lote (sem aviso) não inclui nem lê PDF", async () => {
    autoIncludeLeadContract.mockClear();
    notifyAudience.mockClear();
    await onEnteredInclusaoFaturamento(stageClient(), { opportunityId: "l1", notify: false });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(autoIncludeLeadContract).not.toHaveBeenCalled();
    expect(notifyAudience).not.toHaveBeenCalled();
  });
});

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
