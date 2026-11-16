"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  buildPushMessage,
  notificationTag,
  type CrmNotificationRow,
} from "@/lib/crm/notifications/presentation";
import {
  claimNotificationArrival,
  getNotificationPreferences,
} from "@/lib/crm/notifications/preferences";
import {
  closeAllSystemNotifications,
  closeSystemNotification,
  disablePush,
  enablePush,
  getPushState,
  registerCrmServiceWorker,
  sendTestPush,
  showLocalSystemNotification,
  syncPushSubscription,
  type PushState,
} from "@/lib/crm/notifications/push-client";
import { playNotificationSound, unlockNotificationAudio } from "@/lib/crm/notifications/sound";
import { useCrmInAppNotificationsRealtime } from "@/lib/crm/use-in-app-notifications-realtime";

/**
 * Centro das notificações do CRM (16/11/2026). Montado uma vez no AppShell: o sino do
 * header, o do mobile, a central (/crm/notifications) e os toasts leem daqui, com uma só
 * busca e um só canal de realtime. Antes cada sino buscava e escutava por conta própria.
 *
 * Chegada de aviso novo (detectada por diferença de ids, venha do realtime, do push ou do
 * polling de reserva):
 * - aba visível: toast + som (uma aba só, por reivindicação no localStorage);
 * - todas as abas em segundo plano: notificação do sistema (se permitida) ou, sem permissão,
 *   só o som. A notificação usa a tag do aviso, então o push do servidor, se chegar também,
 *   só a substitui sem tocar de novo.
 */

export type NotificationToast = { key: string; row: CrmNotificationRow; summaryCount?: number };

type PushController = {
  state: PushState | "loading";
  busy: boolean;
  error: string | null;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  sendTest: () => Promise<{ ok: boolean; message: string }>;
};

type NotificationsContextValue = {
  items: CrmNotificationRow[];
  loaded: boolean;
  unreadCount: number;
  /** Incrementa a cada chegada: o sino usa para tocar a animação. */
  arrivalTick: number;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markUnread: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  markingAll: boolean;
  toasts: NotificationToast[];
  dismissToast: (key: string) => void;
  push: PushController;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function useCrmNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useCrmNotifications precisa do CrmNotificationsProvider (AppShell).");
  return ctx;
}

/** Aviso mais velho que isso não toca nem vira toast (ex.: item antigo entrando na janela de 100). */
const ARRIVAL_WINDOW_MS = 15 * 60 * 1000;
const POLL_MS = 60_000;
const MAX_TOASTS = 3;
const HIDDEN_CLAIM_DELAY_MS = 700;

function isRecent(row: CrmNotificationRow): boolean {
  const created = new Date(row.created_at).getTime();
  return Number.isFinite(created) && Date.now() - created < ARRIVAL_WINDOW_MS;
}

function useTitleBadge(unread: number) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prefix = /^\(\d+\+?\)\s/;
    const apply = () => {
      const base = document.title.replace(prefix, "");
      const next = unread > 0 ? `(${unread > 99 ? "99+" : unread}) ${base}` : base;
      if (document.title !== next) document.title = next;
    };
    apply();
    // O Next troca o <title> ao navegar: reaplica o contador quando isso acontece.
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });

    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (unread > 0) void nav.setAppBadge?.(unread).catch(() => undefined);
    else void nav.clearAppBadge?.().catch(() => undefined);

    return () => observer.disconnect();
  }, [unread]);
}

