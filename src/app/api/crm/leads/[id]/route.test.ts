import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseFake } from "@/test/supabase-fake";
import { mockCrmSession } from "@/test/mock-crm-auth";
import { patchLeadDetail } from "@/lib/crm/patch-lead-detail";
import {
  solicitarAberturaVios,
  viosAberturaModo,
} from "@/modules/crm/application/services/solicitar-abertura-vios";
import { DELETE, PATCH } from "./route";

vi.mock("@/lib/auth/server", () => ({ requireAuthApi: vi.fn() }));
vi.mock("@/lib/auth/module-access", () => ({ listUserModules: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/crm/record-lead-activity", () => ({ recordLeadActivityEvent: vi.fn() }));
vi.mock("@/lib/crm/patch-lead-detail", () => ({ patchLeadDetail: vi.fn() }));
vi.mock("@/modules/crm/application/services/solicitar-abertura-vios", () => ({
  viosAberturaModo: vi.fn(() => "desligado"),
  solicitarAberturaVios: vi.fn(),
}));

const leadId = "00000000-0000-4000-8000-000000000001";
const ctx = () => ({ params: Promise.resolve({ id: leadId }) });

beforeEach(() => vi.clearAllMocks());

describe("DELETE /api/crm/leads/[id]", () => {
  it.each(["comercial", "controladoria", "financeiro"] as const)("%s não exclui lead", async (role) => {
    mockCrmSession({ role });
    const res = await DELETE(new NextRequest("http://localhost"), ctx());
    expect(res.status).toBe(403);
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("admin exclui pela RPC atômica", async () => {
    mockCrmSession({ role: "admin" });
    const fake = createSupabaseFake({ rpc: { delete_crm_lead_atomic: { data: null, error: null } } });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(fake.client as never);
    const res = await DELETE(new NextRequest("http://localhost"), ctx());
    expect(res.status).toBe(200);
    expect(fake.rpc).toHaveBeenCalledWith("delete_crm_lead_atomic", { p_opportunity_id: leadId });
  });
});

describe("PATCH /api/crm/leads/[id] — encerramento", () => {
  const patch = (body: unknown) =>
    PATCH(new NextRequest("http://localhost", { method: "PATCH", body: JSON.stringify(body) }), ctx());

  it("financeiro não marca como perdido", async () => {
    mockCrmSession({ role: "financeiro" });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(createSupabaseFake({}).client as never);
    const res = await patch({ closingStatus: { value: "perdido" } });
    expect(res.status).toBe(403);
  });

  it("não reabre venda ganha", async () => {
    mockCrmSession({ role: "comercial" });
    const fake = createSupabaseFake({
      tables: { oportunidades: { maybeSingle: { data: { encerramento: "ganho", etapa: "aguardando_cadastro" }, error: null } } },
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(fake.client as never);
    const res = await patch({ closingStatus: { value: null } });
    expect(res.status).toBe(409);
  });
});

describe("PATCH /api/crm/leads/[id] — abertura no VIOS quando a DUE é ligada depois", () => {
  const patch = (key: string, value: string) =>
    PATCH(
      new NextRequest("http://localhost", { method: "PATCH", body: JSON.stringify({ intakeField: { key, value } }) }),
      ctx(),
    );

  beforeEach(() => {
    mockCrmSession({ role: "comercial" });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(createSupabaseFake({}).client as never);
    vi.mocked(patchLeadDetail).mockResolvedValue({ ok: true });
    vi.mocked(solicitarAberturaVios).mockResolvedValue({ status: "enviado", avisos: [] });
  });

  it.each([
    ["havera_due_diligence", "Sim"],
    ["due_diligence_intake", "sim"],
    ["data_entrega_due", "2026-11-20"],
  ])("%s = %s pede a abertura", async (key, value) => {
    vi.mocked(viosAberturaModo).mockReturnValue("simular");
    const res = await patch(key, value);
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(solicitarAberturaVios).toHaveBeenCalledWith(expect.anything(), leadId));
  });

  it("desligar a DUE, outro campo ou modo desligado não pede nada", async () => {
    vi.mocked(viosAberturaModo).mockReturnValue("ativo");
    await patch("havera_due_diligence", "Não");
    await patch("local_reuniao", "Online");
    vi.mocked(viosAberturaModo).mockReturnValue("desligado");
    await patch("havera_due_diligence", "Sim");
    expect(solicitarAberturaVios).not.toHaveBeenCalled();
  });

  it("edição recusada não pede a abertura", async () => {
    vi.mocked(viosAberturaModo).mockReturnValue("ativo");
    vi.mocked(patchLeadDetail).mockResolvedValue({ ok: false, error: "x", status: 400 });
    const res = await patch("havera_due_diligence", "Sim");
    expect(res.status).toBe(400);
    expect(solicitarAberturaVios).not.toHaveBeenCalled();
  });
});
