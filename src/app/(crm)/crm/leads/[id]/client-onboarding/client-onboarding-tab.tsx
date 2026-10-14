"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Send } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import {
  listMissingOnboardingFields,
  type ClientOnboardingPayload,
  type ClientOnboardingStatus,
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
    returnedAt: string | null;
    concludedAt: string | null;
    grupoNome: string | null;
    viosReferencia: string | null;
    updatedAt: string;
  } | null;
  payload: ClientOnboardingPayload;
  checklist: OpsChecklist;
  permissions: { editDraft: boolean; submit: boolean; review: boolean; returnToOwner: boolean; conclude: boolean };
};

const STATUS_LABEL: Record<ClientOnboardingStatus, string> = {
  rascunho: "Em preenchimento pelo responsável",
  enviado: "Com Operações Legais",
  devolvido: "Devolvido para ajuste",
  concluido: "Cadastro concluído",
};

/**
 * Aba "Cadastro" da ficha do lead (pós-venda): o responsável preenche e envia para
 * Operações Legais; Operações Legais confere, cadastra e conclui (ou devolve).
 */
export function ClientOnboardingTab({ leadId }: { leadId: string }) {
  const router = useRouter();
  const base = `/api/crm/leads/${encodeURIComponent(leadId)}/onboarding`;
  const [data, setData] = useState<OnboardingResponse | null>(null);
  const [payload, setPayload] = useState<ClientOnboardingPayload | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(base, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as OnboardingResponse | null;
      if (!res.ok || !json?.ok) {
        setMessage({ tone: "error", text: json?.error ?? "Não foi possível carregar o cadastro." });
        return;
      }
      setData(json);
      setPayload(json.payload);
      setUpdatedAt(json.onboarding?.updatedAt ?? null);
      setDirty(false);
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

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
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        setMessage({ tone: "error", text: json?.error ?? "Não foi possível enviar o cadastro." });
        return;
      }
      setMessage({ tone: "success", text: "Cadastro enviado para Operações Legais." });
      await load();
      router.refresh();
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
  const missing = listMissingOnboardingFields(payload);
  const editable = permissions.editDraft && onboarding?.status !== "concluido";
  const isOwnerStage = data.stage === "aguardando_cadastro";
  const isOpsStage = data.stage === "cadastro_novo_cliente";

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
            {onboarding ? STATUS_LABEL[onboarding.status] : "Pré-preenchido com os dados do lead — confira e complete."}
            {onboarding?.status === "concluido" && onboarding.grupoNome
              ? ` · Grupo ${onboarding.grupoNome}${onboarding.viosReferencia ? ` · VIOS ${onboarding.viosReferencia}` : ""}`
              : ""}
          </p>
        </div>
        {editable && isOwnerStage ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={saving || !dirty || data.migrationPending} onClick={() => void saveDraft()}>
              <Save className="size-4" aria-hidden />
              Salvar rascunho
            </Button>
            {permissions.submit ? (
              <Button
                type="button"
                disabled={saving || missing.length > 0 || data.migrationPending}
                onClick={() => setSubmitOpen(true)}
              >
                <Send className="size-4" aria-hidden />
                Enviar para Operações Legais
              </Button>
            ) : null}
          </div>
        ) : editable && isOpsStage ? (
          <Button type="button" variant="outline" disabled={saving || !dirty} onClick={() => void saveDraft()}>
            <Save className="size-4" aria-hidden />
            Salvar correções
          </Button>
        ) : null}
      </div>

      {onboarding?.status === "devolvido" && onboarding.returnComment ? (
        <Alert className="border-warning-border bg-warning-bg text-warning-text">
          <AlertTitle>Operações Legais devolveu para ajuste</AlertTitle>
          <AlertDescription>{onboarding.returnComment}</AlertDescription>
        </Alert>
      ) : null}

      {message ? (
        <Alert variant={message.tone === "error" ? "destructive" : "default"}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}

      {editable && isOwnerStage && missing.length > 0 ? (
        <p className="text-v2-caption text-muted-foreground">Para enviar, falta: {missing.join(", ")}.</p>
      ) : null}

      {isOpsStage && (permissions.review || permissions.returnToOwner) && !data.migrationPending ? (
        <OpsLegaisReviewPanel
          leadId={leadId}
          initialChecklist={data.checklist}
          canReturn={permissions.returnToOwner}
          canConclude={permissions.conclude}
          onChanged={() => {
            void load();
            router.refresh();
          }}
        />
      ) : null}

      <ClientOnboardingForm
        payload={payload}
        readOnly={!editable}
        onChange={(next) => {
          setPayload(next);
          setDirty(true);
        }}
      />

      <AlertDialog open={submitOpen} onOpenChange={(open) => !saving && setSubmitOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar o cadastro para Operações Legais?</AlertDialogTitle>
            <AlertDialogDescription>
              O lead vai para Cadastro de Novo Cliente. Operações Legais confere, cadastra no VIOS e nos sistemas legados e
              cria o grupo do cliente.
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
