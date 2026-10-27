import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseFake } from "@/test/supabase-fake";
import { mockCrmSession } from "@/test/mock-crm-auth";
import { GET } from "./route";

vi.mock("@/lib/auth/server", () => ({ requireAuthApi: vi.fn() }));
vi.mock("@/lib/auth/module-access", () => ({ listUserModules: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

const alert = {
  id: "alert-1",
  contrato_id: "contract-1",
  data_base: "2027-01-01",
  status: "aberto",
  contratos: { status: "ativo" },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/crm/contracts/renewals", () => {
  it("lista as renovações dos contratos ativos numa consulta só", async () => {
    mockCrmSession({ role: "comercial" });
    const fake = createSupabaseFake({
      tables: {
        contrato_alertas: { awaited: { data: [alert], error: null } },
        app_users: { awaited: { data: [{ id: "user-1", full_name: "Controladoria" }], error: null } },
      },
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(fake.client as never);

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alerts).toEqual([{ id: "alert-1", contrato_id: "contract-1", data_base: "2027-01-01", status: "aberto" }]);
    expect(body.users).toEqual([{ id: "user-1", full_name: "Controladoria" }]);
    expect(fake.calls).toContainEqual({ table: "contrato_alertas", method: "eq", args: ["tipo", "contrato_renovacao_pendente"] });
    expect(fake.calls).toContainEqual({ table: "contrato_alertas", method: "eq", args: ["contratos.status", "ativo"] });
    expect(fake.calls.filter((call) => call.table === "contrato_alertas" && call.method === "select")).toHaveLength(1);
  });

  it("devolve a resposta de autenticação quando não há sessão", async () => {
    const { requireAuthApi } = await import("@/lib/auth/server");
    vi.mocked(requireAuthApi).mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 401 }),
    } as Awaited<ReturnType<typeof requireAuthApi>>);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });
});
