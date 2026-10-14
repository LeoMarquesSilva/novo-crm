import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mockCrmSession } from "@/test/mock-crm-auth";
import { GET } from "./route";

vi.mock("@/lib/auth/server", () => ({ requireAuthApi: vi.fn() }));
vi.mock("@/lib/auth/module-access", () => ({ listUserModules: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe("GET /api/crm/d4sign/link-lead", () => {
  it("financeiro não busca oportunidades", async () => {
    mockCrmSession({ role: "financeiro" });
    const res = await GET(new NextRequest("http://localhost/api/crm/d4sign/link-lead?q=acme"));
    expect(res.status).toBe(403);
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });
});
