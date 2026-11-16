"use client";

import Link from "next/link";
import { motion, useAnimationControls, useReducedMotion } from "framer-motion";
import { ArrowLeft, Bell, BellRing, CheckCheck, Maximize2, Settings2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { NotificationItemCompact } from "@/components/crm/notifications/notification-item";
import { TOOLTIP_CHIP_CLASS } from "@/components/crm/notifications/notification-visuals";
import { NotificationSettingsPanel } from "@/components/crm/notifications/notification-settings";
import { useCrmNotifications } from "@/components/crm/notifications/notifications-provider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isPushPromptSnoozed, snoozePushPrompt } from "@/lib/crm/notifications/preferences";
import { groupNotificationsByDay } from "@/lib/crm/notifications/presentation";
import { cn } from "@/lib/utils";

const MAX_ITEMS = 30;

function HeaderIconButton({
  label,
  onClick,
  disabled,
  children,
  href,
  onNavigate,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  href?: string;
  onNavigate?: () => void;
}) {
  const className = cn(
    "inline-flex size-8 items-center justify-center rounded-(--radius-v2-md) text-muted-foreground transition-colors duration-(--motion-fast)",
    "hover:bg-neutral-100 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    "disabled:pointer-events-none disabled:opacity-40",
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href ? (
          <Link href={href} onClick={onNavigate} aria-label={label} className={className}>
            {children}
          </Link>
        ) : (
          <button type="button" aria-label={label} onClick={onClick} disabled={disabled} className={className}>
            {children}
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent side="bottom" className={TOOLTIP_CHIP_CLASS}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function PushInvite({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { push } = useCrmNotifications();
  const [hidden, setHidden] = useState(() => (typeof window === "undefined" ? true : isPushPromptSnoozed()));
  if (hidden || push.state !== "default") return null;

  return (
    <div className="mx-3 mt-3 flex items-start gap-3 rounded-(--radius-v2-lg) border border-brand-navy/10 bg-brand-cream px-3 py-2.5">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-navy text-brand-gold">
        <BellRing className="size-4" strokeWidth={2} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-5 text-brand-navy">Não perca nenhum aviso</p>
        <p className="text-xs leading-[18px] text-neutral-600">
          Receba no computador ou celular, mesmo com o CRM em outra janela.
        </p>
        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void push.enable()}
            disabled={push.busy}
            className="inline-flex h-7 items-center rounded-(--radius-v2-md) bg-brand-navy px-2.5 text-xs font-semibold text-white transition-colors hover:bg-brand-navy-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
          >
            Ativar notificações
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex h-7 items-center rounded-(--radius-v2-md) px-2 text-xs font-semibold text-neutral-600 transition-colors hover:bg-white hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Preferências
          </button>
        </div>
      </div>
      <button
        type="button"
        aria-label="Dispensar por uma semana"
        onClick={() => {
          snoozePushPrompt();
          setHidden(true);
        }}
        className="-mr-1 -mt-0.5 inline-flex size-6 items-center justify-center rounded-(--radius-v2-sm) text-neutral-500 transition-colors hover:bg-white hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <X className="size-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}

function EmptyState({ tab, onShowAll }: { tab: "unread" | "all"; onShowAll: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-success-bg text-success-text ring-8 ring-success-bg/40">
        <CheckCheck className="size-5" strokeWidth={2} aria-hidden />
      </span>
      <p className="mt-4 text-sm font-semibold text-foreground">
        {tab === "unread" ? "Tudo em dia" : "Nenhuma notificação ainda"}
      </p>
      <p className="mt-1 max-w-[240px] text-xs leading-[18px] text-muted-foreground">
        {tab === "unread"
          ? "Você leu todos os avisos. Os novos aparecem aqui na hora."
          : "Quando alguém precisar de você no CRM, o aviso chega aqui."}
      </p>
      {tab === "unread" ? (
        <button
          type="button"
          onClick={onShowAll}
          className="mt-3 rounded-(--radius-v2-md) px-2 py-1 text-xs font-semibold text-interactive-700 transition-colors hover:bg-interactive-50 focus-visible:outline-2 focus-visible:outline-ring"
        >
          Ver avisos anteriores
        </button>
      ) : null}
    </div>
  );
}

export function CrmNotificationsBell({ className }: { className?: string }) {
  const { items, loaded, unreadCount, arrivalTick, markAllRead, markingAll } = useCrmNotifications();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"list" | "settings">("list");
  const [tab, setTab] = useState<"unread" | "all">("unread");
  const reduceMotion = useReducedMotion();
  const bellControls = useAnimationControls();
  const badgeControls = useAnimationControls();
  const lastTickRef = useRef(arrivalTick);
  // "Agora" estável enquanto o popover está aberto (horas relativas não pulam a cada render).
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (arrivalTick === lastTickRef.current) return;
    lastTickRef.current = arrivalTick;
    if (reduceMotion) return;
    void bellControls.start({
      rotate: [0, -16, 13, -9, 6, -3, 0],
      transition: { duration: 0.8, ease: "easeInOut" },
    });
    void badgeControls.start({ scale: [1, 1.35, 1], transition: { duration: 0.45, ease: "easeOut" } });
  }, [arrivalTick, bellControls, badgeControls, reduceMotion]);

  const visible = useMemo(() => {
    const base = tab === "unread" ? items.filter((n) => !n.lida_em) : items;
    return base.slice(0, MAX_ITEMS);
  }, [items, tab]);
  const sections = useMemo(() => groupNotificationsByDay(visible, now), [visible, now]);
  const badge = unreadCount > 99 ? "99+" : String(unreadCount);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setNow(new Date());
      setView("list");
      setTab(unreadCount > 0 ? "unread" : "all");
    }
  }

  const close = () => setOpen(false);

  // Ao trocar entre lista e preferências o botão clicado some: leva o foco para a tela nova,
  // senão ele cai no <body> e o popover perde o foco do teclado.
  const contentRef = useRef<HTMLDivElement>(null);
  const viewChangedRef = useRef(false);
  useEffect(() => {
    if (!viewChangedRef.current) return;
    viewChangedRef.current = false;
    contentRef.current?.querySelector<HTMLElement>("button, [href], input")?.focus();
  }, [view]);
  const switchView = (next: "list" | "settings") => {
    viewChangedRef.current = true;
    setView(next);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unreadCount > 0 ? `Notificações: ${unreadCount} não lidas` : "Notificações"}
          className={cn(
            "relative inline-flex size-9 items-center justify-center rounded-(--radius-v2-lg) border border-border bg-white text-muted-foreground transition-colors duration-(--motion-fast)",
            "hover:border-border-strong hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            "data-[state=open]:border-interactive-300 data-[state=open]:bg-interactive-50 data-[state=open]:text-interactive-700",
            unreadCount > 0 && "text-foreground",
            className,
          )}
        >
          <motion.span animate={bellControls} style={{ originX: 0.5, originY: 0.1 }} className="inline-flex">
            <Bell className="size-[18px]" strokeWidth={2} />
          </motion.span>
          {unreadCount > 0 ? (
            <motion.span
              animate={badgeControls}
              aria-hidden
              className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger-text px-1 text-[11px] font-bold leading-none tabular-nums text-white ring-2 ring-white"
            >
              {badge}
            </motion.span>
          ) : null}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        collisionPadding={12}
        ref={contentRef}
        className="flex max-h-[min(80dvh,640px)] w-[min(calc(100vw-1.5rem),400px)] flex-col overflow-hidden rounded-(--radius-v2-xl) bg-white p-0"
      >
        {view === "settings" ? (
          <>
            <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
              <HeaderIconButton label="Voltar para os avisos" onClick={() => switchView("list")}>
                <ArrowLeft className="size-4" strokeWidth={2} />
              </HeaderIconButton>
              <h2 className="text-[15px] font-bold tracking-[-0.01em] text-foreground">Preferências</h2>
            </div>
            <div className="crm-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <NotificationSettingsPanel />
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 px-4 pb-2 pt-3">
              <h2 className="text-[15px] font-bold tracking-[-0.01em] text-foreground">Notificações</h2>
              {unreadCount > 0 ? (
                <span className="rounded-full bg-interactive-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-interactive-700">
                  {unreadCount} {unreadCount === 1 ? "nova" : "novas"}
                </span>
              ) : null}
              <div className="ml-auto flex items-center gap-0.5">
                <HeaderIconButton
                  label="Marcar todas como lidas"
                  onClick={() => void markAllRead()}
                  disabled={unreadCount === 0 || markingAll}
                >
                  <CheckCheck className="size-4" strokeWidth={2} />
                </HeaderIconButton>
                <HeaderIconButton label="Preferências de notificação" onClick={() => switchView("settings")}>
                  <Settings2 className="size-4" strokeWidth={2} />
                </HeaderIconButton>
                <HeaderIconButton label="Abrir central de notificações" href="/crm/notifications" onNavigate={close}>
                  <Maximize2 className="size-4" strokeWidth={2} />
                </HeaderIconButton>
              </div>
            </div>

            <div className="px-4 pb-2.5">
              <div role="group" aria-label="Filtro" className="grid grid-cols-2 gap-1 rounded-(--radius-v2-lg) bg-neutral-100 p-1">
                {(
                  [
                    { id: "unread", label: "Não lidas", count: unreadCount },
                    { id: "all", label: "Todas", count: null },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={tab === t.id}
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "inline-flex h-7 items-center justify-center gap-1.5 rounded-(--radius-v2-md) text-[13px] font-semibold transition-colors duration-(--motion-fast)",
                      "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                      tab === t.id
                        ? "bg-white text-foreground shadow-(--shadow-v2-xs)"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t.label}
                    {t.count ? (
                      <span className="rounded-full bg-primary px-1.5 text-[11px] font-bold leading-4 tabular-nums text-white">
                        {t.count > 99 ? "99+" : t.count}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-border" />

            <div className="crm-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
              <PushInvite onOpenSettings={() => switchView("settings")} />
              {!loaded ? (
                <ul aria-busy className="space-y-px py-2">
                  {[0, 1, 2].map((i) => (
                    <li key={i} className="flex gap-3 px-4 py-3">
                      <span className="size-9 shrink-0 animate-pulse rounded-(--radius-v2-lg) bg-neutral-100" />
                      <span className="flex-1 space-y-2 pt-1">
                        <span className="block h-3 w-3/4 animate-pulse rounded bg-neutral-100" />
                        <span className="block h-3 w-1/2 animate-pulse rounded bg-neutral-100" />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : sections.length === 0 ? (
                <EmptyState tab={tab} onShowAll={() => setTab("all")} />
              ) : (
                sections.map((section) => (
                  <section key={section.bucket} aria-label={section.label}>
                    <h3 className="sticky top-0 z-[1] border-b border-border/60 bg-white/95 px-4 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground backdrop-blur-sm">
                      {section.label}
                    </h3>
                    <ul className="divide-y divide-border/70">
                      {section.items.map((row) => (
                        <NotificationItemCompact key={row.id} row={row} now={now} onNavigate={close} />
                      ))}
                    </ul>
                  </section>
                ))
              )}
            </div>

            <div className="border-t border-border p-2">
              <Link
                href="/crm/notifications"
                onClick={close}
                className="flex h-9 w-full items-center justify-center rounded-(--radius-v2-md) text-[13px] font-semibold text-interactive-700 transition-colors duration-(--motion-fast) hover:bg-interactive-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Ver central de notificações
              </Link>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
