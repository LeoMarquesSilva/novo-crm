"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";

import {
  DynamicField,
  type FieldDefinition,
} from "@/components/crm/dynamic-form";
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
import { OPPORTUNITY_STAGE_LABELS } from "@/lib/crm/stage-labels";
import { isInteractionFromBaseUiSelectLayer } from "@/lib/ui/base-ui-select-dialog";
import { cn } from "@/lib/utils";
import type { OpportunityStage } from "@/modules/crm/domain/entities";

type FieldValue = string | string[] | undefined;

type TransitionRequirements = {
  nextStage: OpportunityStage;
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
};

function actionLabel(href: string): string {
  if (href.includes("tab=proposal")) return "Abrir proposta";
  if (href.includes("tab=signature")) return "Abrir assinatura";
  if (href.includes("tab=contract")) return "Abrir contrato";
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
}: {
  leadId: string;
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

  const requestAdvance = async (targetStage: OpportunityStage) => {
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
        empresasIntake?: Array<{ index: number }>;
        customFields?: FieldDefinition[];
        fieldValues?: Record<string, FieldValue>;
        warnings?: string[];
        transitionBlocker?: TransitionBlocker | null;
      };
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error ?? "Não foi possível validar a próxima etapa.");
      }
      if (payload.transitionBlocker) {
        setBlocker(payload.transitionBlocker);
        return;
      }
      if (payload.leadIntakeBlockingReason) {
        setBlocker({ message: payload.leadIntakeBlockingReason });
        return;
      }

      const fieldValues = { ...(payload.fieldValues ?? {}) };
      if (
        !fieldValues.cp_proposta_empresas_json &&
        (payload.empresasIntake?.length ?? 0) > 0
      ) {
        fieldValues.cp_proposta_empresas_json = JSON.stringify({
          primaryIndex: payload.empresasIntake![0]!.index,
          extras: [],
        });
      }

      setRequirements({
        nextStage: targetStage,
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

    const blocking = listBlockingCustomFields(
      requirements.customFields,
      requirements.fieldValues,
    );
    if (blocking.length > 0) {
      setError(
        `Preencha os campos obrigatórios: ${blocking
          .map((field) => field.label)
          .join(", ")}.`,
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const fieldValuesByCode: Record<string, string | string[]> = {};
      for (const field of requirements.customFields) {
        const value = requirements.fieldValues[field.field_code];
        if (Array.isArray(value) && value.length > 0) {
          fieldValuesByCode[field.field_code] = value;
        } else if (typeof value === "string" && value.trim()) {
          fieldValuesByCode[field.field_code] = value.trim();
        }
      }

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

      <Dialog
        modal={false}
        open={open}
        onOpenChange={(nextOpen) => {
          if (!submitting) setOpen(nextOpen);
        }}
      >
        <DialogContent
          className="max-h-[min(90dvh,760px)] max-w-xl overflow-y-auto"
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
                ? `Confirme a mudança de ${OPPORTUNITY_STAGE_LABELS[currentStage]} para ${OPPORTUNITY_STAGE_LABELS[nextStage]}.`
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

              {requirements.customFields.length > 0 ? (
                <div className="space-y-3 rounded-(--radius-v2-xl) border border-border p-4">
                  <p className="text-sm font-semibold text-foreground">
                    Campos da próxima etapa
                  </p>
                  {requirements.customFields.map((field) => (
                    <div key={field.field_code} className="space-y-1.5">
                      <Label htmlFor={field.field_code}>
                        {field.label}
                        {field.is_required ? " *" : ""}
                      </Label>
                      <DynamicField
                        field={field}
                        value={requirements.fieldValues[field.field_code]}
                        onChange={(code, value) =>
                          setRequirements((current) =>
                            current
                              ? {
                                  ...current,
                                  fieldValues: {
                                    ...current.fieldValues,
                                    [code]: value,
                                  },
                                }
                              : current,
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              ) : (
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
                {actionLabel(blocker.actionHref)}
              </Link>
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => setOpen(false)}
            >
              Cancelar
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
