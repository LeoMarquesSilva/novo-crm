"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, FileSearch, Info, Loader2, ReceiptText } from "lucide-react";

import { useCrmActor } from "@/components/crm/crm-session-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { canConfigureContract } from "@/lib/auth/crm-access-policy";
import { DIVERGENCE_FIELD, PDF_STATUS_LABEL } from "@/lib/crm/contract-inclusion/lead-inclusion-view";
import type { LeadDetailData } from "./page";

type Readiness = NonNullable<LeadDetailData["contractBilling"]>["readiness"];

/** O que ainda não está pronto para a inclusão preencher o contrato (vazio = tudo pronto). */
function readinessIssues(readiness: Readiness): string[] {
  return [
    ...(!readiness.clienteVinculado
      ? [
          readiness.cadastroConcluido
            ? "Cliente ainda não vinculado ao contrato."
            : "Operações Legais ainda não concluiu o cadastro: o cliente é vinculado na conclusão.",
        ]
      : []),
    ...(!readiness.datasNoCadastro
      ? ["Vigência e primeiro faturamento ainda não estão no cadastro: informe na configuração."]
      : []),
    ...(!readiness.pdfAssinado ? ["Sem PDF assinado: as cobranças vêm da proposta."] : []),
  ];
}

type InclusionResult = {
  setupHref: string;
  prefilled: boolean;
  pdf: { status: string; message: string | null };
  divergences: { field: string; leadValue: string; pdfValue: string }[];
};

/**
 * Contrato no gerenciamento, na Visão geral do lead (03/11/2026: sem aba Faturamento).
 * O contrato é incluído sozinho quando o lead entra em Inclusão no Faturamento (cadastro +
 * leitura do PDF assinado); o Financeiro confere e ativa na configuração do contrato. Este
 * quadro mostra o andamento para todos e, se a inclusão automática não aconteceu, "Incluir agora".
 * Ao ativar, o lead vai para Boas-vindas.
 */
