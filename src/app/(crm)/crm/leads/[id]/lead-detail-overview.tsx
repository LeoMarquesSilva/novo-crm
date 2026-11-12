"use client";

import { createElement, useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Cloud,
  ExternalLink,
  FileSignature,
  GitBranch,
  History,
  Handshake,
  Layers3,
  MapPin,
  MessageSquareText,
  RotateCcw,
  Sparkles,
  UserRound,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CrmUserLabel } from "@/components/crm/crm-user-label";
import { formatDateTimeBr } from "@/lib/format-datetime";
import { cn } from "@/lib/utils";
import { leadAreas, leadDigitalPlatforms } from "@/modules/crm/application/services/new-lead-payload";
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
  | "due"
  | "crm"
  | "notes"
  | "signature"
  | "history";

type IntakeField = LeadDetailData["intakeFields"][number];
type IntakeGroupKey = "requester" | "schedule" | "commercial" | "other" | "integration";

const HIDDEN_INTAKE_KEYS = new Set([
  "due_diligence_intake",
  "tipo_lead",
  "plataforma",
  "area_cross_selling",
  "decisor",
  "decisor_telefone",
  "decisor_email",
]);
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

/** Célula da grade de 2 colunas: fio em cima e, na coluna da esquerda, fio à direita. */
const CELL = "border-t border-neutral-200 sm:odd:border-r";

export function LeadDetailOverview({
  lead,
  leadTypeDisplay,
  dueLabel,
  isCrossSellingLead,
  onNavigate,
}: {
  lead: LeadDetailData;
  leadTypeDisplay: string;
  dueLabel: string;
  isCrossSellingLead: boolean;
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

  // Origem, etapa e datas ficam no cabeçalho e na faixa de etapas (12/11/2026). Aqui só o que se
  // edita do lead; "Sobre o lead" e "Ações rápidas" saíram (repetiam o cabeçalho e as abas).
  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        <Card className="gap-0 py-0">
          <CardHeader className="px-5 py-4 sm:px-6">
            <SectionTitle title="Dados do lead" />
          </CardHeader>
          <CardContent className="grid px-0 sm:grid-cols-2">
            {leadTypeDisplay === "Lead Digital" ? (
              <LeadDetailFieldEditor
                leadId={lead.id}
                scope="intake"
                fieldKey="plataforma"
                label="Plataforma *"
                value={lead.intakeFields.find((field) => field.key === "plataforma")?.value ?? ""}
                kind="select"
                selectOptions={[...leadDigitalPlatforms]}
                displayVariant="row"
                className={CELL}
              />
            ) : null}
            <LeadDetailFieldEditor
              leadId={lead.id}
              scope="intake"
              fieldKey="solicitante_nome"
              label="Empresa / nome do lead"
              value={lead.solicitante}
              kind="text"
              labelIcon={Building2}
              displayVariant="row"
              className={CELL}
            />
            <LeadDetailFieldEditor
              leadId={lead.id}
              scope="intake"
              fieldKey="havera_due_diligence"
              label="Due diligence"
              value={dueLabel}
              kind="yesno"
              displayVariant="row"
              className={CELL}
            />
            {isCrossSellingLead ? (
              <OverviewValue
                label="Cliente vinculado"
                value={lead.clienteId || "Ainda sem cliente vinculado"}
                muted={!lead.clienteId}
              />
            ) : null}
            {isCrossSellingLead ? (
              <LeadDetailFieldEditor
                leadId={lead.id}
                scope="intake"
                fieldKey="area_cross_selling"
                label="Áreas *"
                value={lead.intakeFields.find((field) => field.key === "area_cross_selling")?.value ?? ""}
                kind="multiselect"
                selectOptions={[...leadAreas]}
                displayVariant="row"
                className={CELL}
              />
            ) : null}
            <LeadDetailFieldEditor
              leadId={lead.id}
              scope="intake"
              fieldKey="decisor"
              label="Decisor"
              value={lead.intakeFields.find((field) => field.key === "decisor")?.value ?? ""}
              kind="text"
              displayVariant="row"
              className={CELL}
            />
            <LeadDetailFieldEditor
              leadId={lead.id}
              scope="intake"
              fieldKey="decisor_telefone"
              label="Telefone do decisor"
              value={lead.intakeFields.find((field) => field.key === "decisor_telefone")?.value ?? ""}
              kind="text"
              displayVariant="row"
              className={CELL}
            />
            <LeadDetailFieldEditor
              leadId={lead.id}
              scope="intake"
              fieldKey="decisor_email"
              label="E-mail do decisor"
              value={lead.intakeFields.find((field) => field.key === "decisor_email")?.value ?? ""}
              kind="text"
              displayVariant="row"
              className={CELL}
            />
          </CardContent>
        </Card>

        {hasIntakeData ? (
          <Card className="gap-0 py-0">
            <CardHeader className="px-5 py-4 sm:px-6">
              <SectionTitle title="Cadastro inicial" />
            </CardHeader>
            <CardContent className="px-0">
              <IntakeFieldGroup
                title="Solicitante e cadastro"
                fields={groups.requester}
                leadId={lead.id}
                mergeSolicitanteIdentity
              />
              <IntakeFieldGroup title="Prazos e reunião" fields={groups.schedule} leadId={lead.id} />
              <IntakeFieldGroup title="Escopo e indicação" fields={groups.commercial} leadId={lead.id} />
              <IntakeFieldGroup title="Outras informações" fields={groups.other} leadId={lead.id} />

              {lead.empresasIntake.length > 0 || lead.isSystemCreated ? (
                <CollapsibleGroup title="Empresas">
                  {lead.empresasIntake.length > 0 ? (
                    <div className="divide-y divide-neutral-200 border-t border-neutral-200">
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
                    <p className="px-4 pb-4 text-sm text-muted-foreground">Nenhuma empresa vinculada.</p>
                  )}
                  {lead.isSystemCreated ? (
                    <LeadAddEmpresaButton leadId={lead.id} className="border-t border-neutral-200 px-4 py-4" />
                  ) : null}
                </CollapsibleGroup>
              ) : null}

              {groups.integration.length > 0 ? (
                <IntegrationSummary leadId={lead.id} fields={groups.integration} />
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <Card className="p-6">
            <SectionTitle
              title="Sem cadastro inicial"
              description="Não há campos de abertura salvos para este lead."
            />
          </Card>
        )}
      </div>

      <aside className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:self-start">
        <RecentActivityCard
          activities={lead.lifecycleTimeline.activities.slice(0, 3)}
          onViewAll={() => onNavigate("history")}
        />
      </aside>
    </div>
  );
}

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="min-w-0">
      <CardTitle className="text-v2-heading-md text-foreground">{title}</CardTitle>
      {description ? <p className="mt-0.5 text-sm leading-5 text-muted-foreground">{description}</p> : null}
    </div>
  );
}

