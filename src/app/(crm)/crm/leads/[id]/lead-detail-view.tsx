"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileSignature,
  FileText,
  Layers3,
  LinkIcon,
  ListChecks,
  MessageSquareText,
  PencilLine,
  Presentation,
  ShieldCheck,
  Sparkles,
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
import { formatDateTimeBr } from "@/lib/format-datetime";
import { getDueAreaTaskStatus, type DueAreaTaskStatus } from "@/lib/crm/due-area-task-status";
import { isDueAreaTaskDelivered } from "@/lib/crm/due-area-tasks";
import { resolveRdFieldEditor } from "@/lib/crm/lead-rd-field-editor-map";
import { resolvePropostaEmpresaPrincipalNome } from "@/lib/crm/proposta-empresa-principal";
import { getEscopoEntryForArea, isEscopoEntryComplete } from "@/lib/crm/proposta-escopo-entry";
import { parseEscopoJson, syncEscopoToAreas } from "@/lib/crm/proposta-escopo-json";
import { cn } from "@/lib/utils";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Renderizado à parte (JSON); não repetir como campo genérico. */
const HIDDEN_PIPELINE_CODES = new Set(["cp_escopo_detalhe_json"]);
const PROPOSAL_FIELD_ORDER = ["cp_qualificacao", "cp_areas_objeto", "cp_objeto_proposta"];
type LeadDetailTab = "overview" | "proposal" | "contract" | "due" | "crm" | "notes" | "signature";

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

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5">
      <Link
        href="/crm/leads"
        className="inline-flex items-center gap-2 rounded-full border border-[#dfe5ee] bg-white px-3 py-2 text-sm font-bold text-[#102033] shadow-sm underline-offset-4 transition-colors hover:border-[#cbd5e1] hover:bg-[#f8fafc]"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar ao pipeline
      </Link>

      <section className="relative overflow-hidden rounded-[28px] border border-white/55 bg-[#0b1724] p-5 text-white shadow-sm shadow-primary-dark/10 sm:p-7">
        <div className="absolute inset-0 bg-crm-gradient-dark opacity-85" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(45,200,183,0.28),transparent_34%),linear-gradient(135deg,rgba(8,22,36,0.15),rgba(4,13,22,0.92))]" />
        <div className="absolute -right-16 -top-24 h-56 w-56 rounded-full border border-white/10 bg-white/8 blur-2xl" />
        <div className="relative z-[1] flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 max-w-4xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-accent-green/35 bg-accent-green/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-100">
                Detalhe do lead
              </span>
              {heroContextBadge ? (
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-semibold",
                    heroContextBadge.className,
                  )}
                >
                  {heroContextBadge.label}
                </span>
              ) : null}
            </div>
            <h1 className="mt-4 text-3xl font-extrabold tracking-[-0.055em] text-white sm:text-4xl">
              {lead.solicitante}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-100/90">
              Workspace comercial para acompanhar dados do lead, campos editáveis, proposta, escopos por área e assinatura.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <HeroPill label="Etapa" value={etapaLabel} tone="blue" />
              <HeroPill label="Tipo" value={leadTypeDisplay} tone="gold" />
              <HeroPill label="Due diligence" value={ddSimNao} tone={lead.haveraDueDiligence ? "emerald" : "slate"} />
            </div>
          </div>

          <div className="grid min-w-[min(100%,420px)] grid-cols-2 gap-3">
            <SummaryMetric label="Criado em" value={formatDateTimeBr(lead.criadoEm)} />
            <SummaryMetric label="Atualizado" value={lead.atualizadoEm ? formatDateTimeBr(lead.atualizadoEm) : "Sem atualização"} />
            {lead.isSystemCreated ? (
              <div className="col-span-2 rounded-2xl border border-white/10 bg-white/10 p-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">
                  Ações administrativas
                </p>
                <LeadDeleteButton leadId={lead.id} />
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
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

            <TabsContent value="notes" className="mt-4 space-y-5">
              <LeadNotesTab leadId={lead.id} />
            </TabsContent>
          </Tabs>
        </main>

        <LeadRightPanel
          lead={lead}
          etapaLabel={etapaLabel}
          isProposalStage={isProposalStage}
          isContractStage={isContractStage}
          selectedAreas={selectedAreas}
          completedAreaRequests={completedAreaRequests}
          totalAreaRequests={totalAreaRequests}
          escopoDetalhe={escopoDetalheJson}
          activeTab={activeTab}
          isRdLead={isRdLead}
          onTabChange={handleTabChange}
        />
      </div>
    </div>
  );
}

function HeroPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "gold" | "emerald" | "slate";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs shadow-sm",
        tone === "blue" && "border-[#bfd2f6] bg-[#eef5ff] text-[#173a6a]",
        tone === "gold" && "border-[#d8bf82]/40 bg-[#fff7df] text-[#73531c]",
        tone === "emerald" && "border-emerald-200 bg-emerald-50 text-emerald-900",
        tone === "slate" && "border-slate-200 bg-slate-50 text-slate-700",
      )}
    >
      <span className="font-medium opacity-75">{label}:</span>
      <span className="font-bold">{value}</span>
    </span>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-3 shadow-sm backdrop-blur">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">{label}</p>
      <p className="mt-1 text-sm font-bold leading-snug text-white">{value}</p>
    </div>
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

function LeadRightPanel({
  lead,
  etapaLabel,
  isProposalStage,
  isContractStage,
  selectedAreas,
  completedAreaRequests,
  totalAreaRequests,
  escopoDetalhe,
  activeTab,
  isRdLead,
  onTabChange,
}: {
  lead: LeadDetailData;
  etapaLabel: string;
  isProposalStage: boolean;
  isContractStage: boolean;
  selectedAreas: string[];
  completedAreaRequests: number;
  totalAreaRequests: number;
  escopoDetalhe: ReturnType<typeof parseEscopoJson>;
  activeTab: LeadDetailTab;
  isRdLead: boolean;
  onTabChange: (tab: LeadDetailTab) => void;
}) {
  const [nowIso] = useState(() => new Date().toISOString());
  const tabShortcuts: Array<{ tab: LeadDetailTab; label: string; icon: LucideIcon }> = [
    { tab: "overview", label: "Visão geral", icon: UserRound },
    ...(lead.haveraDueDiligence ? [{ tab: "due" as const, label: "Due diligence", icon: ListChecks }] : []),
    { tab: "proposal", label: "Proposta", icon: FileText },
    ...(isContractStage ? [{ tab: "contract" as const, label: "Contrato", icon: FileSignature }] : []),
    ...(isRdLead ? [{ tab: "crm" as const, label: "CRM / RD", icon: ShieldCheck }] : []),
    { tab: "signature", label: "Assinatura", icon: FileSignature },
    { tab: "notes", label: "Anotações", icon: MessageSquareText },
  ];
  const areaRows = selectedAreas.map((area) => ({
    area,
    request: lead.escopoSolicitacoes?.find((item) => areaKeyMatches(item.areaKey, area)) ?? null,
  }));
  const areaRowsWithStatus = areaRows.map((row) => {
    const entry = getEscopoEntryForArea(escopoDetalhe, row.area);
    const scopeComplete = isEscopoEntryComplete(row.area, entry);
    return { ...row, scopeComplete };
  });
  const pendingAreaCount = areaRowsWithStatus.filter((row) => !row.request?.concluidoEm && !row.scopeComplete).length;
  const scopeProgressLabel =
    totalAreaRequests > 0
      ? `${Math.max(completedAreaRequests, areaRowsWithStatus.filter((row) => row.scopeComplete).length)}/${totalAreaRequests}`
      : `${areaRowsWithStatus.length - pendingAreaCount}/${areaRowsWithStatus.length}`;

  return (
    <aside className="hidden min-w-0 xl:block">
      <div className="sticky top-6 space-y-4">
        <div className="relative overflow-hidden rounded-[24px] border border-[#dfe5ee] bg-white p-5 shadow-[0_18px_45px_rgba(16,31,46,0.07)]">
          <div className="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full bg-[#c8a96b]/18 blur-3xl" />
          <div className="pointer-events-none absolute -left-12 top-28 h-32 w-32 rounded-full bg-emerald-300/15 blur-3xl" />
          <div className="relative">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#101f2e_0%,#24615b_62%,#c8a96b_100%)] text-white shadow-[0_14px_28px_rgba(16,31,46,0.18)]">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Cockpit do lead</p>
              <p className="truncate text-sm font-extrabold text-[#102033]">{etapaLabel}</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <PanelMetric
              label="Pendências"
              value={isProposalStage ? String(pendingAreaCount) : "—"}
              tone={pendingAreaCount > 0 ? "warn" : "ok"}
            />
            <PanelMetric
              label="Escopos"
              value={areaRows.length > 0 ? scopeProgressLabel : "—"}
              tone={pendingAreaCount > 0 ? "warn" : "ok"}
            />
          </div>

          <div className="mt-4 rounded-2xl border border-[#e6e9ef] bg-[#f8fafc]/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-[#102033]">Elaboração</p>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-bold",
                  isProposalStage ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600",
                )}
              >
                {isProposalStage ? "ativa" : "fora da etapa"}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              {isProposalStage
                ? "Priorize proposta, escopos, pendências e geração do Word."
                : "A proposta será habilitada quando o lead entrar em elaboração."}
            </p>
          </div>

          <div className="mt-4 rounded-2xl border border-[#e6e9ef] bg-white/90 p-4 shadow-[0_10px_24px_rgba(16,31,46,0.04)]">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <p className="text-sm font-bold text-[#102033]">Escopo por área</p>
            </div>
            {areaRows.length > 0 ? (
              <div className="mt-3 space-y-2.5">
                {areaRowsWithStatus.map(({ area, request, scopeComplete }) => {
                  const completed = Boolean(request?.concluidoEm) || scopeComplete;
                  const gestorName = request?.gestor?.fullName ?? `Gestor ${area}`;
                  const preenchidoPorName = request?.preenchidoPor?.fullName ?? request?.gestor?.fullName ?? null;
                  const responsaveis = request?.responsaveis ?? [];
                  const responsaveisLabel =
                    responsaveis.length > 0
                      ? responsaveis.map((user) => user.fullName).join(", ")
                      : gestorName;
                  const overdue =
                    !completed && request?.prazoAte && nowIso ? request.prazoAte < nowIso : false;
                  return (
                    <div
                      key={area}
                      className="group/area flex gap-3 rounded-xl border border-[#eef1f5] bg-[#f8fafc] p-3 transition-all duration-150 hover:-translate-y-0.5 hover:border-[#dfe5ee] hover:bg-white hover:shadow-[0_10px_24px_rgba(16,31,46,0.06)]"
                    >
                      <Avatar className="h-9 w-9 shrink-0 border-2 border-white shadow-sm transition-transform duration-150 group-hover/area:scale-105">
                        {request?.gestor?.avatarUrl ? (
                          <AvatarImage src={request.gestor.avatarUrl} alt="" className="object-cover" />
                        ) : null}
                        <AvatarFallback
                          className={cn(
                            "text-[11px] font-black",
                            completed ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
                          )}
                        >
                          {request?.gestor?.fullName ? areaInitials(request.gestor.fullName) : areaInitials(area)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-extrabold text-[#102033]">{area}</p>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                              completed && "bg-emerald-100 text-emerald-800",
                              !completed && overdue && "bg-rose-100 text-rose-800",
                              !completed && !overdue && "bg-amber-100 text-amber-800",
                            )}
                          >
                            {completed ? "Preenchido" : overdue ? "Atrasado" : "Pendente"}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">
                          {completed ? `Responsável: ${gestorName}` : `Gestores: ${responsaveisLabel}`}
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                          {completed && request?.concluidoEm
                            ? `Preenchido${preenchidoPorName ? ` por ${preenchidoPorName}` : ""} em ${formatDateTimeBr(request.concluidoEm)}.`
                            : completed
                              ? "Escopo salvo nas informações do lead."
                            : request?.prazoAte
                              ? `Prazo até ${formatDateTimeBr(request.prazoAte)}.`
                            : request?.notificadoEm
                              ? `Solicitado em ${formatDateTimeBr(request.notificadoEm)}. Precisa ser preenchido assim que possível.`
                              : "Precisa ser solicitado/preenchido para finalizar a proposta."}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">Nenhuma área de escopo selecionada nesta proposta.</p>
            )}
          </div>

          <div className="mt-4 space-y-1.5">
            {tabShortcuts.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.tab}
                  type="button"
                  onClick={() => onTabChange(item.tab)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-all duration-200",
                    activeTab === item.tab
                      ? "border-primary-dark/20 bg-crm-gradient-primary text-white shadow-[0_10px_24px_rgba(15,118,110,0.22)]"
                      : "border-[#e1e5eb] bg-white/85 text-slate-600 shadow-[0_1px_2px_rgba(16,31,46,0.03)] hover:-translate-y-0.5 hover:border-accent-teal/30 hover:bg-white hover:text-primary-dark",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4",
                      activeTab === item.tab ? "text-white/80" : "text-slate-400",
                    )}
                  />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
        </div>

        <div className="rounded-[22px] border border-[#dfe5ee] bg-[#fff8e6] p-4 text-sm text-[#73531c] shadow-sm">
          <div className="flex items-center gap-2 font-extrabold">
            <PencilLine className="h-4 w-4" />
            Próxima melhor ação
          </div>
          <p className="mt-2 text-xs leading-relaxed">
            {isProposalStage
              ? "Revise pendências, confira preview e gere uma nova versão da proposta antes de enviar para assinatura."
              : "Mantenha os dados do cadastro e RD limpos para acelerar a etapa de proposta."}
          </p>
        </div>
      </div>
    </aside>
  );
}

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

function areaInitials(area: string) {
  const words = area.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0] ?? ""}${words[words.length - 1]![0] ?? ""}`.toUpperCase();
}

function PanelMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "ok" | "warn";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-3",
        tone === "ok" && "border-emerald-200 bg-emerald-50",
        tone === "warn" && "border-amber-200 bg-amber-50",
        tone === "neutral" && "border-[#e6e9ef] bg-white",
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p
        className={cn(
          "mt-1 text-lg font-extrabold tracking-[-0.04em]",
          tone === "ok" && "text-emerald-800",
          tone === "warn" && "text-amber-800",
          tone === "neutral" && "text-[#102033]",
        )}
      >
        {value}
      </p>
    </div>
  );
}
