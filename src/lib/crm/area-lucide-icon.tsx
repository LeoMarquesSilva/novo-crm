import { createElement, forwardRef, type CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import { Briefcase, Layers, Scale } from "lucide-react";
import { cn } from "@/lib/utils";

export type PracticeAreaColorTokens = { bg: string; text: string; ring: string };

/**
 * Ícone da apresentação comercial (`public/brand/areas`, ver docs/ICONES-DAS-AREAS.md) desenhado
 * por máscara: assume a cor do texto (`bg-current`), como os ícones Lucide, e aceita className.
 * Tipado como LucideIcon para valer em todo lugar que já recebia o ícone da área.
 */
function brandAreaIcon(file: string, name: string): LucideIcon {
  const url = `url(/brand/areas/${file})`;
  const mask: CSSProperties = {
    maskImage: url,
    WebkitMaskImage: url,
    maskSize: "contain",
    WebkitMaskSize: "contain",
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    WebkitMaskPosition: "center",
  };
  const Icon = forwardRef<HTMLSpanElement, { className?: string }>(function BrandAreaIcon({ className }, ref) {
    return (
      <span
        ref={ref}
        aria-hidden
        data-area-icon={name}
        className={cn("inline-block size-4 shrink-0 bg-current", className)}
        style={mask}
      />
    );
  });
  Icon.displayName = `AreaIcon(${name})`;
  return Icon as unknown as LucideIcon;
}

const AREA_ICON = {
  civel: brandAreaIcon("civel.svg", "Cível"),
  trabalhista: brandAreaIcon("trabalhista.svg", "Trabalhista"),
  societario: brandAreaIcon("societario-e-contratos.svg", "Societário e Contratos"),
  recuperacao: brandAreaIcon("recuperacao-de-creditos.svg", "Recuperação de Créditos"),
  tributario: brandAreaIcon("tributario.svg", "Tributário"),
  reestruturacao: brandAreaIcon("reestruturacao-e-insolvencia.svg", "Reestruturação e Insolvência"),
  patrimonial: brandAreaIcon("estruturacao-patrimonial.svg", "Estruturação Patrimonial"),
  empresarial: brandAreaIcon("empresarial.svg", "Empresarial"),
};

/**
 * Ícone da área de prática (nome canônico ou legado): os da apresentação comercial
 * (04/11/2026, docs/ICONES-DAS-AREAS.md). Nome antigo mantido: é usado em todo o CRM.
 * Fallback: `Briefcase`.
 */
export function getAreaLucideIcon(area: string): LucideIcon {
  const a = area.trim().toLowerCase();

  if (a.includes("cível") || a.includes("civel")) return AREA_ICON.civel;
  if (a.includes("trabalh")) return AREA_ICON.trabalhista;
  if (a.includes("societ") || a.includes("contrato")) return AREA_ICON.societario;
  if (a.includes("recuperação") || a.includes("recuperacao") || a.includes("crédito") || a.includes("credito"))
    return AREA_ICON.recuperacao;
  if (a.includes("tribut")) return AREA_ICON.tributario;
  if (a.includes("reestrutura") || a.includes("insolvência") || a.includes("insolvencia") || a.includes("distressed"))
    return AREA_ICON.reestruturacao;
  if (a.includes("patrimon")) return AREA_ICON.patrimonial;
  if (a.includes("empresarial")) return AREA_ICON.empresarial;
  if (a.includes("socio") || a.includes("operações") || a.includes("operacoes")) return Scale;

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

/** `xs` cabe em SelectTrigger h-8/h-10; nunca use `sm+` dentro de select. */
const BADGE_SIZE = {
  xs: { box: "size-5 rounded-md", icon: "size-3" },
  sm: { box: "size-8 rounded-lg", icon: "size-3.5" },
  md: { box: "size-10 rounded-xl", icon: "size-4" },
  lg: { box: "size-11 rounded-xl", icon: "size-[1.125rem]" },
} as const;

const LABEL_LAYOUT = {
  xs: { gap: "gap-1.5", name: "text-sm font-medium" },
  sm: { gap: "gap-2", name: "text-sm font-semibold" },
  md: { gap: "gap-2.5", name: "text-sm font-semibold" },
  lg: { gap: "gap-3", name: "text-base font-semibold" },
} as const;

export type PracticeAreaIconSize = keyof typeof BADGE_SIZE;

/** Ícone da área em badge colorido (usar sempre que citar uma área de prática). */
export function PracticeAreaIconBadge({
  area,
  size = "md",
  className,
}: {
  area: string;
  size?: PracticeAreaIconSize;
  className?: string;
}) {
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
      {createElement(getAreaLucideIcon(area), {
        className: cn(s.icon, colors.text),
      })}
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
  size?: PracticeAreaIconSize;
}) {
  const layout = LABEL_LAYOUT[size];
  return (
    <span className={cn("inline-flex min-w-0 items-center", layout.gap, className)}>
      <PracticeAreaIconBadge area={area} size={size} />
      <span className={cn("truncate text-[#111827]", layout.name, nameClassName)}>{area}</span>
    </span>
  );
}
