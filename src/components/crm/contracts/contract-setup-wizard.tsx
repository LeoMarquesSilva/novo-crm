"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Save } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInputBr } from "@/components/ui/date-input-br";
import { Select, SelectTrigger } from "@/components/ui/select";
import { CrmSelectContent, CrmSelectItem, CrmSelectValue } from "@/components/crm/crm-select";
import { AreaIconLabel } from "@/lib/crm/area-lucide-icon";
import type {
  ContractConfigurationDraft,
  ContractDetailViewModel,
  ContractSource,
} from "@/modules/contracts/infrastructure/contract-queries";

import { ContractAllocationsEditor } from "./contract-allocations-editor";
import { ContractAreasEditor } from "./contract-areas-editor";
import { ContractComponentsEditor } from "./contract-components-editor";
import { ContractResponsiblesEditor } from "./contract-responsibles-editor";
import { ContractSharesCommissionsEditor } from "./contract-shares-commissions-editor";
import {
  ADJUSTMENT_INDEX_LABELS,
  ADJUSTMENT_INDEX_OPTIONS,
  BILLING_KIND_LABELS,
  TRIGGER_KINDS,
  basisPointsToMaskedPercent,
  centsToMaskedBrl,
} from "./contract-setup-form-helpers";

const steps = [
  "Identificação e vigência",
  "Áreas e preços",
  "Componentes e condições",
  "Rateios por área",
  "Origem e comissões",
  "Projeção e ativação",
];

const sourceLabels: Record<ContractSource, string> = {
  proposta: "Proposta",
  contrato: "Contrato",
  rd: "RD",
  manual: "Manual",
};

type Issue = { path?: Array<string | number>; message: string };
type ApiResult = { ok: boolean; updatedAt?: string; error?: string; issues?: Issue[] };

function stringify(value: unknown) {
  return JSON.stringify(value);
}

function projection(configuration: ContractConfigurationDraft): number {
  const recurring = new Set(["mensal_fixo", "mensal_escalonado", "manutencao", "mensal_condicionado"]);
  return configuration.version.components.reduce((sum, component) => {
    if (recurring.has(component.kind)) return sum + Number(component.amountCents ?? 0);
    if (component.kind === "mensal_preco_fechado") {
      return sum + Number(component.installments?.[0]?.amountCents ?? 0);
    }
    return sum;
  }, 0);
}