export function CrmNotificationsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [items, setItems] = useState<CrmNotificationRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [arrivalTick, setArrivalTick] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);
  const [toasts, setToasts] = useState<NotificationToast[]>([]);
  const [pushState, setPushState] = useState<PushState | "loading">("loading");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  const knownIdsRef = useRef<Set<string> | null>(null);
  const itemsRef = useRef<CrmNotificationRow[]>([]);
  const inflightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const announceArrivals = useCallback((fresh: CrmNotificationRow[]) => {
    if (fresh.length === 0) return;
    setArrivalTick((t) => t + 1);
    const prefs = getNotificationPreferences();
    const newest = fresh[0]!;
    const visible = document.visibilityState === "visible";

    if (visible) {
      if (prefs.toasts) {
        setToasts((prev) => {
          const additions: NotificationToast[] =
            fresh.length > MAX_TOASTS
              ? [{ key: `summary-${newest.id}`, row: newest, summaryCount: fresh.length }]
              : fresh.map((row) => ({ key: row.id, row }));
          const keys = new Set(additions.map((a) => a.key));
          return [...additions, ...prev.filter((t) => !keys.has(t.key))].slice(0, MAX_TOASTS);
        });
      }
      if (prefs.sound && claimNotificationArrival(newest.id)) {
        playNotificationSound(prefs.soundId, prefs.volume);
      }
      return;
    }

    // Em segundo plano: espera um pouco para uma aba visível (se houver) reivindicar antes.
    window.setTimeout(() => {
      if (!claimNotificationArrival(newest.id)) return;
      const canSystem =
        prefs.systemWhenHidden &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted";
      if (canSystem) {
        for (const row of fresh.slice(0, MAX_TOASTS)) {
          void showLocalSystemNotification(buildPushMessage(row));
        }
        return;
      }
      if (prefs.sound) playNotificationSound(prefs.soundId, prefs.volume);
    }, HIDDEN_CLAIM_DELAY_MS);
  }, []);

  const applyList = useCallback(
    (list: CrmNotificationRow[]) => {
      setItems(list);
      setLoaded(true);
      const known = knownIdsRef.current;
      if (!known) {
        knownIdsRef.current = new Set(list.map((n) => n.id));
        return;
      }
      const fresh = list.filter((n) => !known.has(n.id) && !n.lida_em && isRecent(n));
      for (const n of list) known.add(n.id);
      announceArrivals(fresh);
    },
    [announceArrivals],
  );

  const refresh = useCallback(async () => {
    if (inflightRef.current) return inflightRef.current;
    const run = (async () => {
      try {
        const res = await fetch("/api/crm/notifications", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { ok?: boolean; notifications?: CrmNotificationRow[] };
        if (data.ok && Array.isArray(data.notifications)) applyList(data.notifications);
      } catch {
        /* rede instável: mantém a lista atual */
      } finally {
        inflightRef.current = null;
      }
    })();
    inflightRef.current = run;
    return run;
  }, [applyList]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useCrmInAppNotificationsRealtime(() => {
    void refresh();
  });

  // Reserva para quando o realtime cai: busca ao voltar para a aba e a cada minuto com ela visível.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [refresh]);

  // Libera o áudio no primeiro gesto (regra de autoplay dos navegadores).
  useEffect(() => {
    const unlock = () => unlockNotificationAudio();
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Service worker + estado do push + mensagens do SW.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await registerCrmServiceWorker();
      const state = await getPushState();
      if (cancelled) return;
      setPushState(state);
      if (state === "subscribed") void syncPushSubscription();
    })();

    if (!("serviceWorker" in navigator)) return () => {
      cancelled = true;
    };
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; path?: string } | null;
      if (!data?.type) return;
      if (data.type === "crm-push" || data.type === "crm-notification-read") void refresh();
      if (data.type === "crm-navigate" && typeof data.path === "string" && data.path.startsWith("/")) {
        router.push(data.path);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, [refresh, router]);

  const unreadCount = useMemo(() => items.filter((n) => !n.lida_em).length, [items]);
  useTitleBadge(unreadCount);

  const setRead = useCallback(async (id: string, read: boolean) => {
    const stamp = read ? new Date().toISOString() : null;
    const previous = itemsRef.current.find((n) => n.id === id)?.lida_em ?? null;
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, lida_em: stamp } : n)));
    if (read) {
      setToasts((prev) => prev.filter((t) => t.row.id !== id));
      void closeSystemNotification(notificationTag(id));
    }
    try {
      const res = await fetch(`/api/crm/notifications/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, lida_em: previous } : n)));
    }
  }, []);

  const markRead = useCallback((id: string) => setRead(id, true), [setRead]);
  const markUnread = useCallback((id: string) => setRead(id, false), [setRead]);

  const markAllRead = useCallback(async () => {
    setMarkingAll(true);
    const stamp = new Date().toISOString();
    const snapshot = items;
    setItems((prev) => prev.map((n) => (n.lida_em ? n : { ...n, lida_em: stamp })));
    setToasts([]);
    void closeAllSystemNotifications();
    try {
      const res = await fetch("/api/crm/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_all_read" }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setItems(snapshot);
    } finally {
      setMarkingAll(false);
    }
  }, [items]);

  const dismissToast = useCallback((key: string) => {
    setToasts((prev) => prev.filter((t) => t.key !== key));
  }, []);

  const enable = useCallback(async () => {
    setPushBusy(true);
    setPushError(null);
    try {
      unlockNotificationAudio();
      setPushState(await enablePush());
    } catch (error) {
      setPushError(error instanceof Error ? error.message : "Não foi possível ativar.");
      setPushState(await getPushState());
    } finally {
      setPushBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setPushBusy(true);
    setPushError(null);
    try {
      setPushState(await disablePush());
    } finally {
      setPushBusy(false);
    }
  }, []);

  const sendTest = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    if (pushState !== "subscribed") {
      const shown = await showLocalSystemNotification({
        id: crypto.randomUUID(),
        title: "Notificações ativadas",
        body: "É assim que os avisos do CRM aparecem quando ele está em segundo plano.",
        path: "/crm/notifications",
        tag: `crm-notif-teste-${Date.now()}`,
        tipo: "push_teste",
        group: "outras",
        groupLabel: "Teste",
        timestamp: Date.now(),
      });
      return shown
        ? { ok: true, message: "Teste enviado para este navegador." }
        : { ok: false, message: "O navegador não deixou mostrar a notificação." };
    }
    const result = await sendTestPush().catch(() => ({ ok: false, sent: 0, error: "Falha de rede." }));
    if (!result.ok) return { ok: false, message: result.error ?? "Não foi possível enviar o teste." };
    if (result.sent === 0) return { ok: false, message: "Nenhum dispositivo recebeu. Desative e ative de novo." };
    return {
      ok: true,
      message:
        result.sent === 1
          ? "Push enviado. Com o CRM em primeiro plano o sistema não mostra; troque de janela para ver."
          : `Push enviado para ${result.sent} dispositivos.`,
    };
  }, [pushState]);

  const push = useMemo<PushController>(
    () => ({ state: pushState, busy: pushBusy, error: pushError, enable, disable, sendTest }),
    [pushState, pushBusy, pushError, enable, disable, sendTest],
  );

  const value = useMemo<NotificationsContextValue>(
    () => ({
      items,
      loaded,
      unreadCount,
      arrivalTick,
      refresh,
      markRead,
      markUnread,
      markAllRead,
      markingAll,
      toasts,
      dismissToast,
      push,
    }),
    [items, loaded, unreadCount, arrivalTick, refresh, markRead, markUnread, markAllRead, markingAll, toasts, dismissToast, push],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}
