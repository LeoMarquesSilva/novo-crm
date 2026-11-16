"use client";

import type { CrmPushMessage } from "@/lib/crm/notifications/presentation";

/**
 * Lado do navegador do push (16/11/2026): service worker, permissão e inscrição.
 *
 * Estados:
 * - unsupported: navegador sem Service Worker/Notification (no iPhone, só com o CRM
 *   adicionado à tela de início).
 * - denied: o usuário bloqueou as notificações do site (só se desfaz nas configurações do navegador).
 * - default: ainda não perguntamos.
 * - granted: permitido, mas sem inscrição de push (servidor sem chaves VAPID): os avisos
 *   aparecem no sistema só enquanto o CRM estiver aberto em alguma aba.
 * - subscribed: push completo, chega mesmo com o CRM fechado.
 */
export type PushState = "unsupported" | "denied" | "default" | "granted" | "subscribed";

export const VAPID_PUBLIC_KEY = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();

const SW_URL = "/sw.js";

export function isServerPushAvailable(): boolean {
  return VAPID_PUBLIC_KEY.length > 0;
}

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "serviceWorker" in navigator && "Notification" in window;
}

export function isIosWithoutStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function registerCrmServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return Promise.resolve(null);
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register(SW_URL, { scope: "/", updateViaCache: "none" })
      .catch((error: unknown) => {
        console.warn("[push] service worker não registrado:", error);
        registrationPromise = null;
        return null;
      });
  }
  return registrationPromise;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await registerCrmServiceWorker();
  if (!registration || !("pushManager" in registration)) return null;
  try {
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

async function saveSubscription(subscription: PushSubscription): Promise<boolean> {
  const res = await fetch("/api/crm/push/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  return res.ok;
}

export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return "unsupported";
  const permission = Notification.permission;
  if (permission === "denied") return "denied";
  if (permission === "default") return "default";
  if (!isServerPushAvailable()) return "granted";
  const subscription = await currentSubscription();
  if (!subscription) return "granted";
  return "subscribed";
}

/**
 * Garante que a inscrição deste navegador está gravada no servidor (o login pode ter mudado
 * ou a linha pode ter sido limpa). Barato: um POST idempotente por carregamento.
 */
export async function syncPushSubscription(): Promise<void> {
  if (!isServerPushAvailable() || !isPushSupported() || Notification.permission !== "granted") return;
  const subscription = await currentSubscription();
  if (subscription) await saveSubscription(subscription).catch(() => false);
}

export async function enablePush(): Promise<PushState> {
  if (!isPushSupported()) return "unsupported";
  const permission =
    Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "default";
  if (!isServerPushAvailable()) {
    await registerCrmServiceWorker();
    return "granted";
  }

  const registration = await registerCrmServiceWorker();
  if (!registration || !("pushManager" in registration)) return "granted";
  await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  const saved = await saveSubscription(subscription).catch(() => false);
  if (!saved) throw new Error("Não foi possível registrar este dispositivo no CRM.");
  return "subscribed";
}

export async function disablePush(): Promise<PushState> {
  const subscription = await currentSubscription();
  if (subscription) {
    await fetch("/api/crm/push/subscriptions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => undefined);
    await subscription.unsubscribe().catch(() => false);
  }
  return getPushState();
}

export async function sendTestPush(): Promise<{ ok: boolean; sent: number; error?: string }> {
  const res = await fetch("/api/crm/push/test", { method: "POST" });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; sent?: number; error?: string };
  return { ok: Boolean(data.ok), sent: data.sent ?? 0, error: data.error };
}

/** Notificação do sistema mostrada pela própria página (CRM aberto em segundo plano). */
export async function showLocalSystemNotification(message: CrmPushMessage): Promise<boolean> {
  if (!isPushSupported() || Notification.permission !== "granted") return false;
  const registration = await registerCrmServiceWorker();
  if (!registration) return false;
  try {
    await registration.showNotification(message.title, {
      body: message.body,
      icon: "/icon.png",
      badge: "/notification-badge.png",
      tag: message.tag,
      timestamp: message.timestamp,
      lang: "pt-BR",
      data: { id: message.id, path: message.path },
      // `renotify`/`actions` existem no Chrome, mas não no tipo do TS.
      ...({ renotify: false, actions: [
        { action: "open", title: "Abrir" },
        { action: "read", title: "Marcar como lida" },
      ] } as Record<string, unknown>),
    } as NotificationOptions);
    return true;
  } catch {
    return false;
  }
}

/** Fecha a notificação do sistema de um aviso que foi lido no app. */
export async function closeSystemNotification(tag: string): Promise<void> {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration("/").catch(() => undefined);
  if (!registration) return;
  const list = await registration.getNotifications({ tag }).catch(() => [] as Notification[]);
  for (const n of list) n.close();
}

export async function closeAllSystemNotifications(): Promise<void> {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration("/").catch(() => undefined);
  if (!registration) return;
  const list = await registration.getNotifications().catch(() => [] as Notification[]);
  for (const n of list) if (n.tag?.startsWith("crm-notif-")) n.close();
}
