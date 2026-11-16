// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { playNotificationSound } from "@/lib/crm/notifications/sound";
import { CrmNotificationsProvider, useCrmNotifications } from "./notifications-provider";

let realtimeCallback: (() => void) | null = null;

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/crm/use-in-app-notifications-realtime", () => ({
  useCrmInAppNotificationsRealtime: (cb: () => void) => {
    realtimeCallback = cb;
  },
}));
vi.mock("@/lib/crm/notifications/sound", () => ({
  playNotificationSound: vi.fn(() => true),
  unlockNotificationAudio: vi.fn(),
}));
vi.mock("@/lib/crm/notifications/push-client", () => ({
  registerCrmServiceWorker: vi.fn().mockResolvedValue(null),
  getPushState: vi.fn().mockResolvedValue("default"),
  syncPushSubscription: vi.fn(),
  enablePush: vi.fn(),
  disablePush: vi.fn(),
  sendTestPush: vi.fn(),
  showLocalSystemNotification: vi.fn().mockResolvedValue(true),
  closeSystemNotification: vi.fn(),
  closeAllSystemNotifications: vi.fn(),
}));

function row(id: string, minutesAgo: number, read = false) {
  return {
    id,
    tipo: "lead_note_mention",
    payload: { title: `Aviso ${id}`, path: "/crm/leads/1" },
    lida_em: read ? new Date().toISOString() : null,
    created_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  };
}

function Probe() {
  const { unreadCount, toasts, loaded } = useCrmNotifications();
  return (
    <div>
      <span data-testid="loaded">{String(loaded)}</span>
      <span data-testid="unread">{unreadCount}</span>
      <span data-testid="toasts">{toasts.map((t) => t.row.id).join(",")}</span>
    </div>
  );
}

let responses: unknown[][] = [];

beforeEach(() => {
  vi.clearAllMocks();
  realtimeCallback = null;
  window.localStorage.clear();
  document.title = "CRM";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  responses = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const list = responses.length > 1 ? responses.shift()! : responses[0]!;
      return new Response(JSON.stringify({ ok: true, notifications: list }), { status: 200 });
    }),
  );
});

describe("CrmNotificationsProvider", () => {
  it("não toca som na carga inicial, só quando chega um aviso novo", async () => {
    responses = [[row("a", 30), row("b", 60, true)]];
    render(
      <CrmNotificationsProvider>
        <Probe />
      </CrmNotificationsProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loaded").textContent).toBe("true"));
    expect(screen.getByTestId("unread").textContent).toBe("1");
    expect(playNotificationSound).not.toHaveBeenCalled();
    await waitFor(() => expect(document.title).toBe("(1) CRM"));

    responses = [[row("c", 0), row("a", 30), row("b", 60, true)]];
    await act(async () => {
      realtimeCallback?.();
    });
    await waitFor(() => expect(screen.getByTestId("unread").textContent).toBe("2"));
    expect(screen.getByTestId("toasts").textContent).toBe("c");
    expect(playNotificationSound).toHaveBeenCalledTimes(1);
    expect(playNotificationSound).toHaveBeenCalledWith("suave", 0.6);
  });

  it("aviso antigo que entra na lista não vira toast nem som", async () => {
    responses = [[row("a", 5)]];
    render(
      <CrmNotificationsProvider>
        <Probe />
      </CrmNotificationsProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loaded").textContent).toBe("true"));

    responses = [[row("a", 5), row("velho", 60 * 24)]];
    await act(async () => {
      realtimeCallback?.();
    });
    await waitFor(() => expect(screen.getByTestId("unread").textContent).toBe("2"));
    expect(screen.getByTestId("toasts").textContent).toBe("");
    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it("o mesmo aviso toca uma vez só entre abas (reivindicação no localStorage)", async () => {
    responses = [[]];
    window.localStorage.setItem("crm:notif-claim:c", String(Date.now()));
    render(
      <CrmNotificationsProvider>
        <Probe />
      </CrmNotificationsProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loaded").textContent).toBe("true"));
    responses = [[row("c", 0)]];
    await act(async () => {
      realtimeCallback?.();
    });
    await waitFor(() => expect(screen.getByTestId("toasts").textContent).toBe("c"));
    expect(playNotificationSound).not.toHaveBeenCalled();
  });
});
