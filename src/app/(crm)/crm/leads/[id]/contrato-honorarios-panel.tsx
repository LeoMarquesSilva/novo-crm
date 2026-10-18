"use client";

import { Info, TriangleAlert } from "lucide-react";
import { DocumentInheritedBadge } from "@/components/crm/document-builder-chrome";
import { Button } from "@/components/ui/button";
import { investmentItemHasValue, paymentMethodDisplay } from "@/lib/crm/contract-engine/payment";
import type { ContractInvestment, ContractPayment } from "@/lib/crm/contract-engine/types";

export type IgnoredCommercialField = {
  code: string;
  label: string;
  value: string;
};

/**
 * Seção "Condições Comerciais" com o motor canônico ativo: a cláusula de honorários
 * vem do investimento da proposta (o que o cliente aceitou), não dos campos livres
 * do builder. Mostra o texto que vai para o contrato e lista o que foi digitado nos
 * campos antigos e não entra no documento — nada some em silêncio.
 */
export function HonorariosDaPropostaPanel({
  payment,
  investment,
  ignoredFields,
  onClearField,
  disabled,
}: {
  payment: ContractPayment;
  investment: ContractInvestment;
  ignoredFields: IgnoredCommercialField[];
  onClearField: (code: string) => void;
  disabled?: boolean;
}) {
  const hasInvestment = investment.items.some(investmentItemHasValue);
  const paragraphs = payment.clauseText.split("\n").filter((p) => p.trim());
  const forma = paymentMethodDisplay(payment);

  return (
    <div className="space-y-3">
      <div className="rounded-(--radius-v2-md) border border-info-border bg-info-bg p-3 text-xs text-foreground">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="text-v2-caption-medium uppercase tracking-wide text-text-muted-v2">
            Cláusula de honorários
          </p>
          <DocumentInheritedBadge />
        </div>
        {hasInvestment ? (
          <div className="space-y-2 text-sm leading-relaxed">
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        ) : (
          <p className="flex items-start gap-1.5 text-sm text-warning-text">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            A proposta não tem investimento com valor. Preencha o investimento na proposta e atualize o
            contrato; sem isso a cláusula de honorários sai incompleta.
          </p>
        )}
        <dl className="mt-3 space-y-1">
          <div>
            <dt className="inline font-bold">Forma de pagamento: </dt>
            <dd className="inline">
              {forma || "não informada na proposta — a linha não sai no contrato."}
            </dd>
          </div>
          {investment.totalExtenso ? (
            <div>
              <dt className="inline font-bold">Proposta base: </dt>
              <dd className="inline">{investment.totalExtenso} (só honorários fixos; mensais e êxito ficam fora)</dd>
            </div>
          ) : null}
        </dl>
        <p className="mt-3 flex items-start gap-1.5 text-text-muted-v2">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Para mudar valores, parcelas, manutenção ou êxito, ajuste o investimento na proposta e atualize o
          contrato.
        </p>
      </div>

      {ignoredFields.length > 0 ? (
        <div className="rounded-(--radius-v2-md) border border-warning-border bg-warning-bg p-3 text-xs text-warning-text">
          <p className="flex items-start gap-1.5 font-semibold">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Preenchido neste contrato, mas não entra no documento: a cláusula de honorários vem da proposta.
          </p>
          <ul className="mt-2 space-y-2">
            {ignoredFields.map((field) => (
              <li key={field.code} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
                <span className="min-w-0 whitespace-pre-wrap text-foreground">
                  <strong>{field.label}:</strong> {field.value}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 text-xs"
                  disabled={disabled}
                  onClick={() => onClearField(field.code)}
                >
                  Limpar
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
