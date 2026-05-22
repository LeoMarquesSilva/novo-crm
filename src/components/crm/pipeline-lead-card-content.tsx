"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  CircleHelp,
  ExternalLink,
  Send,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { DaysInStagePanel } from "@/components/crm/days-in-stage-panel";
import { ContractSignersKanbanPanel } from "@/components/crm/contract-signers-kanban-panel";
import {
  MeetingKanbanPanel,
  PropostaEscopoKanbanPanel,
  PropostaEnviadaKanbanPanel,
  ContractReviewKanbanPanel,
  DueLevantamentoKanbanPanel,
  DueRevisaoKanbanPanel,
  DueCompilacaoAdjustmentsKanbanPanel,
} from "@/components/crm/pipeline-stage-panels";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SignerAppUserLookup } from "@/lib/crm/signer-avatar-catalog";
import { isRdKanbanViewOnlyLead } from "@/lib/crm/rd-kanban-view";
import { OPPORTUNITY_STAGE_LABELS } from "@/lib/crm/stage-labels";
import { getLeadPipelineSituation } from "@/modules/crm/application/lead-pipeline-situation";
import type { DemandType, Oportunidade } from "@/modules/crm/domain/entities";
import { formatDateTimeBr } from "@/lib/format-datetime";
import {
  latestSignerSignedAt,
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
  appUsersByEmail?: SignerAppUserLookup;
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

const TIPO_DEMANDA_LABEL: Record<DemandType, string> = {
  novo_lead: "Novo lead",
  novo_contrato: "Novo contrato",
  aditivo: "Aditivo",
};

/** Card enxuto para negociações espelhadas do RD — sem painéis operacionais do CRM. */
function PipelineRdLeadCardContent({
  item,
  daysCompact,
  showOpenLink,
}: PipelineLeadCardContentProps) {
  const situacaoComercial = getLeadPipelineSituation(item);
  const rdNome = item.solicitanteRd?.trim();
  const showRdNome =
    rdNome && rdNome.toLowerCase() !== item.solicitante.trim().toLowerCase();

  return (
    <>
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span
          className="inline-flex items-center rounded-full border border-orange-300/50 bg-orange-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-orange-900"
          title="Sincronizado do RD Station — somente visualização no kanban"
        >
          RD Station
        </span>
        {situacaoComercial === "vendidas" ? (
          <span className="inline-flex items-center rounded-full border border-emerald-600/35 bg-emerald-500/18 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-950">
            Vendida
          </span>
        ) : null}
        {situacaoComercial === "perdidas" ? (
          <span className="inline-flex items-center rounded-full border border-rose-400/45 bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-950">
            Perdida
          </span>
        ) : null}
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            Negociação (RD)
          </p>
          <p className="mt-0.5 text-[13px] font-extrabold leading-snug tracking-[-0.03em] text-primary-dark">
            {item.solicitante}
          </p>
        </div>
        {showOpenLink ? (
          <Link
            href={`/crm/leads/${encodeURIComponent(item.id)}`}
            className={cn(
              "mt-0.5 inline-flex shrink-0 rounded-md p-1 text-muted-foreground transition-colors",
              "hover:bg-primary-dark/10 hover:text-primary-dark",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark/35 focus-visible:ring-offset-1",
            )}
            title="Ver ficha (dados do RD)"
            aria-label="Ver ficha (dados do RD)"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </Link>
        ) : null}
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-primary-dark/80">
          {OPPORTUNITY_STAGE_LABELS[item.etapa] ?? item.etapa}
        </span>
        <span className="text-muted-foreground"> · {TIPO_DEMANDA_LABEL[item.tipo]}</span>
      </p>

      {showRdNome ? (
        <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
          Solicitante RD: <span className="font-medium text-primary-dark/85">{rdNome}</span>
        </p>
      ) : null}

      {item.ownerUserName?.trim() ? (
        <div className="mt-2">
          <AvatarNameBlock
            label="Responsável (mapeado)"
            name={item.ownerUserName}
            imageUrl={item.ownerUserAvatarUrl}
          />
        </div>
      ) : null}

      {situacaoComercial === "perdidas" && item.motivoPerda?.trim() ? (
        <p className="mt-2 text-[11px] leading-snug text-rose-900/90">
          Motivo: {item.motivoPerda.trim()}
        </p>
      ) : null}

      <DaysInStagePanel item={item} className="mt-2" compact={daysCompact} />

      <p className="mt-2 text-[10px] leading-snug text-orange-900/75">
        Somente visualização — etapa e operação no RD Station.
      </p>
    </>
  );
}

export function PipelineLeadCardContent({
  item,
  daysCompact,
  showOpenLink,
  appUsersByEmail,
}: PipelineLeadCardContentProps) {
  if (isRdKanbanViewOnlyLead(item)) {
    return (
      <PipelineRdLeadCardContent
        item={item}
        daysCompact={daysCompact}
        showOpenLink={showOpenLink}
      />
    );
  }

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
  const showMeetingInfo = item.etapa === "reuniao";
  const showPropostaEscopoDetails =
    item.etapa === "confeccao_proposta" && Boolean(item.propostaEscopoSummary?.total);
  const showPropostaEnviadaPanel = item.etapa === "proposta_enviada";
  const showContractElaborationPanel =
    item.etapa === "confeccao_contrato" || item.etapa === "contrato_elaborado";
  const contractSigners =
    (item.etapa === "contrato_enviado" || item.etapa === "contrato_assinado") &&
    Array.isArray(item.d4signSigners) &&
    item.d4signSigners.length > 0
      ? item.d4signSigners
      : null;
  const contractSentAt = item.d4signUpdatedAt?.trim() || null;
  const contractFullySignedAt =
    item.etapa === "contrato_assinado"
      ? latestSignerSignedAt(contractSigners ?? []) ?? contractSentAt
      : null;
  const showContractSentSummary =
    item.etapa === "contrato_enviado" &&
    (Boolean(contractSigners) || Boolean(contractSentAt) || Boolean(item.linkContrato?.trim()));
  const showContractSignersPanel =
    Boolean(contractSigners?.length) &&
    (item.etapa === "contrato_enviado" || item.etapa === "contrato_assinado");
  const showContractSentOnlySummary =
    showContractSentSummary && !contractSigners?.length;
  const showBadgesRow = situacaoComercial !== "em_andamento" || Boolean(item.origemRd);
  const perdidaTooltip = item.motivoPerda?.trim()
    ? `Negociação marcada como perdida. Motivo: ${item.motivoPerda.trim()}`
    : "Negociação marcada como perdida";
  const motivoPerda = item.motivoPerda?.trim() ?? "";

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

      {showDueLevantamentoDetails && item.dueAreaTasksSummary ? (
        <DueLevantamentoKanbanPanel
          summary={item.dueAreaTasksSummary}
          breakdown={item.dueAreaTasksBreakdown}
        />
      ) : null}

      {showMeetingInfo ? <MeetingKanbanPanel item={item} /> : null}

      {showPropostaEscopoDetails && item.propostaEscopoSummary ? (
        <PropostaEscopoKanbanPanel
          summary={item.propostaEscopoSummary}
          breakdown={item.propostaEscopoBreakdown}
          linkProposta={item.linkProposta}
        />
      ) : null}

      {showPropostaEnviadaPanel ? (
        <PropostaEnviadaKanbanPanel linkProposta={item.linkProposta} />
      ) : null}

      {showContractElaborationPanel ? (
        <ContractReviewKanbanPanel
          leadId={item.id}
          etapa={item.etapa === "contrato_elaborado" ? "contrato_elaborado" : "confeccao_contrato"}
          review={item.contractReviewSummary}
          linkContrato={item.linkContrato}
        />
      ) : null}

      {showContractSignersPanel && contractSigners ? (
        <ContractSignersKanbanPanel
          signers={contractSigners}
          sentAt={contractSentAt}
          finalizedAt={contractFullySignedAt}
          linkContrato={item.linkContrato}
          variant={item.etapa === "contrato_assinado" ? "completed" : "pending"}
          appUsersByEmail={appUsersByEmail}
        />
      ) : null}

      {showContractSentOnlySummary ? (
        <div
          className="mt-2 overflow-hidden rounded-xl border border-sky-300/50 bg-gradient-to-b from-sky-50/90 to-white/80 px-2.5 py-2 text-[10px] font-medium text-primary-dark/85 shadow-sm shadow-primary-dark/[0.03]"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-sky-200/80 bg-sky-500/10 text-sky-800">
              <Send className="h-3.5 w-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold tracking-tight text-primary-dark">Contrato enviado</p>
              {contractSentAt ? (
                <p className="mt-0.5 text-[9px] font-medium text-primary-dark/55">
                  {formatDateTimeBr(contractSentAt)}
                </p>
              ) : (
                <p className="mt-0.5 text-[9px] font-medium text-primary-dark/55">
                  Aguardando dados dos signatários
                </p>
              )}
              {item.linkContrato?.trim() ? (
                <a
                  href={item.linkContrato.trim()}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-accent-teal underline-offset-2 hover:underline"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                  Abrir contrato
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {hasCompilacaoAdjustments && item.dueReviewAdjustments ? (
        <DueCompilacaoAdjustmentsKanbanPanel adjustments={item.dueReviewAdjustments} />
      ) : null}

      {item.haveraDueDiligence &&
      item.etapa === "revisao" &&
      item.dueAreaReviewSummary?.total ? (
        <DueRevisaoKanbanPanel
          summary={item.dueAreaReviewSummary}
          breakdown={item.dueAreaReviewBreakdown}
        />
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
