import Link from "next/link";
import { AlertCircle, CheckCircle2, ReceiptText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { LeadDetailData } from "./page";

export function ContractBillingOnboardingPanel({
  contractBilling,
  showSetupAction,
}: {
  contractBilling: LeadDetailData["contractBilling"];
  showSetupAction: boolean;
}) {
  if (!contractBilling) {
    return (
      <Card className="glass-card-no-float border-[#dfe5ee] p-6">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="text-xl font-extrabold text-[#102033]">Contrato não vinculado</CardTitle>
          <p className="text-sm text-slate-500">Não foi encontrado um cadastro contratual para esta oportunidade.</p>
        </CardHeader>
      </Card>
    );
  }

  const { validationProgress } = contractBilling;
  return (
    <Card className="glass-card-no-float border-[#dfe5ee] p-5 sm:p-6">
      <CardHeader className="gap-3 px-0 pt-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[#24615b]">
              <ReceiptText className="h-4 w-4" /> Implantação financeira
            </p>
            <CardTitle className="mt-2 text-xl font-extrabold text-[#102033]">Configuração do faturamento</CardTitle>
          </div>
          <Badge variant="outline">{contractBilling.lifecycleStatus}</Badge>
        </div>
        <p className="text-sm text-slate-500">{contractBilling.suggestionsOrigin}</p>
      </CardHeader>
      <CardContent className="space-y-5 px-0 pb-0">
        <div className="space-y-2">
          <div className="flex justify-between text-sm font-semibold text-[#102033]">
            <span>Validação</span>
            <span>{validationProgress.completed}/{validationProgress.total}</span>
          </div>
          <Progress value={validationProgress.percentage} />
        </div>
        {contractBilling.blockers.length > 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
              <AlertCircle className="h-4 w-4" /> Pendências para ativação
            </p>
            <ul className="mt-2 space-y-1 text-sm text-amber-900">
              {contractBilling.blockers.map((blocker) => <li key={blocker}>• {blocker}</li>)}
            </ul>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Contrato ativo e validado.
          </p>
        )}
        {showSetupAction ? (
          <Link href={contractBilling.setupHref} className={buttonVariants({ variant: "cta" })}>
            Configurar contrato
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
