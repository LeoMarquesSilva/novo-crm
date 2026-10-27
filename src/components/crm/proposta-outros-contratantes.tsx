"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { maskDocument } from "@/lib/crm/br-document-mask";
import { formatCepDisplay } from "@/lib/crm/proposta-empresas";
import {
  alternarContratante,
  contratantesMarcados,
  definirEnderecoContratante,
  enderecoContratantePreenchido,
  enderecoContratanteVazio,
  principalIndexDaEscolha,
  type EnderecoContratante,
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
 * Vêm marcadas; desmarca quem só está relacionado ao lead. Quem tem sede em outro lugar
 * recebe endereço próprio (sem ele, a qualificação usa o endereço do cliente).
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
  const [editando, setEditando] = useState<number | null>(null);
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
          const marcado = marcados.has(empresa.index);
          const proprio = escolha.enderecos?.[String(empresa.index)];
          return (
            <li key={empresa.index} className="px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
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
                  checked={marcado}
                  disabled={disabled}
                  onCheckedChange={(checked) => onChange(alternarContratante(escolha, empresas, empresa.index, checked))}
                  aria-label={`${empresa.razao_social || "Empresa"} assina como contratante`}
                />
              </div>
              {marcado ? (
                editando === empresa.index ? (
                  <EnderecoProprioForm
                    idPrefix={`endereco-contratante-${empresa.index}`}
                    inicial={proprio ?? enderecoContratanteVazio()}
                    disabled={disabled}
                    onCancel={() => setEditando(null)}
                    onApply={(endereco) => {
                      setEditando(null);
                      onChange(definirEnderecoContratante(escolha, empresa.index, endereco));
                    }}
                  />
                ) : (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="min-w-0">
                      {enderecoContratantePreenchido(proprio)
                        ? `Sede: ${resumoEndereco(proprio)}`
                        : "Sede: mesmo endereço do cliente"}
                    </span>
                    <button
                      type="button"
                      className="font-medium text-foreground underline-offset-2 hover:underline disabled:opacity-50"
                      disabled={disabled}
                      onClick={() => setEditando(empresa.index)}
                    >
                      {proprio ? "Alterar endereço" : "Endereço próprio"}
                    </button>
                    {proprio ? (
                      <button
                        type="button"
                        className="font-medium text-foreground underline-offset-2 hover:underline disabled:opacity-50"
                        disabled={disabled}
                        onClick={() => onChange(definirEnderecoContratante(escolha, empresa.index, null))}
                      >
                        Usar o endereço do cliente
                      </button>
                    ) : null}
                  </div>
                )
              ) : null}
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

function resumoEndereco(e: EnderecoContratante): string {
  const cidadeUf = [e.cidade, e.uf.toUpperCase()].filter(Boolean).join("/");
  return [e.logradouro, e.numero && `nº ${e.numero}`, e.bairro, cidadeUf].filter(Boolean).join(", ");
}

function EnderecoProprioForm({
  idPrefix,
  inicial,
  disabled,
  onApply,
  onCancel,
}: {
  idPrefix: string;
  inicial: EnderecoContratante;
  disabled?: boolean;
  onApply: (endereco: EnderecoContratante) => void;
  onCancel: () => void;
}) {
  const [endereco, setEndereco] = useState<EnderecoContratante>(inicial);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const set = (key: keyof EnderecoContratante, value: string) => setEndereco((prev) => ({ ...prev, [key]: value }));

  async function buscarCep() {
    const cep = endereco.cep.replace(/\D/g, "");
    if (cep.length !== 8) {
      setErro("O CEP deve ter 8 números.");
      return;
    }
    setBuscando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/integrations/viacep?cep=${encodeURIComponent(cep)}`);
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        data?: { logradouro: string; bairro: string; localidade: string; uf: string };
      };
      if (!res.ok || !json.ok || !json.data) {
        setErro(json.error ?? "CEP não encontrado. Preencha o endereço manualmente.");
        return;
      }
      const d = json.data;
      setEndereco((prev) => ({ ...prev, logradouro: d.logradouro, bairro: d.bairro, cidade: d.localidade, uf: d.uf }));
    } catch {
      setErro("Não foi possível consultar o CEP. Preencha o endereço manualmente.");
    } finally {
      setBuscando(false);
    }
  }

  const campos: Array<{ key: keyof EnderecoContratante; label: string; className: string }> = [
    { key: "logradouro", label: "Logradouro", className: "sm:col-span-4" },
    { key: "numero", label: "Número", className: "sm:col-span-2" },
    { key: "complemento", label: "Complemento", className: "sm:col-span-2" },
    { key: "bairro", label: "Bairro", className: "sm:col-span-4" },
    { key: "cidade", label: "Cidade", className: "sm:col-span-4" },
    { key: "uf", label: "UF", className: "sm:col-span-2" },
  ];

  return (
    <div className="mt-2 space-y-2 rounded-(--radius-v2-md) border border-border bg-muted/40 p-3">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <label htmlFor={`${idPrefix}-cep`} className="text-xs font-medium text-foreground">
            CEP
          </label>
          <Input
            id={`${idPrefix}-cep`}
            value={endereco.cep}
            inputMode="numeric"
            placeholder="00000-000"
            disabled={disabled}
            onChange={(e) => set("cep", formatCepDisplay(e.target.value))}
          />
        </div>
        <Button type="button" variant="outline" size="sm" disabled={disabled || buscando} onClick={() => void buscarCep()}>
          {buscando ? "Buscando…" : "Buscar"}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-6">
        {campos.map((campo) => (
          <div key={campo.key} className={`min-w-0 space-y-1 ${campo.className}`}>
            <label htmlFor={`${idPrefix}-${campo.key}`} className="text-xs font-medium text-foreground">
              {campo.label}
            </label>
            <Input
              id={`${idPrefix}-${campo.key}`}
              value={endereco[campo.key]}
              disabled={disabled}
              maxLength={campo.key === "uf" ? 2 : undefined}
              onChange={(e) =>
                set(campo.key, campo.key === "uf" ? e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase() : e.target.value)
              }
            />
          </div>
        ))}
      </div>
      {erro ? <p className="text-xs font-medium text-destructive">{erro}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={disabled || !enderecoContratantePreenchido(endereco)}
          onClick={() => onApply(endereco)}
        >
          Aplicar endereço
        </Button>
      </div>
    </div>
  );
}
