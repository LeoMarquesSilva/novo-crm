"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";

import {
  buildTransitionFieldPayload,
  isReuniaoConfeccaoTransition,
  prepareConfeccaoFieldValues,
  REUNIAO_CONFECCAO_HIDDEN_FROM_GENERIC,
  REUNIAO_CONFECCAO_MANAGED_CODES,
  validateReuniaoConfeccaoValues,
  visibleTransitionCustomFields,
  withConfeccaoQualificacao,
} from "@/components/crm/confeccao-proposta-transition";
import {
  ConfeccaoReuniaoModalSection,
  type EmpresaIntakeRow,
} from "@/components/crm/confeccao-reuniao-modal-section";
import {
  DynamicField,
  type FieldDefinition,
} from "@/components/crm/dynamic-form";
import { ClientOnboardingSubmitDialog } from "@/components/crm/client-onboarding-submit-dialog";
import { SendContractSignatureDialog } from "@/components/crm/contracts/send-contract-signature-dialog";
import { LeadStageDurationStrip } from "@/components/crm/lead-stage-duration-strip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { DateInputBr } from "@/components/ui/date-input-br";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimeInputBr } from "@/components/ui/time-input-br";
import { listBlockingCustomFields } from "@/lib/crm/compute-transition-requirements";
import { getNextLeadStage } from "@/lib/crm/lead-stage-duration-strip";
import type { LeadLifecycleTimeline } from "@/lib/crm/lead-lifecycle-timeline";
import { pipelineCodeForStage } from "@/lib/crm/pipeline-board-config";
import { STAGE_ACTION_LABELS } from "@/lib/crm/stage-actions";
import { OPPORTUNITY_STAGE_LABELS } from "@/lib/crm/stage-labels";
import { userFacingFieldLabel } from "@/lib/crm/user-facing-field-label";
import { isInteractionFromBaseUiSelectLayer } from "@/lib/ui/base-ui-select-dialog";
import { cn } from "@/lib/utils";
import type { OpportunityStage } from "@/modules/crm/domain/entities";
import type { StageActionKind } from "@/modules/crm/domain/stage-transition-rules";

type FieldValue = string | string[] | undefined;

type TransitionRequirements = {
  /** Etapa do lead quando o modal abriu: o rascunho só vale enquanto ela não mudar. */
  fromStage: OpportunityStage;
  nextStage: OpportunityStage;
  /** Reunião → Confecção de Proposta: bloco dedicado (empresas, endereço, áreas, escopo). */
  reuniaoConfeccao: boolean;
  empresasIntake: EmpresaIntakeRow[];
  customFields: FieldDefinition[];
  fieldValues: Record<string, FieldValue>;
  warnings: string[];
  leadIntakeNeeded: boolean;
  localReuniao: string;
  dataReuniao: string;
  horarioReuniao: string;
  missingLinkProposta: boolean;
  missingLinkContrato: boolean;
  linkProposta: string;
  linkContrato: string;
};

type TransitionBlocker = {
  message: string;
  actionHref?: string;
  actionKind?: StageActionKind;
};

function actionLabel(href: string, kind?: StageActionKind): string {
  if (kind) return STAGE_ACTION_LABELS[kind];
  if (href.includes("tab=proposal")) return "Abrir proposta";
  if (href.includes("tab=signature")) return "Abrir assinatura";
  if (href.includes("tab=contract")) return "Abrir contrato";
  if (href.startsWith("/crm/migracao-rd")) return "Completar migração";
  return "Resolver pendência";
}

