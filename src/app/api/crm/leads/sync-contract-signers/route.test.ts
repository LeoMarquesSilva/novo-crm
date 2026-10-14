import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { getD4SignQuotaStatus } from "@/lib/d4sign/api-usage";
import { mockCrmSession } from "@/test/mock-crm-auth";
import { POST } from "./route";

vi.mock("@/lib/auth/server", () => ({ requireAuthApi: vi.fn() }));
vi.mock("@/lib/auth/module-access", () => ({ listUserModules: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/d4sign/api-usage", () => ({
  getD4SignQuotaStatus: vi.fn(),
  isD4SignQuotaExhausted: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

describe("POST sync-contract-signers", () => {
  it.each(["financeiro", "controladoria"] as const)("%s não gasta cota da D4Sign", async (role) => {
    mockCrmSession({ role });
    const res = await POST(new NextRequest("http://localhost", { method: "POST", body: "{}" }));
    expect(res.status).toBe(403);
    expect(getD4SignQuotaStatus).not.toHaveBeenCalled();
  });
});
