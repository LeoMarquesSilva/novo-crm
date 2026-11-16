import { beforeEach, describe, expect, it, vi } from "vitest";

const sendNotification = vi.fn();

vi.mock("web-push", () => {
  class WebPushError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  }
  return { default: { sendNotification: (...args: unknown[]) => sendNotification(...args) }, WebPushError };
});

import { WebPushError } from "web-push";
import { buildPushMessage } from "@/lib/crm/notifications/presentation";
import { sendPushToUser } from "./web-push-server";

type Sub = { id: string; endpoint: string; p256dh: string; auth: string; failure_count: number };

function fakeAdmin(subs: Sub[]) {
  const deleted: string[] = [];
  const updated: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const client = {
    from: () => ({
      select: () => ({ eq: async () => ({ data: subs, error: null }) }),
      delete: () => ({
        eq: async (_col: string, id: string) => {
          deleted.push(id);
          return { error: null };
        },
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: async (_col: string, id: string) => {
          updated.push({ id, patch });
          return { error: null };
        },
      }),
    }),
  };
  return { client, deleted, updated };
}

const message = buildPushMessage({
  id: "11111111-1111-4111-8111-111111111111",
  tipo: "venda_fechada",
  payload: { title: "Venda fechada", path: "/crm/leads/1" },
  created_at: "2026-11-16T12:00:00Z",
});

const sub = (id: string, failure_count = 0): Sub => ({
  id,
  endpoint: `https://push.example/${id}`,
  p256dh: "p".repeat(40),
  auth: "a".repeat(16),
  failure_count,
});

beforeEach(() => {
  sendNotification.mockReset();
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "BPublicKey");
  vi.stubEnv("VAPID_PRIVATE_KEY", "privateKey");
});

describe("sendPushToUser", () => {
  it("não faz nada sem chaves VAPID", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const { client } = fakeAdmin([sub("a")]);
    const result = await sendPushToUser(client as never, "user", message);
    expect(result).toEqual({ sent: 0, removed: 0, failed: 0, configured: false });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("envia para cada dispositivo e descarta inscrição expirada (410) ou inexistente (404)", async () => {
    sendNotification
      .mockResolvedValueOnce({ statusCode: 201 })
      .mockRejectedValueOnce(new WebPushError("gone", 410, {}, "", "https://push.example/b"))
      .mockRejectedValueOnce(new WebPushError("not found", 404, {}, "", "https://push.example/c"));
    const { client, deleted, updated } = fakeAdmin([sub("a"), sub("b"), sub("c")]);

    const result = await sendPushToUser(client as never, "user", message);

    expect(result).toEqual({ sent: 1, removed: 2, failed: 0, configured: true });
    expect(deleted.sort()).toEqual(["b", "c"]);
    expect(updated).toEqual([{ id: "a", patch: expect.objectContaining({ failure_count: 0 }) }]);
    const [subscription, body, options] = sendNotification.mock.calls[0]!;
    expect(subscription).toEqual({ endpoint: "https://push.example/a", keys: { p256dh: "p".repeat(40), auth: "a".repeat(16) } });
    expect(JSON.parse(body as string)).toMatchObject({ title: "Venda fechada", tag: `crm-notif-${message.id}` });
    expect(options).toMatchObject({ urgency: "high", vapidDetails: { publicKey: "BPublicKey" } });
  });

  it("conta falha temporária e só descarta depois de várias seguidas", async () => {
    sendNotification.mockRejectedValue(new WebPushError("server", 500, {}, "", "x"));
    const { client, deleted, updated } = fakeAdmin([sub("a", 2), sub("b", 7)]);

    const result = await sendPushToUser(client as never, "user", message);

    expect(result).toMatchObject({ sent: 0, failed: 1, removed: 1 });
    expect(updated).toEqual([{ id: "a", patch: expect.objectContaining({ failure_count: 3 }) }]);
    expect(deleted).toEqual(["b"]);
  });
});
