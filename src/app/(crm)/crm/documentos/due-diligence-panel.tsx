"use client";

import Link from "next/link";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Presentation,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

function initialsFromLabel(label: string): string {
  const parts = label
    .replace(/@.*/, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase() || "?";
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

function getDuePhase(row: DueDiligenceLeadRow): DuePhaseKey {
  if (row.dueFinalizadaEmIso) return "finalizada";
  const tl = row.timeline;
  if (tl.fases[2]?.inicioIso) return "revisao";
  if (tl.fases[1]?.inicioIso) return "compilacao";
  return "levantamento";
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

// ─── Phase stepper ────────────────────────────────────────────────────────────

function PhaseStepper({ currentPhase }: { currentPhase: DuePhaseKey }) {
  const current = PHASE_ORDER[currentPhase];
  return (
    <div className="flex items-center" role="list" aria-label="Etapas da due diligence">
      {PHASE_STEPS.map((step, i) => {
        const idx = PHASE_ORDER[step.key];
        const isCompleted = idx < current;
        const isCurrent = idx === current;
        return (
          <div key={step.key} className="flex items-center" role="listitem">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold transition-all",
                  isCompleted &&
                    "bg-accent-green text-white shadow-sm ring-1 ring-accent-green/30",
                  isCurrent &&
                    "bg-primary-dark text-white shadow-md shadow-primary-dark/20 ring-2 ring-primary-dark/15",
                  !isCompleted && !isCurrent && "bg-muted text-muted-foreground ring-1 ring-border",
                )}
                aria-current={isCurrent ? "step" : undefined}
              >
                {isCompleted ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                ) : (
                  <span aria-hidden>{i + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  "hidden text-[9px] font-bold sm:block",
                  isCompleted && "text-accent-green",
                  isCurrent && "text-primary-dark",
                  !isCompleted && !isCurrent && "text-muted-foreground",
                )}
              >
                {step.short}
              </span>
            </div>
            {i < PHASE_STEPS.length - 1 && (
              <div
                className={cn(
                  "mx-1 mb-4 h-[2px] w-5 rounded-full transition-colors sm:w-8",
                  idx < current ? "bg-accent-green/40" : "bg-border",
                )}
                aria-hidden
              />
            )}
          </div>
        );
      })}
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
  const [open, setOpen] = useState(false);
  const phase = getDuePhase(lead);
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
      {/* Urgency strip */}
      {isAtRisk && (
        <div
          className="h-1 w-full bg-gradient-to-r from-destructive/70 to-destructive"
          aria-hidden
        />
      )}

      {/* Card header */}
      <div className="space-y-3 p-4 sm:p-5">
        {/* Name + badges row */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Negociação
            </p>
            <h2 className="text-[17px] font-extrabold leading-tight tracking-[-0.02em] text-primary-dark">
              {lead.leadName}
            </h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span>
                Solicitante:{" "}
                <span className="font-medium text-primary-dark/80">{lead.solicitanteNome}</span>
              </span>
              <span className="select-none text-border">·</span>
              <span>
                Aberto por:{" "}
                <span className="font-medium text-primary-dark/80">{lead.createdByLabel}</span>
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <PunctualityBadge p={lead.punctuality} />
            <Link
              href={`/crm/leads/${encodeURIComponent(lead.oportunidadeId)}`}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-accent-teal transition-colors hover:bg-muted"
            >
              Ver ficha
              <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
            </Link>
          </div>
        </div>

        {/* Phase progress + deadline */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/40 px-4 py-3">
          <PhaseStepper currentPhase={phase} />
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Prazo combinado
            </p>
            <p className="text-sm font-extrabold tracking-[-0.02em] text-primary-dark">
              {lead.prazoEntregaLabel}
            </p>
          </div>
        </div>

        {/* Expand toggle */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-muted/40 py-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-primary-dark"
          aria-expanded={open}
          aria-controls={`lead-details-${lead.oportunidadeId}`}
        >
          {open ? "Recolher detalhes" : "Ver documentos e cronologia"}
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
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
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-8 w-8 shrink-0 border border-border">
                        {lead.createdByAvatarUrl && (
                          <AvatarImage
                            src={lead.createdByAvatarUrl}
                            alt=""
                            className="object-cover"
                          />
                        )}
                        <AvatarFallback className="text-[10px] font-bold text-primary-dark">
                          {initialsFromLabel(lead.createdByLabel)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-semibold text-primary-dark">{lead.createdByLabel}</span>
                    </div>
                  </InfoCell>
                  <InfoCell label="Solicitante">
                    <span className="font-semibold text-primary-dark">{lead.solicitanteNome}</span>
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

  const statCards = [
    {
      label: "Total",
      value: stats.total,
      valueClass: "text-primary-dark",
      tone: "border-border",
    },
    {
      label: "Em andamento",
      value: stats.emAndamento,
      valueClass: "text-accent-teal",
      tone: "border-accent-teal/25 bg-accent-teal/[0.07]",
    },
    {
      label: "Em atraso",
      value: stats.emAtraso,
      valueClass: "text-destructive",
      tone: "border-rose-300/35 bg-rose-100/35",
    },
    {
      label: "Finalizadas",
      value: stats.finalizadas,
      valueClass: "text-accent-green",
      tone: "border-accent-green/25 bg-accent-green/[0.06]",
    },
  ];

  return (
    <div className="space-y-5">
      {/* ── Stats overview ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statCards.map((s) => (
          <div
            key={s.label}
            className={cn("glass-card-no-float rounded-[18px] border p-5", s.tone)}
          >
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
              {s.label}
            </p>
            <p
              className={cn(
                "mt-0.5 text-4xl font-extrabold tabular-nums tracking-[-0.06em]",
                s.valueClass,
              )}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <div className="glass-card glass-card-no-float rounded-[18px] p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative min-w-[200px] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60"
              aria-hidden
            />
            <input
              type="text"
              placeholder="Buscar lead ou solicitante…"
              value={leadQuery}
              onChange={(e) => setLeadQuery(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-muted/40 pl-9 pr-3 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/60 focus:border-accent-teal focus:ring-2 focus:ring-accent-teal/10"
              aria-label="Buscar lead"
            />
          </div>
          {/* Deadline filter */}
          <Select
            value={punctualityFilter}
            onValueChange={(v) => setPunctualityFilter(v ?? "all")}
          >
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue placeholder="Situação do prazo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os prazos</SelectItem>
              <SelectItem value="em_andamento">Em curso</SelectItem>
              <SelectItem value="em_atraso">Em atraso</SelectItem>
              <SelectItem value="no_prazo">Entregue no prazo</SelectItem>
              <SelectItem value="fora_do_prazo">Fora do prazo</SelectItem>
              <SelectItem value="sem_prazo">Sem prazo</SelectItem>
            </SelectContent>
          </Select>
          {/* Clear */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="h-9 rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary-dark/30 hover:text-primary-dark"
            >
              Limpar
            </button>
          )}
        </div>

        {/* Phase pills */}
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { key: "all", label: "Todas as fases" },
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

        {hasActiveFilters && (
          <p className="mt-2.5 text-xs text-muted-foreground">
            {sorted.length} de {leads.length} negociação
            {leads.length !== 1 ? "ões" : ""} encontrada{leads.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* ── Lead cards ──────────────────────────────────────────────────── */}
      {sorted.length > 0 ? (
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