export function LeadDetailStageAdvance({
  leadId,
  currentStage,
  hasDueDiligence,
  timeline,
  canAdvance,
  linkProposta,
  linkContrato,
  leadName,
}: {
  leadId: string;
  leadName?: string | null;
  currentStage: OpportunityStage;
  hasDueDiligence: boolean;
  timeline: LeadLifecycleTimeline;
  canAdvance: boolean;
  linkProposta: string | null;
  linkContrato: string | null;
}) {
  const router = useRouter();
  const nextStage = canAdvance
    ? getNextLeadStage(currentStage, hasDueDiligence)
    : null;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requirements, setRequirements] =
    useState<TransitionRequirements | null>(null);
  const [blocker, setBlocker] = useState<TransitionBlocker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [onboardingDialogOpen, setOnboardingDialogOpen] = useState(false);

  const requestAdvance = async (
    targetStage: OpportunityStage,
    options: { discardDraft?: boolean } = {},
  ) => {
    // Contrato Elaborado → Enviado: a etapa muda pelo envio para assinatura.
    if (currentStage === "contrato_elaborado" && targetStage === "contrato_enviado") {
      setSendDialogOpen(true);
      return;
    }
    // Fechar o modal não descarta o que foi digitado: reabrir para a mesma etapa
    // devolve o rascunho em vez de buscar os requisitos de novo.
    if (
      !options.discardDraft &&
      requirements &&
      requirements.fromStage === currentStage &&
      requirements.nextStage === targetStage
    ) {
      setError(null);
      setBlocker(null);
      setOpen(true);
      return;
    }
    setOpen(true);
    setLoading(true);
    setRequirements(null);
    setBlocker(null);
    setError(null);
    try {
      const params = new URLSearchParams({
        opportunityId: leadId,
        nextStage: targetStage,
        pipeline: pipelineCodeForStage(targetStage),
      });
      const response = await fetch(
        `/api/crm/leads/transition-requirements?${params.toString()}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        leadIntakeBlockingReason?: string | null;
        missingLinkProposta?: boolean;
        missingLinkContrato?: boolean;
        leadIntake?: {
          needed?: boolean;
          showFields?: boolean;
          local_reuniao?: string;
          data_reuniao?: string;
          horario_reuniao?: string;
        } | null;
        empresasIntake?: EmpresaIntakeRow[];
        customFields?: FieldDefinition[];
        fieldValues?: Record<string, FieldValue>;
        warnings?: string[];
        transitionBlocker?: TransitionBlocker | null;
      };
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error ?? "Não foi possível validar a próxima etapa.");
      }
      if (payload.transitionBlocker) {
        if (payload.transitionBlocker.actionKind === "open_send_dialog") {
          setOpen(false);
          setSendDialogOpen(true);
          return;
        }
        // Aguardando Cadastro → Cadastro de Novo Cliente: o cadastro do cliente abre num modal.
        if (payload.transitionBlocker.actionKind === "open_onboarding") {
          setOpen(false);
          setOnboardingDialogOpen(true);
          return;
        }
        setBlocker(payload.transitionBlocker);
        return;
      }
      if (payload.leadIntakeBlockingReason) {
        setBlocker({ message: payload.leadIntakeBlockingReason });
        return;
      }

      const empresasIntake = Array.isArray(payload.empresasIntake) ? payload.empresasIntake : [];
      const fieldValues = prepareConfeccaoFieldValues({
        fieldValues: payload.fieldValues ?? {},
        empresasIntake,
      });

      setRequirements({
        fromStage: currentStage,
        nextStage: targetStage,
        reuniaoConfeccao: isReuniaoConfeccaoTransition({
          sourceStage: currentStage,
          nextStage: targetStage,
          pipeline: pipelineCodeForStage(targetStage),
        }),
        empresasIntake,
        customFields: payload.customFields ?? [],
        fieldValues,
        warnings: payload.warnings ?? [],
        leadIntakeNeeded: Boolean(
          payload.leadIntake?.needed || payload.leadIntake?.showFields,
        ),
        localReuniao: payload.leadIntake?.local_reuniao ?? "",
        dataReuniao: payload.leadIntake?.data_reuniao ?? "",
        horarioReuniao: payload.leadIntake?.horario_reuniao ?? "",
        missingLinkProposta: Boolean(payload.missingLinkProposta),
        missingLinkContrato: Boolean(payload.missingLinkContrato),
        linkProposta: linkProposta ?? "",
        linkContrato: linkContrato ?? "",
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível validar a próxima etapa.",
      );
    } finally {
      setLoading(false);
    }
  };

  const updateFieldValue = (code: string, value: string | string[]) =>
    setRequirements((current) =>
      current
        ? { ...current, fieldValues: { ...current.fieldValues, [code]: value } }
        : current,
    );

  const visibleCustomFields = requirements
    ? visibleTransitionCustomFields(requirements.customFields, requirements.fieldValues, {
        nextStage: requirements.nextStage,
        reuniaoConfeccao: requirements.reuniaoConfeccao,
      })
    : [];

  const submit = async () => {
    if (!requirements || submitting) return;
    if (
      requirements.leadIntakeNeeded &&
      (!requirements.localReuniao.trim() ||
        !requirements.dataReuniao.trim() ||
        !requirements.horarioReuniao.trim())
    ) {
      setError("Preencha local, data e horário da reunião.");
      return;
    }
    if (
      requirements.missingLinkProposta &&
      !requirements.linkProposta.trim()
    ) {
      setError("Informe o link da proposta.");
      return;
    }
    if (
      requirements.missingLinkContrato &&
      !requirements.linkContrato.trim()
    ) {
      setError("Informe o link do contrato.");
      return;
    }

    let values = requirements.fieldValues;
    if (requirements.reuniaoConfeccao) {
      const sectionError = validateReuniaoConfeccaoValues({
        customValues: requirements.fieldValues,
        empresasIntake: requirements.empresasIntake,
      });
      if (sectionError) {
        setError(sectionError);
        return;
      }
      values = withConfeccaoQualificacao({
        customValues: requirements.fieldValues,
        empresasIntake: requirements.empresasIntake,
      });
    }

    let blocking =
      requirements.nextStage === "confeccao_contrato"
        ? []
        : listBlockingCustomFields(requirements.customFields, values);
    if (requirements.reuniaoConfeccao) {
      blocking = blocking.filter(
        (field) =>
          !REUNIAO_CONFECCAO_HIDDEN_FROM_GENERIC.has(field.field_code) &&
          !REUNIAO_CONFECCAO_MANAGED_CODES.has(field.field_code),
      );
    }
    if (blocking.length > 0) {
      setError(
        `Preencha os campos obrigatórios: ${blocking
          .map((field) => userFacingFieldLabel(field.label, field.field_code))
          .join(", ")}.`,
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const fieldValuesByCode = buildTransitionFieldPayload({
        visibleFields: visibleTransitionCustomFields(requirements.customFields, values, {
          nextStage: requirements.nextStage,
          reuniaoConfeccao: requirements.reuniaoConfeccao,
        }),
        values,
        reuniaoConfeccao: requirements.reuniaoConfeccao,
      });

      const response = await fetch("/api/crm/leads/transition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityId: leadId,
          nextStage: requirements.nextStage,
          linkProposta: requirements.linkProposta.trim() || undefined,
          linkContrato: requirements.linkContrato.trim() || undefined,
          leadIntake: requirements.leadIntakeNeeded
            ? {
                local_reuniao: requirements.localReuniao.trim(),
                data_reuniao: requirements.dataReuniao.trim(),
                horario_reuniao: requirements.horarioReuniao.trim(),
              }
            : undefined,
          fieldValuesByCode:
            Object.keys(fieldValuesByCode).length > 0
              ? fieldValuesByCode
              : undefined,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        errors?: string[];
        transitionBlocker?: TransitionBlocker;
      };
      if (!response.ok || payload.ok === false) {
        if (payload.transitionBlocker) setBlocker(payload.transitionBlocker);
        throw new Error(
          payload.errors?.join("; ") ||
            payload.error ||
            "Não foi possível avançar a etapa.",
        );
      }

      setOpen(false);
      setRequirements(null);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Não foi possível avançar a etapa.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <LeadStageDurationStrip
        currentStage={currentStage}
        timeline={timeline}
        advanceStage={nextStage}
        advancing={loading}
        onAdvance={nextStage ? requestAdvance : undefined}
      />

      <SendContractSignatureDialog
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        leadId={leadId}
        leadName={leadName}
        onSent={() => router.refresh()}
      />

      <ClientOnboardingSubmitDialog
        open={onboardingDialogOpen}
        onOpenChange={setOnboardingDialogOpen}
        leadId={leadId}
        leadName={leadName}
        onSubmitted={() => router.refresh()}
      />

      <Dialog
        modal={false}
        open={open}
        onOpenChange={(nextOpen) => {
          if (!submitting) setOpen(nextOpen);
        }}
      >
        <DialogContent
          className={cn(
            "max-h-[min(90dvh,760px)] overflow-y-auto",
            requirements?.reuniaoConfeccao && !blocker
              ? "max-h-[min(90dvh,860px)] w-full max-w-[min(100vw-1.5rem,880px)] sm:max-w-[min(100vw-1.5rem,880px)]"
              : "max-w-xl",
          )}
          onPointerDownOutside={(event) => {
            if (isInteractionFromBaseUiSelectLayer(event)) event.preventDefault();
          }}
          onFocusOutside={(event) => {
            if (isInteractionFromBaseUiSelectLayer(event)) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Avançar etapa</DialogTitle>
            <DialogDescription>
              {nextStage
                ? `Confirme a mudança de ${OPPORTUNITY_STAGE_LABELS[currentStage]} para ${OPPORTUNITY_STAGE_LABELS[nextStage]}. Fechar guarda o que você preencheu até avançar.`
                : "Não há uma próxima etapa disponível."}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center gap-3 rounded-(--radius-v2-xl) border border-border p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Validando requisitos da etapa…
            </div>
          ) : blocker ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" aria-hidden />
              <AlertTitle>Existe uma pendência</AlertTitle>
              <AlertDescription>{blocker.message}</AlertDescription>
            </Alert>
          ) : requirements ? (
            <div className="space-y-4">
              {requirements.warnings.map((warning) => (
                <Alert key={warning}>
                  <AlertTitle>Atenção</AlertTitle>
                  <AlertDescription>{warning}</AlertDescription>
                </Alert>
              ))}

              {requirements.leadIntakeNeeded ? (
                <div className="space-y-3 rounded-(--radius-v2-xl) border border-border p-4">
                  <p className="text-sm font-semibold text-foreground">
                    Dados da reunião
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="detail-transition-location">Local *</Label>
                    <Input
                      id="detail-transition-location"
                      value={requirements.localReuniao}
                      disabled={submitting}
                      onChange={(event) =>
                        setRequirements((current) =>
                          current
                            ? { ...current, localReuniao: event.target.value }
                            : current,
                        )
                      }
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="detail-transition-date">Data *</Label>
                      <DateInputBr
                        id="detail-transition-date"
                        value={requirements.dataReuniao}
                        disabled={submitting}
                        onChange={(value) =>
                          setRequirements((current) =>
                            current ? { ...current, dataReuniao: value } : current,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="detail-transition-time">Horário *</Label>
                      <TimeInputBr
                        id="detail-transition-time"
                        value={requirements.horarioReuniao}
                        disabled={submitting}
                        onChange={(value) =>
                          setRequirements((current) =>
                            current
                              ? { ...current, horarioReuniao: value }
                              : current,
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {requirements.missingLinkProposta ? (
                <div className="space-y-1.5">
                  <Label htmlFor="detail-transition-proposal-link">
                    Link da proposta *
                  </Label>
                  <Input
                    id="detail-transition-proposal-link"
                    type="url"
                    value={requirements.linkProposta}
                    disabled={submitting}
                    onChange={(event) =>
                      setRequirements((current) =>
                        current
                          ? { ...current, linkProposta: event.target.value }
                          : current,
                      )
                    }
                  />
                </div>
              ) : null}

              {requirements.missingLinkContrato ? (
                <div className="space-y-1.5">
                  <Label htmlFor="detail-transition-contract-link">
                    Link do contrato *
                  </Label>
                  <Input
                    id="detail-transition-contract-link"
                    type="url"
                    value={requirements.linkContrato}
                    disabled={submitting}
                    onChange={(event) =>
                      setRequirements((current) =>
                        current
                          ? { ...current, linkContrato: event.target.value }
                          : current,
                      )
                    }
                  />
                </div>
              ) : null}

              {requirements.reuniaoConfeccao ? (
                <ConfeccaoReuniaoModalSection
                  gestorField={requirements.customFields.find(
                    (field) => field.field_code === "cp_gestor_contrato" && field.is_active !== false,
                  )}
                  empresasIntake={requirements.empresasIntake}
                  customValues={requirements.fieldValues}
                  disabled={submitting}
                  onFieldChange={updateFieldValue}
                />
              ) : null}

              {visibleCustomFields.length > 0 ? (
                <div className="space-y-3 rounded-(--radius-v2-xl) border border-border p-4">
                  <p className="text-sm font-semibold text-foreground">
                    {requirements.reuniaoConfeccao ? "Campos adicionais da etapa" : "Campos da próxima etapa"}
                  </p>
                  {visibleCustomFields.map((field) => (
                    <div key={field.field_code} className="space-y-1.5">
                      <Label htmlFor={field.field_code}>
                        {userFacingFieldLabel(field.label, field.field_code)}
                        {field.is_required ? " *" : ""}
                      </Label>
                      <DynamicField
                        field={field}
                        value={requirements.fieldValues[field.field_code]}
                        onChange={updateFieldValue}
                      />
                    </div>
                  ))}
                </div>
              ) : requirements.reuniaoConfeccao ? null : (
                <p className="rounded-(--radius-v2-xl) border border-success-border bg-success-bg p-4 text-sm text-success-text">
                  Todos os requisitos estão atendidos. Confirme para avançar.
                </p>
              )}
            </div>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter className="gap-2">
            {blocker?.actionHref ? (
              <Link
                href={blocker.actionHref}
                className={cn(buttonVariants({ variant: "cta" }), "mr-auto")}
                onClick={() => setOpen(false)}
              >
                {actionLabel(blocker.actionHref, blocker.actionKind)}
              </Link>
            ) : null}
            {requirements && !blocker && !loading && nextStage ? (
              <Button
                type="button"
                variant="ghost"
                className="mr-auto"
                disabled={submitting}
                onClick={() => void requestAdvance(nextStage, { discardDraft: true })}
              >
                Recomeçar
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => setOpen(false)}
            >
              Fechar
            </Button>
            {requirements && !blocker ? (
              <Button
                type="button"
                variant="cta"
                disabled={loading || submitting}
                onClick={() => void submit()}
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <ArrowRight className="size-4" aria-hidden />
                )}
                Confirmar etapa
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
