/* Service worker do CRM — notificações push (16/11/2026).
 *
 * - push: mostra o aviso no sistema, a menos que o CRM esteja visível numa aba (aí o
 *   próprio app mostra o toast e toca o som). A tag é o id do aviso: se a aba em segundo
 *   plano já mostrou a mesma notificação, esta só a substitui, sem tocar de novo.
 * - notificationclick: marca como lida e abre/foca o CRM no link do aviso.
 * - pushsubscriptionchange: renova a inscrição e avisa o servidor.
 */

const DEFAULT_ICON = "/icon.png";
const DEFAULT_BADGE = "/notification-badge.png";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function parsePushData(event) {
  if (!event.data) return null;
  try {
    return event.data.json();
  } catch {
    try {
      return { title: "CRM", body: event.data.text() };
    } catch {
      return null;
    }
  }
}

async function hasVisibleClient() {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  return windows.some((client) => client.visibilityState === "visible");
}

async function broadcast(message) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) client.postMessage(message);
}

async function updateAppBadge(unread) {
  if (typeof unread !== "number") return;
  try {
    if (unread > 0 && self.navigator.setAppBadge) await self.navigator.setAppBadge(unread);
    else if (self.navigator.clearAppBadge) await self.navigator.clearAppBadge();
  } catch {
    /* selo é opcional */
  }
}

self.addEventListener("push", (event) => {
  const data = parsePushData(event);
  if (!data) return;

  event.waitUntil(
    (async () => {
      await updateAppBadge(data.unread);
      await broadcast({ type: "crm-push", payload: data });
      if (await hasVisibleClient()) return;

      await self.registration.showNotification(data.title || "CRM", {
        body: data.body || "",
        icon: DEFAULT_ICON,
        badge: DEFAULT_BADGE,
        tag: data.tag || undefined,
        renotify: false,
        timestamp: data.timestamp || Date.now(),
        lang: "pt-BR",
        data: { id: data.id || null, path: data.path || "/crm/notifications" },
        actions: data.id
          ? [
              { action: "open", title: "Abrir" },
              { action: "read", title: "Marcar como lida" },
            ]
          : [],
      });
    })(),
  );
});

async function markRead(id) {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return;
  try {
    await fetch(`/api/crm/notifications/${encodeURIComponent(id)}`, {
      method: "PATCH",
      credentials: "include",
    });
  } catch {
    /* sem rede: o aviso continua não lido no sino */
  }
}

async function openPath(path) {
  const target = new URL(path || "/crm/notifications", self.location.origin);
  if (target.origin !== self.location.origin) return;
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const crmWindow =
    windows.find((client) => client.focused && new URL(client.url).pathname.startsWith("/crm")) ||
    windows.find((client) => new URL(client.url).pathname.startsWith("/crm")) ||
    windows[0];
  if (crmWindow) {
    await crmWindow.focus();
    if ("navigate" in crmWindow) {
      try {
        await crmWindow.navigate(target.href);
        return;
      } catch {
        /* página não controlada pelo SW: avisa a aba para navegar */
      }
    }
    crmWindow.postMessage({ type: "crm-navigate", path: target.pathname + target.search + target.hash });
    return;
  }
  await self.clients.openWindow(target.href);
}

self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const data = notification.data || {};
  notification.close();

  event.waitUntil(
    (async () => {
      await markRead(data.id);
      await broadcast({ type: "crm-notification-read", id: data.id || null });
      if (event.action === "read") return;
      await openPath(data.path);
    })(),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const options = event.oldSubscription && event.oldSubscription.options;
      if (!options || !options.applicationServerKey) return;
      const subscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: options.applicationServerKey,
      });
      await fetch("/api/crm/push/subscriptions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
    })().catch(() => undefined),
  );
});
