"use client";

import { createElement, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Cloud,
  ExternalLink,
  FileSignature,
  FileText,
  GitBranch,
  History,
  Info,
  Layers3,
  MessageSquareText,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UserRound,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CrmUserLabel } from "@/components/crm/crm-user-label";
import { formatDateTimeBr } from "@/lib/format-datetime";
import { cn } from "@/lib/utils";
import { leadAreas } from "@/modules/crm/application/services/new-lead-payload";
import type { LeadActivityEvent } from "@/lib/crm/lead-lifecycle-timeline";
import type { LeadDetailData } from "./page";
import { LeadAddEmpresaButton } from "./lead-add-empresa-button";
import {
  LeadDetailFieldEditor,
  intakeFieldEditorKind,
  type LeadFieldEditorKind,
} from "./lead-detail-field-editor";
import { LeadIntakeEmpresaBlock } from "./lead-intake-empresa-block";

export type LeadOverviewTabTarget =
  | "proposal"
  | "contract"
  | "billing"
  | "due"
  | "crm"
  | "notes"
  | "signature"
  | "history";

type IntakeField = LeadDetailData["intakeFields"][number];
type IntakeGroupKey = "requester" | "schedule" | "commercial" | "other" | "integration";

const HIDDEN_INTAKE_KEYS = new Set(["due_diligence_intake", "tipo_lead"]);
const INTEGRATION_FIELD_PREFIX = "sharepoint_";
const LONG_FIELD_KEYS = new Set(["areas_analise", "contexto_comercial", "sharepoint_agendamento_error"]);

const INTAKE_GROUP_BY_KEY: Record<string, IntakeGroupKey> = {
  email_solicitante: "requester",
  solicitante_nome: "requester",
  cadastrado_por: "requester",
  data_entrega_due: "schedule",
  horario_entrega_due: "schedule",
  local_reuniao: "schedule",
  data_reuniao: "schedule",
  horario_reuniao: "schedule",
  areas_analise: "commercial",
  tipo_indicacao: "commercial",
  nome_indicacao: "commercial",
  contexto_comercial: "commercial",
};

export function groupLeadIntakeFields(fields: IntakeField[]): Record<IntakeGroupKey, IntakeField[]> {
  const grouped: Record<IntakeGroupKey, IntakeField[]> = {
    requester: [],
    schedule: [],
    commercial: [],
    other: [],
    integration: [],
  };

  for (const field of fields) {
    if (HIDDEN_INTAKE_KEYS.has(field.key)) continue;
    if (field.key.startsWith(INTEGRATION_FIELD_PREFIX)) {
      grouped.integration.push(field);
      continue;
    }
    grouped[INTAKE_GROUP_BY_KEY[field.key] ?? "other"].push(field);
  }

  return grouped;
}

