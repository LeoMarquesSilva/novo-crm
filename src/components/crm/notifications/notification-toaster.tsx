"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { NotificationGlyph, notificationVisual } from "@/components/crm/notifications/notification-visuals";
import { useCrmNotifications, type NotificationToast } from "@/components/crm/notifications/notifications-provider";
import { parseLeadCriadorPor, parseOriginadoPor } from "@/lib/crm/in-app-notification-meta";
import {
  notificationBody,
  notificationGroupLabel,
  notificationHref,
  notificationTitle,
} from "@/lib/crm/notifications/presentation";
import { cn } from "@/lib/utils";

const TOAST_MS = 8000;

function ToastCard({ toast }: { toast: NotificationToast }) {
  const router = useRouter();
  const { markRead, dismissToast } = useCrmNotifications();
  const reduceMotion = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(TOAST_MS);
  const startedRef = useRef(0);

  const { row, summaryCount } = toast;
  const { group } = notificationVisual(row.tipo);
  const actor = parseOriginadoPor(row.payload) ?? parseLeadCriadorPor(row.payload);
  const summary = typeof summaryCount === "number" && summaryCount > 1;
  const title = summary ? `${summaryCount} novas notificações` : notificationTitle(row);
  const body = summary ? `Mais recente: ${notificationTitle(row)}` : notificationBody(row);
  const href = summary ? "/crm/notifications" : notificationHref(row.payload);

  useEffect(() => {
    if (paused) return;
    startedRef.current = Date.now();
    const timer = window.setTimeout(() => dismissToast(toast.key), remainingRef.current);
    return () => {
      window.clearTimeout(timer);
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedRef.current));
    };
  }, [paused, dismissToast, toast.key]);

  function open() {
    if (!summary) void markRead(row.id);
    dismissToast(toast.key);
    if (href.startsWith("/")) router.push(href);
    else window.open(href, "_blank", "noopener");
  }

  return (
    <motion.li
      layout={!reduceMotion}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24, transition: { duration: 0.16 } }}
      transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      className="pointer-events-auto relative w-full overflow-hidden rounded-(--radius-v2-xl) border border-border bg-white shadow-(--shadow-v2-md)"
    >
      <div className="flex gap-3 p-3 pr-2">
        <NotificationGlyph tipo={row.tipo} actor={summary ? null : actor} className="mt-0.5" />
        <button
          type="button"
          onClick={open}
          className="min-w-0 flex-1 rounded-(--radius-v2-sm) text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <span className="block text-xs font-medium text-muted-foreground">
            {summary ? "CRM" : notificationGroupLabel(group)} · agora
          </span>
          <span className="mt-0.5 line-clamp-2 block text-[13px] font-semibold leading-[18px] text-foreground">
            {title}
          </span>
          {body ? (
            <span className="mt-0.5 line-clamp-2 block text-xs leading-[18px] text-muted-foreground">{body}</span>
          ) : null}
        </button>
        <button
          type="button"
          aria-label="Fechar"
          onClick={() => dismissToast(toast.key)}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-(--radius-v2-md) text-muted-foreground transition-colors hover:bg-neutral-100 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <X className="size-4" strokeWidth={2} />
        </button>
      </div>
      <div className="flex items-center gap-1 border-t border-border/70 px-2 py-1.5 pl-[60px]">
        <button
          type="button"
          onClick={open}
          className="inline-flex h-7 items-center rounded-(--radius-v2-md) px-2 text-xs font-semibold text-interactive-700 transition-colors hover:bg-interactive-50 focus-visible:outline-2 focus-visible:outline-ring"
        >
          {summary ? "Ver todas" : "Abrir"}
        </button>
        {!summary ? (
          <button
            type="button"
            onClick={() => void markRead(row.id)}
            className="inline-flex h-7 items-center rounded-(--radius-v2-md) px-2 text-xs font-semibold text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            Marcar como lida
          </button>
        ) : null}
      </div>
      <span
        aria-hidden
        className={cn(
          "crm-toast-timer absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary/70",
          paused && "[animation-play-state:paused]",
        )}
        style={{ animationDuration: `${TOAST_MS}ms` }}
      />
    </motion.li>
  );
}

/** Pilha de avisos recém-chegados no canto inferior direito (no celular, embaixo, largura total). */
export function NotificationToaster() {
  const { toasts } = useCrmNotifications();
  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed inset-x-3 bottom-3 z-(--z-dialog-floating) sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[360px]"
    >
      <ol className="flex flex-col-reverse gap-2">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <ToastCard key={toast.key} toast={toast} />
          ))}
        </AnimatePresence>
      </ol>
    </div>
  );
}
