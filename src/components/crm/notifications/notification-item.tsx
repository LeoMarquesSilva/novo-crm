"use client";

import Link from "next/link";
import { AlertCircle, Check, ChevronDown, ChevronRight, Clock, Mail, MailOpen } from "lucide-react";

import {
  NotificationGlyph,
  TONE_DOT_CLASS,
  TOOLTIP_CHIP_CLASS,
  notificationVisual,
} from "@/components/crm/notifications/notification-visuals";
import { useCrmNotifications } from "@/components/crm/notifications/notifications-provider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  formatContextoDateTimePtBr,
  parseDueLevantamentoEnrichment,
  parseLeadContextoDatas,
  parseLeadCriadorPor,
  parseOriginadoPor,
} from "@/lib/crm/in-app-notification-meta";
import {
  formatNotificationTime,
  notificationAreaKey,
  notificationBody,
  notificationGroupLabel,
  notificationHref,
  notificationTitle,
  type CrmNotificationRow,
} from "@/lib/crm/notifications/presentation";
import { cn } from "@/lib/utils";

function fullDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" });
}

function ReadToggle({ row, className }: { row: CrmNotificationRow; className?: string }) {
  const { markRead, markUnread } = useCrmNotifications();
  const unread = !row.lida_em;
  const label = unread ? "Marcar como lida" : "Marcar como não lida";
  const Icon = unread ? MailOpen : Mail;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void (unread ? markRead(row.id) : markUnread(row.id));
          }}
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-(--radius-v2-md) border border-border bg-white text-muted-foreground transition-colors duration-(--motion-fast)",
            "hover:border-border-strong hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            className,
          )}
        >
          <Icon className="size-3.5" strokeWidth={2} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" className={TOOLTIP_CHIP_CLASS}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/** Linha do sino e do toast: densa, uma ação de leitura no hover (no lugar da hora). */
export function NotificationItemCompact({
  row,
  now,
  onNavigate,
}: {
  row: CrmNotificationRow;
  now: Date;
  onNavigate?: () => void;
}) {
  const { markRead } = useCrmNotifications();
  const unread = !row.lida_em;
  const { tone, group } = notificationVisual(row.tipo);
  const actor = parseOriginadoPor(row.payload) ?? parseLeadCriadorPor(row.payload);
  const title = notificationTitle(row);
  const body = notificationBody(row);
  const area = notificationAreaKey(row.payload);
  const href = notificationHref(row.payload);

  return (
    <li className="group/notif relative">
      <Link
        href={href}
        onClick={() => {
          if (unread) void markRead(row.id);
          onNavigate?.();
        }}
        className={cn(
          "relative flex gap-3 px-4 py-3 pr-5 outline-none transition-colors duration-(--motion-fast)",
          "hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30",
          unread && "bg-interactive-50/50 hover:bg-interactive-50",
        )}
      >
        {unread ? (
          <span aria-hidden className="absolute inset-y-2.5 left-0 w-[3px] rounded-r-full bg-primary" />
        ) : null}
        <NotificationGlyph tipo={row.tipo} actor={actor} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p
              className={cn(
                "line-clamp-2 min-w-0 flex-1 text-[13px] leading-[18px]",
                unread ? "font-semibold text-foreground" : "font-medium text-neutral-700",
              )}
            >
              {title}
            </p>
            <time
              dateTime={row.created_at}
              title={fullDate(row.created_at)}
              className="mt-px shrink-0 text-xs tabular-nums text-muted-foreground group-hover/notif:invisible group-focus-within/notif:invisible"
            >
              {formatNotificationTime(row.created_at, now)}
            </time>
          </div>
          {body ? (
            <p className="mt-0.5 line-clamp-2 text-xs leading-[18px] text-muted-foreground">{body}</p>
          ) : null}
          <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT_CLASS[tone])} />
            <span className="truncate">
              {notificationGroupLabel(group)}
              {area ? ` · ${area}` : ""}
            </span>
            {unread ? <span className="sr-only">· não lida</span> : null}
          </p>
        </div>
      </Link>
      <div className="absolute right-3 top-2.5 opacity-0 transition-opacity duration-(--motion-fast) group-hover/notif:opacity-100 group-focus-within/notif:opacity-100">
        <ReadToggle row={row} />
      </div>
    </li>
  );
}