export function LeadDetailOverview({
  lead,
  etapaLabel,
  leadTypeDisplay,
  dueLabel,
  isCrossSellingLead,
  isContractStage,
  showBillingTab,
  isRdLead,
  onNavigate,
}: {
  lead: LeadDetailData;
  etapaLabel: string;
  leadTypeDisplay: string;
  dueLabel: string;
  isCrossSellingLead: boolean;
  isContractStage: boolean;
  showBillingTab: boolean;
  isRdLead: boolean;
  onNavigate: (tab: LeadOverviewTabTarget) => void;
}) {
  const groups = groupLeadIntakeFields(lead.intakeFields);
  const hasIntakeData =
    groups.requester.length > 0 ||
    groups.schedule.length > 0 ||
    groups.commercial.length > 0 ||
    groups.other.length > 0 ||
    groups.integration.length > 0 ||
    lead.empresasIntake.length > 0;

  const contextAction = showBillingTab
    ? ({ tab: "billing", label: "Abrir faturamento", icon: Layers3 } as const)
    : isContractStage
      ? ({ tab: "contract", label: "Abrir contrato", icon: FileSignature } as const)
      : ({ tab: "proposal", label: "Abrir proposta", icon: FileText } as const);

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        <Card className="gap-0 py-0">
          <CardHeader className="border-b border-neutral-200 px-5 py-4 sm:px-6">
            <SectionTitle
              icon={Info}
              title="Resumo editável"
              description="Informações essenciais para identificar e acompanhar o lead."
            />
          </CardHeader>
          <CardContent className="grid px-0 sm:grid-cols-2">
            <OverviewValue label="Tipo de lead" value={leadTypeDisplay} />
            <OverviewValue label="Etapa atual" value={etapaLabel} />
            <LeadDetailFieldEditor
              leadId={lead.id}
              scope="intake"
              fieldKey="solicitante_nome"
              label="Empresa / nome do lead"
              value={lead.solicitante}
              kind="text"
              displayVariant="row"
              className="border-t border-neutral-200 sm:border-r"
            />
            <LeadDetailFieldEditor
              leadId={lead.id}
              scope="intake"
              fieldKey="havera_due_diligence"
              label="Due diligence"
              value={dueLabel}
              kind="yesno"
              displayVariant="row"
              className="border-t border-neutral-200"
            />
            {isCrossSellingLead ? (
              <OverviewValue
                label="Cliente vinculado"
                value={lead.clienteId || "Ainda sem cliente vinculado"}
                muted={!lead.clienteId}
              />
            ) : null}
            <OverviewValue label="Criado em" value={formatDateTimeBr(lead.criadoEm)} tabular />
            <OverviewValue
              label="Atualizado em"
              value={lead.atualizadoEm ? formatDateTimeBr(lead.atualizadoEm) : "Sem atualização"}
              muted={!lead.atualizadoEm}
              tabular
            />
            {lead.rdDealUrl ? (
              <OverviewLink label="Negociação no RD" href={lead.rdDealUrl} />
            ) : isRdLead ? (
              <OverviewValue label="Negociação no RD" value="Lead RD sem link disponível" muted />
            ) : null}
          </CardContent>
        </Card>

        {hasIntakeData ? (
          <Card className="gap-0 py-0">
            <CardHeader className="border-b border-neutral-200 px-5 py-4 sm:px-6">
              <SectionTitle
                icon={Building2}
                title="Cadastro inicial"
                description="Dados informados na abertura da demanda, organizados por contexto."
              />
            </CardHeader>
            <CardContent className="px-0">
              <IntakeFieldGroup
                title="Solicitante e cadastro"
                description="Quem solicitou e quem registrou a demanda."
                fields={groups.requester}
                leadId={lead.id}
                mergeSolicitanteIdentity
              />
              <IntakeFieldGroup
                title="Prazos e reunião"
                description="Agenda prevista para entrega, encontro e próximos marcos."
                fields={groups.schedule}
                leadId={lead.id}
              />
              <IntakeFieldGroup
                title="Escopo e indicação"
                description="Áreas envolvidas e contexto comercial da oportunidade."
                fields={groups.commercial}
                leadId={lead.id}
              />
              <IntakeFieldGroup
                title="Outras informações"
                description="Dados adicionais enviados no cadastro."
                fields={groups.other}
                leadId={lead.id}
              />

              {lead.empresasIntake.length > 0 || lead.isSystemCreated ? (
                <section className="border-t-[6px] border-neutral-100">
                  <GroupHeader
                    title="Empresas"
                    description="Partes e documentos associados ao lead."
                  />
                  {lead.empresasIntake.length > 0 ? (
                    <div className="divide-y divide-neutral-200">
                      {lead.empresasIntake.map((empresa) => (
                        <LeadIntakeEmpresaBlock
                          key={`emp-${empresa.index}`}
                          leadId={lead.id}
                          initial={empresa}
                          canDelete={lead.empresasIntake.length > 1}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="px-4 pb-4 text-sm text-muted-foreground">
                      Nenhuma empresa vinculada.
                    </p>
                  )}
                  {lead.isSystemCreated ? (
                    <LeadAddEmpresaButton
                      leadId={lead.id}
                      className="border-t border-neutral-200 px-4 py-4"
                    />
                  ) : null}
                </section>
              ) : null}

              {groups.integration.length > 0 ? (
                <IntegrationSummary leadId={lead.id} fields={groups.integration} />
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <Card className="p-6">
            <SectionTitle
              icon={Building2}
              title="Sem cadastro inicial"
              description="Não há campos de abertura salvos para este lead."
            />
          </Card>
        )}
      </div>

      <aside className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:self-start">
        <AboutLeadCard lead={lead} dueLabel={dueLabel} />
        <QuickActionsCard
          contextAction={contextAction}
          hasDue={lead.haveraDueDiligence}
          hasRd={Boolean(lead.rdDealUrl)}
          rdDealUrl={lead.rdDealUrl}
          onNavigate={onNavigate}
        />
        <RecentActivityCard
          activities={lead.lifecycleTimeline.activities.slice(0, 3)}
          onViewAll={() => onNavigate("history")}
        />
      </aside>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-(--radius-v2-md) bg-interactive-50 text-interactive-700">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <CardTitle className="text-v2-heading-md text-foreground">{title}</CardTitle>
        <p className="mt-0.5 text-sm leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function OverviewValue({
  label,
  value,
  muted = false,
  tabular = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
  tabular?: boolean;
}) {
  return (
    <div className="min-w-0 border-t border-neutral-200 bg-white px-4 py-3.5 sm:odd:border-r">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 break-words text-sm font-medium text-foreground",
          muted && "font-normal text-muted-foreground",
          tabular && "tabular-nums",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function OverviewLink({ label, href }: { label: string; href: string }) {
  return (
    <div className="min-w-0 border-t border-neutral-200 bg-white px-4 py-3.5 sm:odd:border-r">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <Link
        href={href}
        target="_blank"
        rel="noreferrer"
        className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-interactive-700 hover:text-interactive-800 hover:underline"
      >
        Abrir no RD Station
        <ExternalLink className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}

function IntakeFieldGroup({
  title,
  description,
  fields,
  leadId,
  mergeSolicitanteIdentity = false,
}: {
  title: string;
  description: string;
  fields: IntakeField[];
  leadId: string;
  mergeSolicitanteIdentity?: boolean;
}) {
  if (fields.length === 0) return null;

  const solicitanteNameField = mergeSolicitanteIdentity
    ? fields.find((field) => field.key === "solicitante_nome")
    : undefined;
  const solicitanteEmailField = mergeSolicitanteIdentity
    ? fields.find((field) => field.key === "email_solicitante")
    : undefined;
  const visibleFields = mergeSolicitanteIdentity
    ? fields.filter(
        (field) => field.key !== "solicitante_nome" && field.key !== "email_solicitante",
      )
    : fields;
  const solicitanteResolvedUser =
    solicitanteNameField?.resolvedUser ?? solicitanteEmailField?.resolvedUser;

  return (
    <section className="border-t-[6px] border-neutral-100 first:border-t-0">
      <GroupHeader title={title} description={description} />
      <div className="grid sm:grid-cols-2">
        {mergeSolicitanteIdentity && (solicitanteNameField || solicitanteEmailField) ? (
          <LeadDetailFieldEditor
            leadId={leadId}
            scope="intake"
            fieldKey="solicitante_interno"
            label="Solicitante interno"
            value={solicitanteEmailField?.value ?? solicitanteNameField?.value ?? ""}
            kind="user"
            resolvedUser={solicitanteResolvedUser}
            userIdentityMode="email"
            allowExternalUser={false}
            displayVariant="row"
            className="border-t border-neutral-200 sm:border-r"
          />
        ) : null}
        {visibleFields.map((field) => (
          <EditableIntakeField key={field.key} field={field} leadId={leadId} />
        ))}
      </div>
    </section>
  );
}

function GroupHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="flex items-stretch gap-3 border-b border-neutral-200 bg-neutral-50 px-5 py-4">
      <span className="w-1 shrink-0 rounded-full bg-interactive-600" aria-hidden />
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
    </header>
  );
}

function EditableIntakeField({ field, leadId }: { field: IntakeField; leadId: string }) {
  const long = LONG_FIELD_KEYS.has(field.key);
  return (
    <LeadDetailFieldEditor
      leadId={leadId}
      scope="intake"
      fieldKey={field.key}
      label={field.label}
      value={field.value}
      kind={intakeKind(field)}
      selectOptions={field.key === "areas_analise" ? [...leadAreas] : undefined}
      resolvedUser={field.resolvedUser}
      userIdentityMode={
        field.key === "email_solicitante" || field.key === "cadastrado_por" ? "email" : "uuid"
      }
      allowExternalUser={field.key !== "cadastrado_por"}
      displayVariant="row"
      className={cn(
        "border-t border-neutral-200 sm:odd:border-r",
        long && "sm:col-span-2 sm:border-r-0",
      )}
    />
  );
}

function intakeKind(field: IntakeField): LeadFieldEditorKind {
  if (field.key === "sharepoint_agendamento_error") return "textarea";
  if (field.key.endsWith("_url")) return "url";
  return intakeFieldEditorKind(field.key);
}

function IntegrationSummary({ leadId, fields }: { leadId: string; fields: IntakeField[] }) {
  const errorField = fields.find((field) => field.key === "sharepoint_agendamento_error");
  const urlField = fields.find((field) => field.key === "sharepoint_agendamento_url");
  const createdField = fields.find((field) => field.key === "sharepoint_agendamento_created_at");

  return (
    <section className="border-t-[6px] border-neutral-100">
      <GroupHeader
        title="Integração SharePoint"
        description="Estado técnico do agendamento criado a partir deste cadastro."
      />
      <div className="p-4">
        <div
          className={cn(
            "rounded-(--radius-v2-lg) border p-4",
            errorField
              ? "border-danger-border bg-danger-bg"
              : "border-info-border bg-info-bg",
          )}
        >
          <div className="flex items-start gap-3">
            {errorField ? (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger-text" aria-hidden />
            ) : (
              <Cloud className="mt-0.5 size-4 shrink-0 text-info-text" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-sm font-semibold",
                  errorField ? "text-danger-text" : "text-info-text",
                )}
              >
                {errorField ? "Falha ao criar o agendamento" : "Agendamento sincronizado"}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {createdField
                  ? `Último registro: ${createdField.value}`
                  : "Os detalhes técnicos permanecem disponíveis para consulta e correção."}
              </p>
              {urlField ? (
                <Link
                  href={urlField.value}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-interactive-700 hover:underline"
                >
                  Abrir no SharePoint
                  <ExternalLink className="size-3" aria-hidden />
                </Link>
              ) : null}
            </div>
          </div>

          <details className="mt-3 border-t border-current/10 pt-3">
            <summary className="cursor-pointer text-xs font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
              Ver detalhes técnicos
            </summary>
            <div className="mt-3 grid overflow-hidden rounded-(--radius-v2-md) border border-neutral-200 bg-white sm:grid-cols-2">
              {fields.map((field) => (
                <EditableIntakeField key={field.key} field={field} leadId={leadId} />
              ))}
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}

function AboutLeadCard({ lead, dueLabel }: { lead: LeadDetailData; dueLabel: string }) {
  const summary = lead.lifecycleTimeline.summary;
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b border-neutral-200 px-4 py-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Info className="size-4 text-muted-foreground" aria-hidden />
          Sobre o lead
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-neutral-200 px-4">
        <RailValue
          icon={Clock3}
          label="Tempo na etapa"
          value={summary.currentEtapaDurationLabel}
        />
        <RailValue
          icon={ShieldCheck}
          label="Due diligence"
          value={
            <Badge variant={lead.haveraDueDiligence ? "default" : "outline"}>{dueLabel}</Badge>
          }
        />
        <RailValue
          icon={CalendarDays}
          label="Criado em"
          value={<span className="tabular-nums">{formatDateTimeBr(lead.criadoEm)}</span>}
        />
        <RailValue
          icon={History}
          label="Ações registradas"
          value={<span className="tabular-nums">{summary.activityCount}</span>}
        />
      </CardContent>
    </Card>
  );
}

function RailValue({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex gap-3 py-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="mt-1 break-words text-sm font-medium text-foreground">{value}</div>
      </div>
    </div>
  );
}

function QuickActionsCard({
  contextAction,
  hasDue,
  hasRd,
  rdDealUrl,
  onNavigate,
}: {
  contextAction: { tab: "proposal" | "contract" | "billing"; label: string; icon: LucideIcon };
  hasDue: boolean;
  hasRd: boolean;
  rdDealUrl: string | null;
  onNavigate: (tab: LeadOverviewTabTarget) => void;
}) {
  const ContextIcon = contextAction.icon;
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b border-neutral-200 px-4 py-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-muted-foreground" aria-hidden />
          Ações rápidas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 p-2">
        <QuickAction icon={MessageSquareText} label="Adicionar anotação" onClick={() => onNavigate("notes")} />
        <QuickAction icon={History} label="Ver histórico completo" onClick={() => onNavigate("history")} />
        {hasDue ? (
          <QuickAction icon={ShieldCheck} label="Abrir due diligence" onClick={() => onNavigate("due")} />
        ) : null}
        <QuickAction
          icon={ContextIcon}
          label={contextAction.label}
          onClick={() => onNavigate(contextAction.tab)}
        />
        {hasRd && rdDealUrl ? (
          <Link
            href={rdDealUrl}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-9 items-center justify-between gap-3 rounded-(--radius-v2-md) px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <span className="flex items-center gap-2">
              <ExternalLink className="size-4 text-muted-foreground" aria-hidden />
              Abrir no RD Station
            </span>
            <ArrowRight className="size-3.5 text-neutral-400" aria-hidden />
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="control"
      className="w-full justify-between px-3 font-medium"
      onClick={onClick}
    >
      <span className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" aria-hidden />
        {label}
      </span>
      <ArrowRight className="size-3.5 text-neutral-400" aria-hidden />
    </Button>
  );
}

function RecentActivityCard({
  activities,
  onViewAll,
}: {
  activities: LeadActivityEvent[];
  onViewAll: () => void;
}) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row items-center justify-between border-b border-neutral-200 px-4 py-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <History className="size-4 text-muted-foreground" aria-hidden />
          Atividade recente
        </CardTitle>
        <Button type="button" variant="link" size="xs" className="px-0" onClick={onViewAll}>
          Ver todas
        </Button>
      </CardHeader>
      <CardContent className="px-0">
        {activities.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nenhuma atividade registrada.</p>
        ) : (
          <ul className="divide-y divide-neutral-200">
            {activities.map((activity) => (
              <RecentActivityRow key={activity.id} activity={activity} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RecentActivityRow({ activity }: { activity: LeadActivityEvent }) {
  return (
    <li className="px-4 py-3.5">
      <div className="flex gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-(--radius-v2-md) bg-neutral-100 text-muted-foreground">
          {createElement(activityIcon(activity.kind), {
            className: "size-3.5",
            "aria-hidden": true,
          })}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-5 text-foreground">{activity.title}</p>
          <time className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
            {formatDateTimeBr(activity.createdAt)}
          </time>
          <div className="mt-2">
            {activity.actor ? (
              <CrmUserLabel
                name={activity.actor.fullName}
                avatarUrl={activity.actor.avatarUrl}
                size="xs"
                variant="inline"
              />
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Sparkles className="size-3.5" aria-hidden />
                Sistema / automação
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function activityIcon(kind: LeadActivityEvent["kind"]): LucideIcon {
  if (kind === "lead_criado") return Sparkles;
  if (kind === "lead_perdido") return XCircle;
  if (kind === "lead_reaberto") return RotateCcw;
  if (kind === "etapa_alterada") return GitBranch;
  if (kind === "nota_adicionada") return MessageSquareText;
  if (kind.includes("contrato")) return FileSignature;
  if (kind.includes("due") || kind.includes("proposta")) return CheckCircle2;
  return UserRound;
}
