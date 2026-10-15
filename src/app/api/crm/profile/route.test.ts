import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PATCH } from "./route";

vi.mock("@/lib/auth/server", () => ({ requireAuthApi: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

const eq = vi.fn();
const update = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ update }));

function patch(body: unknown) {
  return PATCH(
    new Request("http://localhost/api/crm/profile", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  eq.mockResolvedValue({ error: null });
  vi.mocked(requireAuthApi).mockResolvedValue({
    ok: true,
    profile: {
      id: "app-user-1",
      auth_user_id: "auth-1",
      role: "comercial",
      full_name: "Maria",
      avatar_url: null,
      area: "Cível",
    },
  } as Awaited<ReturnType<typeof requireAuthApi>>);
  vi.mocked(createSupabaseAdminClient).mockReturnValue({ from } as unknown as ReturnType<
    typeof createSupabaseAdminClient
  >);
});

describe("PATCH /api/crm/profile", () => {
  it.each([
    [{ full_name: "Maria Silva", avatar_url: null, role: "admin" }],
    [{ full_name: "Maria Silva", avatar_url: null, area: "Societário e Contratos" }],
    [{ full_name: "Maria Silva", avatar_url: null, id: "outro" }],
  ])("recusa campos privilegiados %j", async (body) => {
    const res = await patch(body);
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it.each(["javascript:alert(1)", "http://exemplo.com/foto.png"])(
    "recusa foto fora de https (%s)",
    async (avatar) => {
      const res = await patch({ full_name: "Maria Silva", avatar_url: avatar });
      expect(res.status).toBe(400);
      expect(update).not.toHaveBeenCalled();
    },
  );

  it("grava só nome e foto no próprio registro", async () => {
    const res = await patch({ full_name: "Maria Silva", avatar_url: "https://exemplo.com/f.png" });
    expect(res.status).toBe(200);
    expect(from).toHaveBeenCalledWith("app_users");
    expect(update).toHaveBeenCalledWith({
      full_name: "Maria Silva",
      avatar_url: "https://exemplo.com/f.png",
    });
    expect(eq).toHaveBeenCalledWith("id", "app-user-1");
  });

  it("não expõe erro do banco", async () => {
    eq.mockResolvedValue({ error: { message: "column secret does not exist", code: "42703" } });
    const res = await patch({ full_name: "Maria Silva", avatar_url: null });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(JSON.stringify(json)).not.toContain("column");
  });

  it("exige sessão", async () => {
    const { NextResponse } = await import("next/server");
    vi.mocked(requireAuthApi).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false }, { status: 401 }),
    });
    const res = await patch({ full_name: "Maria Silva", avatar_url: null });
    expect(res.status).toBe(401);
  });
});
