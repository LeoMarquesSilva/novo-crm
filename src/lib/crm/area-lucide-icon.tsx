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

export function AreaIconLabel({
  area,
  className,
  iconClassName,
}: {
  area: string;
  className?: string;
  iconClassName?: string;
}) {
  const Icon = getAreaLucideIcon(area);
  return (
    <span className={className ?? "inline-flex items-center gap-1.5"}>
      <Icon className={iconClassName ?? "h-3.5 w-3.5 shrink-0 text-muted-foreground"} aria-hidden />
      <span>{area}</span>
    </span>
  );
}
