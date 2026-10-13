/**
 * Ícone e cor das 8 áreas de prática do ICP (+ "Outros"). Os ícones das áreas que o CRM
 * já conhece vêm de `getAreaLucideIcon`; Contratos, Distressed Deals e Operações Legais
 * têm ícone próprio aqui (no CRM, as duas últimas cairiam no mesmo ícone). Cores por
 * token do Design System V2 — sem hex local.
 */
import { createElement } from "react";
import { FilePenLine, Folder, Settings, Zap, type LucideIcon } from "lucide-react";
import { getAreaLucideIcon } from "@/lib/crm/area-lucide-icon";
import { cn } from "@/lib/utils";
import { normalizePracticeArea } from "@/modules/icp/domain/compute";

/** Áreas cujo ícone já existe no CRM (`src/lib/crm/area-lucide-icon.tsx`). */
const CRM_ICON_AREAS = new Set(["Insolvência", "Cível", "Trabalhista", "Recuperação de Crédito", "Tributário"]);

const LOCAL_ICONS: Record<string, LucideIcon> = {
  Contratos: FilePenLine,
  "Distressed Deals": Zap,
  "Operações Legais": Settings,
};

/**
 * Tom (fundo, ícone e anel) de cada área. Segue a família de cor que o CRM já usa por
 * área (Cível azul, Trabalhista laranja, Contratos violeta, Tributário verde, Insolvência
 * vermelho), traduzida para os tokens semânticos; as três sem cor no CRM usam
 * interactive, navy e neutro forte.
 */
const AREA_TONE: Record<string, string> = {
  Insolvência: "bg-danger-bg text-danger-text ring-danger-border",
  Cível: "bg-info-bg text-info-text ring-info-border",
  Trabalhista: "bg-warning-bg text-warning-text ring-warning-border",
  Contratos: "bg-violet-bg text-violet-text ring-violet-border",
  "Distressed Deals": "bg-brand-navy/10 text-brand-navy ring-brand-navy/20",
  "Recuperação de Crédito": "bg-interactive-100 text-interactive-800 ring-interactive-300",
  Tributário: "bg-success-bg text-success-text ring-success-border",
  "Operações Legais": "bg-neutral-150 text-neutral-700 ring-neutral-300",
};

const DEFAULT_TONE = "bg-neutral-50 text-neutral-500 ring-neutral-200";

function areaKey(area: string): string {
  return normalizePracticeArea(area) ?? area;
}

export function getIcpAreaIcon(area: string): LucideIcon {
  const key = areaKey(area);
  if (LOCAL_ICONS[key]) return LOCAL_ICONS[key];
  if (CRM_ICON_AREAS.has(key)) return getAreaLucideIcon(key);
  return Folder;
}

export function getIcpAreaTone(area: string): string {
  return AREA_TONE[areaKey(area)] ?? DEFAULT_TONE;
}

export function IcpAreaIcon({ area, className }: { area: string; className?: string }) {
  // createElement: o ícone é escolhido pelo nome da área (mesmo padrão do CRM).
  return createElement(getIcpAreaIcon(area), { className, "aria-hidden": true });
}

/** Ícone da área numa caixa colorida (filtros, tabelas e listas). */
export function IcpAreaBadge({ area, size = "md" }: { area: string; size?: "sm" | "md" }) {
  return (
    <span
      role="img"
      aria-label={area}
      title={area}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-(--radius-v2-sm) ring-1",
        size === "sm" ? "size-6" : "size-7",
        getIcpAreaTone(area),
      )}
    >
      <IcpAreaIcon area={area} className={size === "sm" ? "size-3.5" : "size-4"} />
    </span>
  );
}

/** Ícone + nome da área numa etiqueta compacta. */
export function IcpAreaTag({ area }: { area: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-(--radius-v2-sm) px-1.5 py-0.5 text-xs font-medium ring-1",
        getIcpAreaTone(area),
      )}
    >
      <IcpAreaIcon area={area} className="size-3" />
      {area}
    </span>
  );
}

/** Espaço vazio do tamanho do badge, para alinhar linhas sem área (ex.: "Outros"). */
export function IcpAreaBadgeSpacer() {
  return <span className="size-6 shrink-0" aria-hidden />;
}
