import { vi } from "vitest";

import { requireAuthApi } from "@/lib/auth/server";
import { listUserModules } from "@/lib/auth/module-access";
import type { CrmModule, CrmRole } from "@/lib/auth/crm-access-policy";

/**
 * Prepara a sessão falsa para testes de rota. O teste precisa declarar antes:
 *   vi.mock("@/lib/auth/server", () => ({ requireAuthApi: vi.fn() }));
 *   vi.mock("@/lib/auth/module-access", () => ({ listUserModules: vi.fn() }));
 * Assim a política real (`crm-access-policy`) roda sobre o papel informado.
 */
export function mockCrmSession(input: {
  role: CrmRole;
  appUserId?: string;
  area?: string | null;
  email?: string;
  modules?: CrmModule[];
}) {
  vi.mocked(requireAuthApi).mockResolvedValue({
    ok: true,
    user: { id: "auth-1", email: input.email ?? "pessoa@bp.com.br" },
    profile: {
      id: input.appUserId ?? "app-user-1",
      auth_user_id: "auth-1",
      role: input.role,
      full_name: "Pessoa Teste",
      avatar_url: null,
      area: input.area ?? null,
    },
  } as Awaited<ReturnType<typeof requireAuthApi>>);
  vi.mocked(listUserModules).mockResolvedValue(input.modules ?? []);
}
