"use client";

import { createElement } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  Clock3,
  GitBranch,
  History,
  ListChecks,
  MessageSquareText,
  PencilLine,
  Send,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDateTimeBr } from "@/lib/format-datetime";
import type { LeadActivityEvent, LeadLifecycleTimeline } from "@/lib/crm/lead-lifecycle-timeline";
import type { LeadActivityKind } from "@/lib/crm/record-lead-activity";
import { OPPORTUNITY_STAGE_LABELS } from "@/lib/crm/stage-labels";
import { getStageIcon } from "@/lib/crm/stage-icons";
import { initialsFromFullName } from "@/lib/crm/resolve-app-user-display";
import { cn } from "@/lib/utils";
import type { OpportunityStage } from "@/modules/crm/domain/entities";

type LeadLifecycleTimelinePanelProps = {
  timeline: LeadLifecycleTimeline;
};

const ACTIVITY_KIND_META: Record<
  LeadActivityKind,
  { icon: LucideIcon; tone: string; label: string }
> = {
  lead_criado: { icon: Sparkles, tone: "bg-violet-bg text-violet-text", label: "Criação" },
  etapa_alterada: { icon: GitBranch, tone: "bg-info-bg text-info-text", label: "Etapa" },
  campo_pipeline_alterado: { icon: PencilLine, tone: "bg-warning-bg text-warning-text", label: "Campo" },
  campo_intake_alterado: { icon: PencilLine, tone: "bg-warning-bg text-warning-text", label: "Cadastro" },
  campo_rd_alterado: { icon: PencilLine, tone: "bg-info-bg text-info-text", label: "RD" },
  proposta_escopo_concluido: { icon: CheckCircle2, tone: "bg-success-bg text-success-text", label: "Proposta" },
  proposta_escopo_reaberto: { icon: PencilLine, tone: "bg-warning-bg text-warning-text", label: "Proposta" },
  nota_adicionada: { icon: MessageSquareText, tone: "bg-neutral-100 text-foreground", label: "Nota" },
  due_dados_disponibilizados: { icon: ListChecks, tone: "bg-success-bg text-success-text", label: "DUE" },
  due_revisao_aprovada: { icon: CheckCircle2, tone: "bg-success-bg text-success-text", label: "DUE" },
  due_ajustes_solicitados: { icon: ListChecks, tone: "bg-danger-bg text-danger-text", label: "DUE" },
  due_ajustes_concluidos: { icon: CheckCircle2, tone: "bg-success-bg text-success-text", label: "DUE" },
  contrato_enviado: { icon: Send, tone: "bg-info-bg text-info-text", label: "Contrato" },
  contrato_assinado: { icon: CheckCircle2, tone: "bg-success-bg text-success-text", label: "Contrato" },
  proposta_escopo_solicitado: { icon: Send, tone: "bg-warning-bg text-warning-text", label: "Proposta" },
};

