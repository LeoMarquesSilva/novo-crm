"use client";

import {
  AtSign,
  BadgeCheck,
  Bell,
  FilePenLine,
  FileSearch,
  FileText,
  Handshake,
  Timer,
  type LucideIcon,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { InAppNotificationActor } from "@/lib/crm/in-app-notification-meta";
import { notificationGroup, type NotificationGroupId } from "@/lib/crm/notifications/presentation";
import { cn } from "@/lib/utils";

export type NotificationTone = "info" | "violet" | "success" | "warning" | "danger" | "brand" | "neutral";

const GROUP_VISUALS: Record<NotificationGroupId, { icon: LucideIcon; tone: NotificationTone }> = {
  due: { icon: FileSearch, tone: "info" },
  propostas: { icon: FileText, tone: "violet" },
  contratos: { icon: FilePenLine, tone: "brand" },
  indicadores: { icon: Handshake, tone: "warning" },
  anotacoes: { icon: AtSign, tone: "info" },
  pos_venda: { icon: BadgeCheck, tone: "success" },
  sla_etapa: { icon: Timer, tone: "danger" },
  outras: { icon: Bell, tone: "neutral" },
};

/** Alguns tipos pedem uma cor própria dentro do grupo (cancelamento, devolução…). */
const TIPO_TONE_OVERRIDES: Record<string, NotificationTone> = {
  contrato_assinado: "success",
  contrato_ativado: "success",
  venda_fechada: "success",
  cadastro_cliente_concluido: "success",
  contrato_cancelado: "danger",
  contrato_excedente_sem_preco: "danger",
  cadastro_cliente_devolvido: "warning",
  due_area_sem_responsavel: "warning",
  contrato_renovacao_pendente: "warning",
};

export const TONE_TILE_CLASS: Record<NotificationTone, string> = {
  info: "bg-info-bg text-info-text ring-info-border/70",
  violet: "bg-violet-bg text-violet-text ring-violet-border/70",
  success: "bg-success-bg text-success-text ring-success-border/70",
  warning: "bg-warning-bg text-warning-text ring-warning-border/70",
  danger: "bg-danger-bg text-danger-text ring-danger-border/70",
  brand: "bg-brand-cream text-brand-gold-text ring-brand-gold/40",
  neutral: "bg-neutral-100 text-neutral-600 ring-neutral-200",
};

export const TONE_DOT_CLASS: Record<NotificationTone, string> = {
  info: "bg-info-text",
  violet: "bg-violet-text",
  success: "bg-success-text",
  warning: "bg-warning-text",
  danger: "bg-danger-text",
  brand: "bg-brand-gold",
  neutral: "bg-neutral-400",
};

/** Tooltip curto (rótulo de botão de ícone), no mesmo estilo do menu lateral. */
export const TOOLTIP_CHIP_CLASS =
  "w-auto max-w-[240px] rounded-(--radius-v2-md) border-transparent bg-brand-navy px-2 py-1 text-xs font-medium text-white";

export function notificationVisual(tipo: string): { icon: LucideIcon; tone: NotificationTone; group: NotificationGroupId } {
  const group = notificationGroup(tipo);
  const base = GROUP_VISUALS[group];
  return { icon: base.icon, tone: TIPO_TONE_OVERRIDES[tipo] ?? base.tone, group };
}

export function groupVisual(group: NotificationGroupId): { icon: LucideIcon; tone: NotificationTone } {
  return GROUP_VISUALS[group];
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

/**
 * Ícone do aviso: quadrado colorido da categoria ou, quando há uma pessoa por trás
 * (quem originou / criou o lead), o avatar com o selo da categoria no canto.
 */
export function NotificationGlyph({
  tipo,
  actor,
  size = "md",
  className,
}: {
  tipo: string;
  actor?: InAppNotificationActor | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const { icon: Icon, tone } = notificationVisual(tipo);
  const box = size === "lg" ? "size-11" : size === "sm" ? "size-8" : "size-9";
  const iconSize = size === "lg" ? "size-5" : size === "sm" ? "size-3.5" : "size-4";

  if (actor) {
    return (
      <span className={cn("relative inline-flex shrink-0 self-start", className)}>
        <Avatar className={cn(box, "border border-border")}>
          {actor.avatar_url ? <AvatarImage src={actor.avatar_url} alt="" /> : null}
          <AvatarFallback className="bg-neutral-100 text-xs font-semibold text-neutral-700">
            {initialsFromName(actor.full_name)}
          </AvatarFallback>
        </Avatar>
        <span
          aria-hidden
          className={cn(
            "absolute -bottom-1 -right-1 flex size-[18px] items-center justify-center rounded-full ring-2 ring-white",
            TONE_TILE_CLASS[tone],
          )}
        >
          <Icon className="size-2.5" strokeWidth={2.25} />
        </span>
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 self-start items-center justify-center rounded-(--radius-v2-lg) ring-1 ring-inset",
        box,
        TONE_TILE_CLASS[tone],
        className,
      )}
    >
      <Icon className={iconSize} strokeWidth={2} />
    </span>
  );
}
