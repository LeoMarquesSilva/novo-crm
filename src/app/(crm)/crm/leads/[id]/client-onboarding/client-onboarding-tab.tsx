"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Save, Send } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ClientOnboardingSubmitDialog } from "@/components/crm/client-onboarding-submit-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  adjustableFieldMeta,
  listMissingCadastroFields,
  type ClientOnboardingPayload,
  type ClientOnboardingStatus,
  type OnboardingAdjustment,
  type OnboardingParty,
  type OpsChecklist,
} from "@/modules/crm/domain/client-onboarding";

import { ClientOnboardingForm } from "./client-onboarding-form";
import { OpsLegaisReviewPanel } from "./ops-legais-review-panel";

type OnboardingResponse = {
  ok: boolean;
  error?: string;
  stage: string;
  isRdLead: boolean;
  migrationPending: boolean;
  onboarding: {
    status: ClientOnboardingStatus;
    returnComment: string | null;
    submittedAt?: string | null;
    submittedByName?: string | null;
    submissionCount?: number;
    returnedAt: string | null;
    concludedAt: string | null;
    grupoNome: string | null;
    viosReferencia: string | null;
    updatedAt: string;
  } | null;
  payload: ClientOnboardingPayload;
  checklist: OpsChecklist;
  leadParties?: OnboardingParty[];
  ajustes?: OnboardingAdjustment[];
  permissions: {
    editDraft: boolean;
    editCadastro?: boolean;
    editFaturamento?: boolean;
    submit: boolean;
    review: boolean;
    returnToOwner: boolean;
    conclude: boolean;
    submitBilling?: boolean;
  };
};

/** Rola até o campo apontado na devolução e põe o cursor nele. */
function focusField(anchor: string | undefined) {
  if (!anchor) return;
  const target = document.getElementById(anchor);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  const input = target.matches("input, textarea, button") ? target : target.querySelector<HTMLElement>("input, textarea, button");
  input?.focus({ preventScroll: true });
}

/** Etapas em que os dados do faturamento já foram enviados ao Financeiro. */
const BILLING_SENT_STAGES = new Set(["inclusao_faturamento", "boas_vindas", "reuniao_kickoff"]);

const STATUS_LABEL: Record<ClientOnboardingStatus, string> = {
  rascunho: "Em preenchimento pelo responsável",
  enviado: "Com Operações Legais",
  devolvido: "Devolvido para ajuste",
  concluido: "Cadastro concluído",
};

/**
 * Aba "Cadastro" da ficha do lead (pós-venda): o responsável preenche e envia o cadastro para
 * Operações Legais, que confere e conclui (ou devolve apontando campos) em paralelo; em Cadastro
 * de Novo Cliente o responsável envia os dados do faturamento e o lead vai para o Financeiro.
 */
