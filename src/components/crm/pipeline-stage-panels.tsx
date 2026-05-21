"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Calendar,
  Check,
  ChevronDown,
  ClipboardList,
  Clock,
  ExternalLink,
  Eye,
  FileCheck,
  FileText,
  MapPin,
  PenLine,
  Scale,
  Send,
  Video,
  Wrench,
} from "lucide-react";
import type { Oportunidade } from "@/modules/crm/domain/entities";
import { formatDateTimeBr, formatDateYmdBr } from "@/lib/format-datetime";
import { cn } from "@/lib/utils";
import {
  KanbanAreaRow,
  KanbanPanelInfoRow,
  KanbanPanelShell,
  type KanbanPanelTone,
} from "@/components/crm/pipeline-kanban-panel-shell";

function isTodayYmd(ymd: string): boolean {
  const today = new Date();
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return false;
  return today.getFullYear() === y && today.getMonth() + 1 === m && today.getDate() === d;
}

function meetingSubtitle(dataReuniao: string | null | undefined): string | null {
  const raw = dataReuniao?.trim();
  if (!raw) return "Data ainda não definida";
  if (isTodayYmd(raw)) return "Reunião hoje";
  return `Agendada para ${formatDateYmdBr(raw)}`;
}

function isOnlineMeeting(local: string): boolean {
  const l = local.toLowerCase();
  return (
    l.includes("teams") ||
    l.includes("zoom") ||
    l.includes("meet") ||
    l.includes("online") ||
    l.includes("virtual")
  );
}

type MeetingKanbanPanelProps = {
  item: Pick<Oportunidade, "localReuniao" | "dataReuniao" | "horarioReuniao">;
};

export function MeetingKanbanPanel({ item }: MeetingKanbanPanelProps) {
  const local = item.localReuniao?.trim() || "";
  const dataRaw = item.dataReuniao?.trim() || "";
  const horario = item.horarioReuniao?.trim() || "";
  const hasSchedule = Boolean(dataRaw || horario || local);
  const online = local ? isOnlineMeeting(local) : false;

  const dateBadge =
    dataRaw && isTodayYmd(dataRaw) ? (
      <span className="rounded-full bg-violet-600/15 px-1.5 py-px text-[8px] font-bold uppercase tracking-wide text-violet-900">
        Hoje
      </span>
    ) : null;

  return (
    <KanbanPanelShell
      tone="violet"
      icon={online ? <Video className="h-3.5 w-3.5" /> : <Calendar className="h-3.5 w-3.5" />}
      title="Reunião com o cliente"
      subtitle={meetingSubtitle(dataRaw || null)}
      badge={dateBadge}
    >
      <div className="space-y-1.5 px-2 py-2">
        <KanbanPanelInfoRow
          icon={<MapPin className="h-3.5 w-3.5" />}
          label="Local"
          value={local || "A definir"}
          muted={!local}
        />
        <KanbanPanelInfoRow
          icon={<Calendar className="h-3.5 w-3.5" />}
          label="Data"
          value={dataRaw ? formatDateYmdBr(dataRaw) : "A definir"}
          muted={!dataRaw}
        />
        <KanbanPanelInfoRow
          icon={<Clock className="h-3.5 w-3.5" />}
          label="Horário"
          value={horario || "A definir"}
          muted={!horario}
        />
      </div>
      {!hasSchedule ? (
        <div className="border-t border-primary-dark/[0.06] px-2.5 py-1.5 text-[9px] font-medium text-primary-dark/55">
          Preencha local, data e horário na ficha do lead.
        </div>
      ) : null}
    </KanbanPanelShell>
  );
}

type PropostaEscopoKanbanPanelProps = {
  summary: NonNullable<Oportunidade["propostaEscopoSummary"]>;
  breakdown: Oportunidade["propostaEscopoBreakdown"];
  linkProposta?: string | null;
};

