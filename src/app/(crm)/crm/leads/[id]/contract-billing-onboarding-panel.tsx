"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, FileSearch, Loader2, ReceiptText, RefreshCw } from "lucide-react";

import { useCrmActor } from "@/components/crm/crm-session-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { canConfigureContract } from "@/lib/auth/crm-access-policy";
import type { LeadDetailData } from "./page";

const PDF_STATUS_LABEL: Record<string, string> = {
  read: "PDF assinado lido pela IA",
  not_signed: "PDF ainda não finalizado na D4Sign",
  not_cached: "PDF assinado ainda não baixado",
  quota_exhausted: "Limite de downloads da D4Sign nesta hora",
  scanned: "PDF escaneado (sem texto para a IA)",
  failed: "Não foi possível ler o PDF",
  no_document: "Lead sem documento de assinatura",
};

const DIVERGENCE_FIELD: Record<string, string> = {
  startsAt: "Início da vigência",
  firstInvoiceAt: "Primeiro faturamento",
  adjustmentIndex: "Índice de reajuste",
  components: "Valor total das cobranças",
};

type InclusionResult = {
  setupHref: string;
  prefilled: boolean;
  pdf: { status: string; message: string | null };
  divergences: { field: string; leadValue: string; pdfValue: string }[];
};

/**
 * Aba Faturamento (Inclusão no Faturamento): o Financeiro inclui o contrato no
 * gerenciamento de contratos — rascunho pré-preenchido com o cadastro do cliente, a
 * proposta e a leitura do PDF assinado — e segue para criar as regras de cobrança e ativar.
 * Ao ativar, o lead vai para Boas-vindas.
 */
export function ContractBillingOnboardingPanel({
  leadId,
  stage,
  contractBilling,
  showSetupAction,
}: {
  leadId: string;
  stage: string;
  contractBilling: LeadDetailData["contractBilling"];
  showSetupAction: boolean;
}) {
  const router = useRouter();
  const actor = useCrmActor();
  const [busy, setBusy] = useState<"initial" | "reread_pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InclusionResult | null>(null);

  const canInclude =
    showSetupAction &&
    stage === "inclusao_faturamento" &&
    Boolean(
      actor &&
        canConfigureContract({
          role: actor.role,
          contract: { opportunityId: leadId, opportunityStage: stage, versionNumber: 1, versionStatus: "rascunho" },
        }),
    );
  const inclusion = contractBilling?.inclusion ?? null;
  const included = Boolean(result?.prefilled || inclusion?.prefilledAt);
  const pdfStatus = result?.pdf.status ?? inclusion?.pdfStatus ?? null;
  const pdfMessage = result?.pdf.message ?? inclusion?.pdfMessage ?? null;
  const divergences = result?.divergences ?? inclusion?.divergences ?? [];
  const setupHref = result?.setupHref ?? contractBilling?.setupHref ?? null;

  async function include(mode: "initial" | "reread_pdf") {
    setBusy(mode);
    setError(null);
    try {
      const res = await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}/contract-inclusion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const json = (await res.json().catch(() => null)) as ({ ok?: boolean; error?: string } & InclusionResult) | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "Não foi possível incluir o contrato.");
        return;
      }
      setResult(json);
      router.refresh();
      if (mode === "initial") router.push(json.setupHref);
    } finally {
      setBusy(null);
    }
  }

  const validationProgress = contractBilling?.validationProgress ?? { completed: 0, total: 5, percentage: 0 };

  return (
    <Card className="border-border bg-white p-5 sm:p-6">
      <CardHeader className="gap-3 px-0 pt-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-v2-caption-medium uppercase tracking-wide text-text-muted-v2">
              <ReceiptText className="h-4 w-4" /> Inclusão no faturamento
            </p>
            <CardTitle className="mt-2 text-v2-heading-lg text-foreground">Gerenciamento de contratos</CardTitle>
          </div>
          {contractBilling ? <Badge variant="outline">{contractBilling.lifecycleStatus}</Badge> : null}
        </div>
        <p className="text-v2-body-sm text-muted-foreground">
          {contractBilling?.suggestionsOrigin ??
            "O contrato entra no gerenciamento de contratos pelo botão abaixo, já com os dados do lead."}
        </p>
      </CardHeader>
      <CardContent className="space-y-5 px-0 pb-0">
        {contractBilling ? (
          <div className="space-y-2">
            <div className="flex justify-between text-v2-body-sm-medium text-foreground">
              <span>Validação</span>
              <span>
                {validationProgress.completed}/{validationProgress.total}
              </span>
            </div>
            <Progress value={validationProgress.percentage} />
          </div>
        ) : null}

        {contractBilling && contractBilling.blockers.length > 0 ? (
          <div className="rounded-(--radius-v2-xl) border border-warning-border bg-warning-bg p-4">
            <p className="flex items-center gap-2 text-v2-body-sm-medium text-warning-text">
              <AlertCircle className="h-4 w-4" /> Pendências para ativação
            </p>
            <ul className="mt-2 space-y-1 text-v2-body-sm text-warning-text">
              {contractBilling.blockers.map((blocker) => (
                <li key={blocker}>• {blocker}</li>
              ))}
            </ul>
          </div>
        ) : contractBilling ? (
          <p className="flex items-center gap-2 text-v2-body-sm-medium text-success-text">
            <CheckCircle2 className="h-4 w-4" /> Contrato ativo e validado.
          </p>
        ) : null}

        {pdfStatus ? (
          <div className="flex flex-wrap items-center gap-2 text-v2-body-sm">
            <FileSearch className="size-4 text-muted-foreground" aria-hidden />
            <span className={pdfStatus === "read" ? "text-success-text" : "text-warning-text"}>
              {PDF_STATUS_LABEL[pdfStatus] ?? pdfStatus}
            </span>
            {pdfStatus !== "read" && pdfMessage ? <span className="text-muted-foreground">· {pdfMessage}</span> : null}
          </div>
        ) : null}

        {divergences.length > 0 ? (
          <Alert className="border-warning-border bg-warning-bg text-warning-text">
            <AlertTitle>Confira: o cadastro e o PDF assinado não batem</AlertTitle>
            <AlertDescription>
              <ul className="mt-1 space-y-1">
                {divergences.map((d) => (
                  <li key={d.field}>
                    {DIVERGENCE_FIELD[d.field] ?? d.field}: cadastro {d.leadValue} · PDF {d.pdfValue}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {canInclude ? (
          <div className="flex flex-wrap gap-2">
            {!included ? (
              <Button type="button" disabled={busy !== null} onClick={() => void include("initial")}>
                {busy === "initial" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {busy === "initial" ? "Lendo o contrato assinado…" : "Incluir no gerenciamento de contratos"}
              </Button>
            ) : setupHref ? (
              <Link href={setupHref} className={buttonVariants({ variant: "primary" })}>
                Continuar configuração
              </Link>
            ) : null}
            {included ? (
              <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void include("reread_pdf")}>
                {busy === "reread_pdf" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="size-4" aria-hidden />
                )}
                Reler PDF
              </Button>
            ) : null}
          </div>
        ) : showSetupAction && contractBilling ? (
          <p className="text-v2-caption text-muted-foreground">
            A inclusão no gerenciamento de contratos é feita pelo Financeiro.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
