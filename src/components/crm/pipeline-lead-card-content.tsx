"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Clock,
  ExternalLink,
  FileCheck,
  PenLine,
  Send,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { DaysInStagePanel } from "@/components/crm/days-in-stage-panel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getLeadPipelineSituation } from "@/modules/crm/application/lead-pipeline-situation";
import type { Oportunidade } from "@/modules/crm/domain/entities";
import { formatDateTimeBr, formatDateYmdBr } from "@/lib/format-datetime";
import {
  countSignedSigners,
  latestSignerSignedAt,
  signerDisplayLabel,
  signerRoleLabel,
} from "@/lib/crm/d4sign-kanban-signers";

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const a = parts[0][0];
  const b = parts[parts.length - 1][0];
  return `${a}${b}`.toUpperCase();
}

function normalizePersonName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Solicitante (usuário interno) e responsável (RD→CRM) são a mesma pessoa. */
function isSameSolicitanteEResponsavel(item: Oportunidade): boolean {
  const ownerId = item.ownerUserId;
  const solicitanteId = item.solicitanteUsuarioId;
  if (ownerId && solicitanteId && ownerId === solicitanteId) {
    return true;
  }
  const s = item.solicitanteUsuarioNome?.trim();
  const o = item.ownerUserName?.trim();
  if (!s || !o) return false;
  return normalizePersonName(s) === normalizePersonName(o);
}