function OverviewValue({
  label,
  value,
  muted = false,
  tabular = false,
  icon: Icon,
}: {
  label: string;
  value: string;
  muted?: boolean;
  tabular?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <div className={cn("min-w-0 bg-white px-4 py-3.5", CELL)}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null}
        {label}
      </p>
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

function IntakeFieldGroup({
  title,
  fields,
  leadId,
  mergeSolicitanteIdentity = false,
}: {
  title: string;
  fields: IntakeField[];
  leadId: string;
  mergeSolicitanteIdentity?: boolean;
}) {
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
  const indicationTypeFromFields = fields.find((field) => field.key === "tipo_indicacao")?.value;
  const [indicationType, setIndicationType] = useState(indicationTypeFromFields);

  useEffect(() => {
    setIndicationType(indicationTypeFromFields);
  }, [indicationTypeFromFields]);

  if (fields.length === 0) return null;

  return (
    <CollapsibleGroup title={title}>
      <div className="grid sm:grid-cols-2">
        {mergeSolicitanteIdentity && (solicitanteNameField || solicitanteEmailField) ? (
          <LeadDetailFieldEditor
            leadId={leadId}
            scope="intake"
            fieldKey="solicitante_interno"
            label="Captador"
            value={solicitanteEmailField?.value ?? solicitanteNameField?.value ?? ""}
            kind="user"
            resolvedUser={solicitanteResolvedUser}
            userIdentityMode="email"
            allowExternalUser={false}
            labelIcon={UserRound}
            displayVariant="row"
            className={CELL}
          />
        ) : null}
        {visibleFields.map((field) => (
          <EditableIntakeField
            key={field.key}
            field={field}
            leadId={leadId}
            indicationType={indicationType}
            onAfterSave={
              field.key === "tipo_indicacao" ? (savedValue) => setIndicationType(savedValue) : undefined
            }
          />
        ))}
      </div>
    </CollapsibleGroup>
  );
}

function CollapsibleGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();

  return (
    <section className="border-t border-neutral-200">
      <header className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-5 text-foreground">{title}</h3>
          {description ? <p className="text-xs leading-4 text-muted-foreground">{description}</p> : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 gap-1.5 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((current) => !current)}
        >
          <span className="hidden sm:inline">{expanded ? "Recolher" : "Expandir"}</span>
          <span className="sr-only sm:hidden">{expanded ? `Recolher ${title}` : `Expandir ${title}`}</span>
          <ChevronDown
            className={cn("size-4 transition-transform duration-200", expanded && "rotate-180")}
            aria-hidden
          />
        </Button>
      </header>
      {expanded ? <div id={contentId}>{children}</div> : null}
    </section>
  );
}

function EditableIntakeField({
  field,
  leadId,
  indicationType,
  onAfterSave,
}: {
  field: IntakeField;
  leadId: string;
  indicationType?: string;
  onAfterSave?: (savedValue: string) => void;
}) {
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
      labelIcon={intakeFieldIcon(field.key)}
      indicationType={field.key === "nome_indicacao" ? indicationType : undefined}
      onAfterSave={onAfterSave}
      resolvedUser={field.resolvedUser}
      userIdentityMode={
        field.key === "email_solicitante" || field.key === "cadastrado_por" ? "email" : "uuid"
      }
      allowExternalUser={field.key !== "cadastrado_por"}
      displayVariant="row"
      className={cn(CELL, long && "sm:col-span-2 sm:border-r-0")}
    />
  );
}

function intakeFieldIcon(fieldKey: string): LucideIcon | undefined {
  if (fieldKey.startsWith("data_")) return CalendarDays;
  if (fieldKey.startsWith("horario_")) return Clock3;
  if (fieldKey === "areas_analise") return Layers3;
  if (fieldKey === "local_reuniao") return MapPin;
  if (fieldKey === "tipo_indicacao" || fieldKey === "nome_indicacao") return Handshake;
  if (
    fieldKey === "solicitante_nome" ||
    fieldKey === "email_solicitante" ||
    fieldKey === "cadastrado_por"
  ) {
    return UserRound;
  }
  return undefined;
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
    <CollapsibleGroup
      title="Integração SharePoint"
      description="Estado técnico do agendamento criado a partir deste cadastro."
    >
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
    </CollapsibleGroup>
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
