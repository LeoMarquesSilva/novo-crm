"use client";

import Link from "next/link";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  Download,
  ExternalLink,
  FileText,
  HelpCircle,
  Layers,
  ListFilter,
  Loader2,
  MinusCircle,
  Presentation,
  Search,
  SlidersHorizontal,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CrmUserLabel } from "@/components/crm/crm-user-label";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { DueDiligenceTimeline } from "@/lib/crm/due-diligence-timeline";
import type { DuePunctuality } from "@/lib/crm/due-diligence-deadline";
import { formatDateTimeBr } from "@/lib/format-datetime";
import { DueTimelineSection } from "./due-timeline-ui";

// ─── Types ───────────────────────────────────────────────────────────────────

export type DueDiligenceDocumentRow = {
  id: string;
  documentKind: string;
  originalFilename: string;
  contentType: string | null;
  byteSize: number | null;
  uploadedAt: string;
};

export type DueDiligenceLeadRow = {
  oportunidadeId: string;
  etapa: string;
  leadName: string;
  solicitanteNome: string;
  solicitanteAvatarUrl: string | null;
  createdByLabel: string;
  createdByAvatarUrl: string | null;
  duePedidoEmIso: string | null;
  dueFinalizadaEmIso: string | null;
  prazoEntregaLabel: string;
  prazoEntregaSortKey: number;
  punctuality: DuePunctuality;
  faseAtualLabel: string;
  timeline: DueDiligenceTimeline;
  documents: DueDiligenceDocumentRow[];
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function formatBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function kindLabel(kind: string): string {
  if (kind === "ppt_compilacao") return "Compilação (PPT)";
  if (kind === "outro") return "Outro";
  return kind;
}

function inferFileKind(contentType: string | null, filename: string): "pdf" | "ppt" | "other" {
  const ct = (contentType ?? "").toLowerCase();
  const fn = filename.toLowerCase();
  if (ct.includes("pdf") || fn.endsWith(".pdf")) return "pdf";
  if (
    ct.includes("presentation") ||
    ct.includes("powerpoint") ||
    fn.endsWith(".ppt") ||
    fn.endsWith(".pptx")
  )
    return "ppt";
  return "other";
}

// ─── Phase logic ─────────────────────────────────────────────────────────────

type DuePhaseKey = "levantamento" | "compilacao" | "revisao" | "finalizada";

const PHASE_STEPS: { key: DuePhaseKey; short: string; full: string }[] = [
  { key: "levantamento", short: "Lev.", full: "Levantamento" },
  { key: "compilacao", short: "Comp.", full: "Compilação" },
  { key: "revisao", short: "Rev.", full: "Revisão" },
  { key: "finalizada", short: "Fin.", full: "Finalizada" },
];

const PHASE_ORDER: Record<DuePhaseKey, number> = {
  levantamento: 0,
  compilacao: 1,
  revisao: 2,
  finalizada: 3,
};

const PHASE_META: Record<
  DuePhaseKey,
  { label: string; badge: string; dot: string; ring: string }
> = {
  levantamento: {
    label: "Levantamento de dados",
    badge: "border-sky-300/50 bg-sky-50 text-sky-900",
    dot: "bg-sky-500",
    ring: "ring-sky-200",
  },
  compilacao: {
    label: "Compilação",
    badge: "border-violet-300/50 bg-violet-50 text-violet-900",
    dot: "bg-violet-500",
    ring: "ring-violet-200",
  },
  revisao: {
    label: "Revisão por áreas",
    badge: "border-amber-300/50 bg-amber-50 text-amber-950",
    dot: "bg-amber-500",
    ring: "ring-amber-200",
  },
  finalizada: {
    label: "Due diligence finalizada",
    badge: "border-accent-green/35 bg-accent-green/10 text-emerald-900",
    dot: "bg-accent-green",
    ring: "ring-accent-green/30",
  },
};

function getDuePhase(row: DueDiligenceLeadRow): DuePhaseKey {
  if (row.dueFinalizadaEmIso) return "finalizada";
  const tl = row.timeline;
  if (tl.fases[2]?.inicioIso) return "revisao";
  if (tl.fases[1]?.inicioIso) return "compilacao";
  return "levantamento";
}

function countAreasByStatus(
  areas: DueDiligenceTimeline["areasLevantamento"],
  match: "done" | "pending" | "adjustments",
): number {
  return areas.filter((a) => {
    if (/Entregue|Respondida \(OK\)/i.test(a.situacao)) return match === "done";
    if (/ajustes/i.test(a.situacao)) return match === "adjustments";
    if (/Pendente|confirmação|Aguardando|Em aberto/i.test(a.situacao))
      return match === "pending";
    return match === "pending";
  }).length;
}

function timelineProgressHint(lead: DueDiligenceLeadRow, phase: DuePhaseKey): string {
  const { timeline } = lead;
  if (phase === "levantamento") {
    const n = timeline.areasLevantamento.length;
    if (n === 0) return "Aguardando tarefas por área";
    const done = countAreasByStatus(timeline.areasLevantamento, "done");
    return `${done} de ${n} área${n !== 1 ? "s" : ""} com dados disponibilizados`;
  }
  if (phase === "compilacao") {
    const hasPpt = lead.documents.some((d) => d.documentKind === "ppt_compilacao");
    return hasPpt
      ? "PPT de compilação anexado"
      : "Compilação em curso — sem PPT registrado";
  }
  if (phase === "revisao") {
    const n = timeline.areasRevisao.length;
    if (n === 0) return "Revisão iniciada — áreas em abertura";
    const done = countAreasByStatus(timeline.areasRevisao, "done");
    const adj = countAreasByStatus(timeline.areasRevisao, "adjustments");
    if (adj > 0) return `${adj} área${adj !== 1 ? "s" : ""} pedindo ajustes`;
    return `${done} de ${n} área${n !== 1 ? "s" : ""} aprovada${n !== 1 ? "s" : ""}`;
  }
  return lead.dueFinalizadaEmIso
    ? `Concluída em ${formatDateTimeBr(lead.dueFinalizadaEmIso)}`
    : "Marcada como finalizada";
}

// ─── Animation variants ──────────────────────────────────────────────────────

const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] as const },
  },
};