function DueLevantamentoDetails({ row }: { row: CrmNotificationRow }) {
  const due = parseDueLevantamentoEnrichment(row.payload);
  if (!due || due.areas.length === 0) return null;
  return (
    <details className="due-kanban-details group/due mt-3 rounded-(--radius-v2-md) border border-border bg-neutral-50 open:bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-(--radius-v2-md) px-3 py-2 text-xs font-semibold text-foreground outline-none transition-colors hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-primary/30 [&::-webkit-details-marker]:hidden">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <ChevronDown className="due-kanban-chevron size-3.5 shrink-0 text-muted-foreground transition-transform duration-200" aria-hidden />
          <span className="truncate">Levantamento DUE por área</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 tabular-nums">
          {due.atrasados > 0 ? (
            <span className="rounded-full bg-danger-bg px-1.5 py-0.5 text-danger-text">{due.atrasados} em atraso</span>
          ) : null}
          {due.disponibilizados}/{due.total}
        </span>
      </summary>
      <ul className="grid gap-1.5 border-t border-border px-3 pb-3 pt-2.5 sm:grid-cols-2">
        {due.areas.map((area) => (
          <li key={area.areaKey} className="flex items-start gap-2 text-xs leading-snug text-foreground/85">
            <span className="mt-0.5 shrink-0" aria-hidden>
              {area.entregue ? (
                <Check className="size-3.5 text-success-text" strokeWidth={2.5} />
              ) : area.emAtraso ? (
                <AlertCircle className="size-3.5 text-danger-text" strokeWidth={2.5} />
              ) : (
                <Clock className="size-3.5 text-warning-text" strokeWidth={2.5} />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-semibold text-foreground">{area.areaKey}</span>
              {area.entregue ? (
                <span className="text-success-text">
                  {" "}— concluída
                  {area.semProcessosAtivos ? <span className="text-muted-foreground"> (sem proc. ativos)</span> : null}
                </span>
              ) : area.emAtraso ? (
                <span className="text-danger-text"> — em atraso</span>
              ) : (
                <span className="text-warning-text"> — pendente</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Linha da central (/crm/notifications): mais contexto, ações sempre à mão. */
export function NotificationItemFull({ row, now }: { row: CrmNotificationRow; now: Date }) {
  const { markRead } = useCrmNotifications();
  const unread = !row.lida_em;
  const { tone, group } = notificationVisual(row.tipo);
  const originadoPor = parseOriginadoPor(row.payload);
  const leadCriador = parseLeadCriadorPor(row.payload);
  const actor = originadoPor ?? leadCriador;
  const title = notificationTitle(row);
  const body = notificationBody(row);
  const area = notificationAreaKey(row.payload);
  const href = notificationHref(row.payload);
  const contexto = parseLeadContextoDatas(row.payload);

  const datas = contexto
    ? [
        { label: "Lead", value: formatContextoDateTimePtBr(contexto.lead_criado_em) },
        { label: "Entrega DUE", value: formatContextoDateTimePtBr(contexto.due_entrega_em) },
        { label: "Reunião", value: formatContextoDateTimePtBr(contexto.reuniao_em) },
      ].filter((d) => d.value)
    : [];

  return (
    <li
      className={cn(
        "group/notif relative flex gap-3.5 px-4 py-4 transition-colors duration-(--motion-fast) sm:px-5",
        unread ? "bg-interactive-50/45" : "bg-white hover:bg-neutral-25",
      )}
    >
      {unread ? <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-primary" /> : null}
      <NotificationGlyph tipo={row.tipo} actor={actor} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("size-1.5 rounded-full", TONE_DOT_CLASS[tone])} />
            {notificationGroupLabel(group)}
          </span>
          {area ? (
            <>
              <span aria-hidden className="text-neutral-300">·</span>
              <span>{area}</span>
            </>
          ) : null}
          <span aria-hidden className="text-neutral-300">·</span>
          <time dateTime={row.created_at} title={fullDate(row.created_at)} className="tabular-nums">
            {formatNotificationTime(row.created_at, now)}
          </time>
          {unread ? (
            <span className="rounded-full bg-primary px-1.5 py-px text-[11px] font-semibold leading-4 text-white">Nova</span>
          ) : null}
        </div>

        <Link
          href={href}
          onClick={() => {
            if (unread) void markRead(row.id);
          }}
          className={cn(
            "mt-1 block rounded-(--radius-v2-sm) text-sm leading-5 outline-none hover:underline hover:underline-offset-2 focus-visible:ring-2 focus-visible:ring-primary/30",
            unread ? "font-semibold text-foreground" : "font-medium text-neutral-700",
          )}
        >
          {title}
        </Link>
        {body ? <p className="mt-1 line-clamp-3 text-[13px] leading-5 text-muted-foreground">{body}</p> : null}

        {actor ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {originadoPor ? "Originado por " : "Lead criado por "}
            <span className="font-semibold text-neutral-700">{actor.full_name}</span>
          </p>
        ) : null}

        {datas.length > 0 ? (
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {datas.map((d) => (
              <li
                key={d.label}
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-border bg-white px-2 py-0.5 text-xs tabular-nums text-neutral-600"
              >
                <span className="font-semibold text-neutral-700">{d.label}</span>
                {d.value}
              </li>
            ))}
          </ul>
        ) : null}

        <DueLevantamentoDetails row={row} />
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-start">
        <ReadToggle row={row} className="sm:opacity-0 sm:group-hover/notif:opacity-100 sm:focus-visible:opacity-100" />
        <Link
          href={href}
          onClick={() => {
            if (unread) void markRead(row.id);
          }}
          aria-label={`Abrir: ${title}`}
          className="inline-flex size-7 items-center justify-center rounded-(--radius-v2-md) text-muted-foreground transition-colors hover:bg-neutral-100 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ChevronRight className="size-4" strokeWidth={2} />
        </Link>
      </div>
    </li>
  );
}
