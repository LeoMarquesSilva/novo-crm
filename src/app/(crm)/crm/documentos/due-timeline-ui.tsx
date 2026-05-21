"use client";

import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  Flag,
} from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { AreaIconLabel } from "@/lib/crm/area-lucide-icon";
import { normalizePracticeAreaKey } from "@/lib/crm/area-keys-alignment";
import type {
  DueDiligenceTimeline,
  DueAreaTempo,
  DueFaseResumo,
} from "@/lib/crm/due-diligence-timeline";
import { formatarDuracaoBr } from "@/lib/crm/due-diligence-timeline";
import { formatDateTimeBr } from "@/lib/format-datetime";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type PhaseState = "done" | "active" | "pending";

function getPhaseState(fase: DueFaseResumo): PhaseState {
  if (fase.fimIso) return "done";
  if (fase.inicioIso) return "active";
  return "pending";
}

function areaStatus(
  situacao: string,
): "done" | "adjustments" | "pending" | "active" {
  if (/Entregue|Respondida \(OK\)/i.test(situacao)) return "done";
  if (/ajustes/i.test(situacao)) return "adjustments";
  if (/Pendente|confirmação|Aguardando|Em aberto/i.test(situacao))
    return "pending";
  return "active";
}

// ─── Area row ────────────────────────────────────────────────────────────────

function AreaRow({ area }: { area: DueAreaTempo }) {
  const label = normalizePracticeAreaKey(area.area);
  const status = areaStatus(area.situacao);

  const cfg = {
    done: {
      icon: <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-accent-green" />,
      badge: "border-accent-green/30 bg-accent-green/10 text-emerald-800",
    },
    adjustments: {
      icon: <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />,
      badge: "border-amber-300/40 bg-amber-100/60 text-amber-900",
    },
    pending: {
      icon: <Circle className="h-3.5 w-3.5 shrink-0 text-primary-dark/25" />,
      badge: "border-border bg-muted text-muted-foreground",
    },
    active: {
      icon: <Clock className="h-3.5 w-3.5 shrink-0 text-accent-teal" />,
      badge: "border-accent-teal/30 bg-accent-teal/[0.07] text-primary-dark",
    },
  }[status];

  return (
    <li className="flex items-start gap-2.5 py-2">
      <div className="mt-0.5 shrink-0">{cfg.icon}</div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <AreaIconLabel
            area={label}
            className="text-[13px] font-semibold tracking-[-0.01em] text-primary-dark"
            iconClassName="h-3.5 w-3.5 text-primary-dark/50"
          />
          {area.cicloRevisao != null && (
            <span className="rounded border border-border bg-muted px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              Ciclo {area.cicloRevisao}
            </span>
          )}
          <span
            className={cn(
              "rounded-full border px-2 py-px text-[10px] font-semibold",
              cfg.badge,
            )}
          >
            {area.situacao}
          </span>
        </div>
        {(area.inicioIso || area.fimIso || area.duracaoMs != null) && (
          <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <CalendarClock
              className="h-3 w-3 shrink-0 text-primary-dark/30"
              aria-hidden
            />
            <span className="font-medium">
              {area.inicioIso ? formatDateTimeBr(area.inicioIso) : "—"}
            </span>
            {area.fimIso && (
              <>
                <ArrowRight
                  className="h-2.5 w-2.5 text-primary-dark/20"
                  aria-hidden
                />
                <span className="font-medium">
                  {formatDateTimeBr(area.fimIso)}
                </span>
              </>
            )}
            {area.duracaoMs != null && (
              <span className="font-bold text-accent-teal">
                · {formatarDuracaoBr(area.duracaoMs)}
              </span>
            )}
          </p>
        )}
      </div>
    </li>
  );
}

// ─── Phase step ───────────────────────────────────────────────────────────────

interface StepFase extends DueFaseResumo {
  isFinalStep?: boolean;
}

