"use client";

import { CheckCheck, Inbox, LoaderCircle, Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";

import { NotificationItemFull } from "@/components/crm/notifications/notification-item";
import { NotificationSettingsPanel } from "@/components/crm/notifications/notification-settings";
import { TONE_DOT_CLASS, groupVisual } from "@/components/crm/notifications/notification-visuals";
import { useCrmNotifications } from "@/components/crm/notifications/notifications-provider";
import { Button } from "@/components/ui/button";
import { NOTIFICATION_TAB_GROUPS, parseLeadCriadorPor, parseOriginadoPor } from "@/lib/crm/in-app-notification-meta";
import {
  groupNotificationsByDay,
  notificationAreaKey,
  notificationBody,
  notificationGroup,
  notificationGroupLabel,
  notificationTitle,
  type CrmNotificationRow,
  type NotificationGroupId,
} from "@/lib/crm/notifications/presentation";
import { cn } from "@/lib/utils";

const GROUP_ORDER: NotificationGroupId[] = [...NOTIFICATION_TAB_GROUPS.map((g) => g.id), "outras"];

function normalize(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

const subscribeNothing = () => () => {};

/**
 * Horas relativas e "Hoje/Ontem" dependem do relógio e do fuso do navegador (o servidor na
 * Vercel roda em UTC): a lista só é montada depois da hidratação, para não divergir do HTML.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNothing, () => true, () => false);
}

function ListSkeleton() {
  return (
    <ul aria-busy className="divide-y divide-border">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex gap-3.5 px-4 py-4 sm:px-5">
          <span className="size-11 shrink-0 animate-pulse rounded-(--radius-v2-lg) bg-neutral-100" />
          <span className="flex-1 space-y-2.5 pt-1">
            <span className="block h-3 w-1/4 animate-pulse rounded bg-neutral-100" />
            <span className="block h-3.5 w-2/3 animate-pulse rounded bg-neutral-100" />
            <span className="block h-3 w-1/2 animate-pulse rounded bg-neutral-100" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function searchableText(row: CrmNotificationRow): string {
  const actor = parseOriginadoPor(row.payload) ?? parseLeadCriadorPor(row.payload);
  return normalize(
    [notificationTitle(row), notificationBody(row), notificationAreaKey(row.payload), actor?.full_name]
      .filter(Boolean)
      .join(" "),
  );
}

/** Botão do cabeçalho da página (o cabeçalho é server component). */
export function NotificationsHeaderActions() {
  const { unreadCount, markAllRead, markingAll } = useCrmNotifications();
  return (
    <Button
      type="button"
      variant="secondary"
      size="control"
      onClick={() => void markAllRead()}
      disabled={unreadCount === 0 || markingAll}
    >
      {markingAll ? <LoaderCircle className="animate-spin" /> : <CheckCheck />}
      Marcar todas como lidas
    </Button>
  );
}

export function NotificationList({ initial }: { initial: CrmNotificationRow[] }) {
  const { items: liveItems, loaded } = useCrmNotifications();
  const items = loaded ? liveItems : initial;
  const [group, setGroup] = useState<NotificationGroupId | "todas">("todas");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [query, setQuery] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [now] = useState(() => new Date());
  const hydrated = useHydrated();

  const counts = useMemo(() => {
    const map = new Map<NotificationGroupId, { total: number; unread: number }>();
    for (const n of items) {
      const g = notificationGroup(n.tipo);
      const cur = map.get(g) ?? { total: 0, unread: 0 };
      cur.total += 1;
      if (!n.lida_em) cur.unread += 1;
      map.set(g, cur);
    }
    return map;
  }, [items]);

  const totalUnread = useMemo(() => items.filter((n) => !n.lida_em).length, [items]);
  const groupsWithItems = GROUP_ORDER.filter((g) => (counts.get(g)?.total ?? 0) > 0);
  const activeGroup = group !== "todas" && !counts.has(group) ? "todas" : group;

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return items.filter((n) => {
      if (onlyUnread && n.lida_em) return false;
      if (activeGroup !== "todas" && notificationGroup(n.tipo) !== activeGroup) return false;
      if (q && !searchableText(n).includes(q)) return false;
      return true;
    });
  }, [items, onlyUnread, activeGroup, query]);

  const sections = useMemo(() => groupNotificationsByDay(filtered, now), [filtered, now]);
  const hasFilters = onlyUnread || activeGroup !== "todas" || query.trim().length > 0;

  const chip = (id: NotificationGroupId | "todas", label: string, total: number, unread: number) => {
    const active = activeGroup === id;
    const dot = id === "todas" ? null : TONE_DOT_CLASS[groupVisual(id).tone];
    return (
      <button
        key={id}
        type="button"
        aria-pressed={active}
        onClick={() => setGroup(id)}
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors duration-(--motion-fast)",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          active
            ? "border-brand-navy bg-brand-navy text-white"
            : "border-border bg-white text-neutral-700 hover:border-border-strong hover:bg-neutral-50",
        )}
      >
        {dot ? <span aria-hidden className={cn("size-1.5 rounded-full", dot, active && "ring-2 ring-white/30")} /> : null}
        {label}
        <span className={cn("tabular-nums", active ? "text-white/70" : "text-muted-foreground")}>{total}</span>
        {unread > 0 ? (
          <span
            className={cn(
              "rounded-full px-1.5 text-[11px] font-bold leading-4 tabular-nums",
              active ? "bg-white text-brand-navy" : "bg-primary text-white",
            )}
          >
            {unread}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section aria-label="Avisos" className="min-w-0 overflow-clip rounded-(--radius-v2-xl) border border-border bg-white">
        <div className="space-y-3 border-b border-border p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-(--radius-v2-md) border border-border bg-white px-3 transition-colors focus-within:border-interactive-500 focus-within:ring-3 focus-within:ring-primary/15">
              <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por cliente, área ou pessoa…"
                aria-label="Buscar notificações"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-text-placeholder-v2 [&::-webkit-search-cancel-button]:hidden"
              />
              {query ? (
                <button
                  type="button"
                  aria-label="Limpar busca"
                  onClick={() => setQuery("")}
                  className="inline-flex size-6 items-center justify-center rounded-(--radius-v2-sm) text-muted-foreground hover:bg-neutral-100 hover:text-foreground"
                >
                  <X className="size-3.5" strokeWidth={2} />
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <div className="grid grid-cols-2 gap-1 rounded-(--radius-v2-lg) bg-neutral-100 p-1">
                {(
                  [
                    { value: false, label: "Todas" },
                    { value: true, label: `Não lidas${totalUnread ? ` (${totalUnread})` : ""}` },
                  ] as const
                ).map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    aria-pressed={onlyUnread === opt.value}
                    onClick={() => setOnlyUnread(opt.value)}
                    className={cn(
                      "inline-flex h-7 items-center justify-center whitespace-nowrap rounded-(--radius-v2-md) px-3 text-[13px] font-semibold transition-colors duration-(--motion-fast)",
                      "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                      onlyUnread === opt.value
                        ? "bg-white text-foreground shadow-(--shadow-v2-xs)"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="lg:hidden"
                aria-label="Preferências de notificação"
                aria-expanded={showSettings}
                onClick={() => setShowSettings((v) => !v)}
              >
                <SlidersHorizontal />
              </Button>
            </div>
          </div>

          {groupsWithItems.length > 1 ? (
            // Celular: uma linha com rolagem lateral; telas maiores: quebra de linha.
            <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
              {chip("todas", "Todas", items.length, totalUnread)}
              {groupsWithItems.map((g) =>
                chip(g, notificationGroupLabel(g), counts.get(g)?.total ?? 0, counts.get(g)?.unread ?? 0),
              )}
            </div>
          ) : null}
        </div>

        {showSettings ? (
          <div className="border-b border-border bg-neutral-25 p-4 lg:hidden">
            <NotificationSettingsPanel />
          </div>
        ) : null}

        {!hydrated ? (
          <ListSkeleton />
        ) : sections.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
              <Inbox className="size-5" strokeWidth={2} aria-hidden />
            </span>
            <p className="mt-4 text-sm font-semibold text-foreground">
              {hasFilters ? "Nenhum aviso com esses filtros" : "Nenhuma notificação por agora"}
            </p>
            <p className="mt-1 max-w-sm text-[13px] leading-5 text-muted-foreground">
              {hasFilters
                ? "Tente outra categoria ou limpe a busca."
                : "Pedidos de escopo, pendências da DUE, contratos e pós-venda aparecem aqui assim que acontecem."}
            </p>
            {hasFilters ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setQuery("");
                  setGroup("todas");
                  setOnlyUnread(false);
                }}
              >
                Limpar filtros
              </Button>
            ) : null}
          </div>
        ) : (
          sections.map((section) => (
            <section key={section.bucket} aria-label={section.label}>
              <h2 className="sticky top-[60px] z-[1] flex items-center justify-between border-b border-border bg-neutral-25/95 px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground backdrop-blur-sm sm:px-5 lg:top-16">
                {section.label}
                <span className="tabular-nums normal-case tracking-normal">{section.items.length}</span>
              </h2>
              <ul className="divide-y divide-border">
                {section.items.map((row) => (
                  <NotificationItemFull key={row.id} row={row} now={now} />
                ))}
              </ul>
            </section>
          ))
        )}
      </section>

      <aside className="sticky top-22 hidden rounded-(--radius-v2-xl) border border-border bg-white lg:block">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">Como você é avisado</h2>
          <p className="mt-0.5 text-xs leading-[18px] text-muted-foreground">Som, pop-up e notificações do sistema.</p>
        </div>
        <div className="px-5 py-5">
          <NotificationSettingsPanel />
        </div>
      </aside>
    </div>
  );
}
