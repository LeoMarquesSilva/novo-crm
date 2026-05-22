"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileSignature,
  FileText,
  History,
  Layers3,
  LinkIcon,
  ListChecks,
  Mail,
  MessageSquareText,
  PencilLine,
  Presentation,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { OPPORTUNITY_STAGE_LABELS } from "@/lib/crm/stage-labels";
import { getStageIcon } from "@/lib/crm/stage-icons";
import {
  isCadastroLeadOnlyStage,
  isPosVendaPipelineStage,
  POS_VENDA_PIPELINE_COLUMNS,
  SALES_PIPELINE_COLUMNS,
} from "@/lib/crm/pipeline-board-config";
import { initialsFromFullName } from "@/lib/crm/resolve-app-user-display";
import { formatDateTimeBr } from "@/lib/format-datetime";
import { getDueAreaTaskStatus, type DueAreaTaskStatus } from "@/lib/crm/due-area-task-status";
import { isDueAreaTaskDelivered } from "@/lib/crm/due-area-tasks";
import { resolveRdFieldEditor } from "@/lib/crm/lead-rd-field-editor-map";
import { resolvePropostaEmpresaPrincipalNome } from "@/lib/crm/proposta-empresa-principal";
import { getEscopoEntriesForArea, isEscopoAreaComplete } from "@/lib/crm/proposta-escopo-entry";
import { parseEscopoJson, syncEscopoToAreas } from "@/lib/crm/proposta-escopo-json";
import { cn } from "@/lib/utils";
import { useLeadDetailRealtime } from "@/lib/crm/use-lead-detail-realtime";
import { leadAreas } from "@/modules/crm/application/services/new-lead-payload";
import type { LeadDetailData, LeadDetailViewer } from "./page";
import { LeadD4SignPanel } from "./lead-d4sign-panel";
import { LeadDeleteButton } from "./lead-delete-button";
import { LeadAddEmpresaButton } from "./lead-add-empresa-button";
import { LeadIntakeEmpresaBlock } from "./lead-intake-empresa-block";
import {
  LeadDetailFieldEditor,
  intakeFieldEditorKind,
  pipelineFieldToEditorProps,
} from "./lead-detail-field-editor";
import { PropostaDocumentBuilder } from "./proposta-document-builder";
import { ContratoDocumentBuilder } from "./contrato-document-builder";
import { LeadNotesTab } from "./lead-notes-tab";
import { LeadLifecycleTimelinePanel } from "@/components/crm/lead-lifecycle-timeline-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Renderizado à parte (JSON); não repetir como campo genérico. */
const HIDDEN_PIPELINE_CODES = new Set(["cp_escopo_detalhe_json"]);
const PROPOSAL_FIELD_ORDER = ["cp_qualificacao", "cp_areas_objeto", "cp_objeto_proposta"];
type LeadDetailTab = "overview" | "proposal" | "contract" | "due" | "crm" | "notes" | "signature" | "history";

