/**
 * Apresentação dos avisos do sino, da central, dos toasts e do push (16/11/2026).
 * Puro: roda no servidor (rota de despacho do push) e no navegador.
 */
import {
  NOTIFICATION_TAB_GROUPS,
  inAppNotificationTipoLabel,
  notificationTabGroupForTipo,
  type NotificationTabGroupId,
} from "@/lib/crm/in-app-notification-meta";

export type CrmNotificationRow = {
  id: string;
  tipo: string;
  payload: unknown;
  lida_em: string | null;
  created_at: string;
};

export type NotificationGroupId = Exclude<NotificationTabGroupId, "todas">;

function payloadRecord(payload: unknown): Record<string, unknown> {
  return payload != null && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Caminho relativo primeiro: o `link` absoluto aponta para a produção e tirava do
 * localhost/preview quem clicava no aviso. O `link` fica para e-mails e avisos antigos.
 */
export function notificationHref(payload: unknown): string {
  const p = payloadRecord(payload);
  const path = trimmed(p.path);
  if (path.startsWith("/") && !path.startsWith("//")) return path;
  const link = trimmed(p.link);
  if (link.startsWith("http")) return link;
  return "/crm/leads";
}

export function notificationTitle(row: Pick<CrmNotificationRow, "tipo" | "payload">): string {
  return trimmed(payloadRecord(row.payload).title) || inAppNotificationTipoLabel(row.tipo);
}

export function notificationBody(row: Pick<CrmNotificationRow, "payload">): string | null {
  const p = payloadRecord(row.payload);
  return trimmed(p.preview) || trimmed(p.leadName) || null;
}

export function notificationAreaKey(payload: unknown): string | null {
  return trimmed(payloadRecord(payload).area_key) || null;
}

export function notificationGroup(tipo: string): NotificationGroupId {
  return notificationTabGroupForTipo(tipo);
}

const GROUP_LABELS: Record<NotificationGroupId, string> = {
  ...Object.fromEntries(NOTIFICATION_TAB_GROUPS.map((g) => [g.id, g.label])),
  outras: "Geral",
} as Record<NotificationGroupId, string>;

export function notificationGroupLabel(group: NotificationGroupId): string {
  return GROUP_LABELS[group] ?? "Geral";
}

export type NotificationDayBucket = "hoje" | "ontem" | "semana" | "antigas";

const DAY_BUCKET_LABELS: Record<NotificationDayBucket, string> = {
  hoje: "Hoje",
  ontem: "Ontem",
  semana: "Últimos 7 dias",
  antigas: "Mais antigas",
};

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function notificationDayBucket(iso: string, now: Date = new Date()): NotificationDayBucket {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "antigas";
  const today = startOfLocalDay(now);
  const day = startOfLocalDay(when);
  const diffDays = Math.round((today - day) / 86_400_000);
  if (diffDays <= 0) return "hoje";
  if (diffDays === 1) return "ontem";
  if (diffDays < 7) return "semana";
  return "antigas";
}

export type NotificationDaySection<T extends Pick<CrmNotificationRow, "created_at">> = {
  bucket: NotificationDayBucket;
  label: string;
  items: T[];
};

/** Mantém a ordem recebida (mais novo primeiro) e corta em seções por dia. */
export function groupNotificationsByDay<T extends Pick<CrmNotificationRow, "created_at">>(
  rows: readonly T[],
  now: Date = new Date(),
): NotificationDaySection<T>[] {
  const sections: NotificationDaySection<T>[] = [];
  for (const row of rows) {
    const bucket = notificationDayBucket(row.created_at, now);
    let section = sections.find((s) => s.bucket === bucket);
    if (!section) {
      section = { bucket, label: DAY_BUCKET_LABELS[bucket], items: [] };
      sections.push(section);
    }
    section.items.push(row);
  }
  return sections;
}

/** Hora curta para a lista: "agora", "5 min", "14:32", "ontem 09:10", "12/11". */
export function formatNotificationTime(iso: string, now: Date = new Date()): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";
  const diffMs = now.getTime() - when.getTime();
  if (diffMs < 60_000) return "agora";
  if (diffMs < 60 * 60_000) return `${Math.floor(diffMs / 60_000)} min`;
  const hhmm = when.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const bucket = notificationDayBucket(iso, now);
  if (bucket === "hoje") return hhmm;
  if (bucket === "ontem") return `ontem ${hhmm}`;
  if (bucket === "semana") {
    const weekday = when.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
    return `${weekday} ${hhmm}`;
  }
  const sameYear = when.getFullYear() === now.getFullYear();
  return when.toLocaleDateString("pt-BR", sameYear ? { day: "2-digit", month: "2-digit" } : { dateStyle: "short" });
}

/** Corpo do push (service worker) e da notificação local do navegador. */
export type CrmPushMessage = {
  id: string;
  title: string;
  body: string;
  path: string;
  tag: string;
  tipo: string;
  group: NotificationGroupId;
  groupLabel: string;
  timestamp: number;
  unread?: number;
};

const MAX_PUSH_TITLE = 120;
const MAX_PUSH_BODY = 240;

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

export function notificationTag(id: string): string {
  return `crm-notif-${id}`;
}

export function buildPushMessage(
  row: Pick<CrmNotificationRow, "id" | "tipo" | "payload" | "created_at">,
  options: { unread?: number } = {},
): CrmPushMessage {
  const group = notificationGroup(row.tipo);
  const href = notificationHref(row.payload);
  const created = new Date(row.created_at).getTime();
  return {
    id: row.id,
    title: clip(notificationTitle(row), MAX_PUSH_TITLE),
    body: clip(notificationBody(row) ?? notificationGroupLabel(group), MAX_PUSH_BODY),
    // Link absoluto de outro domínio não abre pelo service worker; cai na central.
    path: href.startsWith("/") ? href : "/crm/notifications",
    tag: notificationTag(row.id),
    tipo: row.tipo,
    group,
    groupLabel: notificationGroupLabel(group),
    timestamp: Number.isFinite(created) ? created : Date.now(),
    ...(typeof options.unread === "number" ? { unread: options.unread } : {}),
  };
}
