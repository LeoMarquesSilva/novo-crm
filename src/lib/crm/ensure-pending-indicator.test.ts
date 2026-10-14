import { describe, expect, it } from "vitest";

import { createSupabaseFake } from "@/test/supabase-fake";
import { ensurePendingIndicator } from "./ensure-pending-indicator";

describe("ensurePendingIndicator", () => {
  it("avisa os admins pelo id de login (auth), não pelo app_users.id", async () => {
    const fake = createSupabaseFake({
      tables: {
        indicadores: {
          maybeSingle: (() => {
            let n = 0;
            return () => (n++ === 0 ? { data: null, error: null } : { data: { id: "i-1", nome: "Fulano" }, error: null });
          })(),
        },
        app_users: { awaited: { data: [{ id: "app-1", auth_user_id: "auth-1" }], error: null } },
      },
    });
    await ensurePendingIndicator({ supabase: fake.client as never, nome: "Fulano" });
    const insert = fake.calls.find((c) => c.table === "crm_in_app_notifications" && c.method === "insert");
    expect(insert?.args[0]).toEqual([expect.objectContaining({ user_id: "auth-1" })]);
    expect(fake.calls).toContainEqual({ table: "app_users", method: "not", args: ["auth_user_id", "is", null] });
  });
});
