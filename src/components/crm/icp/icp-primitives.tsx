"use client";

/**
 * Peças visuais compartilhadas pelas abas do ICP: painel (Surface), barras, indicadores,
 * selos de fonte, tooltip de ajuda, logo do grupo e filtros. Design System V2: superfície
 * branca com borda e raio de 12px, sem sombra; cores só por token.
 */
import { useState, type ReactNode } from "react";
import { CircleQuestionMark, Database, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  crmSurfaceSegmentedRootClass,
  crmSurfaceSegmentedTabClass,
} from "@/components/crm/crm-surface-header";
import { cn } from "@/lib/utils";
import type { IcpGroupRow } from "@/modules/icp/domain/compute";
import { SOURCE_SYSTEM, TIER_SCOPES, type Source, type SourceSystem, type TierScope } from "./icp-content";
import { employeeRangeText, groupName, pct } from "./icp-format";

/** Ícone aceito pelos painéis: qualquer ícone do lucide ou o `LinkedinIcon` local. */
export type IcpIcon = React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

/** Anel de foco padrão dos controles locais (mesmo azul do `--ring`). */
export const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

/**
 * Marca "in" do LinkedIn em traço (currentColor). O lucide-react 1.x não traz mais
 * ícones de marca, então o glifo é desenhado aqui no mesmo grid 24×24 e traço 2.
 */
export function LinkedinIcon({ className, "aria-hidden": ariaHidden = true }: { className?: string; "aria-hidden"?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-4", className)}
      aria-hidden={ariaHidden}
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 11v5" />
      <path d="M8 8v.01" />
      <path d="M12 16v-5" />
      <path d="M16 16v-3a2 2 0 0 0-4 0" />
    </svg>
  );
}

/* ---------------------------------------------------------------- Tooltips */

/** Ícone "?" de ajuda com explicação curta num tooltip (substitui o `InfoTooltip` do sistema antigo). */
export function IcpInfoTooltip({
  title,
  description,
  side = "top",
  className,
}: {
  title: string;
  description: string;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Saiba mais sobre ${title}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-(--radius-v2-sm) text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600",
            focusRing,
            className,
          )}
        >
          <CircleQuestionMark className="size-3.5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="px-3.5 py-3">
        <p className="text-sm font-semibold leading-snug text-foreground">{title}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function LabelWithInfo({ label, info, className }: { label: string; info: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {label}
      <IcpInfoTooltip title={label} description={info} />
    </span>
  );
}

/** Botão de texto "detalhes" que abre um tooltip com conteúdo livre. */
export function DetailsTooltip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "rounded-(--radius-v2-sm) px-1.5 py-0.5 text-xs font-medium text-interactive-700 underline-offset-2 hover:underline",
            focusRing,
            className,
          )}
        >
          detalhes
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="px-3.5 py-3">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

/* ----------------------------------------------------------- Fontes de dados */

export function SourceBadge({ system }: { system: SourceSystem }) {
  return (
    <Badge variant="outline" className={SOURCE_SYSTEM[system].className}>
      {SOURCE_SYSTEM[system].label}
    </Badge>
  );
}

/** Rodapé de fontes: mostra os sistemas e lista o detalhe de cada dado num tooltip. */
export function SourceNote({ sources, className }: { sources: Source[]; className?: string }) {
  const systems = Array.from(new Set(sources.map((s) => s.system)));
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <span className="inline-flex items-center gap-1">
        <Database className="size-3.5" aria-hidden />
        Fonte:
      </span>
      {systems.map((system) => (
        <SourceBadge key={system} system={system} />
      ))}
      <DetailsTooltip>
        <p className="text-sm font-semibold text-foreground">De onde vêm os dados</p>
        <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-muted-foreground">
          {sources.map((source) => (
            <li key={`${source.system}-${source.detail}`}>
              <span className="font-semibold text-foreground">{SOURCE_SYSTEM[source.system].label}</span> ·{" "}
              {source.detail}
            </li>
          ))}
        </ul>
      </DetailsTooltip>
    </div>
  );
}

/* -------------------------------------------------------------------- Painel */

/** Surface (§15.1) com título, ajuda, ação opcional e rodapé de fontes. */
export function Panel({
  title,
  description,
  icon: Icon,
  children,
  className,
  action,
  sources,
  info,
}: {
  title: string;
  description?: string;
  icon?: IcpIcon;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
  sources?: Source[];
  /** Explicação curta mostrada num tooltip ao lado do título. */
  info?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-(--radius-v2-xl) border border-border bg-white p-4 sm:p-5", className)}>
      <PanelHeader title={title} description={description} icon={Icon} info={info} action={action} />
      {children}
      {sources && sources.length > 0 && <SourceNote sources={sources} className="mt-4 border-t border-border pt-3" />}
    </section>
  );
}

