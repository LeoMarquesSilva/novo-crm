import { beforeEach, describe, expect, it, vi } from "vitest";

import { countUnreadNotifications, sendPushToUser } from "@/lib/crm/push/web-push-server";
import { POST } from "./route";

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/crm/push/web-push-server", () => ({
  countUnreadNotifications: vi.fn().mockResolvedValue(3),
  sendPushToUser: vi.fn().mockResolvedValue({ sent: 1, removed: 0, failed: 0, configured: true }),
}));

const SECRET = "s".repeat(32);
const notification = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  tipo: "lead_note_mention",
  payload: { title: "Você foi mencionado", preview: "ACME", path: "/crm/leads/1?tab=notas" },
  created_at: "2026-11-16T13:00:00.000Z",
};

function request(body: unknown, auth: string | null = `Bearer ${SECRET}`) {
  return new Request("http://localhost/api/push/dispatch", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRM_PUSH_DISPATCH_SECRET", SECRET);
});

describe("POST /api/push/dispatch", () => {
  it("503 sem segredo configurado", async () => {
    vi.stubEnv("CRM_PUSH_DISPATCH_SECRET", "");
    const res = await POST(request({ notification }));
    expect(res.status).toBe(503);
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("401 com segredo errado ou ausente", async () => {
    expect((await POST(request({ notification }, "Bearer errado"))).status).toBe(401);
    expect((await POST(request({ notification }, null))).status).toBe(401);
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("400 com aviso inválido", async () => {
    const res = await POST(request({ notification: { ...notification, user_id: "x" } }));
    expect(res.status).toBe(400);
  });

  it("manda o push com o contador de não lidas", async () => {
    const res = await POST(request({ notification }));
    expect(res.status).toBe(200);
    expect(countUnreadNotifications).toHaveBeenCalledWith(expect.anything(), notification.user_id);
    expect(sendPushToUser).toHaveBeenCalledWith(
      expect.anything(),
      notification.user_id,
      expect.objectContaining({
        id: notification.id,
        title: "Você foi mencionado",
        path: "/crm/leads/1?tab=notas",
        group: "anotacoes",
        unread: 3,
      }),
    );
    expect(await res.json()).toMatchObject({ ok: true, sent: 1 });
  });
});
