import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseFake } from "@/test/supabase-fake";
import { mockCrmSession } from "@/test/mock-crm-auth";
import { PATCH, POST } from "./route";

vi.mock("@/lib/auth/server", () => ({ requireAuthApi: vi.fn() }));
vi.mock("@/lib/auth/module-access", () => ({ listUserModules: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/crm/record-lead-activity", () => ({ recordLeadActivityEvent: vi.fn() }));
vi.mock("@/lib/crm/workflow-transition-evidence", () => ({
  hasStoredGeneratedDocument: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/crm/proposta-document-data", () => ({
  loadDefaultContratoTemplate: vi.fn().mockResolvedValue(null),
}));

const leadId = "00000000-0000-4000-8000-000000000001";
const ctx = () => ({ params: Promise.resolve({ id: leadId }) });
const conclude = () =>
  PATCH(
    new NextRequest("http://localhost", { method: "PATCH", body: JSON.stringify({ status: "concluido" }) }),
    ctx(),
  );

function setupDb(assignedTo: string | null = null) {
  const fake = createSupabaseFake({
    tables: {
      contract_review_tasks: {
        maybeSingle: { data: { id: "task-1", status: "em_revisao", assigned_to: assignedTo }, error: null },
        single: { data: { id: "task-1", status: "concluido" }, error: null },
      },
      oportunidades: { maybeSingle: { data: { id: leadId, etapa: "confeccao_contrato" }, error: null } },
    },
    rpc: { transition_opportunity_atomic: { data: { transition_id: "t-1" }, error: null } },
  });
  vi.mocked(createSupabaseAdminClient).mockReturnValue(fake.client as never);
  return fake;
}

beforeEach(() => vi.clearAllMocks());

describe("PATCH review-task", () => {
  it.each(["financeiro", "controladoria"] as const)("%s sem a área Societário não conclui", async (role) => {
    mockCrmSession({ role });
    const fake = setupDb();
    const res = await conclude();
    expect(res.status).toBe(403);
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("comercial conclui e o lead avança pela RPC atômica", async () => {
    mockCrmSession({ role: "comercial" });
    const fake = setupDb();
    const res = await conclude();
    expect(res.status).toBe(200);
    expect(fake.rpc).toHaveBeenCalledWith(
      "transition_opportunity_atomic",
      expect.objectContaining({
        p_expected_stage: "confeccao_contrato",
        p_next_stage: "contrato_elaborado",
      }),
    );
  });

  it("controladoria da área Societário e Contratos conclui", async () => {
    mockCrmSession({ role: "controladoria", area: "Societário e Contratos" });
    setupDb();
    expect((await conclude()).status).toBe(200);
  });

  it("designado para a tarefa conclui", async () => {
    mockCrmSession({ role: "financeiro", appUserId: "revisor-1" });
    setupDb("revisor-1");
    expect((await conclude()).status).toBe(200);
  });
});

describe("POST review-task", () => {
  const request = (prazoRevisao: string) =>
    POST(
      new NextRequest("http://localhost", { method: "POST", body: JSON.stringify({ prazoRevisao }) }),
      ctx(),
    );

  function setupPostDb() {
    const fake = createSupabaseFake({
      tables: {
        oportunidades: { maybeSingle: { data: { id: leadId, solicitante_nome: "ACME" }, error: null } },
        contract_review_tasks: { single: { data: { id: "task-1" }, error: null } },
        app_users: { awaited: { data: [{ id: "u-1", auth_user_id: "auth-9", full_name: "Revisora" }], error: null } },
      },
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(fake.client as never);
    return fake;
  }

  it.each(["2026-10-20", "20/10/2026"])("grava %s como meia-noite de São Paulo e avisa com a mesma data", async (prazo) => {
    mockCrmSession({ role: "comercial" });
    const fake = setupPostDb();
    const res = await request(prazo);
    expect(res.status).toBe(200);
    const upsert = fake.calls.find((c) => c.table === "contract_review_tasks" && c.method === "upsert");
    expect(upsert?.args[0]).toMatchObject({ prazo_revisao: "2026-10-20T03:00:00.000Z" });
    const notification = fake.calls.find((c) => c.table === "crm_in_app_notifications" && c.method === "insert");
    const rows = notification?.args[0] as { payload: { preview: string } }[];
    expect(rows[0]?.payload.preview).toContain("Prazo: 20/10/2026");
  });

  it("recusa prazo que não é data", async () => {
    mockCrmSession({ role: "comercial" });
    const fake = setupPostDb();
    const res = await request("31/02/2026");
    expect(res.status).toBe(400);
    expect(fake.calls.some((c) => c.method === "upsert")).toBe(false);
  });
});
