"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Save, Send, TriangleAlert } from "lucide-react";

import { ClientOnboardingForm } from "@/app/(crm)/crm/leads/[id]/client-onboarding/client-onboarding-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { dialogSelectOutsideHandlers } from "@/lib/ui/base-ui-select-dialog";
import {
  listMissingCadastroFields,
  listMissingFaturamentoFields,
  type ClientOnboardingPayload,
  type ClientOnboardingStatus,
  type OnboardingParty,
} from "@/modules/crm/domain/client-onboarding";

/**
 * Passo do pós-venda que o modal conduz:
 * - `cadastro`: Aguardando Cadastro → Cadastro de Novo Cliente (vai para Operações Legais).
 * - `faturamento`: Cadastro de Novo Cliente (cadastro concluído) → Inclusão no Faturamento.
 */
export type OnboardingDialogStep = "cadastro" | "faturamento";

type OnboardingState = {
  stage: string;
  migrationPending: boolean;
  status: ClientOnboardingStatus | null;
  returnComment: string | null;
  updatedAt: string | null;
  leadParties: OnboardingParty[];
  permissions: { editCadastro: boolean; editFaturamento: boolean; submit: boolean; submitBilling: boolean };
};

const STEP_COPY: Record<
  OnboardingDialogStep,
  { title: string; description: string; submit: string; submitUrl: string; nextStage: string }
> = {
  cadastro: {
    title: "Cadastro do cliente",
    description:
      "Confira e complete o cadastro: o que já foi informado no lead vem preenchido. Ao enviar, o lead vai para Cadastro de Novo Cliente, com Operações Legais. Fechar guarda o rascunho.",
    submit: "Enviar para Operações Legais",
    submitUrl: "submit",
    nextStage: "cadastro_novo_cliente",
  },
  faturamento: {
    title: "Dados do faturamento",
    description:
      "Revise os dados do faturamento (o que já foi informado vem preenchido). Ao enviar, o lead vai para Inclusão no Faturamento, com o Financeiro, mesmo que Operações Legais ainda esteja conferindo o cadastro. Fechar guarda o rascunho.",
    submit: "Enviar para o Financeiro",
    submitUrl: "billing",
    nextStage: "inclusao_faturamento",
  },
};

function blockReasonFor(step: OnboardingDialogStep, state: OnboardingState): string | null {
  if (state.migrationPending) return "O cadastro do cliente ainda não foi habilitado no banco.";
  if (step === "cadastro") {
    if (state.stage !== "aguardando_cadastro") return "O lead já saiu de Aguardando Cadastro. Atualize a página.";
    if (!state.permissions.submit) {
      return "Só o responsável pelo lead, o comercial e o admin enviam o cadastro para Operações Legais.";
    }
    return null;
  }
  // Não espera Operações Legais: o cadastro segue em paralelo.
  if (state.stage !== "cadastro_novo_cliente") return "O lead não está em Cadastro de Novo Cliente. Atualize a página.";
  if (!state.permissions.submitBilling) {
    return "Só o responsável pelo lead, o comercial e o admin enviam os dados do faturamento.";
  }
  return null;
}

/**
 * Os passos do pós-venda pelo kanban ou pelo "Avançar" da ficha: o mesmo formulário da aba
 * Cadastro, num modal, já com o rascunho salvo e o pré-preenchimento do lead. Enviar muda a
 * etapa; fechar guarda o rascunho.
 */
