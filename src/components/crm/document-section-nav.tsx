"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Navegação por seções dos editores de documento (proposta e contrato), 12/11/2026.
 * Os dois editores mostram todas as seções numa rolagem só; esta barra fica fixa no topo do
 * painel de edição, marca a seção visível e leva até a seção clicada. O estado de cada seção é
 * um ponto de 6px + o nome (antes: abas em cartão na proposta e pílulas coloridas no contrato).
 */

/** "danger" = a seção tem marcação que trava a geração do documento. */
export type DocumentSectionState = "complete" | "pending" | "danger" | "neutral";

export type DocumentSectionNavItem = {
  id: string;
  label: string;
  state: DocumentSectionState;
};

export const DOCUMENT_SECTION_STATE_LABEL: Record<DocumentSectionState, string> = {
  complete: "completa",
  pending: "pendente",
  danger: "há campo a preencher",
  neutral: "opcional",
};

const STATE_TEXT: Record<DocumentSectionState, string> = {
  complete: "Completa",
  pending: "Pendente",
  danger: "Campo a preencher",
  neutral: "Opcional",
};

const DOT_CLASS: Record<DocumentSectionState, string> = {
  complete: "bg-success-text",
  pending: "bg-warning-text",
  danger: "bg-danger-text",
  neutral: "bg-neutral-300",
};

/** Folga entre a barra fixa e o topo da seção. */
const SECTION_SCROLL_GAP = 12;

function sectionNavHeight(pane: HTMLElement): number {
  return pane.querySelector<HTMLElement>("[data-section-nav]")?.offsetHeight ?? 0;
}

/**
 * Rola só o painel de edição até a seção. `scrollIntoView` também rolava os ancestrais
 * `overflow-hidden` (diálogo, split) e a tela ficava pela metade quando a seção estava perto do
 * fim do painel.
 */
export function scrollPaneToDocumentSection(pane: HTMLElement, sectionId: string) {
  const target = document.getElementById(sectionId);
  if (!target || !pane.contains(target)) return;
  const paneRect = pane.getBoundingClientRect();
  // Na animação de abertura (zoom) o rect vem escalado; offsetHeight não.
  const scale = pane.offsetHeight > 0 ? paneRect.height / pane.offsetHeight : 1;
  const offset = (target.getBoundingClientRect().top - paneRect.top) / (scale || 1) - pane.clientTop;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  pane.scrollTo({
    top: Math.max(0, pane.scrollTop + offset - sectionNavHeight(pane) - SECTION_SCROLL_GAP),
    behavior: reduceMotion ? "auto" : "smooth",
  });
}

/**
 * Seção atual do painel: a última cujo topo já passou da barra fixa. No fim da rolagem vale a
 * última seção, mesmo curta.
 */
export function useActiveDocumentSection(pane: HTMLElement | null, ids: readonly string[]): string | null {
  const key = ids.join("|");
  const [active, setActive] = useState<string | null>(ids[0] ?? null);

  useEffect(() => {
    if (!pane) return;
    const list = key ? key.split("|") : [];
    let frame = 0;

    const update = () => {
      frame = 0;
      const present = list.filter((id) => {
        const el = document.getElementById(id);
        return el != null && pane.contains(el);
      });
      if (present.length === 0) return;
      const paneRect = pane.getBoundingClientRect();
      const threshold = paneRect.top + sectionNavHeight(pane) + SECTION_SCROLL_GAP + 8;
      let current = present[0]!;
      for (const id of present) {
        if (document.getElementById(id)!.getBoundingClientRect().top <= threshold) current = id;
      }
      if (pane.scrollTop > 0 && pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 2) {
        current = present[present.length - 1]!;
      }
      setActive(current);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    pane.addEventListener("scroll", schedule, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(pane);
    return () => {
      pane.removeEventListener("scroll", schedule);
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [pane, key]);

  return active;
}

export function DocumentSectionNav({
  items,
  activeId,
  onNavigate,
  label = "Seções do documento",
}: {
  items: DocumentSectionNavItem[];
  activeId: string | null;
  onNavigate: (id: string) => void;
  label?: string;
}) {
  const listRef = useRef<HTMLOListElement>(null);

  // Painel estreito: a barra rola na horizontal e a seção atual nunca fica escondida nela.
  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!list || !current || list.scrollWidth <= list.clientWidth) return;
    const left = current.offsetLeft;
    const right = left + current.offsetWidth;
    if (left < list.scrollLeft) list.scrollLeft = Math.max(0, left - 8);
    else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth + 8;
  }, [activeId]);

  return (
    <nav
      data-section-nav
      aria-label={label}
      className="sticky top-0 z-(--z-sticky) border-b border-border bg-white px-3 sm:px-4"
    >
      <ol ref={listRef} className="crm-scrollbar relative flex overflow-x-auto">
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <li key={item.id} className="shrink-0">
              <button
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={isActive ? "location" : undefined}
                aria-label={`${item.label}: ${DOCUMENT_SECTION_STATE_LABEL[item.state]}`}
                title={`${item.label}: ${DOCUMENT_SECTION_STATE_LABEL[item.state]}`}
                className={cn(
                  "relative flex h-11 items-center gap-1.5 px-2 text-[13px] whitespace-nowrap transition-colors focus-visible:outline-offset-[-2px]",
                  "after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full",
                  isActive
                    ? "font-semibold text-foreground after:bg-interactive-600"
                    : "font-medium text-text-secondary-v2 after:bg-transparent hover:text-foreground",
                )}
              >
                <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT_CLASS[item.state])} />
                {item.label}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Título de seção dos editores: nome, estado (ponto + texto) e, se houver, selos da seção. */
export function DocumentSectionHeader({
  title,
  state,
  stateLabel,
  description,
  children,
}: {
  title: string;
  state: DocumentSectionState;
  /** Texto do estado quando o padrão não basta (ex.: "2 pendências", "3 adicionadas"). */
  stateLabel?: string;
  description?: ReactNode;
  /** Selos extras ao lado do estado. */
  children?: ReactNode;
}) {
  return (
    <header className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-v2-heading-md text-foreground">{title}</h3>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary-v2">
          <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT_CLASS[state])} />
          {stateLabel ?? STATE_TEXT[state]}
        </span>
        {children}
      </div>
      {description ? <p className="text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
    </header>
  );
}
