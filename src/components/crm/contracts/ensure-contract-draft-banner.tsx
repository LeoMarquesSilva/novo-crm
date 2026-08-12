"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EnsureContractDraftBanner({
  opportunityId,
  canEnsureDraft,
}: {
  opportunityId: string;
  canEnsureDraft: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [contractId, setContractId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ensureDraft() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/crm/contracts/ensure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        contractId?: string;
        error?: string;
      };
      if (!response.ok || data.ok === false || !data.contractId) {
        throw new Error(data.error ?? "Não foi possível criar o rascunho contratual.");
      }
      setContractId(data.contractId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao criar o rascunho contratual.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        {contractId ? (
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700" />
        ) : (
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-800" />
        )}
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h2 className="font-bold text-[#102033]">
              {contractId ? "Cadastro-base criado" : "Cadastro-base ausente"}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {contractId
                ? `Rascunho contratual ${contractId} pronto para configuração.`
                : "Crie o rascunho contratual vinculado à oportunidade antes de configurar o faturamento."}
            </p>
          </div>
          {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            {contractId ? (
              <Link
                href={`/crm/contratos/${contractId}?setup=1`}
                className={buttonVariants({ variant: "cta", size: "sm" })}
              >
                Abrir contrato
              </Link>
            ) : canEnsureDraft ? (
              <Button type="button" size="sm" disabled={submitting} onClick={() => void ensureDraft()}>
                {submitting ? "Criando…" : "Criar rascunho contratual"}
              </Button>
            ) : null}
            <Link
              href={`/crm/leads/${opportunityId}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Voltar ao lead
            </Link>
          </div>
          {!contractId && !canEnsureDraft ? (
            <p className="text-sm text-amber-900">
              Solicite à Controladoria ou a um administrador a criação do rascunho contratual.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