export function ClientOnboardingSubmitDialog({
  open,
  onOpenChange,
  leadId,
  leadName,
  step = "cadastro",
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName?: string | null;
  step?: OnboardingDialogStep;
  onSubmitted: (result: { stage: string }) => void;
}) {
  const base = `/api/crm/leads/${encodeURIComponent(leadId)}/onboarding`;
  const copy = STEP_COPY[step];
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [state, setState] = useState<OnboardingState | null>(null);
  const [payload, setPayload] = useState<ClientOnboardingPayload | null>(null);
  const [dirty, setDirtyState] = useState(false);
  const dirtyRef = useRef(false);
  const setDirty = (value: boolean) => {
    dirtyRef.current = value;
    setDirtyState(value);
  };
  const [busy, setBusy] = useState<"saving" | "submitting" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Reabrir sem ter salvo mantém o que foi digitado.
    if (!open || dirtyRef.current) return;
    let active = true;
    setLoading(true);
    setLoadError(null);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(base, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          stage?: string;
          migrationPending?: boolean;
          onboarding?: { status: ClientOnboardingStatus; returnComment: string | null; updatedAt: string } | null;
          payload?: ClientOnboardingPayload;
          leadParties?: OnboardingParty[];
          permissions?: {
            editDraft: boolean;
            editCadastro?: boolean;
            editFaturamento?: boolean;
            submit: boolean;
            submitBilling?: boolean;
          };
        } | null;
        if (!active) return;
        if (!res.ok || !json?.ok || !json.payload) {
          setLoadError(json?.error ?? "Não foi possível carregar o cadastro.");
          return;
        }
        setState({
          stage: json.stage ?? "",
          migrationPending: Boolean(json.migrationPending),
          status: json.onboarding?.status ?? null,
          returnComment: json.onboarding?.returnComment ?? null,
          updatedAt: json.onboarding?.updatedAt ?? null,
          leadParties: json.leadParties ?? [],
          permissions: {
            editCadastro: Boolean(json.permissions?.editCadastro ?? json.permissions?.editDraft),
            editFaturamento: Boolean(json.permissions?.editFaturamento),
            submit: Boolean(json.permissions?.submit),
            submitBilling: Boolean(json.permissions?.submitBilling),
          },
        });
        setPayload(json.payload);
      } catch {
        if (active) setLoadError("Não foi possível carregar o cadastro.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [open, base]);

  const blockReason = state ? blockReasonFor(step, state) : null;
  const editable = Boolean(
    state && !blockReason && (step === "cadastro" ? state.permissions.editCadastro : state.permissions.editFaturamento),
  );
  const canSubmit = Boolean(state && !blockReason);
  const missing = payload
    ? step === "cadastro"
      ? listMissingCadastroFields(payload)
      : listMissingFaturamentoFields(payload)
    : [];

  async function saveDraft(): Promise<boolean> {
    if (!payload || !state) return false;
    setBusy("saving");
    setError(null);
    try {
      const res = await fetch(base, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload, expectedUpdatedAt: state.updatedAt }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; updatedAt?: string } | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "Não foi possível salvar o rascunho.");
        return false;
      }
      setState((current) => (current ? { ...current, updatedAt: json.updatedAt ?? null } : current));
      setDirty(false);
      return true;
    } catch {
      setError("Erro de conexão ao salvar o rascunho. Tente novamente.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function close() {
    if (busy) return;
    if (dirty && editable && !(await saveDraft())) return;
    onOpenChange(false);
  }

  async function submit() {
    if (!payload || !canSubmit || missing.length > 0) return;
    setBusy("submitting");
    setError(null);
    try {
      const res = await fetch(`${base}/${copy.submitUrl}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; stage?: string } | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "Não foi possível enviar.");
        return;
      }
      setDirty(false);
      onSubmitted({ stage: json.stage ?? copy.nextStage });
      onOpenChange(false);
    } catch {
      setError("Erro de conexão ao enviar. Tente novamente.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : void close())} modal={false}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"
        {...dialogSelectOutsideHandlers()}
      >
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            {leadName ? `${leadName} · ` : ""}
            {copy.description}
          </DialogDescription>
        </DialogHeader>

        {loading && !payload ? (
          <div className="flex items-center gap-2 py-6 text-v2-body-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Carregando o cadastro do cliente…
          </div>
        ) : loadError ? (
          <Alert variant="destructive">
            <AlertTitle>Não foi possível abrir o cadastro</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : payload && state ? (
          <div className="space-y-4">
            {blockReason ? (
              <Alert variant="destructive">
                <TriangleAlert className="size-4" aria-hidden />
                <AlertTitle>Envio bloqueado</AlertTitle>
                <AlertDescription>{blockReason}</AlertDescription>
              </Alert>
            ) : null}
            {step === "cadastro" && state.status === "devolvido" && state.returnComment ? (
              <Alert className="border-warning-border bg-warning-bg text-warning-text">
                <AlertTitle>Operações Legais devolveu para ajuste</AlertTitle>
                <AlertDescription>{state.returnComment}</AlertDescription>
              </Alert>
            ) : null}
            <ClientOnboardingForm
              payload={payload}
              readOnly={!editable || busy !== null}
              inModal
              sections={step}
              leadParties={state.leadParties}
              onChange={(next) => {
                setPayload(next);
                setDirty(true);
              }}
            />
          </div>
        ) : null}

        {editable && missing.length > 0 ? (
          <p className="text-v2-caption text-muted-foreground">Para enviar, falta: {missing.join(", ")}.</p>
        ) : null}
        {error ? (
          <p className="text-v2-body-sm text-danger-text" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter className="gap-2">
          {editable ? (
            <Button
              type="button"
              variant="outline"
              className="sm:mr-auto"
              disabled={busy !== null || !dirty}
              onClick={() => void saveDraft()}
            >
              {busy === "saving" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
              Salvar rascunho
            </Button>
          ) : null}
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void close()}>
            Fechar
          </Button>
          <Button
            type="button"
            disabled={loading || !canSubmit || missing.length > 0 || busy !== null}
            onClick={() => void submit()}
          >
            {busy === "submitting" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
            {busy === "submitting" ? "Enviando…" : copy.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
