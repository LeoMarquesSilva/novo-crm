"use client";

import { Switch } from "@/components/ui/switch";
import { maskDocument } from "@/lib/crm/br-document-mask";
import {
  alternarContratante,
  contratantesMarcados,
  principalIndexDaEscolha,
  type EscolhaEmpresasProposta,
} from "@/lib/crm/proposta-contratantes";

type EmpresaCadastro = {
  index: number;
  razao_social: string;
  tipo_documento: "CPF" | "CNPJ";
  documento: string;
};

/**
 * Outras pessoas/empresas do cadastro do lead que assinam o contrato junto com a principal.
 * Vêm marcadas; desmarca quem só está relacionado ao lead.
 */
export function PropostaOutrosContratantes<T extends EscolhaEmpresasProposta>({
  empresas,
  escolha,
  onChange,
  disabled,
}: {
  empresas: EmpresaCadastro[];
  escolha: T;
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  const principal = principalIndexDaEscolha(escolha, empresas);
  const outras = empresas.filter((e) => e.index !== principal);
  if (outras.length === 0) return null;
  const marcados = new Set(contratantesMarcados(escolha, empresas));

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-foreground">Também assinam como contratantes</p>
      <ul className="divide-y divide-border rounded-(--radius-v2-lg) border border-border bg-white">
        {outras.map((empresa) => {
          const id = `contratante-cadastro-${empresa.index}`;
          const doc = empresa.documento ? maskDocument(empresa.documento, empresa.tipo_documento) : "";
          return (
            <li key={empresa.index} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <label htmlFor={id} className="min-w-0 cursor-pointer">
                <span className="block truncate text-sm font-medium text-foreground">
                  {empresa.razao_social || "—"}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {empresa.tipo_documento}
                  {doc ? ` ${doc}` : ""}
                </span>
              </label>
              <Switch
                id={id}
                checked={marcados.has(empresa.index)}
                disabled={disabled}
                onCheckedChange={(checked) => onChange(alternarContratante(escolha, empresas, empresa.index, checked))}
                aria-label={`${empresa.razao_social || "Empresa"} assina como contratante`}
              />
            </li>
          );
        })}
      </ul>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Desmarque quem só está relacionado ao lead e não assina o contrato.
      </p>
    </div>
  );
}
