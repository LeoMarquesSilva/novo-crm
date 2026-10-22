import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseFake } from "@/test/supabase-fake";

import { RdImportConnector } from "./rd-import";

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

const payload = {
  event_name: "crm_deal_updated",
  document: { id: "68924d7526c1f50018dc039b", name: "RENATO", deal_stage: { name: "Proposta Enviada" } },
};

beforeEach(() => vi.clearAllMocks());

describe("sync do RD depois da virada", () => {
  it("com o RD congelado, o webhook não lê nem grava nada", async () => {
    const fake = createSupabaseFake({
      tables: { rd_virada: { maybeSingle: { data: { congelado_em: "2026-10-25T11:00:00Z" }, error: null } } },
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(fake.client as never);

    const result = await new RdImportConnector("token").syncWebhookPayload(payload);

    expect(result).toMatchObject({ frozen: true, imported: 0 });
    expect(fake.calls.filter((c) => ["insert", "update", "upsert"].includes(c.method))).toEqual([]);
  });

  it("negócio já convertido não é alterado pelo RD", async () => {
    const fake = createSupabaseFake({
      tables: {
        rd_virada: { maybeSingle: { data: { congelado_em: null }, error: null } },
        rd_deal_reconciliacao: { maybeSingle: { data: { oportunidade_id: "opp-1" }, error: null } },
        oportunidades: { maybeSingle: { data: { rd_migrado_em: "2026-10-25T12:00:00Z" }, error: null } },
      },
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(fake.client as never);

    const result = await new RdImportConnector("token").syncWebhookPayload(payload);

    expect(result.importedDeals).toBe(0);
    expect(fake.calls.filter((c) => ["insert", "update", "upsert"].includes(c.method))).toEqual([]);
  });
});