function AvatarNameBlock({
  label,
  name,
  imageUrl,
}: {
  label: string;
  name: string;
  imageUrl?: string | null;
}) {
  return (
    <div className="flex items-start gap-2">
      <Avatar className="h-7 w-7 shrink-0 border border-primary-dark/10 shadow-sm">
        {imageUrl ? (
          <AvatarImage src={imageUrl} alt="" className="object-cover" />
        ) : null}
        <AvatarFallback className="text-[10px]">{initialsFromName(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-[12px] font-bold leading-snug tracking-[-0.02em] text-primary-dark">{name}</p>
      </div>
    </div>
  );
}

interface PipelineLeadCardContentProps {
  item: Oportunidade;
  daysCompact?: boolean;
  showOpenLink?: boolean;
}

function LossReasonTooltipBody({ motivo }: { motivo: string }) {
  return (
    <div className="px-3.5 py-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-1 size-2.5 shrink-0 rounded-full bg-rose-600" aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold leading-snug text-primary-dark">Motivo da perda</p>
          <div className="mt-2">
            <span className="inline-flex rounded-md bg-rose-500/14 px-2 py-0.5 text-[11px] font-semibold tracking-tight text-rose-900">
              Perdida
            </span>
          </div>
          <p className="mt-3 text-[13px] leading-snug text-primary-dark/90">{motivo}</p>
        </div>
      </div>
    </div>
  );
}

export function PipelineLeadCardContent({
  item,
  daysCompact,
  showOpenLink,
}: PipelineLeadCardContentProps) {
  const temSolicitanteUsuario =
    item.solicitanteUsuarioNome != null && item.solicitanteUsuarioNome.trim() !== "";
  const temResponsavel =
    item.ownerUserName != null && item.ownerUserName.trim() !== "";
  const mesmoUsuarioSolicitanteEResponsavel =
    temSolicitanteUsuario && temResponsavel && isSameSolicitanteEResponsavel(item);

  const situacaoComercial = getLeadPipelineSituation(item);
  const hasCompilacaoAdjustments =
    item.haveraDueDiligence &&
    item.etapa === "compilacao" &&
    Array.isArray(item.dueReviewAdjustments) &&
    item.dueReviewAdjustments.length > 0;
  const showDueLevantamentoDetails =
    item.haveraDueDiligence &&
    (item.etapa === "levantamento_dados" || item.etapa === "compilacao") &&
    !hasCompilacaoAdjustments &&
    Boolean(item.dueAreaTasksSummary?.total);
  const showMeetingInfo =
    item.haveraDueDiligence && item.etapa === "reuniao";
  const showPropostaEscopoDetails =
    item.etapa === "confeccao_proposta" && Boolean(item.propostaEscopoSummary?.total);
  const isContractFlowStage =
    item.etapa === "confeccao_contrato" ||
    item.etapa === "contrato_elaborado" ||
    item.etapa === "contrato_enviado" ||
    item.etapa === "contrato_assinado";
  const showContractReviewDetails =
    (item.etapa === "confeccao_contrato" || item.etapa === "contrato_elaborado") &&
    Boolean(item.contractReviewSummary);
  const contractSigners =
    (item.etapa === "contrato_enviado" || item.etapa === "contrato_assinado") &&
    Array.isArray(item.d4signSigners) &&
    item.d4signSigners.length > 0
      ? item.d4signSigners
      : null;
  const contractSignedCount = contractSigners ? countSignedSigners(contractSigners) : 0;
  const contractTotalSigners = contractSigners?.length ?? 0;
  const contractSentAt = item.d4signUpdatedAt?.trim() || null;
  const contractFullySignedAt =
    item.etapa === "contrato_assinado"
      ? latestSignerSignedAt(contractSigners ?? []) ?? contractSentAt
      : null;
  const showContractSentSummary =
    item.etapa === "contrato_enviado" &&
    (Boolean(contractSigners) || Boolean(contractSentAt) || Boolean(item.linkContrato?.trim()));
  const compilacaoAdjustmentsTotal = item.dueReviewAdjustments?.length ?? 0;
  const compilacaoAdjustmentsCompleted =
    item.dueReviewAdjustments?.filter((row) => Boolean(row.adjustmentCompletedAt)).length ?? 0;
  const showBadgesRow = situacaoComercial !== "em_andamento" || Boolean(item.origemRd);
  const perdidaTooltip = item.motivoPerda?.trim()
    ? `Negociação marcada como perdida. Motivo: ${item.motivoPerda.trim()}`
    : "Negociação marcada como perdida";
  const motivoPerda = item.motivoPerda?.trim() ?? "";
  const meetingDateDisplay = item.dataReuniao?.trim() ? formatDateYmdBr(item.dataReuniao.trim()) : "Não definida";

  return (
    <>
      {showBadgesRow ? (
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          {situacaoComercial === "vendidas" ? (
            <span
              className="inline-flex items-center rounded-full border border-emerald-600/35 bg-emerald-500/18 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-950"
              title="Negociação fechada como ganha ou em contrato assinado"
            >
              Vendida
            </span>
          ) : null}
          {situacaoComercial === "perdidas" ? (
            <span
              className="inline-flex items-center rounded-full border border-rose-400/45 bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-950"
              title={perdidaTooltip}
            >
              Perdida
            </span>
          ) : null}
          {item.origemRd ? (
            <span
              className="inline-flex items-center rounded-full border border-orange-400/40 bg-orange-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-orange-900/90"
              title="Negociação sincronizada do RD Station CRM (ver API v1 em developers.rdstation.com)"
            >
              RD Station
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            Nome do lead
          </p>
          <p className="mt-0.5 text-[13px] font-extrabold leading-snug tracking-[-0.03em] text-primary-dark">
            {item.solicitante}
          </p>
        </div>
        {showOpenLink ? (
          <Link
            href={`/crm/leads/${encodeURIComponent(item.id)}`}
            className={cn(
              "mt-0.5 inline-flex shrink-0 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors",
              "hover:bg-primary-dark/10 hover:text-primary-dark",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark/35 focus-visible:ring-offset-1",
            )}
            title="Abrir ficha do lead"
            aria-label="Abrir ficha do lead"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </Link>
        ) : null}
      </div>

      {mesmoUsuarioSolicitanteEResponsavel ? (
        <div className="mt-2">
          <AvatarNameBlock
            label="Solicitante e responsável"
            name={item.ownerUserName!}
            imageUrl={item.ownerUserAvatarUrl ?? item.solicitanteUsuarioAvatarUrl}
          />
        </div>
      ) : (
        <>
          {temSolicitanteUsuario ? (
            <div className="mt-2">
              <AvatarNameBlock
                label="Solicitante (usuário)"
                name={item.solicitanteUsuarioNome!}
                imageUrl={item.solicitanteUsuarioAvatarUrl}
              />
            </div>
          ) : null}

          {temResponsavel ? (
            <div className="mt-2">
              <AvatarNameBlock
                label="Responsável (usuário)"
                name={item.ownerUserName!}
                imageUrl={item.ownerUserAvatarUrl}
              />
            </div>
          ) : null}
        </>
      )}

      {item.linkContrato?.trim() &&
      isContractFlowStage &&
      item.etapa !== "contrato_enviado" &&
      item.etapa !== "contrato_assinado" ? (
        <div className="mt-2 flex flex-col gap-1 border-t border-primary-dark/10 pt-2">
          <a
            href={item.linkContrato.trim()}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full cursor-pointer items-center gap-1 text-[11px] font-semibold text-accent-teal underline-offset-2 hover:underline"
            title={item.linkContrato.trim()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">Abrir contrato</span>
          </a>
        </div>
      ) : null}

      {item.etapa === "confeccao_contrato" && !item.contractReviewSummary ? (
        <div className="mt-2 rounded-lg border border-dashed border-primary-dark/15 bg-white/60 px-2 py-2 text-[10px] font-medium text-primary-dark/75">
          <p className="text-[11px] font-semibold text-primary-dark/80">Revisão Societário</p>
          <p className="mt-1">Salve o contrato no builder com prazo de revisão para liberar o envio.</p>
        </div>
      ) : null}

      {showContractReviewDetails && item.contractReviewSummary ? (
        <div
          className={cn(
            "mt-2 rounded-lg border px-2 py-2 text-[10px] font-medium",
            item.contractReviewSummary.status === "concluido"
              ? "border-emerald-300/50 bg-emerald-50/70 text-emerald-950/85"
              : item.contractReviewSummary.status === "em_revisao"
                ? "border-amber-300/50 bg-amber-50/70 text-amber-950/85"
                : "border-primary-dark/10 bg-white/70 text-primary-dark/85",
          )}
        >
          <p className="text-[11px] font-semibold text-primary-dark/80">Revisão Societário</p>
          <div className="mt-1 space-y-1">
            {item.contractReviewSummary.status === "pendente" ? (
              <p className="inline-flex items-center gap-1.5">
                <Clock className="h-3 w-3 shrink-0 text-amber-600" aria-hidden />
                <span>
                  Aguardando início
                  {item.contractReviewSummary.prazoRevisao ? (
                    <>
                      {" "}
                      — prazo{" "}
                      <span className="font-bold">
                        {formatDateYmdBr(item.contractReviewSummary.prazoRevisao)}
                      </span>
                    </>
                  ) : null}
                </span>
              </p>
            ) : null}
            {item.contractReviewSummary.status === "em_revisao" ? (
              <p className="inline-flex items-center gap-1.5">
                <PenLine className="h-3 w-3 shrink-0 text-amber-700" aria-hidden />
                <span>
                  Em revisão
                  {item.contractReviewSummary.prazoRevisao ? (
                    <>
                      {" "}
                      — prazo{" "}
                      <span className="font-bold">
                        {formatDateYmdBr(item.contractReviewSummary.prazoRevisao)}
                      </span>
                    </>
                  ) : null}
                </span>
              </p>
            ) : null}
            {item.contractReviewSummary.status === "concluido" ? (
              <>
                <p className="inline-flex items-center gap-1.5 font-semibold text-emerald-800">
                  <Check className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden />
                  Revisão aprovada
                  {item.contractReviewSummary.concluidoEm ? (
                    <>
                      {" "}
                      em{" "}
                      <span className="font-bold">
                        {formatDateTimeBr(item.contractReviewSummary.concluidoEm)}
                      </span>
                    </>
                  ) : null}
                </p>
                {item.etapa === "contrato_elaborado" ? (
                  <p className="inline-flex items-center gap-1.5 text-emerald-900/85">
                    <Send className="h-3 w-3 shrink-0" aria-hidden />
                    Pronto para envio à D4Sign
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {showContractSentSummary ? (
        <div className="mt-2 rounded-lg border border-sky-300/45 bg-sky-50/75 px-2 py-2 text-[10px] font-medium text-primary-dark/85">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] font-semibold text-sky-950/85">Contrato enviado</p>
            {contractSigners ? (
              <span
                className={cn(
                  "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums",
                  contractSignedCount === contractTotalSigners
                    ? "bg-emerald-500/20 text-emerald-900"
                    : "bg-amber-500/20 text-amber-950",
                )}
              >
                {contractSignedCount}/{contractTotalSigners} assinaram
              </span>
            ) : null}
          </div>
          {contractSentAt ? (
            <p className="mt-1">
              <span className="font-bold">Enviado:</span> {formatDateTimeBr(contractSentAt)}
            </p>
          ) : null}
          {contractSigners && contractSignedCount < contractTotalSigners ? (
            <p className="mt-1 text-amber-900/85">
              Falta assinar:{" "}
              {contractSigners
                .filter((s) => !s.signed)
                .map((s) => signerDisplayLabel(s))
                .join(", ")}
            </p>
          ) : null}
          {contractSigners && contractSignedCount > 0 ? (
            <p className="mt-0.5 text-emerald-900/85">
              Assinaram:{" "}
              {contractSigners
                .filter((s) => s.signed)
                .map((s) => signerDisplayLabel(s))
                .join(", ")}
            </p>
          ) : null}
          {item.linkContrato?.trim() ? (
            <a
              href={item.linkContrato.trim()}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-flex max-w-full cursor-pointer items-center gap-1 text-[10px] font-semibold text-accent-teal underline-offset-2 hover:underline"
              title={item.linkContrato.trim()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
              <span className="min-w-0 truncate">Abrir contrato</span>
            </a>
          ) : null}
        </div>
      ) : null}

      {contractSigners ? (
        <div onPointerDown={(e) => e.stopPropagation()}>
          <details
            className={cn(
              "due-kanban-details mt-2 rounded-lg border open:bg-white/90",
              item.etapa === "contrato_assinado"
                ? "border-emerald-300/50 bg-emerald-50/70"
                : "border-primary-dark/10 bg-white/70",
            )}
            open={item.etapa === "contrato_assinado" ? true : undefined}
          >
            <summary
              className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-primary-dark/75 outline-none transition-colors hover:bg-primary-dark/[0.04] [&::-webkit-details-marker]:hidden"
              title="Ver status dos signatários"
            >
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <ChevronDown
                  className="due-kanban-chevron h-3.5 w-3.5 shrink-0 text-primary-dark/45 transition-transform duration-200"
                  aria-hidden
                />
                <span className="truncate">
                  {item.etapa === "contrato_assinado" ? "Assinaturas concluídas" : "Detalhe dos signatários"}
                </span>
              </span>
              <span className="shrink-0 tabular-nums">
                {contractSignedCount}/{contractTotalSigners}
              </span>
            </summary>
            {item.etapa === "contrato_assinado" && contractFullySignedAt ? (
              <p className="border-t border-emerald-300/40 px-2 pt-2 text-[10px] font-semibold text-emerald-900/85">
                Finalizado em {formatDateTimeBr(contractFullySignedAt)}
              </p>
            ) : null}
            <ul className="space-y-1.5 border-t border-primary-dark/10 px-2 pb-2.5 pt-2">
              {contractSigners.map((s) => {
                const role = signerRoleLabel(s.role);
                return (
                  <li
                    key={s.email}
                    className="flex items-start gap-2 text-[10px] font-medium leading-snug text-primary-dark/85"
                  >
                    <span className="mt-0.5 shrink-0" aria-hidden>
                      {s.signed ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
                      ) : (
                        <Clock className="h-3.5 w-3.5 text-amber-600" strokeWidth={2.5} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-primary-dark">
                        {signerDisplayLabel(s)}
                      </span>
                      {role ? (
                        <span className="block text-[9px] font-semibold uppercase tracking-wide text-primary-dark/50">
                          {role}
                        </span>
                      ) : null}
                      <span className="block truncate text-primary-dark/60">{s.email}</span>
                      {s.signed && s.signed_at ? (
                        <span className="text-emerald-900/80">
                          Assinou em {formatDateTimeBr(s.signed_at)}
                        </span>
                      ) : (
                        <span className="text-amber-800/80">Aguardando assinatura</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            {contractSignedCount === contractTotalSigners ? (
              <p className="border-t border-primary-dark/10 px-2 pb-2 text-[10px] font-bold text-emerald-700">
                Todos assinaram
              </p>
            ) : (
              <p className="border-t border-primary-dark/10 px-2 pb-2 text-[10px] font-bold text-amber-700">
                Aguardando {contractTotalSigners - contractSignedCount} signatário(s)
              </p>
            )}
            {item.etapa === "contrato_assinado" && item.linkContrato?.trim() ? (
              <div className="border-t border-emerald-300/40 px-2 pb-2 pt-1">
                <a
                  href={item.linkContrato.trim()}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full cursor-pointer items-center gap-1 text-[10px] font-semibold text-accent-teal underline-offset-2 hover:underline"
                  title={item.linkContrato.trim()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <FileCheck className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="min-w-0 truncate">Ver contrato assinado</span>
                </a>
              </div>
            ) : null}
          </details>
        </div>
      ) : null}

      {showDueLevantamentoDetails ? (
        <div onPointerDown={(e) => e.stopPropagation()}>
          <details className="due-kanban-details mt-2 rounded-lg border border-primary-dark/10 bg-white/70 open:bg-white/90">
            <summary
              className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-primary-dark/75 outline-none transition-colors hover:bg-primary-dark/[0.04] [&::-webkit-details-marker]:hidden"
              title="Abrir ou fechar o detalhe por área"
            >
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <ChevronDown
                  className="due-kanban-chevron h-3.5 w-3.5 shrink-0 text-primary-dark/45 transition-transform duration-200"
                  aria-hidden
                />
                <span className="truncate">Levantamento DUE</span>
              </span>
              <span className="shrink-0 tabular-nums">
                {item.dueAreaTasksSummary?.disponibilizados}/{item.dueAreaTasksSummary?.total}
              </span>
            </summary>
            {item.dueAreaTasksBreakdown && item.dueAreaTasksBreakdown.length > 0 ? (
              <ul className="space-y-1.5 border-t border-primary-dark/10 px-2 pb-2.5 pt-2">
                {item.dueAreaTasksBreakdown.map((row) => (
                  <li
                    key={row.areaKey}
                    className="flex items-start gap-2 text-[10px] font-medium leading-snug text-primary-dark/85"
                  >
                    <span className="mt-0.5 shrink-0" aria-hidden>
                      {row.entregue ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
                      ) : row.emAtraso ? (
                        <AlertCircle className="h-3.5 w-3.5 text-rose-600" strokeWidth={2.5} />
                      ) : (
                        <Clock className="h-3.5 w-3.5 text-amber-600" strokeWidth={2.5} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-bold text-primary-dark">{row.areaKey}</span>
                      {row.entregue ? (
                        <span className="text-emerald-900/85">
                          {" "}
                          — concluída
                          {row.semProcessosAtivos ? (
                            <span className="font-normal text-primary-dark/65"> (sem proc. ativos)</span>
                          ) : null}
                        </span>
                      ) : row.emAtraso ? (
                        <span className="text-rose-900/85"> — em atraso</span>
                      ) : (
                        <span className="text-amber-950/80"> — pendente</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {(item.dueAreaTasksSummary?.atrasados ?? 0) > 0 ? (
              <p className="border-t border-primary-dark/10 px-2 pb-2 text-[10px] font-bold text-rose-700">
                {item.dueAreaTasksSummary?.atrasados} área(s) em atraso
              </p>
            ) : null}
          </details>
        </div>
      ) : null}

      {showMeetingInfo ? (
        <div className="mt-2 rounded-lg border border-primary-dark/10 bg-white/70 px-2 py-2 text-[10px] font-medium text-primary-dark/85">
          <p className="text-[11px] font-semibold text-primary-dark/75">Dados da reunião</p>
          <div className="mt-1 space-y-1">
            <p>
              <span className="font-bold">Local:</span> {item.localReuniao?.trim() || "Não definido"}
            </p>
            <p>
              <span className="font-bold">Data:</span> {meetingDateDisplay}
            </p>
            <p>
              <span className="font-bold">Horário:</span>{" "}
              {item.horarioReuniao?.trim() || "Não definido"}
            </p>
          </div>
        </div>
      ) : null}

      {showPropostaEscopoDetails ? (
        <div onPointerDown={(e) => e.stopPropagation()}>
          <details className="due-kanban-details mt-2 rounded-lg border border-primary-dark/10 bg-white/70 open:bg-white/90">
            <summary
              className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-primary-dark/75 outline-none transition-colors hover:bg-primary-dark/[0.04] [&::-webkit-details-marker]:hidden"
              title="Abrir ou fechar o detalhe por área"
            >
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <ChevronDown
                  className="due-kanban-chevron h-3.5 w-3.5 shrink-0 text-primary-dark/45 transition-transform duration-200"
                  aria-hidden
                />
                <span className="truncate">Escopo por área</span>
              </span>
              <span className="shrink-0 tabular-nums">
                {item.propostaEscopoSummary!.concluido}/{item.propostaEscopoSummary!.total}
              </span>
            </summary>
            {item.propostaEscopoBreakdown && item.propostaEscopoBreakdown.length > 0 ? (
              <ul className="space-y-1.5 border-t border-primary-dark/10 px-2 pb-2.5 pt-2">
                {item.propostaEscopoBreakdown.map((row) => (
                  <li
                    key={row.areaKey}
                    className="flex items-start gap-2 text-[10px] font-medium leading-snug text-primary-dark/85"
                  >
                    <span className="mt-0.5 shrink-0" aria-hidden>
                      {row.concluido ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
                      ) : (
                        <Clock className="h-3.5 w-3.5 text-amber-600" strokeWidth={2.5} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-bold text-primary-dark">{row.areaKey}</span>
                      {row.concluido ? (
                        <span className="text-emerald-900/85"> — dados enviados</span>
                      ) : (
                        <span className="text-amber-950/80"> — aguardando envio</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {item.propostaEscopoSummary!.pendente > 0 ? (
              <p className="border-t border-primary-dark/10 px-2 pb-2 text-[10px] font-bold text-amber-700">
                {item.propostaEscopoSummary!.pendente} área(s) pendente(s) de envio para elaboração
              </p>
            ) : (
              <p className="border-t border-primary-dark/10 px-2 pb-2 text-[10px] font-bold text-emerald-700">
                Todas as áreas enviaram os dados para elaboração
              </p>
            )}
          </details>
        </div>
      ) : null}

      {hasCompilacaoAdjustments ? (
        <div onPointerDown={(e) => e.stopPropagation()}>
          <details className="due-kanban-details mt-2 rounded-lg border border-amber-300/60 bg-amber-50/70 open:bg-amber-50/90">
            <summary
              className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-amber-900/80 outline-none transition-colors hover:bg-amber-100/70 [&::-webkit-details-marker]:hidden"
              title="Abrir ou fechar os ajustes solicitados"
            >
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <ChevronDown
                  className="due-kanban-chevron h-3.5 w-3.5 shrink-0 text-amber-900/55 transition-transform duration-200"
                  aria-hidden
                />
                <span className="truncate">Ajustes da revisão</span>
              </span>
              <span className="shrink-0 tabular-nums">
                {compilacaoAdjustmentsCompleted}/{compilacaoAdjustmentsTotal}
              </span>
            </summary>
            <ul className="space-y-1.5 border-t border-amber-300/40 px-2 pb-2.5 pt-2">
              {item.dueReviewAdjustments!.map((row) => (
                <li
                  key={`${row.areaKey}-${row.respondedAt ?? "sem-data"}`}
                  className="flex items-start gap-2 text-[10px] font-medium leading-snug text-amber-950/85"
                >
                  <span className="mt-0.5 shrink-0" aria-hidden>
                    {row.adjustmentCompletedAt ? (
                      <Check className="h-3.5 w-3.5 text-emerald-700" strokeWidth={2.5} />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-amber-700" strokeWidth={2.5} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-bold text-amber-950">{row.areaKey}</span>
                    {row.adjustmentCompletedAt ? (
                      <span className="text-emerald-800/90"> — ajuste concluído</span>
                    ) : (
                      <span className="text-amber-950/85"> — solicitou ajustes</span>
                    )}
                    {row.observacaoAjustes ? (
                      <span className="block pt-0.5 font-normal text-amber-900/85">
                        {row.observacaoAjustes}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
            <p className="border-t border-amber-300/40 px-2 pb-2 text-[10px] font-bold text-amber-800">
              {compilacaoAdjustmentsCompleted === compilacaoAdjustmentsTotal
                ? "Todos os ajustes concluídos. Pode retornar para Revisão."
                : "Conclua os ajustes pendentes para voltar à Revisão."}
            </p>
          </details>
        </div>
      ) : null}

      {item.haveraDueDiligence &&
      item.etapa === "revisao" &&
      item.dueAreaReviewSummary?.total ? (
        <div onPointerDown={(e) => e.stopPropagation()}>
          <details className="due-kanban-details mt-2 rounded-lg border border-primary-dark/10 bg-white/70 open:bg-white/90">
            <summary
              className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-primary-dark/75 outline-none transition-colors hover:bg-primary-dark/[0.04] [&::-webkit-details-marker]:hidden"
              title="Abrir ou fechar o detalhe por área"
            >
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <ChevronDown
                  className="due-kanban-chevron h-3.5 w-3.5 shrink-0 text-primary-dark/45 transition-transform duration-200"
                  aria-hidden
                />
                <span className="truncate">Revisão DUE</span>
              </span>
              <span className="shrink-0 tabular-nums">
                {item.dueAreaReviewSummary.reviewed}/{item.dueAreaReviewSummary.total}
              </span>
            </summary>
            {item.dueAreaReviewBreakdown && item.dueAreaReviewBreakdown.length > 0 ? (
              <ul className="space-y-1.5 border-t border-primary-dark/10 px-2 pb-2.5 pt-2">
                {item.dueAreaReviewBreakdown.map((row) => (
                  <li
                    key={row.areaKey}
                    className="flex items-start gap-2 text-[10px] font-medium leading-snug text-primary-dark/85"
                  >
                    <span className="mt-0.5 shrink-0" aria-hidden>
                      {row.reviewed ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
                      ) : (
                        <Clock className="h-3.5 w-3.5 text-amber-600" strokeWidth={2.5} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-bold text-primary-dark">{row.areaKey}</span>
                      {row.reviewed ? (
                        <span className="text-emerald-900/85">
                          {" "}
                          — revisada
                          {row.requestedAdjustments ? (
                            <span className="font-normal text-primary-dark/65"> (com ajustes)</span>
                          ) : (
                            <span className="font-normal text-primary-dark/65"> (ok)</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-amber-950/80"> — pendente de revisão</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {item.dueAreaReviewSummary.pending > 0 ? (
              <p className="border-t border-primary-dark/10 px-2 pb-2 text-[10px] font-bold text-amber-700">
                {item.dueAreaReviewSummary.pending} área(s) ainda sem revisão
              </p>
            ) : (
              <p className="border-t border-primary-dark/10 px-2 pb-2 text-[10px] font-bold text-emerald-700">
                Todas as áreas revisaram
              </p>
            )}
          </details>
        </div>
      ) : null}

      {item.etapa === "confeccao_contrato" ? (
        <Link
          href={`/crm/leads/${encodeURIComponent(item.id)}`}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg",
            "border border-accent-teal/40 bg-accent-teal/10 px-3 py-1.5",
            "text-[11px] font-bold text-teal-800 transition-colors",
            "hover:bg-accent-teal/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal/40",
          )}
        >
          <PenLine className="h-3 w-3 shrink-0" aria-hidden />
          Elaborar contrato
        </Link>
      ) : null}

      {situacaoComercial === "perdidas" && motivoPerda ? (
        <div className="mt-2 flex w-full min-w-0 items-center justify-between gap-2">
          <div className="min-w-0 shrink-0">
            <DaysInStagePanel item={item} compact={daysCompact} />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-rose-300/60 bg-rose-100/70 text-rose-900",
                  "transition-colors hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/60 focus-visible:ring-offset-1",
                )}
                aria-label="Ver motivo da perda"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <CircleHelp className="h-3.5 w-3.5" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" align="end" className="max-w-[300px] p-0">
              <LossReasonTooltipBody motivo={motivoPerda} />
            </TooltipContent>
          </Tooltip>
        </div>
      ) : (
        <DaysInStagePanel item={item} className="mt-2" compact={daysCompact} />
      )}
    </>
  );
}