export function ContractBillingOnboardingPanel({
  leadId,
  stage,
  contractBilling,
}: {
  leadId: string;
  stage: string;
  contractBilling: LeadDetailData["contractBilling"];
}) {
  const router = useRouter();
  const actor = useCrmActor();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InclusionResult | null>(null);

  if (!contractBilling) return null;
  const canInclude =
    stage === "inclusao_faturamento" &&
    Boolean(
      actor &&
        canConfigureContract({
          role: actor.role,
          contract: { opportunityId: leadId, opportunityStage: stage, versionNumber: 1, versionStatus: "rascunho" },
        }),
    );
  const inclusion = contractBilling.inclusion;
  const included = Boolean(result?.prefilled || inclusion?.prefilledAt);
  const pdfStatus = result?.pdf.status ?? inclusion?.pdfStatus ?? null;
  const pdfMessage = result?.pdf.message ?? inclusion?.pdfMessage ?? null;
  const divergences = result?.divergences ?? inclusion?.divergences ?? [];
  const setupHref = result?.setupHref ?? contractBilling.setupHref;
  const validationProgress = contractBilling.validationProgress;
  // Rascunho que ninguém incluiu nem configurou: só o cliente (da conclusão do cadastro) pode estar lá.
  const preInclusion =
    !included && contractBilling.lifecycleStatus === "rascunho" && validationProgress.completed <= 1;
  const issues = readinessIssues(contractBilling.readiness);

  async function includeNow() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}/contract-inclusion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "initial" }),
      });
      const json = (await res.json().catch(() => null)) as ({ ok?: boolean; error?: string } & InclusionResult) | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "Não foi possível incluir o contrato.");
        return;
      }
      setResult(json);
      router.refresh();
      router.push(json.setupHref);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-border bg-white p-5 sm:p-6">
      <CardHeader className="gap-3 px-0 pt-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-v2-caption-medium uppercase tracking-wide text-text-muted-v2">
              <ReceiptText className="h-4 w-4" /> Inclusão no faturamento
            </p>
            <CardTitle className="mt-2 text-v2-heading-lg text-foreground">Contrato no gerenciamento de contratos</CardTitle>
          </div>
          <Badge variant="outline">{contractBilling.lifecycleStatus}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-0 pb-0">
        {preInclusion ? (
          <div className="space-y-2 rounded-(--radius-v2-xl) border border-border bg-surface-subtle p-4 text-v2-body-sm">
            <p className="flex items-center gap-2 text-v2-body-sm-medium text-foreground">
              <Info className="h-4 w-4 text-info-text" aria-hidden />
              {stage === "inclusao_faturamento" ? "Inclusão automática em andamento" : "Contrato ainda não incluído"}
            </p>
            <p className="text-muted-foreground">
              Ao entrar em Inclusão no Faturamento, o CRM inclui o contrato sozinho com o cadastro do cliente e a
              leitura do PDF assinado (leva até 2 minutos) e avisa o Financeiro para conferir e ativar.
            </p>
            {issues.length > 0 ? (
              <ul className="space-y-1">
                {issues.map((issue) => (
                  <li key={issue} className="flex items-start gap-2 text-warning-text">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    {issue}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex justify-between text-v2-body-sm-medium text-foreground">
                <span>Validação</span>
                <span>
                  {validationProgress.completed}/{validationProgress.total}
                </span>
              </div>
              <Progress value={validationProgress.percentage} />
            </div>

            {contractBilling.blockers.length > 0 ? (
              <div className="rounded-(--radius-v2-xl) border border-warning-border bg-warning-bg p-4">
                <p className="flex items-center gap-2 text-v2-body-sm-medium text-warning-text">
                  <AlertCircle className="h-4 w-4" /> Falta configurar
                </p>
                <ul className="mt-2 space-y-1 text-v2-body-sm text-warning-text">
                  {contractBilling.blockers.map((blocker) => (
                    <li key={blocker}>• {blocker}</li>
                  ))}
                </ul>
              </div>
            ) : contractBilling.activationPending ? (
              <div className="rounded-(--radius-v2-xl) border border-info-border bg-info-bg p-4 text-info-text">
                <p className="flex items-center gap-2 text-v2-body-sm-medium">
                  <Info className="h-4 w-4" aria-hidden /> Falta ativar o contrato
                </p>
                <p className="mt-1 text-v2-body-sm">
                  Está tudo configurado. O Financeiro confere e ativa na etapa Projeção e ativação; o lead segue para
                  Boas-vindas.
                </p>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-v2-body-sm-medium text-success-text">
                <CheckCircle2 className="h-4 w-4" /> Contrato ativo e validado.
              </p>
            )}

            {pdfStatus ? (
              <div className="flex flex-wrap items-center gap-2 text-v2-body-sm">
                <FileSearch className="size-4 text-muted-foreground" aria-hidden />
                <span className={pdfStatus === "read" ? "text-success-text" : "text-warning-text"}>
                  {PDF_STATUS_LABEL[pdfStatus] ?? pdfStatus}
                </span>
                {pdfStatus !== "read" && pdfMessage ? <span className="text-muted-foreground">· {pdfMessage}</span> : null}
                {inclusion?.auto ? <span className="text-muted-foreground">· incluído automaticamente</span> : null}
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
          </>
        )}

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {!preInclusion ? (
            <Link href={setupHref} className={buttonVariants({ variant: canInclude ? "primary" : "outline" })}>
              {canInclude && contractBilling.lifecycleStatus !== "ativo" ? "Conferir e ativar o contrato" : "Abrir contrato"}
            </Link>
          ) : canInclude ? (
            // Inclusão automática que não aconteceu (ou ainda roda): o Financeiro inclui na hora.
            <Button type="button" variant="outline" disabled={busy} onClick={() => void includeNow()}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {busy ? "Lendo o contrato assinado…" : "Incluir agora"}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
