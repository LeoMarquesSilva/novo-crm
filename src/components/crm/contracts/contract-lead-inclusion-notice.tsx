"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, FileSearch, Loader2, RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DIVERGENCE_FIELD,
  PDF_STATUS_LABEL,
  type LeadInclusionView,
} from "@/lib/crm/contract-inclusion/lead-inclusion-view";
import { formatDateTimeMinutesBr } from "@/lib/format-datetime";

/**
 * Configuração do contrato de um lead (03/11/2026): mostra de onde vieram os dados (inclusão
 * automática ao entrar em Inclusão no Faturamento), a leitura do PDF assinado e as divergências
 * cadastro × PDF, com "Reler PDF". Se a inclusão automática não aconteceu, "Incluir dados do lead".
 */
export function ContractLeadInclusionNotice({
  opportunityId,
  opportunityStage,
  inclusion,
  canConfigure,
}: {
  opportunityId: string | null;
  opportunityStage: string | null;
  inclusion: LeadInclusionView | null;
  canConfigure: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"initial" | "reread_pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const billingStage = opportunityStage === "inclusao_faturamento";
  if (!opportunityId || (!inclusion?.prefilledAt && !billingStage)) return null;
  const canRun = canConfigure && billingStage;

  async function run(mode: "initial" | "reread_pdf") {
    setBusy(mode);
    setError(null);
    try {
      const res = await fetch(`/api/crm/leads/${encodeURIComponent(opportunityId!)}/contract-inclusion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "Não foi possível incluir os dados do lead.");
        return;
      }
      // A inclusão preenche o rascunho: recarrega para o assistente partir dos dados novos.
      if (mode === "initial") window.location.reload();
      else router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (!inclusion?.prefilledAt) {
    return (
      <Alert className="border-warning-border bg-warning-bg text-warning-text">
        <CircleAlert aria-hidden />
        <AlertTitle>Os dados do lead ainda não entraram neste contrato</AlertTitle>
        <AlertDescription className="text-current">
          <p>
            A inclusão é automática quando o lead entra em Inclusão no Faturamento e leva até 2 minutos. Se não
            aconteceu, inclua agora: o CRM lê o PDF assinado e preenche com o cadastro do cliente.
          </p>
          {error ? <p className="mt-1 font-medium">{error}</p> : null}
          {canRun ? (
            <Button type="button" size="sm" className="mt-2" disabled={busy !== null} onClick={() => void run("initial")}>
              {busy === "initial" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {busy === "initial" ? "Lendo o contrato assinado…" : "Incluir dados do lead"}
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }

  const pdfRead = inclusion.pdfStatus === "read";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-(--radius-v2-xl) border border-border bg-white px-4 py-3 text-v2-body-sm">
        <div className="space-y-0.5">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <CheckCircle2 className="size-4 text-success-text" aria-hidden />
            {inclusion.auto ? "Preenchido automaticamente a partir do lead" : "Preenchido a partir do lead"} em{" "}
            {formatDateTimeMinutesBr(inclusion.prefilledAt)}
          </p>
          {inclusion.pdfStatus ? (
            <p className={`flex items-center gap-2 ${pdfRead ? "text-muted-foreground" : "text-warning-text"}`}>
              <FileSearch className="size-4" aria-hidden />
              {PDF_STATUS_LABEL[inclusion.pdfStatus] ?? inclusion.pdfStatus}
              {!pdfRead && inclusion.pdfMessage ? ` · ${inclusion.pdfMessage}` : ""}
              {!pdfRead ? " · cobranças da proposta" : ""}
            </p>
          ) : null}
        </div>
        {canRun ? (
          <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void run("reread_pdf")}>
            {busy === "reread_pdf" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
            Reler PDF
          </Button>
        ) : null}
      </div>
      {inclusion.divergences.length > 0 ? (
        <Alert className="border-warning-border bg-warning-bg text-warning-text">
          <CircleAlert aria-hidden />
          <AlertTitle>Confira: o cadastro e o PDF assinado não batem</AlertTitle>
          <AlertDescription className="text-current">
            <ul className="mt-1 space-y-1">
              {inclusion.divergences.map((d) => (
                <li key={d.field}>
                  {DIVERGENCE_FIELD[d.field] ?? d.field}: cadastro {d.leadValue} · PDF {d.pdfValue}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      {error ? <p className="text-v2-caption text-danger-text">{error}</p> : null}
    </div>
  );
}
