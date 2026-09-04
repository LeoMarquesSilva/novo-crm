import { describe, expect, it, vi } from "vitest";
import { resolveClientFolder } from "./resolve-client-folder";
import type { D4SignConnector } from "@/modules/crm/infrastructure/integrations/d4sign-client";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

function fakeSupabase(maybeSingleResult: { folder_uuid: string | null; folder_name: string | null } | null): SupabaseAdmin {
  const chain = {
    not: () => chain,
    ilike: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: maybeSingleResult, error: null }),
  };
  return {
    from: () => ({ select: () => chain }),
  } as unknown as SupabaseAdmin;
}

function fakeConnector(createFolder: (safeUuid: string, name: string) => Promise<string>): D4SignConnector {
  return { createFolder } as unknown as D4SignConnector;
}

describe("resolveClientFolder", () => {
  it("reaproveita pasta já existente no banco local (sem chamar a API)", async () => {
    const createFolder = vi.fn();
    const result = await resolveClientFolder({
      supabase: fakeSupabase({ folder_uuid: "folder-123", folder_name: "AGROTECHNICA" }),
      connector: fakeConnector(createFolder),
      safeUuid: "safe-1",
      clientName: "Agrotechnica Ltda",
    });
    expect(result).toEqual({ uuid: "folder-123", name: "AGROTECHNICA" });
    expect(createFolder).not.toHaveBeenCalled();
  });

  it("cria a pasta na D4Sign quando não existe nenhuma com esse nome no cofre", async () => {
    const createFolder = vi.fn(async (_safe: string, name: string) => `new-folder-for-${name}`);
    const result = await resolveClientFolder({
      supabase: fakeSupabase(null),
      connector: fakeConnector(createFolder),
      safeUuid: "safe-1",
      clientName: "Cliente Novo Ltda",
    });
    expect(createFolder).toHaveBeenCalledWith("safe-1", "Cliente Novo Ltda");
    expect(result).toEqual({ uuid: "new-folder-for-Cliente Novo Ltda", name: "Cliente Novo Ltda" });
  });

  it("retorna null sem chamar a API quando o nome do cliente está vazio", async () => {
    const createFolder = vi.fn();
    const result = await resolveClientFolder({
      supabase: fakeSupabase(null),
      connector: fakeConnector(createFolder),
      safeUuid: "safe-1",
      clientName: "   ",
    });
    expect(result).toBeNull();
    expect(createFolder).not.toHaveBeenCalled();
  });
});
