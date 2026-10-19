import { beforeEach, describe, expect, it, vi } from "vitest";

import { recordLeadActivityEvent } from "@/lib/crm/record-lead-activity";
import { createSupabaseFake } from "@/test/supabase-fake";
import { patchLeadDetail, sameFieldValue, type PatchViewerContext } from "./patch-lead-detail";

vi.mock("@/lib/crm/record-lead-activity", () => ({ recordLeadActivityEvent: vi.fn() }));

const leadId = "00000000-0000-4000-8000-000000000001";
const definitionId = "00000000-0000-4000-8000-0000000000aa";
const admin: PatchViewerContext = { authUserId: "auth-1", appUserId: "user-1", role: "admin", appArea: null };

function fakeWith(existing: { id: string; value_json: unknown } | null) {
  return createSupabaseFake({
    tables: {
      field_definitions: {
        awaited: {
          data: [{ id: definitionId, field_type: "text", entity_name: "oportunidade", field_code: "cc_valores", label: "Valores" }],
          error: null,
        },
      },
      field_values: {
        awaited: { data: existing ? [existing] : [], error: null },
        single: { data: { id: "fv-new" }, error: null },
      },
      oportunidades: { maybeSingle: { data: { etapa: "confeccao_contrato" }, error: null } },
    },
  });
}

const patchValue = (fake: ReturnType<typeof fakeWith>, value: string) =>
  patchLeadDetail(fake.client as never, leadId, { pipelineField: { fieldDefinitionId: definitionId, value } }, { viewer: admin });

const writes = (fake: ReturnType<typeof fakeWith>) =>
  fake.calls.filter((c) => c.table === "field_values" && (c.method === "update" || c.method === "insert"));

beforeEach(() => vi.clearAllMocks());

describe("campo de pipeline sem mudança", () => {
  it("valor igual ao gravado não grava nem registra histórico", async () => {
    const fake = fakeWith({ id: "fv-1", value_json: "R$ 12.000,00" });
    expect(await patchValue(fake, "  R$ 12.000,00 ")).toEqual({ ok: true });
    expect(writes(fake)).toHaveLength(0);
    expect(recordLeadActivityEvent).not.toHaveBeenCalled();
  });

  it("vazio sem linha gravada não cria linha vazia nem evento", async () => {
    const fake = fakeWith(null);
    expect(await patchValue(fake, "")).toEqual({ ok: true });
    expect(writes(fake)).toHaveLength(0);
    expect(recordLeadActivityEvent).not.toHaveBeenCalled();
  });

  it("valor diferente grava e registra no histórico", async () => {
    const fake = fakeWith({ id: "fv-1", value_json: "R$ 10.000,00" });
    expect(await patchValue(fake, "R$ 12.000,00")).toEqual({ ok: true });
    expect(writes(fake).map((c) => c.method)).toEqual(["update"]);
    expect(recordLeadActivityEvent).toHaveBeenCalledTimes(1);
  });
});

describe("sameFieldValue", () => {
  it("trata ausente, vazio e lista vazia como o mesmo valor", () => {
    expect(sameFieldValue(null, "")).toBe(true);
    expect(sameFieldValue(undefined, [])).toBe(true);
    expect(sameFieldValue(["Cível", "Trabalhista"], ["Cível", "Trabalhista"])).toBe(true);
    expect(sameFieldValue(["Cível"], ["Cível", "Trabalhista"])).toBe(false);
    expect(sameFieldValue("Sim", "Não")).toBe(false);
  });
});
