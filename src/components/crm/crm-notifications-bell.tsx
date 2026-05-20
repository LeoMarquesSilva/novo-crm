"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bell, SquareArrowOutUpRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  formatContextoDateTimePtBr,
  inAppNotificationTipoLabel,
  parseLeadContextoDatas,
  parseLeadCriadorPor,
  parseOriginadoPor,
} from "@/lib/crm/in-app-notification-meta";
import { useCrmInAppNotificationsRealtime } from "@/lib/crm/use-in-app-notifications-realtime";
import { cn } from "@/lib/utils";

type NotifRow = {
  id: string;
  tipo: string;
  payload: unknown;
  lida_em: string | null;
  created_at: string;
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function notificationHref(payload: unknown): string {
  if (payload == null || typeof payload !== "object") return "/crm/leads";
  const p = payload as Record<string, unknown>;
  if (typeof p.link === "string" && p.link.startsWith("http")) return p.link;
  if (typeof p.path === "string" && p.path.trim()) return p.path.trim();
  return "/crm/leads";
}

function notificationTitle(row: NotifRow): string {
  const p = row.payload as Record<string, unknown> | null;
  const title = typeof p?.title === "string" ? p.title.trim() : "";
  return title || inAppNotificationTipoLabel(row.tipo);
}

function notificationSubtitle(row: NotifRow): string | null {
  const p = row.payload as Record<string, unknown> | null;
  const preview = typeof p?.preview === "string" ? p.preview.trim() : "";
  if (preview) return preview;
  const leadName = typeof p?.leadName === "string" ? p.leadName.trim() : "";
  if (leadName) return leadName;
  return null;
}

export function CrmNotificationsBell({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifRow[]>([]);
  const [listTab, setListTab] = useState<"inbox" | "geral">("inbox");
  const [markingAll, setMarkingAll] = useState(false);

  const refreshList = useCallback(async () => {
    try {
      const res = await fetch("/api/crm/notifications", { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean; notifications?: NotifRow[] };
      if (data.ok && Array.isArray(data.notifications)) setItems(data.notifications);
      else setItems([]);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  useCrmInAppNotificationsRealtime(() => {
    void refreshList();
  });

  useEffect(() => {
    if (open) void refreshList();
  }, [open, refreshList]);

  const unreadCount = useMemo(() => items.filter((n) => !n.lida_em).length, [items]);

  const inboxItems = useMemo(() => items.filter((n) => !n.lida_em).slice(0, 20), [items]);
  const geralItems = useMemo(() => [...items].slice(0, 20), [items]);
  const visibleItems = listTab === "inbox" ? inboxItems : geralItems;

  async function markOneRead(id: string) {
    const res = await fetch(`/api/crm/notifications/${encodeURIComponent(id)}`, { method: "PATCH" });
    if (!res.ok) return;
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, lida_em: new Date().toISOString() } : x)));
  }

  async function markAllRead() {
    const targets = items.filter((n) => !n.lida_em);
    if (targets.length === 0) return;
    setMarkingAll(true);
    try {
      await Promise.all(
        targets.map((n) =>
          fetch(`/api/crm/notifications/${encodeURIComponent(n.id)}`, { method: "PATCH" }),
        ),
      );
      await refreshList();
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Notificações"
          aria-expanded={open}
          className={cn(
            "relative inline-flex size-9 items-center justify-center rounded-xl border border-[#e1e5eb] bg-white text-slate-500 shadow-[0_1px_2px_rgba(16,31,46,0.03)] transition-all duration-200 hover:border-slate-300 hover:bg-white hover:text-primary-dark focus-visible:outline focus-visible:ring-2 focus-visible:ring-primary-dark/25",
            unreadCount > 0 &&
              "border-rose-200/90 shadow-[0_0_0_3px_rgba(244,63,94,0.12),0_2px_8px_rgba(225,29,72,0.08)] hover:border-rose-300/90",
            className,
          )}
        >
          <Bell className="size-5" />
          {unreadCount > 0 ? (
            <span className="pointer-events-none absolute -right-1 -top-1 flex h-[22px] min-w-[22px] items-center justify-center rounded-full border-2 border-white bg-gradient-to-b from-rose-500 to-rose-600 px-1 text-[10px] font-bold tabular-nums text-white shadow-[0_2px_10px_rgba(225,29,72,0.55)] ring-1 ring-rose-700/25">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        sideOffset={10}
        collisionPadding={12}
        className="w-[min(calc(100vw-1.5rem),380px)] rounded-2xl border border-[#e1e6ee] bg-[#fafbfd] p-0 shadow-[0_20px_50px_rgba(16,31,46,0.14)] ring-1 ring-[#102033]/[0.06]"
      >
        <div className="flex items-start justify-between gap-3 rounded-t-2xl border-b border-[#e6eaf2] bg-white/90 px-4 pb-3 pt-3.5 backdrop-blur-sm">
          <h2 className="text-[15px] font-bold tracking-tight text-[#102033]">Notificações</h2>
          <button
            type="button"
            disabled={unreadCount === 0 || markingAll}
            onClick={() => void markAllRead()}
            className={cn(
              "shrink-0 rounded-md px-2 py-1 text-[12px] font-semibold text-slate-600 transition-all duration-150",
              "hover:bg-[#eef5ff] hover:text-primary-dark hover:underline hover:underline-offset-2",
              "focus-visible:outline focus-visible:ring-2 focus-visible:ring-primary-dark/20",
              "disabled:pointer-events-none disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:no-underline",
            )}
          >
            Marcar todas como lidas
          </button>
        </div>

        <div className="flex items-center gap-0.5 border-b border-[#e6eaf2] bg-white/70 px-2 pb-0 pt-1 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setListTab("inbox")}
            className={cn(
              "relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-all duration-150",
              listTab === "inbox"
                ? "text-[#102033] after:absolute after:bottom-0 after:left-3 after:right-3 after:h-0.5 after:rounded-full after:bg-[#102033]"
                : "text-slate-500 hover:bg-[#f0f3f9] hover:text-[#102033]",
            )}
          >
            Caixa de entrada
            {unreadCount > 0 ? (
              <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-[#102033] px-1.5 py-0.5 text-[10px] font-bold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setListTab("geral")}
            className={cn(
              "relative flex rounded-lg px-3 py-2 text-[13px] font-semibold transition-all duration-150",
              listTab === "geral"
                ? "text-[#102033] after:absolute after:bottom-0 after:left-3 after:right-3 after:h-0.5 after:rounded-full after:bg-[#102033]"
                : "text-slate-500 hover:bg-[#f0f3f9] hover:text-[#102033]",
            )}
          >
            Geral
          </button>
          <Link
            href="/crm/notifications"
            onClick={() => setOpen(false)}
            className="ml-auto inline-flex size-9 items-center justify-center rounded-lg text-slate-500 transition-all duration-150 hover:bg-[#eef5ff] hover:text-primary-dark hover:ring-1 hover:ring-primary-dark/15 active:scale-[0.97]"
            aria-label="Abrir página completa de notificações"
            title="Abrir página completa"
          >
            <SquareArrowOutUpRight className="size-4" strokeWidth={2.25} />
          </Link>
        </div>

        <div className="crm-scrollbar max-h-[min(52vh,380px)] overflow-y-auto overflow-x-hidden bg-[#fafbfd]">
          {visibleItems.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-slate-500">
              {listTab === "inbox"
                ? "Nenhuma notificação não lida."
                : "Nenhuma notificação recente."}
            </p>
          ) : (
            <ul className="divide-y divide-[#e8ecf4]">
              {visibleItems.map((row) => {
                const origin = parseOriginadoPor(row.payload);
                const criador = parseLeadCriadorPor(row.payload);
                const face = origin ?? criador;
                const href = notificationHref(row.payload);
                const title = notificationTitle(row);
                const sub = notificationSubtitle(row);
                const contextoDatas = parseLeadContextoDatas(row.payload);
                const when = formatDistanceToNow(new Date(row.created_at), {
                  addSuffix: true,
                  locale: ptBR,
                });
                const unread = !row.lida_em;

                return (
                  <li key={row.id}>
                    <Link
                      href={href}
                      onClick={() => {
                        setOpen(false);
                        if (unread) void markOneRead(row.id);
                      }}
                      className={cn(
                        "group/item flex gap-3 rounded-xl px-3 py-3 transition-all duration-150",
                        "outline-none hover:bg-white hover:shadow-[0_1px_0_rgba(16,31,46,0.04),inset_3px_0_0_0_#2563eb]",
                        "focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-primary-dark/20",
                        "active:scale-[0.995]",
                      )}
                    >
                      <Avatar className="size-10 shrink-0 border border-[#e6e9ef]">
                        {face?.avatar_url ? <AvatarImage src={face.avatar_url} alt="" /> : null}
                        <AvatarFallback className="bg-[#eef1f6] text-[11px] font-semibold text-[#102033]">
                          {face ? initialsFromName(face.full_name) : "—"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold leading-snug text-[#102033]">{title}</p>
                        <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                          {when}
                          {sub ? (
                            <>
                              <span aria-hidden className="text-slate-300">
                                {" "}
                                ·{" "}
                              </span>
                              <span className="line-clamp-2">{sub}</span>
                            </>
                          ) : null}
                        </p>
                        {contextoDatas ? (
                          <p className="mt-1 line-clamp-3 text-[10px] leading-snug text-slate-500">
                            <span className="font-semibold text-slate-600">Lead: </span>
                            {formatContextoDateTimePtBr(contextoDatas.lead_criado_em) ?? "—"}
                            <span aria-hidden className="text-slate-300"> · </span>
                            <span className="font-semibold text-slate-600">DUE: </span>
                            {formatContextoDateTimePtBr(contextoDatas.due_entrega_em) ?? "—"}
                            <span aria-hidden className="text-slate-300"> · </span>
                            <span className="font-semibold text-slate-600">Reunião: </span>
                            {formatContextoDateTimePtBr(contextoDatas.reuniao_em) ?? "—"}
                          </p>
                        ) : null}
                      </div>
                      {unread ? (
                        <span
                          className="mt-1.5 size-2.5 shrink-0 rounded-full bg-[#2563eb] shadow-[0_0_0_2px_rgba(37,99,235,0.25)] ring-1 ring-white"
                          aria-label="Não lida"
                        />
                      ) : (
                        <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-transparent" aria-hidden />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-[#e6eaf2] bg-white/90 px-3 py-2.5 backdrop-blur-sm">
          <Link
            href="/crm/notifications"
            onClick={() => setOpen(false)}
            className={cn(
              "flex h-10 w-full items-center justify-center rounded-xl border border-transparent text-[13px] font-semibold text-primary-dark",
              "transition-all duration-150",
              "hover:border-primary-dark/15 hover:bg-[#eef5ff] hover:shadow-sm",
              "active:scale-[0.99] active:bg-[#e4edfc]",
              "focus-visible:outline focus-visible:ring-2 focus-visible:ring-primary-dark/25",
            )}
          >
            Ver todas as notificações
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
