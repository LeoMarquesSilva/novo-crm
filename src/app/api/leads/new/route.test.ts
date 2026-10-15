import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mockCrmSession } from "@/test/mock-crm-auth";
import { POST } from "./route";

vi.mock("@/lib/auth/server", () => ({ requireAuthApi: vi.fn() }));
vi.mock("@/lib/auth/module-access", () => ({ listUserModules: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe("POST /api/leads/new — permissão", () => {
  it.each(["controladoria", "financeiro"] as const)("%s não cria lead", async (role) => {
    mockCrmSession({ role });
    const res = await POST(new Request("http://localhost/api/leads/new", { method: "POST", body: "{}" }));
    expect(res.status).toBe(403);
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("comercial passa da permissão (payload inválido cai na validação)", async () => {
    mockCrmSession({ role: "comercial" });
    const res = await POST(new Request("http://localhost/api/leads/new", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
  });
});