function PhaseStep({
  fase,
  stepNumber,
  isLast,
  areas,
  defaultAreasOpen,
}: {
  fase: StepFase;
  stepNumber: number;
  isLast: boolean;
  areas?: DueAreaTempo[];
  defaultAreasOpen?: boolean;
}) {
  const state: PhaseState = fase.isFinalStep
    ? fase.inicioIso
      ? "done"
      : "pending"
    : getPhaseState(fase);

  const [areasOpen, setAreasOpen] = useState(defaultAreasOpen ?? false);

  // ── Style tokens per state ──
  const dotStyle = {
    done: "border-accent-green/60 bg-accent-green text-white shadow-sm",
    active:
      "border-accent-teal/70 bg-accent-teal text-white shadow-md shadow-accent-teal/25 ring-4 ring-accent-teal/10",
    pending: "border-border bg-muted text-muted-foreground",
  }[state];

  const lineStyle = {
    done: "bg-accent-green/30",
    active: "bg-accent-teal/20",
    pending: "bg-border",
  }[state];

  const cardStyle = {
    done: "border-accent-green/20 bg-accent-green/[0.04]",
    active: "border-accent-teal/25 bg-accent-teal/[0.05]",
    pending: "border-border bg-muted/40",
  }[state];

  const titleStyle = {
    done: "text-primary-dark",
    active: "text-accent-teal",
    pending: "text-muted-foreground",
  }[state];

  const durationStyle = {
    done: "bg-accent-green/10 text-emerald-800 ring-accent-green/25",
    active: "bg-accent-teal/[0.07] text-accent-teal ring-accent-teal/25",
    pending: "bg-muted text-muted-foreground ring-border",
  }[state];

  return (
    <li className="relative flex gap-4">
      {/* Connector */}
      {!isLast && (
        <div
          className={cn(
            "absolute left-[17px] top-9 w-px rounded-full",
            lineStyle,
          )}
          style={{ bottom: "-1.25rem" }}
          aria-hidden
        />
      )}

      {/* Step circle */}
      <div className="relative z-10 shrink-0 pt-0.5">
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full border-2 text-[13px] font-bold transition-all",
            dotStyle,
          )}
        >
          {state === "done" ? (
            <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
          ) : fase.isFinalStep ? (
            <Flag className="h-4 w-4" aria-hidden />
          ) : (
            <span aria-hidden>{stepNumber}</span>
          )}
        </div>
      </div>

      {/* Card body */}
      <div
        className={cn(
          "mb-5 min-w-0 flex-1 overflow-hidden rounded-2xl border p-4 transition-all",
          cardStyle,
        )}
      >
        {/* Header row */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-0.5">
            <p
              className={cn(
                "text-[15px] font-extrabold tracking-[-0.02em] leading-tight",
                titleStyle,
              )}
            >
              {fase.titulo}
            </p>
            {state === "pending" && (
              <p className="text-xs text-muted-foreground">Aguardando início</p>
            )}
            {state === "active" && !fase.isFinalStep && (
              <p className="text-xs font-medium text-accent-teal/80">
                Em andamento
              </p>
            )}
          </div>
          {fase.duracaoMs != null && (
            <span
              className={cn(
                "rounded-xl px-2.5 py-1 text-sm font-extrabold tabular-nums ring-1",
                durationStyle,
              )}
            >
              {formatarDuracaoBr(fase.duracaoMs)}
            </span>
          )}
        </div>

        {/* Date range */}
        {(fase.inicioIso || state === "active") && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarClock
              className="h-3.5 w-3.5 text-primary-dark/30"
              aria-hidden
            />
            <span className="font-medium text-primary-dark/70">
              {fase.inicioIso ? formatDateTimeBr(fase.inicioIso) : "—"}
            </span>
            {(fase.fimIso || state === "active") && (
              <>
                <ArrowRight
                  className="h-3 w-3 text-primary-dark/20"
                  aria-hidden
                />
                <span
                  className={cn(
                    "font-medium",
                    fase.fimIso
                      ? "text-primary-dark/70"
                      : "italic text-accent-teal",
                  )}
                >
                  {fase.fimIso
                    ? formatDateTimeBr(fase.fimIso)
                    : "em andamento"}
                </span>
              </>
            )}
          </div>
        )}

        {/* Areas */}
        {areas && areas.length > 0 && (
          <div className="mt-3 border-t border-primary-dark/[0.06] pt-2.5">
            <button
              type="button"
              onClick={() => setAreasOpen((v) => !v)}
              className="group flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-primary-dark"
              aria-expanded={areasOpen}
            >
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  areasOpen && "rotate-180",
                )}
                aria-hidden
              />
              {areas.length} área{areas.length !== 1 ? "s" : ""}
            </button>
            <AnimatePresence>
              {areasOpen && (
                <motion.ul
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18, ease: "easeInOut" }}
                  className="mt-1.5 divide-y divide-primary-dark/[0.05] overflow-hidden"
                >
                  {areas.map((a, i) => (
                    <AreaRow
                      key={`${a.area}-${a.cicloRevisao ?? 0}-${i}`}
                      area={a}
                    />
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </li>
  );
}

// ─── Public export ────────────────────────────────────────────────────────────

function timelineResumo(timeline: DueDiligenceTimeline): string {
  const fasesConcluidas = timeline.fases.filter((f) => f.fimIso).length;
  const levPend = timeline.areasLevantamento.filter((a) =>
    /Pendente|Aguardando|Em aberto/i.test(a.situacao),
  ).length;
  const revAjustes = timeline.areasRevisao.filter((a) => /ajustes/i.test(a.situacao)).length;
  const partes: string[] = [];
  if (fasesConcluidas > 0) {
    partes.push(
      `${fasesConcluidas} fase${fasesConcluidas !== 1 ? "s" : ""} encerrada${fasesConcluidas !== 1 ? "s" : ""}`,
    );
  }
  if (levPend > 0) {
    partes.push(`${levPend} área${levPend !== 1 ? "s" : ""} aguardando levantamento`);
  }
  if (revAjustes > 0) {
    partes.push(`${revAjustes} área${revAjustes !== 1 ? "s" : ""} com ajustes na revisão`);
  }
  return partes.length > 0 ? partes.join(" · ") : "Histórico por fase e por área de prática";
}

export function DueTimelineSection({
  timeline,
}: {
  timeline: DueDiligenceTimeline;
}) {
  const finalizadaIso = timeline.fases[2]?.fimIso ?? null;

  const empty = timeline.fases.every((f) => !f.inicioIso);
  if (empty) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center">
        <p className="text-sm font-medium text-muted-foreground">
          Cronologia ainda não disponível
        </p>
        <p className="mt-1 text-xs text-muted-foreground/80">
          As datas aparecem quando a negociação avança no funil de due diligence.
        </p>
      </div>
    );
  }

  const steps: Array<{
    fase: StepFase;
    areas?: DueAreaTempo[];
    defaultAreasOpen?: boolean;
  }> = [
    {
      fase: timeline.fases[0] ?? {
        key: "levantamento",
        titulo: "Levantamento de dados",
        inicioIso: null,
        fimIso: null,
        duracaoMs: null,
      },
      areas: timeline.areasLevantamento,
      defaultAreasOpen:
        getPhaseState(
          timeline.fases[0] ?? {
            key: "",
            titulo: "",
            inicioIso: null,
            fimIso: null,
            duracaoMs: null,
          },
        ) === "active",
    },
    {
      fase: timeline.fases[1] ?? {
        key: "compilacao",
        titulo: "Compilação",
        inicioIso: null,
        fimIso: null,
        duracaoMs: null,
      },
    },
    {
      fase: timeline.fases[2] ?? {
        key: "revisao",
        titulo: "Revisão",
        inicioIso: null,
        fimIso: null,
        duracaoMs: null,
      },
      areas: timeline.areasRevisao,
      defaultAreasOpen:
        getPhaseState(
          timeline.fases[2] ?? {
            key: "",
            titulo: "",
            inicioIso: null,
            fimIso: null,
            duracaoMs: null,
          },
        ) === "active",
    },
    {
      fase: {
        key: "finalizada",
        titulo: "Due Diligence Finalizada",
        inicioIso: finalizadaIso,
        fimIso: finalizadaIso,
        duracaoMs: null,
        isFinalStep: true,
      },
    },
  ];

  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        {timelineResumo(timeline)}
      </p>
      <ol className="space-y-0" aria-label="Cronologia da due diligence">
      {steps.map((step, i) => (
        <PhaseStep
          key={step.fase.key}
          fase={step.fase}
          stepNumber={i + 1}
          isLast={i === steps.length - 1}
          areas={step.areas}
          defaultAreasOpen={step.defaultAreasOpen}
        />
      ))}
    </ol>
    </div>
  );
}
