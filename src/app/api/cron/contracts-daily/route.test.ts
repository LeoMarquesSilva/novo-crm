import { afterEach, describe, expect, it, vi } from "vitest";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { GET } from "./route";

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

afterEach(() => vi.unstubAllEnvs());

describe("cron contracts-daily", () => {
  it("segredo errado → 401 sem abrir o banco", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-de-teste-123");
    const res = await GET(new Request("http://localhost", { headers: { authorization: "Bearer errado" } }));
    expect(res.status).toBe(401);
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });
});
