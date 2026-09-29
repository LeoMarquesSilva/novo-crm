"use client";

import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger } from "@/components/ui/select";
import { CrmSelectContent, CrmSelectItem, CrmSelectValue } from "@/components/crm/crm-select";
import { cn } from "@/lib/utils";
import { formatClienteEnderecoResumo, type ClienteCadastroRow } from "@/lib/crm/cliente-cadastro-cp-fields";
import type { ClienteContratoResumo } from "@/lib/crm/lookup-cliente-by-document";
import { newLeadModalFieldClass } from "@/components/crm/new-lead-modal";

export type RelacaoContratoChoice = "novo" | "aditivo";

type Props = {
  loading: boolean;
  cliente: ClienteCadastroRow | null;
  matchedBy: "documento" | "cnpj_raiz" | null;
  contratos: ClienteContratoResumo[];
  relacaoContrato: RelacaoContratoChoice | null;
  onRelacaoChange: (value: RelacaoContratoChoice) => void;
  contratoBaseId: string;
  onContratoBaseChange: (id: string) => void;
  className?: string;
};

const RELACAO_ITEMS: Record<RelacaoContratoChoice, string> = {
  novo: "Contrato novo",
  aditivo: "Aditivo de contrato existente",
};

export function ClienteDocumentoMatchPanel({
  loading,
  cliente,
  matchedBy,
  contratos,
  relacaoContrato,
  onRelacaoChange,
  contratoBaseId,
  onContratoBaseChange,
  className,
}: Props) {
  if (loading) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-(--radius-v2-xl) border border-border bg-surface-subtle px-4 py-3 text-sm text-muted-foreground",
          className,
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Consultando cadastro na carteira…
      </div>
    );
  }

  if (!cliente) return null;

  const contratoItems = Object.fromEntries(
    contratos.map((c) => [c.id, `${c.titulo} (${c.status})`]),
  );

  return (
    <div
      className={cn(
        "space-y-3 rounded-(--radius-v2-xl) border border-info-border bg-info-bg px-4 py-3",
        className,
      )}
    >
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-info-text">
          Cliente já cadastrado
        </p>
        <p className="mt-1 text-sm font-semibold text-foreground">{cliente.razao_social}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatClienteEnderecoResumo(cliente)}
        </p>
        {matchedBy === "cnpj_raiz" ? (
          <p className="mt-2 text-xs text-muted-foreground">
            CNPJ informado pertence ao mesmo grupo (raiz) do cadastro acima.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium text-foreground">Esta demanda é *</Label>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(RELACAO_ITEMS) as RelacaoContratoChoice[]).map((key) => (
            <label
              key={key}
              className="inline-flex cursor-pointer items-center gap-2 rounded-(--radius-v2-lg) border border-border bg-white px-3 py-2 text-sm font-medium text-foreground has-[:checked]:border-interactive-300 has-[:checked]:bg-interactive-50"
            >
              <input
                type="radio"
                name="relacao_contrato"
                checked={relacaoContrato === key}
                onChange={() => onRelacaoChange(key)}
                className="size-4 accent-interactive-600"
              />
              {RELACAO_ITEMS[key]}
            </label>
          ))}
        </div>
      </div>

      {relacaoContrato === "aditivo" ? (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-foreground">Contrato base *</Label>
          {contratos.length === 0 ? (
            <p className="text-xs text-warning-text">
              Nenhum contrato ativo encontrado para este cliente. Escolha &quot;Contrato novo&quot; ou
              cadastre o contrato na carteira.
            </p>
          ) : (
            <Select
              modal={false}
              items={contratoItems}
              value={contratoBaseId || null}
              onValueChange={(v) => onContratoBaseChange(v ?? "")}
            >
              <SelectTrigger className={cn(newLeadModalFieldClass, "h-10 w-full justify-between")}>
                <CrmSelectValue
                  value={contratoBaseId || null}
                  labels={contratoItems}
                  placeholder="Selecione o contrato"
                />
              </SelectTrigger>
              <CrmSelectContent inModal className="max-h-[min(280px,50dvh)]">
                {contratos.map((c) => (
                  <CrmSelectItem key={c.id} value={c.id}>
                    {c.titulo} ({c.status})
                  </CrmSelectItem>
                ))}
              </CrmSelectContent>
            </Select>
          )}
        </div>
      ) : null}
    </div>
  );
}