export function LeadDetailView({
  lead,
  viewer,
  appUsersByEmail = {},
}: {
  lead: LeadDetailData | null;
  viewer: LeadDetailViewer | null;
  appUsersByEmail?: Record<string, { avatarUrl: string | null; fullName: string }>;
}) {
  if (lead == null) {
    notFound();
  }

  const propostaEmpresaPrincipalNome = resolvePropostaEmpresaPrincipalNome({
    empresasIntake: lead.empresasIntake,
    cpPropostaEmpresasJson: lead.pipelineFields.find((f) => f.fieldCode === "cp_proposta_empresas_json")?.value,
  });

  const etapaLabel = OPPORTUNITY_STAGE_LABELS[lead.etapa] ?? lead.etapa;
  const ddSimNao = lead.haveraDueDiligence ? "Sim" : "Não";
  const isProposalStage = lead.etapa === "confeccao_proposta";
  const isContractStage = lead.etapa === "confeccao_contrato";
  const isRdLead = Boolean(lead.rdDealId || lead.rdDealUrl || lead.filledFields.length > 0);
  const intakeLeadType = lead.intakeFields.find((field) => field.key === "tipo_lead")?.value?.trim();
  const leadTypeDisplay = intakeLeadType || lead.tipo.replace(/_/g, " ");
  const isCrossSellingLead = normalizeLeadType(leadTypeDisplay).includes("crossselling");
  const heroContextBadge =
    lead.encerramento === "ganho"
      ? ({ label: "Ganho", className: "border-emerald-400/35 bg-emerald-500/15 text-emerald-100" } as const)
      : lead.encerramento === "perdido"
        ? ({ label: "Perdido", className: "border-rose-400/35 bg-rose-500/15 text-rose-100" } as const)
        : lead.rdDealUrl
          ? ({ label: "Negociação no RD Station", className: "border-white/10 bg-white/10 text-white/80" } as const)
          : null;

  const proposalPipelineFields = isProposalStage
    ? [...lead.pipelineFields]
        .filter((f) => !HIDDEN_PIPELINE_CODES.has(f.fieldCode))
        .sort(
          (a, b) =>
            (PROPOSAL_FIELD_ORDER.indexOf(a.fieldCode) === -1 ? 999 : PROPOSAL_FIELD_ORDER.indexOf(a.fieldCode)) -
            (PROPOSAL_FIELD_ORDER.indexOf(b.fieldCode) === -1 ? 999 : PROPOSAL_FIELD_ORDER.indexOf(b.fieldCode)),
        )
    : [];

  const otherPipelineFields = isProposalStage
    ? []
    : lead.pipelineFields.filter((f) => !HIDDEN_PIPELINE_CODES.has(f.fieldCode));

  const escopoDetalheProposta = isProposalStage ? lead.escopoDetalhe : null;
  const proposalAreaField = proposalPipelineFields.find((field) => field.fieldCode === "cp_areas_objeto");
  const selectedAreas = proposalAreaField?.value
    .split(/[,;\n]/)
    .map((area) => area.trim())
    .filter(Boolean) ?? [];
  const escopoDetalheJson = syncEscopoToAreas(
    parseEscopoJson(escopoDetalheProposta?.value ?? ""),
    selectedAreas,
  );
  const completedAreaRequests = lead.escopoSolicitacoes?.filter((item) => item.concluidoEm).length ?? 0;
  const totalAreaRequests = lead.escopoSolicitacoes?.length ?? selectedAreas.length;
  const [activeTab, setActiveTab] = useState<LeadDetailTab>(
    isContractStage ? "contract" : isProposalStage ? "proposal" : "overview",
  );
  const router = useRouter();

  useLeadDetailRealtime(lead.id, () => router.refresh());

  useEffect(() => {
    if (!lead.haveraDueDiligence && activeTab === "due") {
      setActiveTab("overview");
    }
  }, [lead.haveraDueDiligence, activeTab]);

  const handleTabChange = (tab: LeadDetailTab) => {
    if (tab === "crm" && !isRdLead) {
      setActiveTab("overview");
      return;
    }
    if (tab === "due" && !lead.haveraDueDiligence) {
      setActiveTab("overview");
      return;
    }
    setActiveTab(tab);
  };

  const proposalScopeSummary = isProposalStage
    ? computeProposalScopeSummary(
        lead,
        selectedAreas,
        escopoDetalheJson,
        completedAreaRequests,
        totalAreaRequests,
      )
    : null;

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5">
      <LeadDetailHero
        lead={lead}
        etapaLabel={etapaLabel}
        leadTypeDisplay={leadTypeDisplay}
        ddSimNao={ddSimNao}
        heroContextBadge={heroContextBadge}
        propostaEmpresaPrincipalNome={propostaEmpresaPrincipalNome}
        proposalScopeSummary={proposalScopeSummary}
      />

      <main className="min-w-0">
          <Tabs
            value={activeTab}
            onValueChange={(value) => handleTabChange(value as LeadDetailTab)}
            className="gap-4"
          >
            <div className="overflow-x-auto rounded-[22px] border border-[#dfe5ee] bg-white p-2 shadow-sm">
              <TabsList className="h-auto min-w-max gap-1 bg-transparent p-0">
                <TabsTrigger value="overview" className="h-10 rounded-2xl px-4 text-sm font-bold">
                  Visão geral
                </TabsTrigger>
                {lead.haveraDueDiligence ? (
                  <TabsTrigger value="due" className="h-10 rounded-2xl px-4 text-sm font-bold">
                    Due diligence
                  </TabsTrigger>
                ) : null}
                <TabsTrigger value="proposal" className="h-10 rounded-2xl px-4 text-sm font-bold">
                  Proposta
                </TabsTrigger>
                {isContractStage ? (
                  <TabsTrigger value="contract" className="h-10 rounded-2xl px-4 text-sm font-bold">
                    Contrato
                  </TabsTrigger>
                ) : null}
                {isRdLead ? (
                  <TabsTrigger value="crm" className="h-10 rounded-2xl px-4 text-sm font-bold">
                    CRM / RD
                  </TabsTrigger>
                ) : null}
                <TabsTrigger value="signature" className="h-10 rounded-2xl px-4 text-sm font-bold">
                  Assinatura
                </TabsTrigger>
                <TabsTrigger value="history" className="h-10 rounded-2xl px-4 text-sm font-bold">
                  Histórico
                </TabsTrigger>
                <TabsTrigger value="notes" className="h-10 rounded-2xl px-4 text-sm font-bold">
                  Anotações
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="mt-4 space-y-5">
              <section id="resumo" className="scroll-mt-6">
                <Card className="glass-card-no-float border-[#dfe5ee] p-5 sm:p-6">
                  <CardHeader className="px-0 pt-0">
                    <SectionEyebrow icon={UserRound}>Resumo editável</SectionEyebrow>
                    <CardTitle className="text-xl font-extrabold tracking-[-0.035em] text-[#102033]">
                      Identificação e origem
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 px-0 pb-0 sm:grid-cols-2">
                    <ReadOnlyInfo label="Tipo de lead" value={leadTypeDisplay} />
                    <ReadOnlyInfo label="Etapa atual" value={etapaLabel} />
                    <LeadDetailFieldEditor
                      leadId={lead.id}
                      scope="intake"
                      fieldKey="solicitante_nome"
                      label="Nome no pipeline"
                      value={lead.solicitante}
                      kind="text"
                    />
                    <LeadDetailFieldEditor
                      leadId={lead.id}
                      scope="intake"
                      fieldKey="havera_due_diligence"
                      label="Due diligence"
                      value={ddSimNao}
                      kind="yesno"
                    />
                    {isCrossSellingLead ? (
                      lead.clienteId ? (
                        <ReadOnlyInfo label="Cliente vinculado" value={lead.clienteId} />
                      ) : (
                        <ReadOnlyInfo label="Cliente vinculado" value="Ainda sem cliente vinculado" muted />
                      )
                    ) : null}
                    <ReadOnlyInfo label="Criado em" value={formatDateTimeBr(lead.criadoEm)} />
                    <ReadOnlyInfo
                      label="Atualizado em"
                      value={lead.atualizadoEm ? formatDateTimeBr(lead.atualizadoEm) : "Sem atualização"}
                      muted={!lead.atualizadoEm}
                    />
                    {lead.rdDealUrl ? (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Negociação no RD</p>
                        <Link
                          href={lead.rdDealUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1.5 text-sm font-bold text-[#173a6a] underline underline-offset-2"
                        >
                          Abrir no RD Station
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    ) : isRdLead ? (
                      <ReadOnlyInfo label="Negociação no RD" value="Lead RD sem link disponível" muted />
                    ) : null}
                  </CardContent>
                </Card>
              </section>

              {lead.intakeFields.length > 0 || lead.empresasIntake.length > 0 ? (
                <section id="cadastro" className="scroll-mt-6">
                  <Card className="glass-card-no-float border-[#dfe5ee] p-5 sm:p-6">
                    <CardHeader className="px-0 pt-0">
                      <SectionEyebrow icon={BriefcaseBusiness}>Cadastro inicial</SectionEyebrow>
                      <CardTitle className="text-xl font-extrabold tracking-[-0.035em] text-[#102033]">
                        Dados enviados na abertura
                      </CardTitle>
                      <p className="mt-1 text-sm text-slate-500">
                        Dados salvos ao criar a demanda pelo formulário interno. Clique no lápis para ajustar.
                      </p>
                    </CardHeader>
                    <CardContent className="px-0 pb-0">
                      <div className="grid gap-3 sm:grid-cols-2">
                        {lead.intakeFields
                          .filter((field) => field.key !== "due_diligence_intake" && field.key !== "tipo_lead")
                          .map((field) => (
                            <LeadDetailFieldEditor
                              key={field.key}
                              leadId={lead.id}
                              scope="intake"
                              fieldKey={field.key}
                              label={field.label}
                              value={field.value}
                              kind={intakeFieldEditorKind(field.key)}
                              selectOptions={field.key === "areas_analise" ? [...leadAreas] : undefined}
                              resolvedUser={field.resolvedUser}
                              userIdentityMode={
                                field.key === "email_solicitante" || field.key === "cadastrado_por"
                                  ? "email"
                                  : "uuid"
                              }
                            />
                          ))}
                        {lead.empresasIntake.map((emp) => (
                          <LeadIntakeEmpresaBlock
                            key={`emp-${emp.index}`}
                            leadId={lead.id}
                            initial={emp}
                            canDelete={lead.empresasIntake.length > 1}
                          />
                        ))}
                      </div>
                      {lead.isSystemCreated ? (
                        <LeadAddEmpresaButton leadId={lead.id} className="mt-4 border-t border-[#dfe5ee] pt-4" />
                      ) : null}
                    </CardContent>
                  </Card>
                </section>
              ) : (
                <EmptyTabCard icon={BriefcaseBusiness} title="Sem cadastro inicial" description="Não há campos de abertura salvos para este lead." />
              )}
            </TabsContent>

            {lead.haveraDueDiligence ? (
              <TabsContent value="due" className="mt-4 space-y-5">
                <DueAreaTasksCard lead={lead} viewer={viewer} onUpdated={() => router.refresh()} />
                <DueCompilacaoSection lead={lead} viewer={viewer} onUpdated={() => router.refresh()} />
                <DueRevisaoSection lead={lead} viewer={viewer} onUpdated={() => router.refresh()} />
              </TabsContent>
            ) : null}

            <TabsContent value="proposal" className="mt-4 space-y-5">
              <section id="proposta" className="scroll-mt-6">
                {isProposalStage && proposalPipelineFields.length > 0 ? (
                  <PropostaDocumentBuilder
                    lead={lead}
                    viewer={viewer}
                    proposalPipelineFields={proposalPipelineFields}
                    escopoDetalhe={escopoDetalheProposta}
                    propostaEmpresaPrincipalNome={propostaEmpresaPrincipalNome}
                  />
                ) : null}

                {isProposalStage && proposalPipelineFields.length === 0 ? (
                  <Card className="glass-card-no-float border-[#dfe5ee] p-6">
                    <CardHeader className="px-0 pt-0">
                      <SectionEyebrow icon={FileText}>Documentos / Propostas</SectionEyebrow>
                      <CardTitle className="text-xl font-extrabold tracking-[-0.035em] text-[#102033]">
                        Proposta de serviços advocatícios
                      </CardTitle>
                      <p className="mt-1 text-sm text-slate-500">
                        Ainda não há campos de proposta salvos. Avance pelo pipeline para pré-preencher qualificações e escopo.
                      </p>
                    </CardHeader>
                  </Card>
                ) : null}

                {!isProposalStage ? (
                  <Card className="glass-card-no-float border-[#dfe5ee] p-6">
                    <CardHeader className="px-0 pt-0">
                      <SectionEyebrow icon={FileText}>Documentos / Propostas</SectionEyebrow>
                      <CardTitle className="text-xl font-extrabold tracking-[-0.035em] text-[#102033]">
                        Proposta ainda não habilitada
                      </CardTitle>
                      <p className="mt-1 text-sm text-slate-500">
                        Esta área fica disponível quando o lead entra na etapa de elaboração de proposta.
                      </p>
                    </CardHeader>
                  </Card>
                ) : null}
              </section>
            </TabsContent>

            {isContractStage ? (
              <TabsContent value="contract" className="mt-4 space-y-5">
                <section id="contrato" className="scroll-mt-6">
                  <ContratoDocumentBuilder
                    lead={lead}
                    propostaEmpresaPrincipalNome={propostaEmpresaPrincipalNome}
                    appUsersByEmail={appUsersByEmail}
                  />
                </section>
              </TabsContent>
            ) : null}

            {isRdLead ? (
            <TabsContent value="crm" className="mt-4 space-y-5">
              {otherPipelineFields.length > 0 ? (
                <section id="pipeline" className="scroll-mt-6">
                  <Card className="glass-card-no-float border-[#dfe5ee] p-5 sm:p-6">
                    <CardHeader className="px-0 pt-0">
                      <SectionEyebrow icon={Layers3}>Pipeline CRM</SectionEyebrow>
                      <CardTitle className="text-xl font-extrabold tracking-[-0.035em] text-[#102033]">
                        Campos da etapa atual
                      </CardTitle>
                      <p className="mt-1 text-sm text-slate-500">
                        Valores armazenados no CRM ao avançar etapas no quadro.
                      </p>
                    </CardHeader>
                    <CardContent className="px-0 pb-0">
                      <div className="grid gap-3 sm:grid-cols-2">
                        {otherPipelineFields.map((field) => {
                          const pe = pipelineFieldToEditorProps(field);
                          return (
                            <LeadDetailFieldEditor
                              key={field.definitionId}
                              leadId={lead.id}
                              scope="pipeline"
                              fieldDefinitionId={field.definitionId}
                              fieldKey={field.fieldCode}
                              label={field.label}
                              value={field.value}
                              kind={pe.kind}
                              selectOptions={pe.selectOptions}
                              resolvedUser={field.resolvedUser}
                            />
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </section>
              ) : null}

              <section id="rd" className="scroll-mt-6">
                <Card className="glass-card-no-float border-[#dfe5ee] p-5 sm:p-6">
                  <CardHeader className="px-0 pt-0">
                    <SectionEyebrow icon={ShieldCheck}>RD Station</SectionEyebrow>
                    <CardTitle className="text-xl font-extrabold tracking-[-0.035em] text-[#102033]">
                      Campos preenchidos no RD
                    </CardTitle>
                    <p className="mt-1 text-sm text-slate-500">
                      Snapshot dos custom fields da oportunidade na última sincronização. Ajustes no CRM sobrepõem a exibição.
                    </p>
                  </CardHeader>
                  <CardContent className="px-0 pb-0">
                    {lead.filledFields.length === 0 ? (
                      <p className="rounded-2xl border border-dashed border-[#dfe5ee] bg-white p-4 text-sm text-slate-500">
                        Nenhum campo mapeado preenchido para esta oportunidade.
                      </p>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {lead.filledFields.map((field) => {
                          const rd = resolveRdFieldEditor(field.key);
                          const opts =
                            rd.kind === "select" || rd.kind === "multiselect" ? [...rd.options] : undefined;
                          return (
                            <LeadDetailFieldEditor
                              key={field.key}
                              leadId={lead.id}
                              scope="rd"
                              fieldKey={field.key}
                              label={field.label}
                              value={field.value}
                              kind={rd.kind}
                              selectOptions={opts}
                              valueSource={field.valueSource}
                              resolvedUser={field.resolvedUser}
                            />
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </section>
            </TabsContent>
            ) : null}

            <TabsContent value="signature" className="mt-4 space-y-5">
              <D4SignDisclosure
                lead={lead}
                defaultOpen={!lead.d4signDocumentUuid && Boolean(lead.linkContrato)}
              />

              {lead.linkProposta || lead.linkContrato ? (
                <CrmLinksCard lead={lead} />
              ) : (
                <EmptyTabCard icon={LinkIcon} title="Sem links comerciais" description="Ainda não há link de proposta ou contrato salvo neste lead." />
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-4 space-y-5">
              <LeadLifecycleTimelinePanel timeline={lead.lifecycleTimeline} />
            </TabsContent>

            <TabsContent value="notes" className="mt-4 space-y-5">
              <LeadNotesTab leadId={lead.id} />
            </TabsContent>
          </Tabs>
      </main>
    </div>
  );
}

type ProposalScopeAreaStatus = {
  area: string;
  status: "complete" | "pending" | "overdue";
};

type ProposalScopeSummary = {
  scopeProgressLabel: string;
  pendingCount: number;
  areas: ProposalScopeAreaStatus[];
};

function normalizeAreaMatch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function areaKeyMatches(areaKey: string, areaLabel: string) {
  const key = normalizeAreaMatch(areaKey);
  const label = normalizeAreaMatch(areaLabel);
  return key === label || key.includes(label) || label.includes(key);
}

function computeProposalScopeSummary(
  lead: LeadDetailData,
  selectedAreas: string[],
  escopoDetalhe: ReturnType<typeof parseEscopoJson>,
  completedAreaRequests: number,
  totalAreaRequests: number,
): ProposalScopeSummary | null {
  if (selectedAreas.length === 0) return null;

  const nowIso = new Date().toISOString();
  const areaRows = selectedAreas.map((area) => {
    const request = lead.escopoSolicitacoes?.find((item) => areaKeyMatches(item.areaKey, area)) ?? null;
    const entries = getEscopoEntriesForArea(escopoDetalhe, area);
    const scopeComplete = isEscopoAreaComplete(area, entries);
    const completed = Boolean(request?.concluidoEm) || scopeComplete;
    const overdue = !completed && request?.prazoAte ? request.prazoAte < nowIso : false;
    const status: ProposalScopeAreaStatus["status"] = completed
      ? "complete"
      : overdue
        ? "overdue"
        : "pending";
    return { area, status };
  });

  const pendingCount = areaRows.filter((row) => row.status !== "complete").length;
  const completeCount = areaRows.filter((row) => row.status === "complete").length;
  const scopeProgressLabel =
    totalAreaRequests > 0
      ? `${Math.max(completedAreaRequests, completeCount)}/${totalAreaRequests}`
      : `${completeCount}/${areaRows.length}`;

  return { scopeProgressLabel, pendingCount, areas: areaRows };
}

function LeadDetailHero({
  lead,
  etapaLabel,
  leadTypeDisplay,
  ddSimNao,
  heroContextBadge,
  propostaEmpresaPrincipalNome,
  proposalScopeSummary,
}: {
  lead: LeadDetailData;
  etapaLabel: string;
  leadTypeDisplay: string;
  ddSimNao: string;
  heroContextBadge: { label: string; className: string } | null;
  propostaEmpresaPrincipalNome: string | null;
  proposalScopeSummary: ProposalScopeSummary | null;
}) {
  const StageIcon = getStageIcon(lead.etapa);
  const isPosVenda = isPosVendaPipelineStage(lead.etapa);
  const pipelineColumns = isPosVenda ? POS_VENDA_PIPELINE_COLUMNS : SALES_PIPELINE_COLUMNS;
  const stageIndex = pipelineColumns.findIndex((column) => column.stage === lead.etapa);
  const pipelineLabel = isPosVenda ? "Pós-venda" : isCadastroLeadOnlyStage(lead.etapa) ? "Pré-funil" : "Funil comercial";
  const pipelineProgress =
    stageIndex >= 0 ? Math.round(((stageIndex + 1) / pipelineColumns.length) * 100) : null;
  const pipelineStepLabel =
    stageIndex >= 0 ? `${stageIndex + 1}/${pipelineColumns.length}` : null;

  const cadastradoPor = lead.intakeFields.find((field) => field.key === "cadastrado_por");
  const areasAnalise = lead.intakeFields.find((field) => field.key === "areas_analise")?.value?.trim();
  const empresaLabel =
    propostaEmpresaPrincipalNome?.trim() ||
    lead.empresasIntake[0]?.razao_social?.trim() ||
    null;

  return (
    <section className="overflow-hidden rounded-[22px] border border-[#dfe5ee] bg-[#0b1724] text-white shadow-sm sm:rounded-[28px]">
      <div className="relative">
        <div className="absolute inset-0 bg-crm-gradient-dark opacity-90" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(45,200,183,0.22),transparent_50%),linear-gradient(180deg,rgba(4,13,22,0.2),rgba(4,13,22,0.95))]" />

        <div className="relative z-[1] px-4 py-4 sm:px-6 sm:py-5">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/crm/leads"
              className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/8 px-2.5 py-1.5 text-xs font-bold text-white/90 transition-colors hover:bg-white/14 sm:gap-2 sm:px-3 sm:text-sm"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              <span className="truncate">Voltar</span>
            </Link>
            <div className="flex shrink-0 items-center gap-2">
              {lead.rdDealUrl ? (
                <Link
                  href={lead.rdDealUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/8 px-2.5 py-1.5 text-xs font-bold text-white/90 transition-colors hover:bg-white/14 sm:px-3"
                >
                  <span className="hidden sm:inline">RD Station</span>
                  <span className="sm:hidden">RD</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              ) : null}
              {lead.isSystemCreated ? <LeadDeleteButton leadId={lead.id} variant="onDark" /> : null}
            </div>
          </div>

          {/* Identidade */}
          <div className="mt-4 flex flex-col gap-4 sm:mt-5 sm:flex-row sm:items-start sm:gap-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 sm:h-14 sm:w-14">
              <StageIcon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-accent-green/30 bg-accent-green/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-100">
                  {pipelineLabel}
                </span>
                {heroContextBadge ? (
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                      heroContextBadge.className,
                    )}
                  >
                    {heroContextBadge.label}
                  </span>
                ) : null}
              </div>
              <h1 className="mt-2 break-words text-2xl font-extrabold leading-tight tracking-[-0.04em] sm:text-3xl lg:text-[2rem]">
                {lead.solicitante}
              </h1>
              {(empresaLabel || lead.solicitanteEmail) ? (
                <div className="mt-2 flex flex-col gap-1.5 text-sm text-white/80 sm:flex-row sm:flex-wrap sm:gap-x-4">
                  {empresaLabel ? (
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                      <span className="truncate">{empresaLabel}</span>
                    </span>
                  ) : null}
                  {lead.solicitanteEmail ? (
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                      <span className="truncate">{lead.solicitanteEmail}</span>
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {/* Meta chips — scroll horizontal no mobile */}
          <div className="-mx-1 mt-4 overflow-x-auto px-1 pb-0.5 sm:mx-0 sm:overflow-visible sm:px-0">
            <div className="flex w-max min-w-full flex-wrap gap-2 sm:w-auto">
              <HeroMetaChip icon={StageIcon} label="Etapa" value={etapaLabel} accent="teal" />
              <HeroMetaChip icon={BriefcaseBusiness} label="Tipo" value={leadTypeDisplay} accent="gold" />
              <HeroMetaChip
                icon={ListChecks}
                label="DUE"
                value={ddSimNao}
                accent={lead.haveraDueDiligence ? "emerald" : "slate"}
              />
              {areasAnalise ? (
                <HeroMetaChip icon={Layers3} label="Áreas" value={areasAnalise} accent="slate" />
              ) : null}
              {proposalScopeSummary ? (
                <>
                  <HeroMetaChip
                    icon={FileText}
                    label="Escopos"
                    value={proposalScopeSummary.scopeProgressLabel}
                    accent={proposalScopeSummary.pendingCount > 0 ? "warn" : "emerald"}
                  />
                  {proposalScopeSummary.pendingCount > 0 ? (
                    <HeroMetaChip
                      icon={ListChecks}
                      label="Pendências"
                      value={String(proposalScopeSummary.pendingCount)}
                      accent="warn"
                    />
                  ) : null}
                </>
              ) : null}
            </div>
          </div>

          {proposalScopeSummary && proposalScopeSummary.areas.length > 0 ? (
            <div className="-mx-1 mt-2 overflow-x-auto px-1 pb-0.5 sm:mx-0 sm:px-0">
              <div className="flex w-max gap-1.5 sm:flex-wrap sm:w-auto">
                {proposalScopeSummary.areas.map(({ area, status }) => (
                  <span
                    key={area}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                      status === "complete" && "border-emerald-400/30 bg-emerald-400/12 text-emerald-50",
                      status === "pending" && "border-amber-400/30 bg-amber-400/12 text-amber-50",
                      status === "overdue" && "border-rose-400/35 bg-rose-400/12 text-rose-50",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        status === "complete" && "bg-emerald-300",
                        status === "pending" && "bg-amber-300",
                        status === "overdue" && "bg-rose-300",
                      )}
                    />
                    {area}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Rodapé: pessoa + datas + progresso */}
          <div className="mt-4 space-y-3 border-t border-white/10 pt-4 sm:mt-5">
            <div
              className={cn(
                "flex flex-col gap-3 sm:flex-row sm:items-center",
                cadastradoPor?.resolvedUser ? "sm:justify-between" : "",
              )}
            >
              {cadastradoPor?.resolvedUser ? (
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar className="h-8 w-8 border border-white/15">
                    {cadastradoPor.resolvedUser.avatarUrl ? (
                      <AvatarImage src={cadastradoPor.resolvedUser.avatarUrl} alt="" className="object-cover" />
                    ) : null}
                    <AvatarFallback className="bg-white/15 text-[10px] font-bold text-white">
                      {initialsFromFullName(cadastradoPor.resolvedUser.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">Cadastrado por</p>
                    <p className="truncate text-sm font-semibold">{cadastradoPor.resolvedUser.fullName}</p>
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/50 sm:text-xs">
                <span>Criado {formatDateTimeBr(lead.criadoEm)}</span>
                {lead.atualizadoEm ? <span>Atualizado {formatDateTimeBr(lead.atualizadoEm)}</span> : null}
              </div>
            </div>

            {pipelineProgress != null ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[11px] sm:text-xs">
                  <span className="truncate font-medium text-white/60">{etapaLabel}</span>
                  <span className="shrink-0 font-bold tabular-nums text-emerald-100/90">{pipelineStepLabel}</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      lead.encerramento === "perdido"
                        ? "bg-rose-400"
                        : lead.encerramento === "ganho"
                          ? "bg-emerald-400"
                          : "bg-gradient-to-r from-teal-400 to-emerald-400",
                    )}
                    style={{ width: `${pipelineProgress}%` }}
                  />
                </div>
              </div>
            ) : isCadastroLeadOnlyStage(lead.etapa) ? (
              <p className="text-xs text-white/55">Lead em cadastro inicial — avance para entrar no funil.</p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroMetaChip({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  accent: "teal" | "gold" | "emerald" | "slate" | "warn";
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-[min(100%,20rem)] shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] sm:px-3 sm:text-xs",
        accent === "teal" && "border-teal-300/25 bg-teal-400/10 text-teal-50",
        accent === "gold" && "border-[#c8a96b]/35 bg-[#c8a96b]/12 text-amber-50",
        accent === "emerald" && "border-emerald-300/30 bg-emerald-400/12 text-emerald-50",
        accent === "slate" && "border-white/15 bg-white/8 text-slate-100",
        accent === "warn" && "border-amber-400/35 bg-amber-400/14 text-amber-50",
      )}
    >
      <Icon className="h-3 w-3 shrink-0 opacity-75 sm:h-3.5 sm:w-3.5" aria-hidden />
      <span className="font-medium opacity-70">{label}</span>
      <span className="truncate font-bold">{value}</span>
    </span>
  );
}

const DUE_STATUS_LABELS: Record<DueAreaTaskStatus | "atrasado", string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  disponibilizado: "Disponibilizado",
  atrasado: "Atrasado",
};

function DueCompilacaoSection({
  lead,
  viewer,
  onUpdated,
}: {
  lead: LeadDetailData;
  viewer: LeadDetailViewer | null;
  onUpdated: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [moving, setMoving] = useState(false);
  const [concludingAdjustments, setConcludingAdjustments] = useState(false);
  const [adjustmentsDialogOpen, setAdjustmentsDialogOpen] = useState(false);
  const [selectedAdjustmentTaskIds, setSelectedAdjustmentTaskIds] = useState<string[]>([]);
  const [adjustmentEvidenceKind, setAdjustmentEvidenceKind] = useState<"link" | "file">("file");
  const [adjustmentCompletionNote, setAdjustmentCompletionNote] = useState("");
  const [adjustmentModalError, setAdjustmentModalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canManage = viewer?.role === "admin" || viewer?.role === "comercial";
  const pptDocs = lead.dueDocuments.filter((d) => d.documentKind === "ppt_compilacao");
  const adjustmentTasks = lead.dueAreaReviewTasks.filter((task) => task.status === "ajustes_solicitados");
  const pendingAdjustmentTasks = adjustmentTasks.filter((task) => !task.adjustmentCompletedAt);
  const completedAdjustmentCount = adjustmentTasks.length - pendingAdjustmentTasks.length;

  if (!lead.haveraDueDiligence || lead.etapa !== "compilacao") return null;

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/crm/leads/${encodeURIComponent(lead.id)}/due-documents`, {
        method: "POST",
        body: fd,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error ?? "Falha no upload.");
      }
      onUpdated();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Erro no upload.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function downloadDoc(docId: string) {
    try {
      const res = await fetch(
        `/api/crm/leads/${encodeURIComponent(lead.id)}/due-documents?documentId=${encodeURIComponent(docId)}`,
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error ?? "Não foi possível gerar o download.");
      }
      if (payload.signedUrl) window.open(payload.signedUrl as string, "_blank", "noopener,noreferrer");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Erro ao baixar.");
    }
  }

  async function moveToRevisao() {
    setMoving(true);
    try {
      const res = await fetch("/api/crm/leads/transition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId: lead.id, nextStage: "revisao" }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          Array.isArray(payload.errors) && payload.errors.length > 0
            ? String(payload.errors[0])
            : (payload.error as string) || "Não foi possível mover para Revisão.";
        throw new Error(msg);
      }
      onUpdated();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Erro ao mudar etapa.");
    } finally {
      setMoving(false);
    }
  }

  function toggleAdjustmentTask(taskId: string) {
    setAdjustmentModalError(null);
    setSelectedAdjustmentTaskIds((current) =>
      current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId],
    );
  }

  async function concludeSelectedAdjustments() {
    if (selectedAdjustmentTaskIds.length < 1) {
      setAdjustmentModalError("Selecione ao menos uma área para concluir os ajustes.");
      return;
    }
    setAdjustmentModalError(null);
    setConcludingAdjustments(true);
    try {
      const res = await fetch(
        `/api/crm/leads/${encodeURIComponent(lead.id)}/due-area-review-adjustments`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            taskIds: selectedAdjustmentTaskIds,
            evidenceKind: adjustmentEvidenceKind,
            completionNote: adjustmentCompletionNote.trim() || null,
          }),
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error ?? "Não foi possível concluir os ajustes selecionados.");
      }
      setAdjustmentsDialogOpen(false);
      setSelectedAdjustmentTaskIds([]);
      setAdjustmentCompletionNote("");
      setAdjustmentModalError(null);
      onUpdated();
    } catch (error) {
      setAdjustmentModalError(
        error instanceof Error ? error.message : "Erro ao concluir ajustes.",
      );
    } finally {
      setConcludingAdjustments(false);
    }
  }

  function formatBytes(n: number | null): string {
    if (n == null) return "—";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <section id="due-compilacao" className="scroll-mt-6">
      <Card className="glass-card-no-float border-[#dfe5ee] p-5 sm:p-6">
        <CardHeader className="px-0 pt-0">
          <SectionEyebrow icon={Presentation}>Due Diligence</SectionEyebrow>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-xl font-extrabold tracking-[-0.035em] text-[#102033]">
                Compilação (PPT)
              </CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                Envie o PowerPoint da compilação. Para seguir para Revisão, é obrigatório ter pelo menos um .ppt/.pptx.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-0 pb-0">
          {lead.dueCompilacaoEntradaEm ? (
            <p className="text-xs text-slate-500">
              <span className="font-semibold text-slate-600">Entrada em Compilação: </span>
              {formatDateTimeBr(lead.dueCompilacaoEntradaEm)}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className="hidden"
              disabled={!canManage || uploading}
              onChange={onUpload}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canManage || uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? "Enviando…" : "Enviar PPT"}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canManage || moving || pptDocs.length < 1}
              onClick={() => void moveToRevisao()}
            >
              {moving ? "Movendo…" : "Mover para Revisão"}
            </Button>
          </div>

          {adjustmentTasks.length > 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-extrabold text-amber-950">Ajustes pendentes por área</p>
                  <p className="mt-1 text-xs text-amber-900/85">
                    Marque as áreas concluídas para esta rodada. Uma única evidência pode concluir múltiplas áreas.
                  </p>
                </div>
                <Badge variant="secondary" className="bg-white text-amber-900">
                  {completedAdjustmentCount}/{adjustmentTasks.length} concluídas
                </Badge>
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {adjustmentTasks.map((task) => {
                  const isCompleted = Boolean(task.adjustmentCompletedAt);
                  const checked = selectedAdjustmentTaskIds.includes(task.id);
                  return (
                    <label
                      key={task.id}
                      className={cn(
                        "flex items-start gap-2 rounded-xl border bg-white px-3 py-2 text-sm",
                        isCompleted ? "border-emerald-200" : "border-amber-200",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4"
                        checked={checked}
                        disabled={!canManage || concludingAdjustments || isCompleted}
                        onChange={() => toggleAdjustmentTask(task.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold text-[#102033]">{task.areaKey}</span>
                        {isCompleted ? (
                          <span className="block text-xs text-emerald-800">
                            Ajuste concluído em {formatDateTimeBr(task.adjustmentCompletedAt)}
                          </span>
                        ) : (
                          <span className="block text-xs text-amber-900/80">
                            {task.observacaoAjustes ? task.observacaoAjustes : "Aguardando conclusão dos ajustes"}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="mt-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!canManage || selectedAdjustmentTaskIds.length < 1}
                  onClick={() => setAdjustmentsDialogOpen(true)}
                >
                  Concluir ajustes selecionados
                </Button>
              </div>
            </div>
          ) : null}

          {pptDocs.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#dfe5ee] bg-white p-4 text-sm text-slate-500">
              Nenhum PPT enviado ainda.
            </p>
          ) : (
            <ul className="space-y-2">
              {pptDocs.map((doc) => (
                <li
                  key={doc.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#eef1f5] bg-white px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#102033]">{doc.originalFilename}</p>
                    <p className="text-xs text-slate-500">
                      {formatBytes(doc.byteSize)} · {formatDateTimeBr(doc.uploadedAt)}
                      {doc.uploadedBy?.fullName ? ` · ${doc.uploadedBy.fullName}` : ""}
                    </p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => void downloadDoc(doc.id)}>
                    Baixar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={adjustmentsDialogOpen}
        onOpenChange={(open) => {
          setAdjustmentsDialogOpen(open);
          if (!open) {
            setAdjustmentModalError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Concluir ajustes selecionados</DialogTitle>
            <DialogDescription>
              Selecione uma evidência da rodada para concluir os ajustes das áreas marcadas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {adjustmentModalError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                {adjustmentModalError}
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>Evidência da rodada</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 rounded-xl border border-[#dfe5ee] bg-white px-3 py-2 text-sm">
                  <input
                    type="radio"
                    name="adjustment-evidence-kind"
                    checked={adjustmentEvidenceKind === "file"}
                    onChange={() => {
                      setAdjustmentEvidenceKind("file");
                      setAdjustmentModalError(null);
                    }}
                  />
                  Novo arquivo (PPT)
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-[#dfe5ee] bg-white px-3 py-2 text-sm">
                  <input
                    type="radio"
                    name="adjustment-evidence-kind"
                    checked={adjustmentEvidenceKind === "link"}
                    onChange={() => {
                      setAdjustmentEvidenceKind("link");
                      setAdjustmentModalError(null);
                    }}
                  />
                  Novo link
                </label>
              </div>
              <p className="text-xs text-slate-500">
                A validação confirma evidência nova após a solicitação de ajustes das áreas selecionadas.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="due-adjustment-note">Observação (opcional)</Label>
              <Textarea
                id="due-adjustment-note"
                value={adjustmentCompletionNote}
                onChange={(event) => setAdjustmentCompletionNote(event.target.value)}
                placeholder="Ex.: Ajustes compilados e revisados conforme observações."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setAdjustmentsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={concludingAdjustments || selectedAdjustmentTaskIds.length < 1}
              onClick={() => void concludeSelectedAdjustments()}
            >
              {concludingAdjustments ? "Concluindo…" : "Confirmar conclusão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function DueRevisaoSection({
  lead,
  viewer,
  onUpdated,
}: {
  lead: LeadDetailData;
  viewer: LeadDetailViewer | null;
  onUpdated: () => void;
}) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [adjustTaskId, setAdjustTaskId] = useState<string | null>(null);
  const [adjustObs, setAdjustObs] = useState("");

  if (!lead.haveraDueDiligence || lead.etapa !== "revisao") return null;

  const tasks = lead.dueAreaReviewTasks;
  const pendingAdjustments = tasks.filter((t) => t.status === "ajustes_solicitados");

  function formatElapsed(ms: number | null): string {
    if (ms == null || ms < 0) return "—";
    const totalMin = Math.max(1, Math.round(ms / 60000));
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const mins = totalMin % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}min`;
    return `${mins}min`;
  }

  async function respond(taskId: string, action: "aprovar" | "ajustes", observacaoAjustes?: string | null) {
    setSavingId(taskId);
    try {
      const res = await fetch(`/api/crm/leads/${encodeURIComponent(lead.id)}/due-area-review-tasks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, action, observacaoAjustes: observacaoAjustes ?? null }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error ?? "Não foi possível registrar a resposta.");
      }
      onUpdated();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Erro ao responder revisão.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section id="due-revisao" className="scroll-mt-6">
      <Card className="glass-card-no-float border-[#dfe5ee] p-5 sm:p-6">
        <CardHeader className="px-0 pt-0">
          <SectionEyebrow icon={ShieldCheck}>Due Diligence</SectionEyebrow>
          <CardTitle className="text-xl font-extrabold tracking-[-0.035em] text-[#102033]">
            Revisão por área
          </CardTitle>
          <p className="mt-1 text-sm text-slate-500">
            Cada área deve aprovar o material ou solicitar ajustes. Ciclo atual: {lead.dueRevisionCycle}.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 px-0 pb-0">
          {lead.dueRevisaoEntradaEm ? (
            <p className="text-xs text-slate-500">
              <span className="font-semibold text-slate-600">Entrada em Revisão: </span>
              {formatDateTimeBr(lead.dueRevisaoEntradaEm)}
            </p>
          ) : null}

          {pendingAdjustments.length > 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <p className="font-bold">Ajustes solicitados</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {pendingAdjustments.map((t) => (
                  <li key={t.id}>
                    <span className="font-semibold">{t.areaKey}</span>
                    {t.observacaoAjustes ? `: ${t.observacaoAjustes}` : ""}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs font-medium text-amber-900/90">
                Retorne à Compilação pelo pipeline, corriga o PPT e envie novamente antes de uma nova rodada de revisão.
              </p>
            </div>
          ) : null}

          {tasks.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma tarefa de revisão encontrada para este ciclo.</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {tasks.map((task) => {
                const canRespond =
                  viewer?.role === "admin" ||
                  viewer?.role === "comercial" ||
                  viewer?.appUserId === task.responsavelAppUserId;
                const busy = savingId === task.id;
                const statusLabel =
                  task.status === "ok"
                    ? "Aprovado"
                    : task.status === "ajustes_solicitados"
                      ? "Ajustes solicitados"
                      : "Pendente";

                return (
                  <div key={task.id} className="rounded-2xl border border-[#dfe5ee] bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Área</p>
                        <p className="mt-0.5 text-sm font-extrabold text-[#102033]">{task.areaKey}</p>
                      </div>
                      <Badge
                        variant={task.status === "ajustes_solicitados" ? "destructive" : "secondary"}
                        className={cn(task.status === "ok" && "bg-emerald-50 text-emerald-800")}
                      >
                        {statusLabel}
                      </Badge>
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-slate-500">
                      <p>
                        <span className="font-bold text-slate-600">Responsável: </span>
                        {task.responsavel?.fullName ?? "—"}
                      </p>
                      <p>
                        <span className="font-bold text-slate-600">Prazo: </span>
                        {task.prazoAte ? formatDateTimeBr(task.prazoAte) : "—"}
                      </p>
                      <p>
                        <span className="font-bold text-slate-600">Tempo para revisar: </span>
                        {formatElapsed(task.reviewElapsedMs)}
                      </p>
                      {task.status === "ajustes_solicitados" ? (
                        <p>
                          <span className="font-bold text-slate-600">Tempo em compilação (ajustes): </span>
                          {formatElapsed(task.compilationElapsedMs)}
                        </p>
                      ) : null}
                      {task.respondedAt ? (
                        <p>
                          <span className="font-bold text-slate-600">Respondido em: </span>
                          {formatDateTimeBr(task.respondedAt)}
                          {task.respondedBy?.fullName ? ` · ${task.respondedBy.fullName}` : ""}
                        </p>
                      ) : null}
                      {task.observacaoAjustes ? (
                        <p className="text-amber-900">
                          <span className="font-bold text-slate-600">Observação: </span>
                          {task.observacaoAjustes}
                        </p>
                      ) : null}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={!canRespond || busy || task.status !== "pendente"}
                        onClick={() => void respond(task.id, "aprovar")}
                      >
                        Aprovar DUE da área
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!canRespond || busy || task.status !== "pendente"}
                        onClick={() => {
                          setAdjustTaskId(task.id);
                          setAdjustObs("");
                        }}
                      >
                        Solicitar ajustes
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={adjustTaskId != null} onOpenChange={(o) => !o && setAdjustTaskId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Solicitar ajustes</DialogTitle>
            <DialogDescription>
              Descreva os ajustes necessários para que a compilação possa ser corrigida.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="due-adj-obs">Observação (obrigatória)</Label>
            <Textarea
              id="due-adj-obs"
              value={adjustObs}
              onChange={(e) => setAdjustObs(e.target.value)}
              placeholder="Descreva o que precisa ser corrigido na DUE."
              rows={4}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setAdjustTaskId(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!adjustTaskId || savingId !== null}
              onClick={() => {
                if (!adjustTaskId) return;
                const t = adjustObs.trim();
                if (!t) {
                  window.alert("Preencha a observação.");
                  return;
                }
                void respond(adjustTaskId, "ajustes", t).then(() => setAdjustTaskId(null));
              }}
            >
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function DueAreaTasksCard({
  lead,
  viewer,
  onUpdated,
}: {
  lead: LeadDetailData;
  viewer: LeadDetailViewer | null;
  onUpdated: () => void;
}) {
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [semDialogTaskId, setSemDialogTaskId] = useState<string | null>(null);
  const [semObs, setSemObs] = useState("");
  const total = lead.dueAreaTasks.length;
  const done = lead.dueAreaTasks.filter((task) =>
    isDueAreaTaskDelivered({
      status: task.status,
      pasta_due_confirmada: task.pastaDueConfirmada,
      sem_processos_ativos: task.semProcessosAtivos,
    }),
  ).length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  const hasPending = done < total;

  async function patchTask(taskId: string, body: Record<string, unknown>) {
    setSavingTaskId(taskId);
    try {
      const res = await fetch(`/api/crm/leads/${encodeURIComponent(lead.id)}/due-area-tasks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error ?? "Não foi possível atualizar a tarefa DUE.");
      }
      if (payload.autoAdvancedToCompilacao) {
        window.alert(
          "Todas as áreas concluíram o levantamento. A negociação foi movida automaticamente para Compilação.",
        );
      }
      onUpdated();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Erro ao atualizar a tarefa DUE.");
    } finally {
      setSavingTaskId(null);
    }
  }

  async function confirmSemProcessos() {
    if (!semDialogTaskId) return;
    await patchTask(semDialogTaskId, {
      taskId: semDialogTaskId,
      status: "disponibilizado",
      semProcessosAtivos: true,
      observacaoSemProcessos: semObs.trim() || null,
    });
    setSemDialogTaskId(null);
    setSemObs("");
  }

  return (
    <>
      <section id="due-levantamento" className="scroll-mt-6">
        <Card className="glass-card-no-float border-[#dfe5ee] p-5 sm:p-6">
          <CardHeader className="px-0 pt-0">
            <SectionEyebrow icon={CheckCircle2}>Due Diligence</SectionEyebrow>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-xl font-extrabold tracking-[-0.035em] text-[#102033]">
                  Levantamento de dados por área
                </CardTitle>
                <p className="mt-1 text-sm text-slate-500">
                  As áreas confirmam a pasta Due Diligence ou registram que não há processos ativos. Ao concluir todas,
                  o CRM move automaticamente para Compilação.
                </p>
              </div>
              <Badge
                variant={hasPending ? "secondary" : "default"}
                className={cn(!hasPending && "bg-emerald-600 text-white")}
              >
                {done}/{total} áreas prontas
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-0 pb-0">
            {total > 0 ? (
              <>
                <div className="rounded-2xl border border-[#dfe5ee] bg-[#f8fafc] p-4">
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold text-slate-500">
                    <span>Progresso do levantamento</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="bg-white" />
                  {hasPending ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Aguardando as áreas restantes. Não é necessário mover manualmente para Compilação.
                    </p>
                  ) : (
                    <p className="mt-2 text-xs font-semibold text-emerald-700">
                      Todas as áreas concluíram. Se a etapa ainda não atualizou, atualize a página.
                    </p>
                  )}
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  {lead.dueAreaTasks.map((task) => {
                    const effectiveStatus = getDueAreaTaskStatus({
                      status: task.status,
                      prazoAte: task.prazoAte,
                    });
                    const canUpdate =
                      viewer?.role === "admin" ||
                      viewer?.role === "comercial" ||
                      viewer?.appUserId === task.responsavelAppUserId;
                    const isSaving = savingTaskId === task.id;
                    const delivered = isDueAreaTaskDelivered({
                      status: task.status,
                      pasta_due_confirmada: task.pastaDueConfirmada,
                      sem_processos_ativos: task.semProcessosAtivos,
                    });

                    return (
                      <div key={task.id} className="rounded-2xl border border-[#dfe5ee] bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Área</p>
                            <p className="mt-0.5 text-sm font-extrabold text-[#102033]">{task.areaKey}</p>
                          </div>
                          <Badge
                            variant={effectiveStatus === "atrasado" ? "destructive" : "secondary"}
                            className={cn(
                              effectiveStatus === "disponibilizado" && "bg-emerald-50 text-emerald-800",
                              effectiveStatus === "em_andamento" && "bg-blue-50 text-blue-800",
                            )}
                          >
                            {DUE_STATUS_LABELS[effectiveStatus]}
                          </Badge>
                        </div>

                        <div className="mt-3 space-y-2 text-xs text-slate-500">
                          <p>
                            <span className="font-bold text-slate-600">Responsável: </span>
                            {task.responsavel?.fullName ?? "Não definido"}
                          </p>
                          <p>
                            <span className="font-bold text-slate-600">Prazo: </span>
                            {task.prazoAte ? formatDateTimeBr(task.prazoAte) : "Sem prazo"}
                          </p>
                          {task.iniciadoEm ? (
                            <p>
                              <span className="font-bold text-slate-600">Iniciado em: </span>
                              {formatDateTimeBr(task.iniciadoEm)}
                            </p>
                          ) : null}
                          {task.dadosDisponibilizadosEm ? (
                            <p>
                              <span className="font-bold text-slate-600">Registrado em: </span>
                              {formatDateTimeBr(task.dadosDisponibilizadosEm)}
                            </p>
                          ) : null}
                          {delivered && task.semProcessosAtivos ? (
                            <p className="font-semibold text-slate-700">Sem processos ativos nesta área.</p>
                          ) : null}
                          {task.observacaoSemProcessos ? (
                            <p>
                              <span className="font-bold text-slate-600">Observação: </span>
                              {task.observacaoSemProcessos}
                            </p>
                          ) : null}
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!canUpdate || isSaving || task.status === "em_andamento" || task.status === "disponibilizado"}
                            onClick={() =>
                              void patchTask(task.id, { taskId: task.id, status: "em_andamento" })
                            }
                          >
                            Iniciar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={!canUpdate || isSaving || task.status === "disponibilizado"}
                            onClick={() =>
                              void patchTask(task.id, {
                                taskId: task.id,
                                status: "disponibilizado",
                                pastaDueConfirmada: true,
                              })
                            }
                          >
                            Confirmar pasta Due Diligence
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={!canUpdate || isSaving || task.status === "disponibilizado"}
                            onClick={() => {
                              setSemDialogTaskId(task.id);
                              setSemObs(task.observacaoSemProcessos ?? "");
                            }}
                          >
                            Sem processos ativos
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="rounded-2xl border border-dashed border-[#dfe5ee] bg-white p-4 text-sm text-slate-500">
                As tarefas automáticas ainda não foram geradas para esta DUE. Ao entrar em Levantamento de Dados, o CRM
                cria uma tarefa por área selecionada.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <Dialog open={semDialogTaskId != null} onOpenChange={(o) => !o && setSemDialogTaskId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sem processos ativos</DialogTitle>
            <DialogDescription>
              Registre que a área não possui processos ativos para esta Due Diligence.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Use quando a área não encontrou processos ativos para esta Due Diligence. Opcionalmente descreva o contexto.
          </p>
          <div className="space-y-2 py-2">
            <Label htmlFor="due-sem-obs">Observação (opcional)</Label>
            <Textarea
              id="due-sem-obs"
              value={semObs}
              onChange={(e) => setSemObs(e.target.value)}
              placeholder="Ex.: Carteira sem litígios ativos no período."
              rows={3}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setSemDialogTaskId(null)}>
              Cancelar
            </Button>
            <Button type="button" disabled={savingTaskId !== null} onClick={() => void confirmSemProcessos()}>
              Confirmar entrega
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SectionEyebrow({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[#24615b]">
      <Icon className="h-4 w-4" />
      {children}
    </div>
  );
}

function ReadOnlyInfo({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="rounded-2xl border border-[#e6e9ef] bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className={cn("mt-1 text-sm font-semibold text-[#102033]", muted && "text-slate-400")}>{value}</p>
    </div>
  );
}

function EmptyTabCard({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Card className="glass-card-no-float border-[#dfe5ee] p-6">
      <CardHeader className="px-0 pt-0">
        <SectionEyebrow icon={Icon}>Sem dados nesta área</SectionEyebrow>
        <CardTitle className="text-xl font-extrabold tracking-[-0.035em] text-[#102033]">
          {title}
        </CardTitle>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </CardHeader>
    </Card>
  );
}

function normalizeLeadType(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function CrmLinksCard({ lead }: { lead: LeadDetailData }) {
  return (
    <section id="links" className="scroll-mt-6">
      <Card className="glass-card-no-float border-[#dfe5ee] p-5 sm:p-6">
        <CardHeader className="px-0 pt-0">
          <SectionEyebrow icon={LinkIcon}>Links no CRM</SectionEyebrow>
          <CardTitle className="text-xl font-extrabold tracking-[-0.035em] text-[#102033]">
            Proposta e contrato
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 px-0 pb-0 md:grid-cols-2">
          {lead.linkProposta ? <LinkBlock label="Link da proposta" href={lead.linkProposta} /> : null}
          {lead.linkContrato ? <LinkBlock label="Link do contrato" href={lead.linkContrato} /> : null}
        </CardContent>
      </Card>
    </section>
  );
}

function LinkBlock({ label, href }: { label: string; href: string }) {
  return (
    <div className="rounded-2xl border border-[#e6e9ef] bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <Link
        href={href}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex max-w-full items-center gap-1.5 break-all text-sm font-bold text-[#173a6a] underline underline-offset-2"
      >
        {href}
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
      </Link>
    </div>
  );
}

function D4SignDisclosure({
  lead,
  defaultOpen,
}: {
  lead: LeadDetailData;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const hasDocument = Boolean(lead.d4signDocumentUuid);

  return (
    <section id="assinatura" className="scroll-mt-6">
      <Card className="glass-card-no-float overflow-hidden border-[#dfe5ee] p-0">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-[#f8fafc] sm:px-6"
          aria-expanded={open}
        >
          <div className="min-w-0">
            <SectionEyebrow icon={FileSignature}>Assinatura eletrônica</SectionEyebrow>
            <h2 className="text-xl font-extrabold tracking-[-0.035em] text-[#102033]">D4Sign</h2>
            <p className="mt-1 text-sm text-slate-500">
              {hasDocument
                ? `Último documento conectado${lead.d4signStatus ? `: ${lead.d4signStatus}` : "."}`
                : "Envie contrato ou proposta para assinatura quando estiver pronto."}
            </p>
          </div>
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "hidden rounded-full border px-2.5 py-1 text-xs font-bold sm:inline-flex",
                hasDocument
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-slate-50 text-slate-600",
              )}
            >
              {hasDocument ? "Conectado" : "Pendente"}
            </span>
            <ChevronDown className={cn("h-5 w-5 text-slate-400 transition-transform", open && "rotate-180")} />
          </span>
        </button>
        {open ? (
          <CardContent className="border-t border-[#e6e9ef] px-5 py-5 sm:px-6">
            <LeadD4SignPanel
              opportunityId={lead.id}
              d4signDocumentUuid={lead.d4signDocumentUuid}
              d4signStatus={lead.d4signStatus}
            />
          </CardContent>
        ) : null}
      </Card>
    </section>
  );
}
