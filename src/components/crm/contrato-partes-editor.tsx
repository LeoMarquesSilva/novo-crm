"use client";

import { useState } from "react";
import { Building2, Check, Plus, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PropostaOutrosContratantes } from "@/components/crm/proposta-outros-contratantes";
import { maskCpfCnpj, maskDocument } from "@/lib/crm/br-document-mask";
import {
  principalIndexDaEscolha,
  trocarPrincipal,
  type EscolhaEmpresasProposta,
} from "@/lib/crm/proposta-contratantes";
import { cn } from "@/lib/utils";

type EmpresaCadastro = {
  index: number;
  razao_social: string;
  tipo_documento: "CPF" | "CNPJ";
  documento: string;
};

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function docLabel(documento: string): string {
  const d = digits(documento);
  if (!d) return "";
  return `${d.length > 11 ? "CNPJ" : "CPF"} ${maskCpfCnpj(d)}`;
}

/**
 * Partes do contrato (lado contratante), gravadas em `cp_proposta_empresas_json`:
 * - com mais de uma empresa/pessoa no cadastro, escolhe-se a principal;
 * - as outras do cadastro assinam junto (ligadas por padrão);
 * - "Incluir parte" acrescenta quem não está no cadastro (`extras`).
 */
export function ContratoPartesEditor<T extends EscolhaEmpresasProposta>({
  empresas,
  escolha,
  onChange,
  disabled,
  principalNomeFallback,
}: {
  empresas: EmpresaCadastro[];
  escolha: T;
  onChange: (next: T) => void;
  disabled?: boolean;
  /** Nome da principal quando o cadastro não tem empresas (lead antigo). */
  principalNomeFallback?: string | null;
}) {
  const principal = principalIndexDaEscolha(escolha, empresas);
  const docsCadastro = new Set(empresas.map((e) => digits(e.documento)).filter(Boolean));
  const extras = escolha.extras
    .map((extra, position) => ({ ...extra, position }))
    .filter((extra) => {
      const doc = digits(extra.documento);
      return (extra.razao_social.trim() || doc) && !docsCadastro.has(doc);
    });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">
          {empresas.length > 1 ? "Contratante principal" : "Contratante"}
        </p>
        {empresas.length > 1 ? (
          <div role="radiogroup" aria-label="Contratante principal" className="grid gap-2">
            {empresas.map((empresa) => {
              const selected = empresa.index === principal;
              const doc = empresa.documento ? maskDocument(empresa.documento, empresa.tipo_documento) : "";
              const Icon = empresa.tipo_documento === "CPF" ? UserRound : Building2;
              return (
                <button
                  key={empresa.index}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  onClick={() => {
                    if (!selected) onChange(trocarPrincipal(escolha, empresas, empresa.index));
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-(--radius-v2-lg) border bg-white px-3 py-2.5 text-left transition-colors",
                    selected
                      ? "border-interactive-600 ring-1 ring-interactive-600"
                      : "border-border hover:border-border-strong",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-(--radius-v2-md) border border-border bg-surface-subtle text-interactive-700">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {empresa.razao_social || `Empresa/Pessoa ${empresa.index}`}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {empresa.tipo_documento}
                      {doc ? ` ${doc}` : ""}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border",
                      selected ? "border-interactive-600 bg-interactive-600 text-white" : "border-border bg-white",
                    )}
                    aria-hidden
                  >
                    {selected ? <Check className="size-3" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-(--radius-v2-md) border border-info-border bg-info-bg p-3">
            <p className="text-sm font-semibold text-foreground">
              {empresas[0]?.razao_social || principalNomeFallback || "Empresa não identificada"}
            </p>
            {empresas[0]?.documento ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {empresas[0].tipo_documento} {maskDocument(empresas[0].documento, empresas[0].tipo_documento)}
              </p>
            ) : null}
          </div>
        )}
      </div>

      <PropostaOutrosContratantes empresas={empresas} escolha={escolha} onChange={onChange} disabled={disabled} />

      <div className="space-y-2">
        {extras.length > 0 ? (
          <>
            <p className="text-xs font-medium text-foreground">Incluídas fora do cadastro</p>
            <ul className="divide-y divide-border rounded-(--radius-v2-lg) border border-border bg-white">
              {extras.map((extra) => (
                <li key={extra.position} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {extra.razao_social || "—"}
                    </span>
                    <span className="block text-xs text-muted-foreground">{docLabel(extra.documento)}</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 gap-1.5 text-muted-foreground hover:text-destructive"
                    disabled={disabled}
                    onClick={() =>
                      onChange({
                        ...escolha,
                        extras: escolha.extras.filter((_, i) => i !== extra.position),
                      })
                    }
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Tirar
                  </Button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <IncluirParteForm
          disabled={disabled}
          docsExistentes={new Set([...docsCadastro, ...extras.map((e) => digits(e.documento)).filter(Boolean)])}
          onAdd={(parte) => onChange({ ...escolha, extras: [...escolha.extras, parte] })}
        />
      </div>
    </div>
  );
}

function IncluirParteForm({
  disabled,
  docsExistentes,
  onAdd,
}: {
  disabled?: boolean;
  docsExistentes: Set<string>;
  onAdd: (parte: { razao_social: string; documento: string }) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  if (!aberto) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={disabled}
        onClick={() => {
          setAberto(true);
          setErro(null);
        }}
      >
        <Plus className="size-3.5" aria-hidden />
        Incluir parte
      </Button>
    );
  }

  function adicionar() {
    const doc = digits(documento);
    if (!nome.trim()) {
      setErro("Informe a razão social ou o nome.");
      return;
    }
    if (doc.length !== 11 && doc.length !== 14) {
      setErro("Informe um CPF (11 números) ou CNPJ (14 números).");
      return;
    }
    if (docsExistentes.has(doc)) {
      setErro("Este documento já está entre as partes.");
      return;
    }
    onAdd({ razao_social: nome.trim(), documento: maskCpfCnpj(doc) });
    setNome("");
    setDocumento("");
    setErro(null);
    setAberto(false);
  }

  return (
    <div className="space-y-2 rounded-(--radius-v2-md) border border-border bg-surface-subtle p-3">
      <p className="text-xs font-medium text-foreground">Nova parte contratante</p>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <div className="min-w-0 space-y-1">
          <label htmlFor="contrato-nova-parte-nome" className="text-xs text-muted-foreground">
            Razão social ou nome
          </label>
          <Input
            id="contrato-nova-parte-nome"
            value={nome}
            disabled={disabled}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-1">
          <label htmlFor="contrato-nova-parte-doc" className="text-xs text-muted-foreground">
            CPF ou CNPJ
          </label>
          <Input
            id="contrato-nova-parte-doc"
            value={documento}
            inputMode="numeric"
            disabled={disabled}
            onChange={(e) => setDocumento(maskCpfCnpj(e.target.value))}
          />
        </div>
      </div>
      {erro ? <p className="text-xs font-medium text-destructive">{erro}</p> : null}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Entra na qualificação e na página de assinaturas. Sem endereço próprio, a qualificação sai só com o
        documento.
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
        <Button type="button" size="sm" disabled={disabled} onClick={adicionar}>
          Incluir
        </Button>
      </div>
    </div>
  );
}
