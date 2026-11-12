"use client";

import { useEffect, useRef } from "react";

import type { LeadLifecycleTimeline } from "@/lib/crm/lead-lifecycle-timeline";
import { buildLeadStageDurationItems } from "@/lib/crm/lead-stage-duration-strip";
import { cn } from "@/lib/utils";
import type { OpportunityStage } from "@/modules/crm/domain/entities";

type LeadStageDurationStripProps = {
  currentStage: OpportunityStage;
  timeline: LeadLifecycleTimeline;
};

/**
 * Faixa só de leitura com o tempo em cada etapa do funil (12/11/2026). Mudar de etapa saiu daqui:
 * virou o botão principal do cabeçalho da ficha ("Avançar para …"). A faixa informa onde o lead
 * está e quanto tempo passou em cada etapa, com um fio no topo de cada etapa (atual em azul,
 * visitadas em azul claro, futuras em cinza) em vez de blocos coloridos.
 */
export function LeadStageDurationStrip({ currentStage, timeline }: LeadStageDurationStripProps) {
  const items = buildLeadStageDurationItems(currentStage, timeline);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Em telas estreitas a faixa rola na horizontal: começa mostrando a etapa atual, não a primeira.
  // Espera o layout existir (ResizeObserver) e centraliza uma vez; depois a rolagem é do usuário.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const center = () => {
      const current = scroller.querySelector<HTMLElement>('[aria-current="step"]');
      if (!current || scroller.scrollWidth <= scroller.clientWidth) return false;
      scroller.scrollLeft = Math.max(0, current.offsetLeft - (scroller.clientWidth - current.offsetWidth) / 2);
      return true;
    };
    if (center() || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (center()) observer.disconnect();
    });
    // A largura que importa é a da lista (cresce quando o CSS aplica `flex`/`min-w-max`).
    observer.observe(scroller);
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);
    return () => observer.disconnect();
  }, [currentStage]);

  return (
    <section aria-labelledby="lead-stage-duration-title">
      <h2 id="lead-stage-duration-title" className="sr-only">
        Tempo em cada etapa do funil
      </h2>
      <div ref={scrollerRef} className="crm-scrollbar relative overflow-x-auto pb-2">
        <ol className="flex min-w-max gap-1 xl:min-w-full">
          {items.map((item) => (
            <li
              key={item.stage}
              aria-current={item.isCurrent ? "step" : undefined}
              className={cn(
                "w-[132px] shrink-0 border-t-2 pt-2 pr-2 xl:w-auto xl:min-w-0 xl:flex-1",
                item.isCurrent
                  ? "border-interactive-600"
                  : item.isVisited
                    ? "border-interactive-300"
                    : "border-neutral-200",
              )}
            >
              <span
                className={cn(
                  "block text-xs leading-4 break-words",
                  item.isCurrent
                    ? "font-semibold text-foreground"
                    : item.isVisited
                      ? "font-medium text-text-secondary-v2"
                      : "text-muted-foreground",
                )}
              >
                {item.title}
              </span>
              <span
                className={cn(
                  "mt-0.5 block truncate text-xs leading-4 tabular-nums",
                  item.isCurrent ? "font-medium text-interactive-700" : "text-muted-foreground",
                )}
              >
                {item.isCurrent ? `${item.durationLabel} · atual` : item.durationLabel}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