export function ContractSetupWizard({
  contract,
  canConfigure,
  returnTarget,
}: {
  contract: ContractDetailViewModel;
  canConfigure: boolean;
  returnTarget: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [configuration, setConfiguration] = useState(contract.configuration);
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(contract.expectedVersionUpdatedAt);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const initial = useMemo(() => stringify(contract.configuration), [contract.configuration]);
  const [baseline, setBaseline] = useState(initial);
  const dirty = configuration !== null && stringify(configuration) !== baseline;

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    const guardLink = (event: MouseEvent) => {
      if (
        !dirty ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const anchor = (event.target as Element | null)?.closest("a[href]");
      if (!anchor || anchor.getAttribute("target") === "_blank" || anchor.getAttribute("href")?.startsWith("#")) {
        return;
      }
      if (!window.confirm("Há alterações não salvas. Deseja sair desta página?")) event.preventDefault();
    };
    document.addEventListener("click", guardLink, true);
    return () => {
      window.removeEventListener("beforeunload", guard);
      document.removeEventListener("click", guardLink, true);
    };
  }, [dirty]);

  if (!configuration || !expectedUpdatedAt) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Este contrato ainda não possui uma versão configurável.
      </div>
    );
  }

  const sourceChanges = Object.entries(contract.sourceFields).filter(([key, field]) => {
    if (field.source === "manual") return false;
    const current =
      key === "clientId"
        ? configuration.clientId
        : key === "startsAt"
          ? configuration.startsAt
          : key === "effectiveTo"
            ? configuration.version.effectiveTo
            : key === "indefinite"
              ? configuration.indefinite
              : key === "dueDay"
                ? configuration.dueDay
                : key === "renewalDate"
                  ? configuration.renewalDate
                  : key === "renewalAlertDate"
                    ? configuration.renewalAlertDate
                    : key === "adjustmentIndex"
                      ? configuration.adjustmentIndex
                      : key === "firstInvoiceAt"
                        ? configuration.firstInvoiceAt
                        : key === "areas"
                          ? configuration.areas
                          : key === "components"
                            ? configuration.version.components
                            : key === "allocations"
                              ? configuration.version.areaAllocations
                              : key === "partnerShares"
                                ? configuration.version.partnerShares
                                : key === "commissions"
                                  ? configuration.version.commissions
                                  : undefined;
    return stringify(current) !== stringify(JSON.parse(field.originalValue));
  });

  const triggers = configuration.version.components.filter(
    (component) => TRIGGER_KINDS.has(component.kind) || Boolean(component.requiresManualRelease),
  );
  const areaById = new Map(configuration.areas.map((area) => [area.id, area.areaKey]));
  const clientLabels = Object.fromEntries(contract.clients.map((client) => [client.id, client.name]));

  const patch = (next: Partial<ContractConfigurationDraft>) => {
    setConfiguration((current) => (current ? { ...current, ...next } : current));
    setMessage(null);
  };
  const patchVersion = (next: Partial<ContractConfigurationDraft["version"]>) => {
    setConfiguration((current) =>
      current ? { ...current, version: { ...current.version, ...next } } : current,
    );
    setMessage(null);
  };

  async function saveDraft(): Promise<string | null> {
    setIssues([]);
    setMessage(null);
    if (sourceChanges.length && (!overrideConfirmed || !overrideReason.trim())) {
      setMessage("Confirme a substituição e informe o motivo para alterar dados sugeridos.");
      return null;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/crm/contracts/${contract.id}/configuration`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersionUpdatedAt: expectedUpdatedAt,
          configuration: {
            ...configuration,
            substitutionEvidence: sourceChanges.map(([field, source]) => ({
              field,
              source: source.source,
              originalValue: source.originalValue,
              overrideReason: overrideReason.trim(),
            })),
          },
        }),
      });
      const result = (await response.json()) as ApiResult;
      if (!response.ok || !result.ok || !result.updatedAt) {
        setIssues(result.issues ?? []);
        setMessage(
          response.status === 409
            ? (result.error ?? "O contrato foi alterado por outra pessoa. Revise antes de salvar novamente.")
            : (result.error ?? "Não foi possível salvar o rascunho."),
        );
        return null;
      }
      setExpectedUpdatedAt(result.updatedAt);
      setBaseline(stringify(configuration));
      setMessage("Rascunho salvo.");
      router.refresh();
      return result.updatedAt;
    } catch {
      setMessage("Falha de conexão ao salvar. Seus valores permanecem nesta tela.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    const currentConfiguration = configuration;
    if (!currentConfiguration) return;
    const updatedAt = dirty ? await saveDraft() : expectedUpdatedAt;
    if (!updatedAt) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/crm/contracts/${contract.id}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: currentConfiguration.version.id,
          expectedVersionUpdatedAt: updatedAt,
          advanceOpportunity: Boolean(contract.opportunityId),
        }),
      });
      const result = (await response.json()) as ApiResult;
      if (!response.ok || !result.ok) {
        setIssues(result.issues ?? []);
        setMessage(
          response.status === 409
            ? (result.error ??
                "O contrato foi alterado por outra pessoa. Seus dados foram mantidos; atualize a versão antes de ativar.")
            : (result.error ?? "Não foi possível ativar o contrato."),
        );
        return;
      }
      router.refresh();
      router.push(returnTarget);
    } catch {
      setMessage("Falha de conexão ao ativar. Seus valores permanecem nesta tela.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4" aria-label="Assistente de configuração do contrato">
      <ol className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {steps.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => setStep(index)}
              aria-current={step === index ? "step" : undefined}
              className={`w-full rounded-xl border p-3 text-left text-xs font-medium ${
                step === index
                  ? "border-teal-500 bg-teal-50 text-teal-900"
                  : "border-zinc-200 bg-white text-zinc-600"
              }`}
            >
              <span className="mb-1 block text-[10px] uppercase tracking-wide">Etapa {index + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-zinc-900">{steps[step]}</h3>
            <p className="text-sm text-zinc-500">{dirty ? "Alterações não salvas" : "Rascunho sincronizado"}</p>
          </div>
          <SourceBadges
            fields={contract.sourceFields}
            keys={
              step === 0
                ? [
                    "clientId",
                    "startsAt",
                    "effectiveTo",
                    "indefinite",
                    "dueDay",
                    "renewalDate",
                    "renewalAlertDate",
                    "adjustmentIndex",
                    "firstInvoiceAt",
                  ]
                : step === 1
                  ? ["areas"]
                  : step === 2
                    ? ["components"]
                    : step === 3
                      ? ["allocations"]
                      : step === 4
                        ? ["partnerShares", "commissions"]
                        : []
            }
          />
        </div>

        {step === 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Cliente">
              <Select
                items={clientLabels}
                value={configuration.clientId ?? ""}
                disabled={!canConfigure}
                onValueChange={(next) => patch({ clientId: next || null })}
              >
                <SelectTrigger className="!h-10 w-full border-[#dfe5ee] bg-white shadow-sm">
                  <CrmSelectValue
                    value={configuration.clientId}
                    labels={clientLabels}
                    placeholder="Selecione o cliente"
                  />
                </SelectTrigger>
                <CrmSelectContent>
                  {contract.clients.map((client) => (
                    <CrmSelectItem key={client.id} value={client.id}>
                      {client.name}
                    </CrmSelectItem>
                  ))}
                </CrmSelectContent>
              </Select>
            </Field>
            <Field label="Início da vigência">
              <DateInputBr
                value={configuration.startsAt ?? ""}
                disabled={!canConfigure}
                className="!h-10 border-[#dfe5ee] bg-white shadow-sm"
                onChange={(ymd) =>
                  patch({
                    startsAt: ymd || null,
                    version: { ...configuration.version, effectiveFrom: ymd },
                  })
                }
              />
            </Field>
            <Field label="Fim da vigência">
              <DateInputBr
                value={configuration.version.effectiveTo ?? ""}
                disabled={!canConfigure}
                className="!h-10 border-[#dfe5ee] bg-white shadow-sm"
                onChange={(ymd) => patchVersion({ effectiveTo: ymd || null })}
              />
            </Field>
            <label className="flex items-center gap-2 self-end rounded-xl border border-zinc-200 p-3 text-sm">
              <input
                type="checkbox"
                checked={configuration.indefinite}
                disabled={!canConfigure}
                onChange={(event) =>
                  patch({
                    indefinite: event.target.checked,
                    version: {
                      ...configuration.version,
                      effectiveTo: event.target.checked ? null : configuration.version.effectiveTo,
                    },
                  })
                }
              />
              Prazo indeterminado
            </label>
            <Field label="Dia de vencimento">
              <Input
                type="number"
                min={1}
                max={31}
                value={configuration.dueDay ?? ""}
                disabled={!canConfigure}
                onChange={(event) =>
                  patch({ dueDay: event.target.value ? Number(event.target.value) : null })
                }
              />
            </Field>
            <Field label="Data-base de renovação">
              <DateInputBr
                value={configuration.renewalDate ?? ""}
                disabled={!canConfigure}
                className="!h-10 border-[#dfe5ee] bg-white shadow-sm"
                onChange={(ymd) => patch({ renewalDate: ymd || null })}
              />
            </Field>
            <Field label="Data do alerta de renovação">
              <DateInputBr
                value={configuration.renewalAlertDate ?? ""}
                disabled={!canConfigure}
                className="!h-10 border-[#dfe5ee] bg-white shadow-sm"
                onChange={(ymd) => patch({ renewalAlertDate: ymd || null })}
              />
            </Field>
            <Field label="Índice de reajuste">
              <Select
                items={ADJUSTMENT_INDEX_LABELS}
                value={configuration.adjustmentIndex ?? ""}
                disabled={!canConfigure}
                onValueChange={(next) => patch({ adjustmentIndex: next || null })}
              >
                <SelectTrigger className="!h-10 w-full border-[#dfe5ee] bg-white shadow-sm">
                  <CrmSelectValue
                    value={configuration.adjustmentIndex}
                    labels={ADJUSTMENT_INDEX_LABELS}
                    placeholder="Selecione o índice"
                  />
                </SelectTrigger>
                <CrmSelectContent>
                  {ADJUSTMENT_INDEX_OPTIONS.map((option) => (
                    <CrmSelectItem key={option} value={option}>
                      {option}
                    </CrmSelectItem>
                  ))}
                  {configuration.adjustmentIndex &&
                  !ADJUSTMENT_INDEX_OPTIONS.includes(
                    configuration.adjustmentIndex as (typeof ADJUSTMENT_INDEX_OPTIONS)[number],
                  ) ? (
                    <CrmSelectItem value={configuration.adjustmentIndex}>
                      {configuration.adjustmentIndex}
                    </CrmSelectItem>
                  ) : null}
                </CrmSelectContent>
              </Select>
            </Field>
            <Field label="Primeiro vencimento">
              <DateInputBr
                value={configuration.firstInvoiceAt ?? ""}
                disabled={!canConfigure || configuration.firstInvoiceConditioned}
                className="!h-10 border-[#dfe5ee] bg-white shadow-sm"
                onChange={(ymd) => patch({ firstInvoiceAt: ymd || null })}
              />
            </Field>
            <label className="flex items-center gap-2 self-end rounded-xl border border-zinc-200 p-3 text-sm">
              <input
                type="checkbox"
                checked={configuration.firstInvoiceConditioned}
                disabled={!canConfigure}
                onChange={(event) =>
                  patch({
                    firstInvoiceConditioned: event.target.checked,
                    firstInvoiceAt: event.target.checked ? null : configuration.firstInvoiceAt,
                  })
                }
              />
              Vencimento condicionado
            </label>
            <ContractResponsiblesEditor
              value={configuration.responsibles}
              users={contract.users}
              disabled={!canConfigure}
              onChange={(responsibles) => patch({ responsibles })}
            />
          </div>
        ) : null}

        {step === 1 ? (
          <ContractAreasEditor
            value={configuration.areas}
            disabled={!canConfigure}
            onChange={(areas) => patch({ areas })}
          />
        ) : null}

        {step === 2 ? (
          <ContractComponentsEditor
            value={configuration.version.components}
            areas={configuration.areas}
            startsAt={configuration.startsAt}
            disabled={!canConfigure}
            onChange={(components) => patchVersion({ components })}
          />
        ) : null}

        {step === 3 ? (
          <ContractAllocationsEditor
            value={configuration.version.areaAllocations}
            areas={configuration.areas}
            components={configuration.version.components}
            disabled={!canConfigure}
            onChange={(areaAllocations) => patchVersion({ areaAllocations })}
          />
        ) : null}

        {step === 4 ? (
          <ContractSharesCommissionsEditor
            partnerShares={configuration.version.partnerShares}
            commissions={configuration.version.commissions}
            users={contract.users}
            disabled={!canConfigure}
            onPartnerSharesChange={(partnerShares) => patchVersion({ partnerShares })}
            onCommissionsChange={(commissions) => patchVersion({ commissions })}
          />
        ) : null}

        {step === 5 ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-[#102033] p-5 text-white">
              <p className="text-xs uppercase tracking-wide text-slate-400">Projeção mensal estimada</p>
              <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
                {centsToMaskedBrl(projection(configuration)) || "R$ 0,00"}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Inclui apenas componentes recorrentes. Gatilhos de êxito ficam de fora até liberação manual.
              </p>
            </div>

            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <h4 className="font-semibold text-amber-950">Gatilhos</h4>
                  <p className="text-sm text-amber-800">
                    Valores condicionados (êxito, spot, acordo etc.) só entram no faturamento após liberação.
                  </p>
                </div>
                <Badge className="bg-amber-100 text-amber-900">{triggers.length}</Badge>
              </div>
              {triggers.length === 0 ? (
                <p className="text-sm text-amber-800">Nenhum gatilho configurado neste rascunho.</p>
              ) : (
                <ul className="space-y-2">
                  {triggers.map((trigger) => {
                    const areaName = trigger.areaId ? areaById.get(trigger.areaId) : null;
                    const amountLabel =
                      trigger.kind === "exito_percentual"
                        ? basisPointsToMaskedPercent(trigger.percentageBasisPoints) || "—"
                        : centsToMaskedBrl(trigger.amountCents) || "Valor sob liberação";
                    return (
                      <li
                        key={trigger.id}
                        className="rounded-xl border border-amber-200 bg-white px-3 py-3 text-sm text-[#102033]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong>{trigger.description}</strong>
                          <Badge variant="outline">
                            {BILLING_KIND_LABELS[trigger.kind] ?? trigger.kind}
                          </Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-slate-600">
                          {areaName ? <AreaIconLabel area={areaName} size="sm" /> : null}
                          <span className="font-mono tabular-nums tracking-tight">{amountLabel}</span>
                        </div>
                        {trigger.reason ? (
                          <p className="mt-2 text-xs text-amber-900">Condição: {trigger.reason}</p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <Button type="button" onClick={activate} disabled={!canConfigure || busy} className="w-full">
              Ativar contrato e avançar etapa
            </Button>
          </div>
        ) : null}

        {sourceChanges.length ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex gap-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>
                Você alterou sugestões vindas de{" "}
                {sourceChanges.map(([, field]) => sourceLabels[field.source]).join(", ")}.
              </p>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={overrideConfirmed}
                onChange={(event) => setOverrideConfirmed(event.target.checked)}
                disabled={!canConfigure}
              />
              Confirmo a substituição dos valores sugeridos.
            </label>
            <label className="mt-3 block text-sm font-medium">
              Motivo da substituição
              <textarea
                className="mt-1 min-h-20 w-full rounded-xl border border-amber-300 bg-white p-3 font-normal"
                value={overrideReason}
                onChange={(event) => setOverrideReason(event.target.value)}
                disabled={!canConfigure}
              />
            </label>
          </div>
        ) : null}

        {issues.length ? (
          <ul role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {issues.map((issue, index) => (
              <li key={`${issue.path?.join(".")}-${index}`}>
                <strong>{issue.path?.join(".") || "Configuração"}:</strong> {issue.message}
              </li>
            ))}
          </ul>
        ) : null}
        {message ? (
          <p role="status" className="mt-4 rounded-xl bg-zinc-100 p-3 text-sm text-zinc-700">
            {message}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep((value) => Math.max(0, value - 1))}
            disabled={step === 0}
          >
            <ChevronLeft />
            Anterior
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={saveDraft} disabled={!canConfigure || busy}>
              <Save />
              Salvar rascunho
            </Button>
            {step < steps.length - 1 ? (
              <Button type="button" onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}>
                Próxima
                <ChevronRight />
              </Button>
            ) : (
              <Badge className="gap-1 bg-teal-100 text-teal-800">
                <Check className="size-3" />
                Etapa final
              </Badge>
            )}
          </div>
        </div>
        {!canConfigure ? (
          <p className="mt-3 text-sm text-amber-700">Seu perfil possui acesso somente para consulta.</p>
        ) : null}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 text-sm font-medium text-zinc-700">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SourceBadges({
  fields,
  keys,
}: {
  fields: ContractDetailViewModel["sourceFields"];
  keys: string[];
}) {
  const sources = [
    ...new Set(
      keys
        .map((key) => fields[key]?.source)
        .filter((source): source is ContractSource => Boolean(source)),
    ),
  ];

  if (sources.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      <Badge variant="outline">
        {sources.length === 1
          ? `Origem: ${sourceLabels[sources[0]!]}`
          : `Origem: ${sources.map((source) => sourceLabels[source]).join(" · ")}`}
      </Badge>
    </div>
  );
}