export function LeadLifecycleTimelinePanel({ timeline }: LeadLifecycleTimelinePanelProps) {
  const { periods, activities, summary } = timeline;
  const CurrentStageIcon = summary.currentEtapa ? getStageIcon(summary.currentEtapa) : History;
  const currentLabel = summary.currentEtapa
    ? OPPORTUNITY_STAGE_LABELS[summary.currentEtapa] ?? summary.currentEtapa
    : "—";

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Tempo total no funil"
          value={summary.totalDurationLabel}
          hint={`Desde ${formatDateTimeBr(summary.leadCreatedAt)}`}
        />
        <MetricCard
          label="Etapa atual"
          value={currentLabel}
          hint={`${summary.currentEtapaDurationLabel} nesta etapa`}
          icon={CurrentStageIcon}
        />
        <MetricCard label="Períodos por etapa" value={String(summary.periodCount)} hint="Entrada e saída registradas" />
        <MetricCard label="Ações registradas" value={String(summary.activityCount)} hint="Campos, proposta, DUE, notas…" />
      </div>

      <section className="overflow-hidden rounded-(--radius-v2-xl) border border-neutral-200 bg-white">
        <header className="flex items-center gap-2 border-b border-neutral-200 px-5 py-4">
          <History className="h-4 w-4 text-muted-foreground" aria-hidden />
          <div>
            <h3 className="text-sm font-extrabold text-foreground">Linha do tempo</h3>
            <p className="text-xs text-muted-foreground">
              Tudo que usuários fizeram neste lead — com avatar, área e horário.
            </p>
          </div>
        </header>
        {activities.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">Nenhuma ação registrada ainda.</p>
        ) : (
          <ul className="divide-y divide-neutral-200">
            {activities.map((event) => (
              <ActivityRow key={event.id} event={event} />
            ))}
          </ul>
        )}
      </section>

      <section className="overflow-hidden rounded-(--radius-v2-xl) border border-neutral-200 bg-white">
        <header className="flex items-center gap-2 border-b border-neutral-200 px-5 py-4">
          <Clock3 className="h-4 w-4 text-muted-foreground" aria-hidden />
          <div>
            <h3 className="text-sm font-extrabold text-foreground">Tempo em cada etapa</h3>
            <p className="text-xs text-muted-foreground">Permanência materializada para relatórios gerenciais.</p>
          </div>
        </header>
        {periods.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">Nenhum período registrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-neutral-50 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Etapa</th>
                  <th className="px-5 py-3">Entrada</th>
                  <th className="px-5 py-3">Saída</th>
                  <th className="px-5 py-3">Permanência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {periods.map((row) => {
                  return (
                    <tr key={row.id} className={cn(row.isCurrent && "bg-success-bg")}>
                      <td className="px-5 py-3 font-semibold text-foreground">
                        <span className="inline-flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-(--radius-v2-md) bg-neutral-100 text-muted-foreground">
                            <StageGlyph stage={row.etapa} className="h-3.5 w-3.5" />
                          </span>
                          {row.etapaLabel}
                          {row.isCurrent ? (
                            <span className="rounded-full bg-success-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success-text">
                              Atual
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-5 py-3 tabular-nums text-foreground">{formatDateTimeBr(row.enteredAt)}</td>
                      <td className="px-5 py-3 tabular-nums text-foreground">
                        {row.exitedAt ? formatDateTimeBr(row.exitedAt) : "—"}
                      </td>
                      <td className="px-5 py-3 font-semibold tabular-nums text-foreground">{row.durationLabel}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ActivityRow({ event }: { event: LeadActivityEvent }) {
  const meta = ACTIVITY_KIND_META[event.kind] ?? ACTIVITY_KIND_META.campo_pipeline_alterado;
  const KindIcon = meta.icon;
  const fromStage = event.metadata.from as OpportunityStage | undefined;
  const toStage = event.metadata.to as OpportunityStage | undefined;

  return (
    <li className="px-5 py-4">
      <div className="flex gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-(--radius-v2-lg)",
            meta.tone,
          )}
        >
          <KindIcon className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{event.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", meta.tone)}>
                  {meta.label}
                </span>
                {event.areaKey ? (
                  <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    Área: {event.areaKey}
                  </span>
                ) : null}
                {event.kind === "etapa_alterada" && fromStage && toStage ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <StageGlyph stage={fromStage} className="h-3.5 w-3.5" />
                    {OPPORTUNITY_STAGE_LABELS[fromStage] ?? fromStage}
                    <span aria-hidden>→</span>
                    <StageGlyph stage={toStage} className="h-3.5 w-3.5" />
                    {OPPORTUNITY_STAGE_LABELS[toStage] ?? toStage}
                  </span>
                ) : event.etapaLabel && event.kind !== "etapa_alterada" ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    {event.etapa ? (
                      <StageGlyph stage={event.etapa} className="h-3.5 w-3.5" />
                    ) : null}
                    {event.etapaLabel}
                  </span>
                ) : null}
              </div>
            </div>
            <time className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDateTimeBr(event.createdAt)}</time>
          </div>

          {event.detail ? (
            <p className="mt-2 rounded-(--radius-v2-md) bg-neutral-50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              {event.detail}
            </p>
          ) : null}

          <div className="mt-2.5">
            <ActivityActor actor={event.actor} />
          </div>
        </div>
      </div>
    </li>
  );
}

function StageGlyph({
  stage,
  className,
}: {
  stage: OpportunityStage;
  className: string;
}) {
  return createElement(getStageIcon(stage), { className, "aria-hidden": true });
}

function ActivityActor({ actor }: { actor: LeadActivityEvent["actor"] }) {
  if (!actor) {
    return (
      <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
        </span>
        Sistema / automação
      </span>
    );
  }

  return (
    <span className="inline-flex max-w-full items-center gap-2">
      <Avatar className="h-7 w-7 border border-white ring-1 ring-neutral-200">
        {actor.avatarUrl ? <AvatarImage src={actor.avatarUrl} alt="" className="object-cover" /> : null}
        <AvatarFallback className="bg-interactive-50 text-[10px] font-bold text-interactive-700">
          {initialsFromFullName(actor.fullName)}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold text-foreground">{actor.fullName}</span>
        {actor.area ? (
          <span className="block truncate text-[10px] font-medium text-muted-foreground">{actor.area}</span>
        ) : (
          <span className="block text-[10px] text-muted-foreground">Sem área cadastrada</span>
        )}
      </span>
    </span>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon?: LucideIcon;
}) {
  const DisplayIcon = Icon ?? UserRound;
  return (
    <div className="rounded-(--radius-v2-xl) border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <DisplayIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </div>
      <p className="mt-1 text-lg font-extrabold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