export function PanelHeader({
  title,
  description,
  icon: Icon,
  info,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: IcpIcon;
  info?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
          <h2 className="text-base font-semibold leading-6 text-foreground">{title}</h2>
          {info && <IcpInfoTooltip title={title} description={info} />}
        </div>
        {description && <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Nota de destaque (insight) dentro de um painel: tom informativo, sem decoração. */
export function Callout({ icon: Icon, children, className }: { icon?: IcpIcon; children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-(--radius-v2-md) border border-info-border bg-info-bg px-4 py-3 text-sm leading-relaxed text-foreground",
        className,
      )}
    >
      {Icon && <Icon className="mt-0.5 size-4 shrink-0 text-info-text" aria-hidden />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------- Barras */

/** Linha com rótulo, valor e barra horizontal proporcional a `max`. */
export function BarRow({
  label,
  value,
  max,
  display,
  hint,
  barClassName = "bg-chart-1",
  icon,
}: {
  label: ReactNode;
  value: number;
  max: number;
  display: string;
  hint?: string;
  barClassName?: string;
  icon?: ReactNode;
}) {
  const width = max > 0 ? Math.max(1.5, (value / max) * 100) : 0;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
      <div className="flex min-w-0 items-center gap-2">
        {icon}
        <span className="truncate text-sm font-medium text-foreground">{label}</span>
        {hint && <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{hint}</span>}
      </div>
      <span className="text-right text-sm font-semibold tabular-nums text-foreground">{display}</span>
      <div className="col-span-2 h-2 overflow-hidden rounded-full bg-neutral-100">
        <div className={cn("h-full rounded-full", barClassName)} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

/** Barra fina (grupos × receita) usada na tabela de faixas. */
export function ShareBar({ value, label, strong }: { value: number; label: string; strong?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-2 whitespace-nowrap">
      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
        <div
          className={cn("h-full rounded-full", strong ? "bg-chart-1" : "bg-neutral-300")}
          style={{ width: `${Math.max(1.5, value * 100)}%` }}
        />
      </div>
      <span className={cn("text-xs tabular-nums", strong ? "font-semibold text-foreground" : "text-muted-foreground")}>
        {pct(value)} {label}
      </span>
    </div>
  );
}

/** Barra fina de 0 a 100% usada na margem e no atraso. */
export function MiniBar({ value, warn }: { value: number; warn?: boolean }) {
  return (
    <div className="mt-1.5 h-1.5 w-full max-w-28 overflow-hidden rounded-full bg-neutral-100">
      <div
        className={cn("h-full rounded-full", warn ? "bg-chart-3" : "bg-chart-1")}
        style={{ width: `${Math.min(100, Math.max(2, value * 100))}%` }}
      />
    </div>
  );
}

/* --------------------------------------------------------------- Indicadores */

/** Grupo de KPIs numa única Surface dividida em colunas (§29.2). */
export function KpiGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section
      aria-label={label}
      className="grid gap-px overflow-hidden rounded-(--radius-v2-xl) border border-border bg-border sm:grid-cols-2 xl:grid-cols-4"
    >
      {children}
    </section>
  );
}

export function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  source,
  info,
}: {
  label: string;
  value: string;
  hint: string;
  icon: IcpIcon;
  source: Source;
  info?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 text-[13px] font-medium leading-5 text-muted-foreground">
          <Icon className="size-4 shrink-0" aria-hidden />
          {label}
        </p>
        {info && <IcpInfoTooltip title={label} description={info} />}
      </div>
      <p className="mt-2 text-3xl font-bold leading-[38px] tracking-[-0.02em] tabular-nums text-foreground">{value}</p>
      <p className="mt-1 flex-1 text-xs leading-snug text-muted-foreground">{hint}</p>
      <p className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
        Fonte: <span className="font-medium text-neutral-700">{SOURCE_SYSTEM[source.system].label}</span> · {source.detail}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ Controles locais */

/** Abas curtas no padrão `segmented` do CRM (§20.1). */
export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-full overflow-x-auto", className)}>
      <div role="tablist" aria-label={label} className={crmSurfaceSegmentedRootClass}>
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={value === option.key}
            onClick={() => onChange(option.key)}
            className={cn(crmSurfaceSegmentedTabClass(value === option.key), "shrink-0 whitespace-nowrap", focusRing)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Recorte "Escritório todo / ICP / Faixa A…D" dos painéis do Resumo. */
export function TierScopeTabs({ value, onChange }: { value: TierScope; onChange: (scope: TierScope) => void }) {
  return <SegmentedTabs options={TIER_SCOPES} value={value} onChange={onChange} label="Grupos considerados" className="mb-4" />;
}

/** Filtro liga/desliga (faixa, porte) com contador. */
export function FilterChip({
  active,
  count,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  count?: number;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-(--radius-v2-md) border px-2.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        focusRing,
        active
          ? "border-interactive-300 bg-interactive-50 text-interactive-700"
          : "border-border bg-white text-muted-foreground hover:border-border-strong hover:text-foreground",
      )}
    >
      {children}
      {count != null && <span className="tabular-nums text-muted-foreground">{count}</span>}
    </button>
  );
}

/* ------------------------------------------------------------- Grupo cliente */

/** Logo da empresa do grupo (LinkedIn ou site); sem logo, as iniciais do grupo. */
export function CompanyLogo({ group, size = "md" }: { group: IcpGroupRow; size?: "xs" | "sm" | "md" }) {
  const [failed, setFailed] = useState(false);
  const name = groupName(group.grupo);
  const box = { xs: "size-6 text-[9px]", sm: "size-7 text-[10px]", md: "size-9 text-xs" }[size];
  const logo = group.profile?.logoUrl;
  if (logo && !failed) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-(--radius-v2-sm) border border-border bg-white",
          box,
        )}
      >
        {/* Logos vêm de URLs públicas do storage do Supabase, sem otimização do next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" loading="lazy" className="size-full object-contain" onError={() => setFailed(true)} />
      </span>
    );
  }
  const initials = name
    .split(/[\s&.-]+/)
    .filter((w) => /^[\p{L}\d]/u.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-(--radius-v2-sm) bg-neutral-100 font-semibold text-neutral-600",
        box,
      )}
    >
      {initials}
    </span>
  );
}

const employeeLinkClass = cn(
  "whitespace-nowrap rounded-(--radius-v2-sm) text-muted-foreground underline-offset-2 hover:text-foreground hover:underline",
  focusRing,
);

/**
 * Faixa de colaboradores do grupo e o link para a página do LinkedIn. Na variante "inline"
 * (abaixo do nome do grupo) não mostra nada quando falta a faixa.
 */
export function EmployeeRange({ group: g, variant = "cell" }: { group: IcpGroupRow; variant?: "cell" | "inline" }) {
  const profile = g.profile;
  if (!profile?.employeeRange) {
    if (variant === "inline") return null;
    // A página existe mas não declara a faixa: mostra só quantas pessoas se vinculam a ela.
    if (profile?.linkedinMembers) {
      return (
        <a
          href={profile.linkedinUrl ?? undefined}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="A página no LinkedIn não declara a faixa de colaboradores; este é o número de pessoas vinculadas a ela, um piso do total"
          className={employeeLinkClass}
        >
          {profile.linkedinMembers.toLocaleString("pt-BR")} no LinkedIn
        </a>
      );
    }
    return (
      <span
        className="text-muted-foreground"
        title={
          profile?.linkedinUrl
            ? "A página no LinkedIn não declara a faixa de colaboradores"
            : profile
              ? "Sem página da empresa no LinkedIn"
              : undefined
        }
      >
        {g.clientType === "pessoa_fisica" && !g.referenceCompany ? "Pessoa física" : "—"}
      </span>
    );
  }
  const details = [
    profile.linkedinName,
    profile.linkedinMembers != null ? `${profile.linkedinMembers.toLocaleString("pt-BR")} pessoas vinculadas no LinkedIn` : null,
    profile.confidence && profile.confidence !== "alta" ? `correspondência ${profile.confidence === "media" ? "média" : "baixa"}` : null,
  ].filter(Boolean);
  return (
    <a
      href={profile.linkedinUrl ?? undefined}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={details.join(" · ")}
      className={cn("inline-flex items-center gap-1.5", employeeLinkClass)}
    >
      <Users className="size-3.5 shrink-0 text-neutral-500" aria-hidden />
      <span className="tabular-nums">
        {employeeRangeText(profile.employeeRange)}
        {variant === "inline" && " colaboradores"}
      </span>
      {profile.confidence && profile.confidence !== "alta" && <span className="text-neutral-400">?</span>}
    </a>
  );
}