export function ClientOnboardingTab({ leadId, stage }: { leadId: string; stage?: string }) {
  const router = useRouter();
  const base = `/api/crm/leads/${encodeURIComponent(leadId)}/onboarding`;
  const [data, setData] = useState<OnboardingResponse | null>(null);
  const [payload, setPayload] = useState<ClientOnboardingPayload | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [showBilling, setShowBilling] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  // Só a leitura mais recente vale: uma resposta atrasada (ex.: a da montagem) não pode
  // sobrescrever o status novo depois do envio.
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const res = await fetch(base, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as OnboardingResponse | null;
      if (seq !== loadSeq.current) return;
      if (!res.ok || !json?.ok) {
        setMessage({ tone: "error", text: json?.error ?? "Não foi possível carregar o cadastro." });
        return;
      }
      setData(json);
      setPayload(json.payload);
      setUpdatedAt(json.onboarding?.updatedAt ?? null);
      setDirty(false);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  // A etapa do lead mudou no servidor (envio, devolução ou conclusão, aqui ou por outra
  // pessoa via Realtime → router.refresh): relê o cadastro em vez de ficar no status antigo.
  const loadedStage = data?.stage;
  useEffect(() => {
    if (stage && loadedStage && stage !== loadedStage && !dirty) void load();
  }, [stage, loadedStage, dirty, load]);

  // Cadastro devolvido: leva o responsável direto ao primeiro campo apontado (uma vez por leitura).
  const focusedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!data || data.stage === "aguardando_cadastro" || data.onboarding?.status !== "devolvido") return;
    const first = data.ajustes?.[0];
    const canFix = data.permissions.editCadastro ?? data.permissions.editDraft;
    const key = `${data.onboarding.updatedAt}:${first?.campo ?? ""}`;
    if (!first || !canFix || focusedFor.current === key) return;
    focusedFor.current = key;
    window.setTimeout(() => focusField(adjustableFieldMeta(first.campo)?.anchor), 150);
  }, [data]);

  async function saveDraft(): Promise<boolean> {
    if (!payload) return false;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(base, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload, expectedUpdatedAt: updatedAt }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; updatedAt?: string } | null;
      if (!res.ok || !json?.ok) {
        setMessage({ tone: "error", text: json?.error ?? "Não foi possível salvar o rascunho." });
        return false;
      }
      setUpdatedAt(json.updatedAt ?? null);
      setDirty(false);
      setMessage({ tone: "success", text: "Rascunho salvo." });
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    if (!payload) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${base}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; stage?: string } | null;
      if (!res.ok || !json?.ok) {
        setMessage({ tone: "error", text: json?.error ?? "Não foi possível enviar o cadastro." });
        return;
      }
      setMessage({ tone: "success", text: "Cadastro enviado para Operações Legais." });
      // Mostra o novo status já com a resposta do envio; a releitura completa vem em seguida.
      setDirty(false);
      setData((current) =>
        current
          ? {
              ...current,
              stage: json.stage ?? "cadastro_novo_cliente",
              onboarding: {
                returnComment: null,
                returnedAt: null,
                concludedAt: null,
                grupoNome: null,
                viosReferencia: null,
                updatedAt: new Date().toISOString(),
                ...current.onboarding,
                status: "enviado",
              },
            }
          : current,
      );
      router.refresh();
      await load();
    } finally {
      setSaving(false);
      setSubmitOpen(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 rounded-(--radius-v2-xl) border border-neutral-200 bg-white p-5 text-v2-body-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Carregando o cadastro do cliente…
      </div>
    );
  }
  if (!data || !payload) {
    return message ? (
      <Alert variant="destructive">
        <AlertDescription>{message.text}</AlertDescription>
      </Alert>
    ) : null;
  }

  const { permissions, onboarding } = data;
  const status = onboarding?.status ?? null;
  const isOwnerStage = data.stage === "aguardando_cadastro";
  // Depois do envio, o cadastro corre em paralelo: Operações Legais confere, o lead segue.
  const opsReviewing =
    !isOwnerStage && status === "enviado" && (permissions.review || permissions.returnToOwner) && !data.migrationPending;
  const returned = !isOwnerStage && status === "devolvido";
  const canEditCadastro = permissions.editCadastro ?? permissions.editDraft;
  const canSendCadastro = permissions.submit && (isOwnerStage || returned);
  const canSendBilling = Boolean(permissions.submitBilling);
  const missingCadastro = listMissingCadastroFields(payload);
  // Os dados do faturamento são preenchidos no modal (botão ou "Avançar"); depois do envio, ficam
  // aqui só para consulta.
  const billingSent = BILLING_SENT_STAGES.has(data.stage);
  const ajustes = returned ? (data.ajustes ?? []) : [];
  const statusLabel = !onboarding
    ? "Pré-preenchido com os dados do lead — confira e complete."
    : returned
      ? "Devolvido para ajuste — corrija o que foi apontado e reenvie"
      : STATUS_LABEL[onboarding.status];

  return (
    <div className="space-y-4">
      {data.migrationPending ? (
        <Alert className="border-warning-border bg-warning-bg text-warning-text">
          <AlertTitle>Cadastro ainda não habilitado no banco</AlertTitle>
          <AlertDescription>
            A migration do cadastro do cliente está pendente. Os dados abaixo são o pré-preenchimento e ainda não podem ser
            salvos.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-v2-xl) border border-neutral-200 bg-white px-4 py-3">
        <div>
          <p className="text-v2-body-sm-medium text-foreground">Cadastro do cliente</p>
          <p className="text-v2-caption text-muted-foreground">
            {statusLabel}
            {onboarding?.status === "concluido" && onboarding.grupoNome
              ? ` · Grupo ${onboarding.grupoNome}${onboarding.viosReferencia ? ` · VIOS ${onboarding.viosReferencia}` : ""}`
              : ""}
          </p>
        </div>
        {canEditCadastro || canSendCadastro || canSendBilling ? (
          <div className="flex flex-wrap gap-2">
            {canEditCadastro ? (
              <Button type="button" variant="outline" disabled={saving || !dirty || data.migrationPending} onClick={() => void saveDraft()}>
                <Save className="size-4" aria-hidden />
                Salvar rascunho
              </Button>
            ) : null}
            {canSendCadastro ? (
              <Button
                type="button"
                variant={canSendBilling ? "outline" : "default"}
                disabled={saving || missingCadastro.length > 0 || data.migrationPending}
                onClick={() => setSubmitOpen(true)}
              >
                <Send className="size-4" aria-hidden />
                {returned ? "Reenviar para Operações Legais" : "Enviar para Operações Legais"}
              </Button>
            ) : null}
            {canSendBilling ? (
              <Button type="button" disabled={saving || data.migrationPending} onClick={() => setBillingOpen(true)}>
                <Send className="size-4" aria-hidden />
                Enviar para o Financeiro
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {returned && (ajustes.length > 0 || onboarding?.returnComment) ? (
        <Alert className="border-warning-border bg-warning-bg text-warning-text">
          <AlertTitle>Operações Legais devolveu para ajuste</AlertTitle>
          <AlertDescription>
            {ajustes.length > 0 ? (
              <ul className="mt-1 space-y-1">
                {ajustes.map((ajuste) => {
                  const meta = adjustableFieldMeta(ajuste.campo);
                  return (
                    <li key={ajuste.campo}>
                      <button
                        type="button"
                        className="font-medium underline underline-offset-2"
                        onClick={() => focusField(meta?.anchor)}
                      >
                        {meta?.label ?? ajuste.campo}
                      </button>
                      {ajuste.comentario ? ` — ${ajuste.comentario}` : ""}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {onboarding?.returnComment ? <p className="mt-1">{onboarding.returnComment}</p> : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {message ? (
        <Alert variant={message.tone === "error" ? "destructive" : "default"}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}

      {canSendCadastro && missingCadastro.length > 0 ? (
        <p className="text-v2-caption text-muted-foreground">Para enviar o cadastro, falta: {missingCadastro.join(", ")}.</p>
      ) : null}
      {opsReviewing ? (
        <OpsLegaisReviewPanel
          leadId={leadId}
          initialChecklist={data.checklist}
          cadastro={payload.cadastro}
          submittedAt={onboarding?.submittedAt ?? null}
          submittedByName={onboarding?.submittedByName ?? null}
          resubmitted={Boolean(onboarding?.returnedAt)}
          canReturn={permissions.returnToOwner}
          canConclude={permissions.conclude}
          onChanged={() => {
            void load();
            router.refresh();
          }}
        />
      ) : null}

      {/* Quem confere lê e copia os dados no painel (e devolve se algo estiver errado). */}
      {opsReviewing ? null : (
        <ClientOnboardingForm
          payload={payload}
          readOnly={!canEditCadastro}
          sections="cadastro"
          leadParties={data.leadParties ?? []}
          ajustes={ajustes}
          onChange={(next) => {
            setPayload(next);
            setDirty(true);
          }}
        />
      )}
      {billingSent ? (
        // Enviado ao Financeiro: só consulta, recolhido.
        <div className="overflow-hidden rounded-(--radius-v2-xl) border border-neutral-200 bg-white">
          <button
            type="button"
            onClick={() => setShowBilling((v) => !v)}
            aria-expanded={showBilling}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-hover"
          >
            <span>
              <span className="block text-v2-body-sm-medium text-foreground">Dados para o faturamento</span>
              <span className="block text-v2-caption text-muted-foreground">
                {[
                  payload.financeiro.faturamento.razaoSocial,
                  payload.financeiro.primeiroFaturamento
                    ? `1º faturamento ${payload.financeiro.primeiroFaturamento.split("-").reverse().join("/")}`
                    : "",
                  payload.financeiro.contatoFinanceiro.nome ? `contato ${payload.financeiro.contatoFinanceiro.nome}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ") || "Enviados ao Financeiro"}
              </span>
            </span>
            <ChevronDown
              className={cn("size-4 shrink-0 text-muted-foreground transition-transform", showBilling && "rotate-180")}
              aria-hidden
            />
          </button>
          {showBilling ? (
            <div className="border-t border-neutral-200 p-3">
              <ClientOnboardingForm payload={payload} readOnly sections="faturamento" onChange={() => undefined} />
            </div>
          ) : null}
        </div>
      ) : null}

      {billingOpen ? (
        <ClientOnboardingSubmitDialog
          open
          onOpenChange={(open) => {
            if (!open) setBillingOpen(false);
          }}
          leadId={leadId}
          step="faturamento"
          onSubmitted={() => {
            setMessage({ tone: "success", text: "Dados do faturamento enviados ao Financeiro." });
            router.refresh();
            void load();
          }}
        />
      ) : null}

      <AlertDialog open={submitOpen} onOpenChange={(open) => !saving && setSubmitOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {returned ? "Reenviar o cadastro para Operações Legais?" : "Enviar o cadastro para Operações Legais?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {returned
                ? "Operações Legais confere de novo o que foi ajustado. O lead continua na etapa em que está."
                : "O lead vai para Cadastro de Novo Cliente. Operações Legais confere, cadastra no VIOS e nos sistemas legados e cria o grupo do cliente."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={() => void submit()}>
              Enviar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
