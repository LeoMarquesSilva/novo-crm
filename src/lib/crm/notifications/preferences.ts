"use client";

import { useCallback, useSyncExternalStore } from "react";

import { isNotificationSoundId, type NotificationSoundId } from "@/lib/crm/notifications/sound";

/**
 * Preferências de notificação deste navegador (16/11/2026). Ficam no localStorage porque som
 * e pop-up dependem do dispositivo (no notebook com som, no celular sem). O push em si é
 * por dispositivo de qualquer forma (uma inscrição por navegador).
 */
export type NotificationPreferences = {
  sound: boolean;
  soundId: NotificationSoundId;
  /** 0 a 1. */
  volume: number;
  /** Cartão no canto da tela quando chega um aviso com o CRM aberto. */
  toasts: boolean;
  /** Notificação do sistema quando o CRM está aberto, mas em outra aba/janela. */
  systemWhenHidden: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  sound: true,
  soundId: "suave",
  volume: 0.6,
  toasts: true,
  systemWhenHidden: true,
};

const STORAGE_KEY = "crm:notification-prefs:v1";

export function normalizeNotificationPreferences(raw: unknown): NotificationPreferences {
  const base = DEFAULT_NOTIFICATION_PREFERENCES;
  if (raw == null || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const volume = typeof o.volume === "number" && Number.isFinite(o.volume) ? Math.min(1, Math.max(0, o.volume)) : base.volume;
  return {
    sound: typeof o.sound === "boolean" ? o.sound : base.sound,
    soundId: isNotificationSoundId(o.soundId) ? o.soundId : base.soundId,
    volume,
    toasts: typeof o.toasts === "boolean" ? o.toasts : base.toasts,
    systemWhenHidden: typeof o.systemWhenHidden === "boolean" ? o.systemWhenHidden : base.systemWhenHidden,
  };
}

let cachedRaw: string | null | undefined;
let cachedValue: NotificationPreferences = DEFAULT_NOTIFICATION_PREFERENCES;
const listeners = new Set<() => void>();

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getNotificationPreferences(): NotificationPreferences {
  if (typeof window === "undefined") return DEFAULT_NOTIFICATION_PREFERENCES;
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedValue = normalizeNotificationPreferences(raw ? JSON.parse(raw) : null);
    } catch {
      cachedValue = DEFAULT_NOTIFICATION_PREFERENCES;
    }
  }
  return cachedValue;
}

export function setNotificationPreferences(patch: Partial<NotificationPreferences>): NotificationPreferences {
  const next = normalizeNotificationPreferences({ ...getNotificationPreferences(), ...patch });
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* modo privado / bloqueado: vale só nesta página */
    cachedRaw = JSON.stringify(next);
    cachedValue = next;
  }
  for (const listener of listeners) listener();
  return next;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useNotificationPreferences(): [
  NotificationPreferences,
  (patch: Partial<NotificationPreferences>) => void,
] {
  const prefs = useSyncExternalStore(
    subscribe,
    getNotificationPreferences,
    () => DEFAULT_NOTIFICATION_PREFERENCES,
  );
  const update = useCallback((patch: Partial<NotificationPreferences>) => {
    setNotificationPreferences(patch);
  }, []);
  return [prefs, update];
}

/** Lembrete "Ativar push" dispensado neste navegador. */
const PUSH_PROMPT_KEY = "crm:push-prompt-dismissed-at";
const PUSH_PROMPT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export function isPushPromptSnoozed(): boolean {
  try {
    const at = Number(window.localStorage.getItem(PUSH_PROMPT_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < PUSH_PROMPT_SNOOZE_MS;
  } catch {
    return false;
  }
}

export function snoozePushPrompt(): void {
  try {
    window.localStorage.setItem(PUSH_PROMPT_KEY, String(Date.now()));
  } catch {
    /* ignorado */
  }
}

/**
 * Várias abas abertas recebem o mesmo aviso: só a primeira que "reivindica" o id toca o som
 * ou mostra a notificação do sistema.
 */
const CLAIM_PREFIX = "crm:notif-claim:";
const CLAIM_TTL_MS = 10 * 60 * 1000;

export function claimNotificationArrival(id: string): boolean {
  try {
    const storage = window.localStorage;
    const key = `${CLAIM_PREFIX}${id}`;
    if (storage.getItem(key)) return false;
    storage.setItem(key, String(Date.now()));
    // Limpa reivindicações antigas de vez em quando.
    if (Math.random() < 0.2) {
      const now = Date.now();
      for (let i = storage.length - 1; i >= 0; i -= 1) {
        const k = storage.key(i);
        if (!k?.startsWith(CLAIM_PREFIX)) continue;
        if (now - Number(storage.getItem(k)) > CLAIM_TTL_MS) storage.removeItem(k);
      }
    }
    return true;
  } catch {
    return true;
  }
}