export function PropostaEscopoKanbanPanel({
  summary,
  breakdown,
  linkProposta,
}: PropostaEscopoKanbanPanelProps) {
  const { total, concluido, pendente } = summary;
  const progressPct = total > 0 ? Math.round((concluido / total) * 100) : 0;
  const allDone = pendente === 0 && total > 0;
  const tone = allDone ? "emerald" : "indigo";

  const footer = linkProposta?.trim() ? (
    <a
      href={linkProposta.trim()}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-full items-center gap-1.5 text-[10px] font-semibold text-accent-teal underline-offset-2 hover:underline"
      title={linkProposta.trim()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">Abrir proposta</span>
    </a>
  ) : allDone ? (
    <p className="text-[9px] font-semibold text-emerald-800/85">
      Todas as áreas enviaram — pronto para elaborar
    </p>
  ) : pendente > 0 ? (
    <p className="text-[9px] font-medium text-primary-dark/60">
      {pendente === 1 ? "1 área pendente de envio" : `${pendente} áreas pendentes de envio`}
    </p>
  ) : null;

  return (
    <KanbanPanelShell
      tone={tone}
      icon={<FileText className="h-3.5 w-3.5" />}
      title={allDone ? "Escopo completo" : "Elaboração da proposta"}
      subtitle={
        allDone
          ? "Dados recebidos de todas as áreas"
          : "Aguardando envio das áreas envolvidas"
      }
      badge={`${concluido}/${total}`}
      progressPct={progressPct}
      footer={footer}
    >
      {breakdown && breakdown.length > 0 ? (
        <details
          className="kanban-panel-details group/details"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-1.5 text-[10px] font-semibold text-primary-dark/70 outline-none transition-colors hover:bg-primary-dark/[0.03] [&::-webkit-details-marker]:hidden">
            <span>Ver áreas</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open/details:rotate-180" />
          </summary>
          <ul className="space-y-1.5 px-2 pb-2">
            {breakdown.map((row) => (
              <KanbanAreaRow
                key={row.areaKey}
                areaKey={row.areaKey}
                done={row.concluido}
                doneLabel="dados enviados"
                pendingLabel="aguardando envio"
              />
            ))}
          </ul>
        </details>
      ) : null}
    </KanbanPanelShell>
  );
}

type PropostaEnviadaKanbanPanelProps = {
  linkProposta?: string | null;
};

export function PropostaEnviadaKanbanPanel({ linkProposta }: PropostaEnviadaKanbanPanelProps) {
  const hasLink = Boolean(linkProposta?.trim());

  return (
    <KanbanPanelShell
      tone="sky"
      icon={<Send className="h-3.5 w-3.5" />}
      title="Proposta enviada"
      subtitle={
        hasLink
          ? "Aguardando retorno do cliente"
          : "Informe o link da proposta na ficha do lead"
      }
      badge={hasLink ? "Enviada" : "Sem link"}
      className={!hasLink ? "border-dashed" : undefined}
      footer={
        hasLink ? (
          <a
            href={linkProposta!.trim()}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-1.5 text-[10px] font-semibold text-accent-teal underline-offset-2 hover:underline"
            title={linkProposta!.trim()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">Abrir proposta</span>
          </a>
        ) : (
          <p className="text-[9px] font-medium text-primary-dark/55">
            Avance para esta etapa com o link SharePoint / Vios da proposta.
          </p>
        )
      }
    />
  );
}

type ContractReviewKanbanPanelProps = {
  leadId: string;
  etapa: "confeccao_contrato" | "contrato_elaborado";
  review: Oportunidade["contractReviewSummary"];
  linkContrato?: string | null;
};

function reviewProgressPct(
  review: NonNullable<Oportunidade["contractReviewSummary"]>["status"] | undefined,
): number | null {
  if (!review) return null;
  if (review === "pendente") return 33;
  if (review === "em_revisao") return 66;
  return 100;
}

export function ContractReviewKanbanPanel({
  leadId,
  etapa,
  review,
  linkContrato,
}: ContractReviewKanbanPanelProps) {
  const isElaborado = etapa === "contrato_elaborado";
  const status = review?.status;
  const prazo = review?.prazoRevisao?.trim() || "";
  const concluidoEm = review?.concluidoEm?.trim() || "";
  const hasContractLink = Boolean(linkContrato?.trim());

  if (!review) {
    return (
      <KanbanPanelShell
        tone="slate"
        icon={<PenLine className="h-3.5 w-3.5" />}
        title="Elaboração do contrato"
        subtitle="Salve o contrato no builder com prazo de revisão Societário"
        className="border-dashed"
        footer={
          <Link
            href={`/crm/leads/${encodeURIComponent(leadId)}`}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              "flex w-full items-center justify-center gap-1.5 rounded-lg",
              "border border-accent-teal/40 bg-accent-teal/10 px-2.5 py-1.5",
              "text-[10px] font-bold text-teal-800 transition-colors hover:bg-accent-teal/20",
            )}
          >
            <PenLine className="h-3 w-3 shrink-0" aria-hidden />
            Elaborar contrato
          </Link>
        }
      />
    );
  }

  const tone =
    status === "concluido" ? "emerald" : status === "em_revisao" ? "amber" : "slate";
  const progressPct = reviewProgressPct(status);
  const badge =
    status === "concluido"
      ? "Aprovada"
      : status === "em_revisao"
        ? "Em revisão"
        : "Pendente";

  const title =
    status === "concluido" && isElaborado
      ? "Contrato elaborado"
      : status === "concluido"
        ? "Revisão aprovada"
        : isElaborado
          ? "Contrato em revisão"
          : "Elaboração do contrato";

  const subtitle =
    status === "concluido" && isElaborado
      ? "Pronto para envio à D4Sign"
      : status === "concluido"
        ? "Societário aprovou — avance para contrato elaborado"
        : status === "em_revisao"
          ? "Societário analisando o documento"
          : "Aguardando início da revisão Societário";

  const icon =
    status === "concluido" ? (
      <FileCheck className="h-3.5 w-3.5" />
    ) : status === "em_revisao" ? (
      <PenLine className="h-3.5 w-3.5" />
    ) : (
      <Scale className="h-3.5 w-3.5" />
    );

  const footer = (() => {
    if (hasContractLink) {
      return (
        <a
          href={linkContrato!.trim()}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-full items-center gap-1.5 text-[10px] font-semibold text-accent-teal underline-offset-2 hover:underline"
          title={linkContrato!.trim()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">Abrir contrato</span>
        </a>
      );
    }
    if (status === "concluido" && isElaborado) {
      return (
        <p className="inline-flex items-center gap-1.5 text-[9px] font-semibold text-emerald-800/85">
          <Send className="h-3 w-3 shrink-0" aria-hidden />
          Pronto para enviar via D4Sign
        </p>
      );
    }
    if (etapa === "confeccao_contrato") {
      return (
        <Link
          href={`/crm/leads/${encodeURIComponent(leadId)}`}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "flex w-full items-center justify-center gap-1.5 rounded-lg",
            "border border-accent-teal/40 bg-accent-teal/10 px-2.5 py-1.5",
            "text-[10px] font-bold text-teal-800 transition-colors hover:bg-accent-teal/20",
          )}
        >
          <PenLine className="h-3 w-3 shrink-0" aria-hidden />
          Abrir builder do contrato
        </Link>
      );
    }
    return null;
  })();

  return (
    <KanbanPanelShell
      tone={tone}
      icon={icon}
      title={title}
      subtitle={subtitle}
      badge={badge}
      progressPct={progressPct}
      footer={footer}
    >
      <div className="space-y-1.5 px-2 py-2">
        {prazo ? (
          <KanbanPanelInfoRow
            icon={<Calendar className="h-3.5 w-3.5" />}
            label="Prazo revisão"
            value={formatDateYmdBr(prazo)}
          />
        ) : null}
        {status === "concluido" && concluidoEm ? (
          <KanbanPanelInfoRow
            icon={<Check className="h-3.5 w-3.5" />}
            label="Aprovado em"
            value={formatDateTimeBr(concluidoEm)}
          />
        ) : null}
        {status === "pendente" ? (
          <KanbanPanelInfoRow
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Status"
            value="Aguardando Societário iniciar"
            muted
          />
        ) : null}
        {status === "em_revisao" ? (
          <KanbanPanelInfoRow
            icon={<PenLine className="h-3.5 w-3.5" />}
            label="Status"
            value="Documento em análise"
          />
        ) : null}
      </div>
    </KanbanPanelShell>
  );
}

