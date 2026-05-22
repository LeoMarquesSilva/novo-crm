import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  Building2,
  Coins,
  Gavel,
  Handshake,
  Landmark,
  Layers,
  Scale,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type PracticeAreaColorTokens = { bg: string; text: string; ring: string };

/**
 * Ícone sugerido para uma área de prática (nome canónico ou legado).
 * Fallback: `Briefcase`.
 */
export function getAreaLucideIcon(area: string): LucideIcon {
  const a = area.trim().toLowerCase();

  if (a.includes("cível") || a.includes("civel")) return Gavel;
  if (a.includes("trabalh")) return Users;
  if (a.includes("societ")) return Handshake;
  if (a.includes("recuperação") || a.includes("recuperacao") || a.includes("crédito") || a.includes("credito"))
    return Coins;
  if (a.includes("tribut")) return Landmark;
  if (a.includes("reestrutura") || a.includes("insolvência") || a.includes("insolvencia")) return Building2;
  if (a.includes("socio") || a.includes("distressed") || a.includes("operações") || a.includes("operacoes"))
    return Scale;

  return a.length > 0 ? Layers : Briefcase;
}

/** Cores por área de prática (badges, cards, árvore do catálogo). */
export function getPracticeAreaColors(area: string): PracticeAreaColorTokens {
  const a = area.trim().toLowerCase();
  if (a.includes("cível") || a.includes("civel"))
    return { bg: "bg-blue-100", text: "text-blue-700", ring: "ring-blue-200/80" };
  if (a.includes("trabalh"))
    return { bg: "bg-orange-100", text: "text-orange-700", ring: "ring-orange-200/80" };
  if (a.includes("societ") || a.includes("contrat"))
    return { bg: "bg-violet-100", text: "text-violet-700", ring: "ring-violet-200/80" };
  if (a.includes("recupera") || a.includes("crédito") || a.includes("credito"))
    return { bg: "bg-amber-100", text: "text-amber-700", ring: "ring-amber-200/80" };
  if (a.includes("tribut"))
    return { bg: "bg-emerald-100", text: "text-emerald-700", ring: "ring-emerald-200/80" };
  if (a.includes("reestrutura") || a.includes("insolvê") || a.includes("insolvencia"))
    return { bg: "bg-rose-100", text: "text-rose-700", ring: "ring-rose-200/80" };
  return { bg: "bg-slate-100", text: "text-slate-600", ring: "ring-slate-200/80" };
}

const BADGE_SIZE = {
  sm: { box: "size-8 rounded-lg", icon: "size-3.5" },
  md: { box: "size-10 rounded-xl", icon: "size-4" },
  lg: { box: "size-11 rounded-xl", icon: "size-[1.125rem]" },
} as const;

/** Ícone da área em badge colorido (usar sempre que citar uma área de prática). */
export function PracticeAreaIconBadge({
  area,
  size = "md",
  className,
}: {
  area: string;
  size?: keyof typeof BADGE_SIZE;
  className?: string;
}) {
  const Icon = getAreaLucideIcon(area);
  const colors = getPracticeAreaColors(area);
  const s = BADGE_SIZE[size];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center ring-1",
        s.box,
        colors.bg,
        colors.ring,
        className,
      )}
      aria-hidden
    >
      <Icon className={cn(s.icon, colors.text)} />
    </span>
  );
}

export function AreaIconLabel({
  area,
  className,
  nameClassName,
  size = "sm",
}: {
  area: string;
  className?: string;
  nameClassName?: string;
  size?: keyof typeof BADGE_SIZE;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      <PracticeAreaIconBadge area={area} size={size} />
      <span className={cn("truncate font-semibold text-[#111827]", nameClassName)}>{area}</span>
    </span>
  );
}