// ─── Phase progress track ─────────────────────────────────────────────────────

type PhaseTrackState = "done" | "current" | "pending";

function phaseTrackState(stepKey: DuePhaseKey, currentPhase: DuePhaseKey): PhaseTrackState {
  const idx = PHASE_ORDER[stepKey];
  const current = PHASE_ORDER[currentPhase];
  if (idx < current) return "done";
  if (idx === current) return "current";
  return "pending";
}

function DuePhaseProgressTrack({
  currentPhase,
  timeline,
  finalizadaIso,
}: {
  currentPhase: DuePhaseKey;
  timeline: DueDiligenceTimeline;
  finalizadaIso: string | null;
}) {
  const currentIndex = PHASE_ORDER[currentPhase];
  const faseByKey: Partial<Record<DuePhaseKey, (typeof timeline.fases)[number]>> = {
    levantamento: timeline.fases[0],
    compilacao: timeline.fases[1],
    revisao: timeline.fases[2],
  };

  return (
    <div className="w-full" role="group" aria-label="Progresso da due diligence">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-xs font-bold text-primary-dark">
          Fase {currentIndex + 1} de {PHASE_STEPS.length}
          <span className="font-semibold text-muted-foreground">
            {" "}
            · {PHASE_META[currentPhase].label}
          </span>
        </p>
        <span className="shrink-0 text-[10px] font-semibold tabular-nums text-muted-foreground">
          {Math.round(((currentIndex + (currentPhase === "finalizada" ? 1 : 0.5)) / PHASE_STEPS.length) * 100)}
          %
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
        {PHASE_STEPS.map((step) => {
          const state = phaseTrackState(step.key, currentPhase);
          const meta = PHASE_META[step.key];
          const fase = faseByKey[step.key];
          const hintIso =
            step.key === "finalizada" ? finalizadaIso : fase?.inicioIso ?? null;

          return (
            <div key={step.key} className="min-w-0">
              <div className="mb-1 flex items-center gap-1">
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[10px] font-bold leading-tight sm:text-[11px]",
                    state === "done" && "text-accent-green",
                    state === "current" && "text-primary-dark",
                    state === "pending" && "text-muted-foreground",
                  )}
                  title={step.full}
                >
                  <span className="sm:hidden">{step.short}</span>
                  <span className="hidden sm:inline">{step.full}</span>
                </span>
                {state === "done" ? (
                  <Check className="h-3 w-3 shrink-0 text-accent-green" strokeWidth={3} aria-hidden />
                ) : state === "current" ? (
                  <span
                    className={cn("h-2 w-2 shrink-0 animate-pulse rounded-full", meta.dot)}
                    aria-hidden
                  />
                ) : null}
              </div>
              <div
                className={cn(
                  "h-2.5 rounded-full transition-all",
                  state === "done" && "bg-accent-green shadow-sm",
                  state === "current" &&
                    cn("bg-primary-dark shadow-md ring-2 ring-offset-1", meta.ring),
                  state === "pending" && "bg-border/70",
                )}
                role="presentation"
              />
              {hintIso ? (
                <p className="mt-1 hidden truncate text-[9px] text-muted-foreground sm:block">
                  {state === "done" && fase?.fimIso
                    ? `até ${formatDateTimeBr(fase.fimIso)}`
                    : `desde ${formatDateTimeBr(hintIso)}`}
                </p>
              ) : state === "pending" ? (
                <p className="mt-1 hidden text-[9px] text-muted-foreground/70 sm:block">Aguardando</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Punctuality badge ────────────────────────────────────────────────────────

function PunctualityBadge({ p }: { p: DuePunctuality }) {
  const styleMap: Record<string, string> = {
    no_prazo: "border-accent-green/30 bg-accent-green/10 text-emerald-800",
    fora_do_prazo: "border-destructive/30 bg-destructive/10 text-destructive",
    em_atraso: "border-destructive/30 bg-destructive/10 text-destructive",
    em_andamento: "border-accent-teal/30 bg-accent-teal/[0.07] text-accent-teal",
    sem_prazo: "border-border bg-muted text-muted-foreground",
  };
  const iconMap: Record<string, React.ReactNode> = {
    no_prazo: <CheckCircle2 className="h-3 w-3" aria-hidden />,
    fora_do_prazo: <Clock className="h-3 w-3" aria-hidden />,
    em_atraso: <Clock className="h-3 w-3" aria-hidden />,
    em_andamento: <Circle className="h-3 w-3 fill-current opacity-40" aria-hidden />,
    sem_prazo: <Circle className="h-3 w-3" aria-hidden />,
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        styleMap[p.kind],
      )}
    >
      {iconMap[p.kind]}
      {p.label}
      {"detail" in p && p.detail ? (
        <span className="font-normal opacity-75">· {p.detail}</span>
      ) : null}
    </span>
  );
}

// ─── Document row ─────────────────────────────────────────────────────────────

function DueDocumentRow({
  oportunidadeId,
  doc,
}: {
  oportunidadeId: string;
  doc: DueDiligenceDocumentRow;
}) {
  const kind = inferFileKind(doc.contentType, doc.originalFilename);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSignedUrl = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/crm/leads/${encodeURIComponent(oportunidadeId)}/due-documents?documentId=${encodeURIComponent(doc.id)}`,
        { method: "GET", credentials: "same-origin" },
      );
      const body = (await res.json()) as { ok?: boolean; signedUrl?: string; error?: string };
      if (!res.ok || !body.ok || !body.signedUrl) {
        throw new Error(body.error ?? "Não foi possível obter o arquivo.");
      }
      setSignedUrl(body.signedUrl);
      return body.signedUrl as string;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [doc.id, oportunidadeId]);

  const handleDownload = async () => {
    const url = signedUrl ?? (await fetchSignedUrl());
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.download = doc.originalFilename;
    a.click();
  };

  const iconStyle =
    kind === "pdf"
      ? "border-rose-200 bg-rose-50 text-rose-600"
      : kind === "ppt"
        ? "border-orange-200 bg-orange-50 text-orange-600"
        : "border-border bg-muted text-muted-foreground";

  return (
    <li className="group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:border-border hover:bg-muted/40">
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
          iconStyle,
        )}
      >
        {kind === "ppt" ? (
          <Presentation className="h-[18px] w-[18px]" aria-hidden />
        ) : (
          <FileText className="h-[18px] w-[18px]" aria-hidden />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-primary-dark">{doc.originalFilename}</p>
        <p className="text-[11px] text-muted-foreground">
          {kindLabel(doc.documentKind)} · {formatBytes(doc.byteSize)} ·{" "}
          {formatDateTimeBr(doc.uploadedAt)}
        </p>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 shrink-0 gap-1.5 px-2.5 text-xs font-semibold opacity-0 transition-opacity group-hover:opacity-100"
        onClick={handleDownload}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Download className="h-3.5 w-3.5" aria-hidden />
        )}
        Baixar
      </Button>
    </li>
  );
}

// ─── Info cell ────────────────────────────────────────────────────────────────

function InfoCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2.5">
      <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1.5">{children}</dd>
    </div>
  );
}

// ─── Guide & quick filters ───────────────────────────────────────────────────

function DueGuideBanner() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[18px] border border-accent-teal/20 bg-gradient-to-br from-accent-teal/[0.06] to-white p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 text-left"
        aria-expanded={open}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent-teal/25 bg-white text-accent-teal shadow-sm">
          <HelpCircle className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-sm font-bold text-primary-dark">Como ler este painel</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            Cada cartão é uma negociação com due diligence. O prazo compara a data/hora combinadas no
            cadastro com a finalização no funil.
          </span>
        </span>
        <ChevronDown
          className={cn(
            "mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <ul className="mt-4 grid gap-2 border-t border-accent-teal/15 pt-4 text-xs text-muted-foreground sm:grid-cols-2">
              <li>
                <strong className="text-primary-dark">Fases:</strong> levantamento → compilação →
                revisão → finalizada.
              </li>
              <li>
                <strong className="text-primary-dark">Em atraso:</strong> prazo combinado já passou e
                a DD ainda não foi finalizada.
              </li>
              <li>
                <strong className="text-primary-dark">Documentos:</strong> PPT de compilação e outros
                anexos enviados no funil.
              </li>
              <li>
                <strong className="text-primary-dark">Cronologia:</strong> tempos por fase e status de
                cada área de prática.
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function QuickFilterChip({
  label,
  value,
  active,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-[7.5rem] flex-1 flex-col rounded-xl border px-3 py-2.5 text-left transition-all sm:min-w-0 sm:flex-none",
        active
          ? "border-primary-dark bg-primary-dark text-white shadow-md shadow-primary-dark/15"
          : cn("bg-card hover:border-primary-dark/25 hover:shadow-sm", tone),
      )}
    >
      <span
        className={cn(
          "text-[10px] font-bold uppercase tracking-[0.14em]",
          active ? "text-white/75" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "mt-0.5 text-2xl font-extrabold tabular-nums tracking-[-0.04em]",
          active ? "text-white" : "text-primary-dark",
        )}
      >
        {value}
      </span>
    </button>
  );
}

// ─── Phase filter pill ────────────────────────────────────────────────────────

function PhasePill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
        active
          ? "border-primary-dark bg-primary-dark text-white"
          : "border-border bg-card text-muted-foreground hover:border-primary-dark/30 hover:bg-muted hover:text-primary-dark",
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
          active ? "bg-white/20 text-white" : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}

// ─── Lead card ────────────────────────────────────────────────────────────────

function LeadCard({ lead }: { lead: DueDiligenceLeadRow }) {
  const [open, setOpen] = useState(
    lead.punctuality.kind === "em_atraso" || lead.punctuality.kind === "fora_do_prazo",
  );
  const phase = getDuePhase(lead);
  const progressHint = timelineProgressHint(lead, phase);
  const isAtRisk =
    lead.punctuality.kind === "em_atraso" || lead.punctuality.kind === "fora_do_prazo";

  return (
    <article
      className={cn(
        "overflow-hidden rounded-[18px] bg-card shadow-[0_1px_2px_rgba(16,31,46,0.035),0_14px_34px_rgba(16,31,46,0.055)] transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:shadow-[0_2px_5px_rgba(16,31,46,0.045),0_18px_42px_rgba(16,31,46,0.075)]",
        isAtRisk
          ? "border border-destructive/30"
          : "border border-[rgba(16,31,46,0.09)] hover:border-[rgba(16,31,46,0.13)]",
      )}
    >
      {isAtRisk && (
        <div className="flex items-center gap-2 border-b border-destructive/15 bg-destructive/[0.06] px-4 py-2 text-xs font-semibold text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Atenção ao prazo — situação crítica
        </div>
      )}

      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <span className="inline-flex rounded-full border border-border/80 bg-muted/50 px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              Funil: {lead.faseAtualLabel}
            </span>
            <div>
              <h2 className="text-lg font-extrabold leading-tight tracking-[-0.02em] text-primary-dark sm:text-[19px]">
                {lead.leadName}
              </h2>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
                <CrmUserLabel
                  name={lead.solicitanteNome}
                  avatarUrl={lead.solicitanteAvatarUrl}
                  size="xs"
                  variant="inline"
                  prefix="Solicitante"
                />
                <CrmUserLabel
                  name={lead.createdByLabel}
                  avatarUrl={lead.createdByAvatarUrl}
                  size="xs"
                  variant="inline"
                  prefix="Aberto por"
                />
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <PunctualityBadge p={lead.punctuality} />
            <Link
              href={`/crm/leads/${encodeURIComponent(lead.oportunidadeId)}`}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-accent-teal transition-colors hover:bg-muted"
            >
              Abrir no funil
              <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
            </Link>
          </div>
        </div>

        <p className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          <Layers className="mr-1.5 inline h-3.5 w-3.5 -translate-y-px text-accent-teal" aria-hidden />
          {progressHint}
        </p>

        <div className="grid gap-3 lg:grid-cols-[1.4fr_auto]">
          <div className="rounded-xl border border-border/60 bg-gradient-to-br from-muted/50 to-background px-4 py-4">
            <DuePhaseProgressTrack
              currentPhase={phase}
              timeline={lead.timeline}
              finalizadaIso={lead.dueFinalizadaEmIso}
            />
          </div>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-1 sm:gap-2.5">
            <div className="rounded-xl border border-border/60 bg-background px-3 py-2.5">
              <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Prazo combinado
              </dt>
              <dd className="mt-1 text-sm font-bold text-primary-dark">{lead.prazoEntregaLabel}</dd>
            </div>
            <div className="rounded-xl border border-border/60 bg-background px-3 py-2.5">
              <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Documentos
              </dt>
              <dd className="mt-1 flex items-center gap-1.5 text-sm font-bold text-primary-dark">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                {lead.documents.length}
              </dd>
            </div>
            <div className="col-span-2 rounded-xl border border-border/60 bg-background px-3 py-2.5 sm:col-span-1">
              <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Início da DD
              </dt>
              <dd className="mt-1 flex items-center gap-1.5 text-sm font-bold text-primary-dark">
                <Timer className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                {formatDateTimeBr(lead.duePedidoEmIso ?? undefined)}
              </dd>
            </div>
          </dl>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors",
            open
              ? "border-primary-dark/20 bg-primary-dark/[0.04] text-primary-dark"
              : "border-border/60 bg-muted/40 text-muted-foreground hover:border-border hover:bg-muted hover:text-primary-dark",
          )}
          aria-expanded={open}
          aria-controls={`lead-details-${lead.oportunidadeId}`}
        >
          <span>
            {open ? "Ocultar detalhes" : "Documentos, cronologia e informações"}
            {!open && lead.documents.length > 0 ? (
              <span className="ml-2 font-normal text-muted-foreground">
                ({lead.documents.length} arquivo{lead.documents.length !== 1 ? "s" : ""})
              </span>
            ) : null}
          </span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </button>
      </div>

      {/* Expandable section */}
      <AnimatePresence>
        {open && (
          <motion.div
            id={`lead-details-${lead.oportunidadeId}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden border-t border-border/60"
          >
            <Tabs defaultValue="documentos" className="w-full min-w-0">
              <TabsList
                variant="line"
                className="h-auto w-full flex-wrap justify-start gap-0 rounded-none border-b border-border/60 bg-transparent px-4 sm:px-5"
              >
                <TabsTrigger
                  value="documentos"
                  className="rounded-none px-3 py-2.5 text-sm font-semibold data-active:after:bottom-0"
                >
                  Documentos
                  {lead.documents.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                      {lead.documents.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="cronologia"
                  className="rounded-none px-3 py-2.5 text-sm font-semibold data-active:after:bottom-0"
                >
                  Cronologia
                </TabsTrigger>
                <TabsTrigger
                  value="info"
                  className="rounded-none px-3 py-2.5 text-sm font-semibold data-active:after:bottom-0"
                >
                  Informações
                </TabsTrigger>
              </TabsList>

              {/* Documents tab */}
              <TabsContent value="documentos" className="p-4 outline-none sm:p-5">
                {lead.documents.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center">
                    <FileText
                      className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30"
                      aria-hidden
                    />
                    <p className="text-sm text-muted-foreground">
                      Nenhum arquivo registrado nesta negociação.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-0.5">
                    {lead.documents.map((d) => (
                      <DueDocumentRow key={d.id} oportunidadeId={lead.oportunidadeId} doc={d} />
                    ))}
                  </ul>
                )}
              </TabsContent>

              {/* Timeline tab */}
              <TabsContent value="cronologia" className="p-4 outline-none sm:p-5">
                <DueTimelineSection timeline={lead.timeline} />
              </TabsContent>

              {/* Info tab */}
              <TabsContent value="info" className="p-4 outline-none sm:p-5">
                <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <InfoCell label="Aberto por">
                    <CrmUserLabel
                      name={lead.createdByLabel}
                      avatarUrl={lead.createdByAvatarUrl}
                      size="md"
                    />
                  </InfoCell>
                  <InfoCell label="Solicitante">
                    <CrmUserLabel
                      name={lead.solicitanteNome}
                      avatarUrl={lead.solicitanteAvatarUrl}
                      size="md"
                    />
                  </InfoCell>
                  <InfoCell label="Due pedida / início">
                    <span className="font-semibold text-primary-dark">
                      {formatDateTimeBr(lead.duePedidoEmIso ?? undefined)}
                    </span>
                  </InfoCell>
                  <InfoCell label="Prazo combinado">
                    <span className="font-semibold text-primary-dark">
                      {lead.prazoEntregaLabel}
                    </span>
                  </InfoCell>
                  <InfoCell label="Due finalizada">
                    <span className="font-semibold text-primary-dark">
                      {lead.dueFinalizadaEmIso ? formatDateTimeBr(lead.dueFinalizadaEmIso) : "—"}
                    </span>
                  </InfoCell>
                  <InfoCell label="Fase atual">
                    <span className="font-semibold text-primary-dark">{lead.faseAtualLabel}</span>
                  </InfoCell>
                </dl>
              </TabsContent>
            </Tabs>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}

type PunctualityFilterOption = {
  value: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  iconClass: string;
};

const PUNCTUALITY_FILTER_OPTIONS: PunctualityFilterOption[] = [
  {
    value: "all",
    label: "Todos os prazos",
    hint: "Sem filtrar por situação de deadline",
    icon: ListFilter,
    iconClass: "border-border bg-muted/80 text-muted-foreground",
  },
  {
    value: "em_andamento",
    label: "Em curso (no prazo)",
    hint: "Due diligence aberta e dentro do prazo",
    icon: Circle,
    iconClass: "border-accent-teal/35 bg-accent-teal/10 text-accent-teal",
  },
  {
    value: "em_atraso",
    label: "Em atraso",
    hint: "Prazo combinado já ultrapassado",
    icon: Clock,
    iconClass: "border-destructive/35 bg-destructive/10 text-destructive",
  },
  {
    value: "no_prazo",
    label: "Entregue no prazo",
    hint: "Finalizada até o deadline acordado",
    icon: CheckCircle2,
    iconClass: "border-accent-green/35 bg-accent-green/10 text-emerald-700",
  },
  {
    value: "fora_do_prazo",
    label: "Entregue fora do prazo",
    hint: "Finalizada após o deadline",
    icon: AlertCircle,
    iconClass: "border-amber-300/50 bg-amber-50 text-amber-900",
  },
  {
    value: "sem_prazo",
    label: "Sem prazo informado",
    hint: "Cadastro sem data/hora de entrega",
    icon: MinusCircle,
    iconClass: "border-border bg-muted/60 text-muted-foreground",
  },
];

function DuePunctualityFilterMenu({
  value,
  onChange,
  labelId,
}: {
  value: string;
  onChange: (value: string) => void;
  labelId: string;
}) {
  const [open, setOpen] = useState(false);
  const selected =
    PUNCTUALITY_FILTER_OPTIONS.find((o) => o.value === value) ??
    PUNCTUALITY_FILTER_OPTIONS[0]!;
  const SelectedIcon = selected.icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id="due-dd-prazo-filter-trigger"
          aria-labelledby={`${labelId} due-dd-prazo-filter-trigger`}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            "flex h-10 w-full min-w-[220px] items-center justify-between gap-2 rounded-lg border border-input bg-muted/40 px-3 text-left text-sm font-medium text-primary-dark shadow-sm transition-[border-color,box-shadow,ring-color] outline-none hover:border-primary-dark/20 hover:bg-muted/60 focus-visible:border-accent-teal focus-visible:ring-2 focus-visible:ring-accent-teal/15 sm:w-[260px]",
            open && "border-accent-teal/40 ring-2 ring-accent-teal/15",
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <SelectedIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{selected.label}</span>
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-[min(100vw-2rem,320px)] p-0"
      >
        <div className="border-b border-border/70 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Situação do prazo
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Escolha como filtrar as negociações listadas abaixo.
          </p>
        </div>
        <ul className="max-h-[min(360px,60dvh)] space-y-0.5 overflow-y-auto p-1.5" role="listbox">
          {PUNCTUALITY_FILTER_OPTIONS.map((opt) => {
            const active = opt.value === value;
            const Icon = opt.icon;
            return (
              <li key={opt.value} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors",
                    active
                      ? "bg-accent-teal/[0.08] ring-1 ring-accent-teal/25"
                      : "hover:bg-muted/70",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                      opt.iconClass,
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 pt-0.5">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-primary-dark">{opt.label}</span>
                      {active ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-accent-teal" aria-hidden />
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                      {opt.hint}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function DueDiligencePanel({ leads }: { leads: DueDiligenceLeadRow[] }) {
  const [leadQuery, setLeadQuery] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [punctualityFilter, setPunctualityFilter] = useState<string>("all");

  const phaseCounts = useMemo(() => {
    const c: Record<string, number> = {
      all: leads.length,
      levantamento: 0,
      compilacao: 0,
      revisao: 0,
      finalizada: 0,
    };
    for (const L of leads) c[getDuePhase(L)]++;
    return c;
  }, [leads]);

  const stats = useMemo(
    () => ({
      total: leads.length,
      emAndamento: leads.filter((L) => !L.dueFinalizadaEmIso).length,
      emAtraso: leads.filter((L) => L.punctuality.kind === "em_atraso").length,
      finalizadas: leads.filter((L) => !!L.dueFinalizadaEmIso).length,
    }),
    [leads],
  );

  const filtered = useMemo(() => {
    const q = leadQuery.trim().toLowerCase();
    return leads.filter((L) => {
      if (
        q &&
        !L.leadName.toLowerCase().includes(q) &&
        !L.solicitanteNome.toLowerCase().includes(q) &&
        !L.oportunidadeId.toLowerCase().includes(q)
      )
        return false;
      if (phaseFilter !== "all" && getDuePhase(L) !== phaseFilter) return false;
      if (punctualityFilter !== "all" && L.punctuality.kind !== punctualityFilter) return false;
      return true;
    });
  }, [leads, leadQuery, phaseFilter, punctualityFilter]);

  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const aLate = a.punctuality.kind === "em_atraso" ? 0 : 1;
        const bLate = b.punctuality.kind === "em_atraso" ? 0 : 1;
        if (aLate !== bLate) return aLate - bLate;
        if (a.prazoEntregaSortKey !== b.prazoEntregaSortKey)
          return a.prazoEntregaSortKey - b.prazoEntregaSortKey;
        return a.leadName.localeCompare(b.leadName, "pt-BR");
      }),
    [filtered],
  );

  const hasActiveFilters =
    leadQuery !== "" || phaseFilter !== "all" || punctualityFilter !== "all";

  const clearFilters = () => {
    setLeadQuery("");
    setPhaseFilter("all");
    setPunctualityFilter("all");
  };

  const togglePunctuality = (kind: string) => {
    setPunctualityFilter((cur) => (cur === kind ? "all" : kind));
  };

  return (
    <div className="space-y-5">
      <DueGuideBanner />

      <div className="glass-card glass-card-no-float rounded-[18px] p-4 space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Filtrar por situação
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <QuickFilterChip
              label="Todas"
              value={stats.total}
              active={punctualityFilter === "all" && phaseFilter === "all" && !leadQuery}
              tone="border-border"
              onClick={clearFilters}
            />
            <QuickFilterChip
              label="Em andamento"
              value={stats.emAndamento}
              active={punctualityFilter === "em_andamento"}
              tone="border-accent-teal/25"
              onClick={() => togglePunctuality("em_andamento")}
            />
            <QuickFilterChip
              label="Em atraso"
              value={stats.emAtraso}
              active={punctualityFilter === "em_atraso"}
              tone="border-rose-300/40 bg-rose-50/80"
              onClick={() => togglePunctuality("em_atraso")}
            />
            <QuickFilterChip
              label="Finalizadas"
              value={stats.finalizadas}
              active={phaseFilter === "finalizada"}
              tone="border-accent-green/25"
              onClick={() => setPhaseFilter((f) => (f === "finalizada" ? "all" : "finalizada"))}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-4">
          <div className="relative min-w-[200px] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60"
              aria-hidden
            />
            <input
              type="text"
              placeholder="Buscar por nome do lead ou solicitante…"
              value={leadQuery}
              onChange={(e) => setLeadQuery(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-muted/40 pl-9 pr-3 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/60 focus:border-accent-teal focus:ring-2 focus:ring-accent-teal/10"
              aria-label="Buscar negociação"
            />
          </div>
          <div className="flex w-full min-w-[220px] flex-col gap-1.5 sm:w-auto">
            <span
              id="due-dd-prazo-filter-label"
              className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground"
            >
              Situação do prazo
            </span>
            <DuePunctualityFilterMenu
              value={punctualityFilter}
              onChange={setPunctualityFilter}
              labelId="due-dd-prazo-filter-label"
            />
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="h-10 rounded-lg border border-border px-4 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary-dark/30 hover:text-primary-dark"
            >
              Limpar filtros
            </button>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Fase da due diligence
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { key: "all", label: "Todas" },
              { key: "levantamento", label: "Levantamento" },
              { key: "compilacao", label: "Compilação" },
              { key: "revisao", label: "Revisão" },
              { key: "finalizada", label: "Finalizada" },
            ].map((p) => (
              <PhasePill
                key={p.key}
                label={p.label}
                count={phaseCounts[p.key] ?? 0}
                active={phaseFilter === p.key}
                onClick={() => setPhaseFilter(p.key)}
              />
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {sorted.length === leads.length ? (
            <>
              Exibindo <strong className="text-primary-dark">{sorted.length}</strong> negociação
              {leads.length !== 1 ? "ões" : ""}
              {leads.length > 0 ? " — prioridade para atrasos e prazos mais próximos" : ""}
            </>
          ) : (
            <>
              <strong className="text-primary-dark">{sorted.length}</strong> de {leads.length}{" "}
              negociação{leads.length !== 1 ? "ões" : ""} com os filtros atuais
            </>
          )}
        </p>
      </div>

      {leads.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-border bg-muted/20 p-12 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/25" aria-hidden />
          <p className="text-sm font-semibold text-primary-dark">Nenhuma due diligence no momento</p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
            Quando um lead for cadastrado neste CRM com due diligence ativa, ele aparecerá aqui com
            fase, prazo e documentos.
          </p>
        </div>
      ) : sorted.length > 0 ? (
        <motion.div
          className="space-y-4"
          variants={listVariants}
          initial="hidden"
          animate="visible"
        >
          {sorted.map((L) => (
            <motion.div key={L.oportunidadeId} variants={cardVariants}>
              <LeadCard lead={L} />
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <div className="rounded-[18px] border border-dashed border-border p-12 text-center">
          <SlidersHorizontal
            className="mx-auto mb-3 h-10 w-10 text-muted-foreground/20"
            aria-hidden
          />
          <p className="text-sm font-semibold text-muted-foreground">
            Nenhuma negociação encontrada
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Ajuste os filtros para ver mais resultados.
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 rounded-lg border border-border px-4 py-1.5 text-xs font-semibold text-accent-teal transition-colors hover:bg-muted"
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}
    </div>
  );
}