function AreaListDetails({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details
      className="kanban-panel-details group/details"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-1.5 text-[10px] font-semibold text-primary-dark/70 outline-none transition-colors hover:bg-primary-dark/[0.03] [&::-webkit-details-marker]:hidden">
        <span>{label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open/details:rotate-180" />
      </summary>
      <ul className="space-y-1.5 px-2 pb-2">{children}</ul>
    </details>
  );
}

type DueLevantamentoKanbanPanelProps = {
  summary: NonNullable<Oportunidade["dueAreaTasksSummary"]>;
  breakdown: Oportunidade["dueAreaTasksBreakdown"];
};

export function DueLevantamentoKanbanPanel({ summary, breakdown }: DueLevantamentoKanbanPanelProps) {
  const { total, disponibilizados, atrasados } = summary;
  const progressPct = total > 0 ? Math.round((disponibilizados / total) * 100) : 0;
  const allDone = disponibilizados === total && total > 0;
  const tone: KanbanPanelTone = atrasados > 0 ? "amber" : allDone ? "emerald" : "indigo";

  const footer =
    atrasados > 0 ? (
      <p className="text-[9px] font-semibold text-rose-800/90">
        {atrasados === 1 ? "1 área em atraso" : `${atrasados} áreas em atraso`}
      </p>
    ) : allDone ? (
      <p className="text-[9px] font-semibold text-emerald-800/85">Todas as áreas concluíram o levantamento</p>
    ) : (
      <p className="text-[9px] font-medium text-primary-dark/60">
        {total - disponibilizados} área(s) pendente(s)
      </p>
    );

  return (
    <KanbanPanelShell
      tone={tone}
      icon={<ClipboardList className="h-3.5 w-3.5" />}
      title={allDone ? "Levantamento concluído" : "Levantamento DUE"}
      subtitle={
        atrasados > 0
          ? "Há entregas em atraso — priorize as áreas pendentes"
          : "Disponibilização de dados por área"
      }
      badge={`${disponibilizados}/${total}`}
      progressPct={progressPct}
      footer={footer}
    >
      {breakdown && breakdown.length > 0 ? (
        <AreaListDetails label="Ver áreas">
          {breakdown.map((row) => (
            <KanbanAreaRow
              key={row.areaKey}
              areaKey={row.areaKey}
              done={row.entregue}
              doneLabel="concluída"
              pendingLabel={row.emAtraso ? "em atraso" : "pendente"}
              tone={row.emAtraso && !row.entregue ? "danger" : "default"}
              extra={
                row.entregue && row.semProcessosAtivos ? "Sem processos ativos" : null
              }
            />
          ))}
        </AreaListDetails>
      ) : null}
    </KanbanPanelShell>
  );
}

type DueRevisaoKanbanPanelProps = {
  summary: NonNullable<Oportunidade["dueAreaReviewSummary"]>;
  breakdown: Oportunidade["dueAreaReviewBreakdown"];
};

export function DueRevisaoKanbanPanel({ summary, breakdown }: DueRevisaoKanbanPanelProps) {
  const { total, reviewed, pending } = summary;
  const progressPct = total > 0 ? Math.round((reviewed / total) * 100) : 0;
  const allDone = pending === 0 && total > 0;
  const tone: KanbanPanelTone = allDone ? "emerald" : "slate";

  const footer = allDone ? (
    <p className="text-[9px] font-semibold text-emerald-800/85">Todas as áreas revisaram</p>
  ) : (
    <p className="text-[9px] font-medium text-primary-dark/60">
      {pending === 1 ? "1 área sem revisão" : `${pending} áreas sem revisão`}
    </p>
  );

  return (
    <KanbanPanelShell
      tone={tone}
      icon={<Eye className="h-3.5 w-3.5" />}
      title={allDone ? "Revisão DUE concluída" : "Revisão DUE"}
      subtitle={
        allDone ? "Ciclo de revisão finalizado pelas áreas" : "Áreas analisando o material compilado"
      }
      badge={`${reviewed}/${total}`}
      progressPct={progressPct}
      footer={footer}
    >
      {breakdown && breakdown.length > 0 ? (
        <AreaListDetails label="Ver áreas">
          {breakdown.map((row) => (
            <KanbanAreaRow
              key={row.areaKey}
              areaKey={row.areaKey}
              done={row.reviewed}
              doneLabel="revisada"
              pendingLabel="pendente de revisão"
              extra={
                row.reviewed
                  ? row.requestedAdjustments
                    ? "Com ajustes solicitados"
                    : "Ok"
                  : null
              }
            />
          ))}
        </AreaListDetails>
      ) : null}
    </KanbanPanelShell>
  );
}

type DueCompilacaoAdjustmentsKanbanPanelProps = {
  adjustments: NonNullable<Oportunidade["dueReviewAdjustments"]>;
};

export function DueCompilacaoAdjustmentsKanbanPanel({
  adjustments,
}: DueCompilacaoAdjustmentsKanbanPanelProps) {
  const total = adjustments.length;
  const completed = adjustments.filter((row) => Boolean(row.adjustmentCompletedAt)).length;
  const pending = total - completed;
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const allDone = pending === 0 && total > 0;
  const tone: KanbanPanelTone = allDone ? "emerald" : "amber";

  const footer = allDone ? (
    <p className="text-[9px] font-semibold text-emerald-800/85">
      Todos os ajustes concluídos — pode retornar para Revisão
    </p>
  ) : (
    <p className="text-[9px] font-medium text-amber-950/75">
      Conclua os ajustes pendentes para voltar à Revisão
    </p>
  );

  return (
    <KanbanPanelShell
      tone={tone}
      icon={<Wrench className="h-3.5 w-3.5" />}
      title={allDone ? "Ajustes concluídos" : "Ajustes da revisão"}
      subtitle={
        allDone
          ? "Áreas finalizaram as correções solicitadas"
          : "Correções solicitadas na revisão DUE"
      }
      badge={`${completed}/${total}`}
      progressPct={progressPct}
      footer={footer}
    >
      <AreaListDetails label="Ver ajustes">
        {adjustments.map((row) => (
          <KanbanAreaRow
            key={`${row.areaKey}-${row.respondedAt ?? "sem-data"}`}
            areaKey={row.areaKey}
            done={Boolean(row.adjustmentCompletedAt)}
            doneLabel="ajuste concluído"
            pendingLabel="ajuste pendente"
            tone={row.adjustmentCompletedAt ? "default" : "warning"}
            extra={row.observacaoAjustes?.trim() || null}
          />
        ))}
      </AreaListDetails>
    </KanbanPanelShell>
  );
}
