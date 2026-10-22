"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";

import { CrmSelectContent, CrmSelectItem } from "@/components/crm/crm-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateInputBr } from "@/components/ui/date-input-br";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { maskCpf, maskCpfCnpj, maskPhoneBr } from "@/lib/crm/br-document-mask";
import { formatCepDisplay } from "@/lib/crm/proposta-empresas";
import { isValidCpf, isValidCpfOrCnpj } from "@/lib/crm/rd-migration/documents";
import { cn } from "@/lib/utils";
import { REAJUSTE_INDICES, type ClientOnboardingPayload } from "@/modules/crm/domain/client-onboarding";

const SOURCE_LABELS: Record<string, string> = {
  contrato: "Do contrato",
  lead: "Do cadastro do lead",
  proposta: "Da proposta",
  carteira: "Da carteira",
  assinatura: "Data da assinatura",
  ponto_focal: "Ponto focal — confirme",
  rd: "Do RD",
};

function SourceChip({ source }: { source?: string }) {
  if (!source) return null;
  return (
    <Badge variant="outline" className="border-info-border bg-info-bg text-info-text">
      {SOURCE_LABELS[source] ?? source}
    </Badge>
  );
}

function Field({
  label,
  htmlFor,
  required,
  source,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  source?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={htmlFor}>
          {label}
          {required ? <span className="text-danger-text"> *</span> : null}
        </Label>
        <SourceChip source={source} />
      </div>
      {children}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-(--radius-v2-xl) border border-neutral-200 bg-white p-4 sm:p-5">
      <div>
        <h3 className="text-v2-heading-md text-foreground">{title}</h3>
        {description ? <p className="mt-0.5 text-v2-caption text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

type Updater = (mutate: (draft: ClientOnboardingPayload) => void) => void;

/** Documento completo com dígito verificador errado (o envio só confere o tamanho; aqui é aviso). */
function documentoInvalido(value: string, kind: "cpf" | "cpf_cnpj"): boolean {
  const digits = value.replace(/\D/g, "");
  if (kind === "cpf") return digits.length === 11 && !isValidCpf(digits);
  return (digits.length === 11 || digits.length === 14) && !isValidCpfOrCnpj(digits);
}

/** Texto do aviso abaixo do campo (só aviso: o envio segue conferindo o tamanho). */
function documentoInvalidoTexto(value: string, kind: "cpf" | "cpf_cnpj"): string | null {
  if (!documentoInvalido(value, kind)) return null;
  return value.replace(/\D/g, "").length === 14
    ? "CNPJ inválido: confira os dígitos."
    : "CPF inválido: confira os dígitos.";
}

function DocumentoAviso({
  id,
  value,
  kind,
  className,
}: {
  id: string;
  value: string;
  kind: "cpf" | "cpf_cnpj";
  className?: string;
}) {
  const texto = documentoInvalidoTexto(value, kind);
  if (!texto) return null;
  return (
    <p id={id} className={cn("text-v2-caption text-danger-text", className)}>
      {texto}
    </p>
  );
}

function apenasNumeroDecimal(value: string): string {
  return value.replace(/[^\d,.]/g, "");
}

/**
 * Formulário do cadastro do cliente: dados de cadastro (Operações Legais) e dados para o
 * Financeiro / gestão de contratos. `readOnly` mostra o mesmo layout sem edição.
 */
export function ClientOnboardingForm({
  payload,
  onChange,
  readOnly = false,
}: {
  payload: ClientOnboardingPayload;
  onChange: (next: ClientOnboardingPayload) => void;
  readOnly?: boolean;
}) {
  const src = payload.sources;
  const update: Updater = (mutate) => {
    const next = structuredClone(payload);
    mutate(next);
    onChange(next);
  };
  const disabled = readOnly;
  const { cadastro, financeiro } = payload;

  // A busca do CEP termina depois de outras digitações: aplica sobre o cadastro mais recente.
  const payloadRef = useRef(payload);
  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);
  const [cepStatus, setCepStatus] = useState<string | null>(null);

  async function buscarCep(cep: string) {
    setCepStatus("Buscando endereço…");
    try {
      const res = await fetch(`/api/integrations/viacep?cep=${encodeURIComponent(cep)}`);
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        data?: { logradouro: string; bairro: string; localidade: string; uf: string };
      };
      if (!res.ok || !json.ok || !json.data) {
        setCepStatus(json.error ?? "CEP não encontrado. Preencha o endereço manualmente.");
        return;
      }
      const data = json.data;
      const next = structuredClone(payloadRef.current);
      if (next.cadastro.endereco.cep.replace(/\D/g, "") !== cep) return;
      next.cadastro.endereco.logradouro = data.logradouro || next.cadastro.endereco.logradouro;
      next.cadastro.endereco.bairro = data.bairro || next.cadastro.endereco.bairro;
      next.cadastro.endereco.cidade = data.localidade || next.cadastro.endereco.cidade;
      next.cadastro.endereco.uf = data.uf || next.cadastro.endereco.uf;
      onChange(next);
      setCepStatus(null);
    } catch {
      setCepStatus("Não foi possível consultar o CEP. Preencha o endereço manualmente.");
    }
  }

  return (
    <div className="space-y-4">
      <Section title="Dados do cliente" description="Operações Legais confere e cadastra no VIOS e nos sistemas legados.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Razão social" htmlFor="ob-razao" required source={src["cadastro.razaoSocial"]}>
            <Input
              id="ob-razao"
              value={cadastro.razaoSocial}
              disabled={disabled}
              onChange={(e) => update((d) => void (d.cadastro.razaoSocial = e.target.value))}
            />
          </Field>
          <Field label="CPF/CNPJ" htmlFor="ob-doc" required source={src["cadastro.documento"]}>
            <Input
              id="ob-doc"
              inputMode="numeric"
              value={cadastro.documento}
              disabled={disabled}
              aria-invalid={documentoInvalido(cadastro.documento, "cpf_cnpj") || undefined}
              aria-describedby={documentoInvalido(cadastro.documento, "cpf_cnpj") ? "ob-doc-aviso" : undefined}
              onChange={(e) => update((d) => void (d.cadastro.documento = maskCpfCnpj(e.target.value)))}
            />
            <DocumentoAviso id="ob-doc-aviso" value={cadastro.documento} kind="cpf_cnpj" />
          </Field>
          <Field label="E-mail do cliente" htmlFor="ob-email" source={src["cadastro.email"]}>
            <Input
              id="ob-email"
              type="email"
              value={cadastro.email}
              disabled={disabled}
              onChange={(e) => update((d) => void (d.cadastro.email = e.target.value))}
            />
          </Field>
          <Field label="Telefone" htmlFor="ob-tel" source={src["cadastro.telefone"]}>
            <Input
              id="ob-tel"
              type="tel"
              inputMode="tel"
              placeholder="(00) 00000-0000"
              value={cadastro.telefone}
              disabled={disabled}
              onChange={(e) => update((d) => void (d.cadastro.telefone = maskPhoneBr(e.target.value)))}
            />
          </Field>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-v2-body-sm-medium text-foreground">Endereço</p>
            <SourceChip source={src["cadastro.endereco"]} />
          </div>
          <div className="grid gap-3 sm:grid-cols-6">
            <Field label="CEP" htmlFor="ob-cep" required className="sm:col-span-2">
              <Input
                id="ob-cep"
                inputMode="numeric"
                placeholder="00000-000"
                value={formatCepDisplay(cadastro.endereco.cep)}
                disabled={disabled}
                onChange={(e) => {
                  const cep = formatCepDisplay(e.target.value);
                  update((d) => void (d.cadastro.endereco.cep = cep));
                  const digits = cep.replace(/\D/g, "");
                  if (digits.length === 8) void buscarCep(digits);
                  else setCepStatus(null);
                }}
              />
              {cepStatus ? <p className="text-v2-caption text-muted-foreground">{cepStatus}</p> : null}
            </Field>
            <Field label="Logradouro" htmlFor="ob-log" required className="sm:col-span-3">
              <Input
                id="ob-log"
                value={cadastro.endereco.logradouro}
                disabled={disabled}
                onChange={(e) => update((d) => void (d.cadastro.endereco.logradouro = e.target.value))}
              />
            </Field>
            <Field label="Número" htmlFor="ob-num" required className="sm:col-span-1">
              <Input
                id="ob-num"
                value={cadastro.endereco.numero}
                disabled={disabled}
                onChange={(e) => update((d) => void (d.cadastro.endereco.numero = e.target.value))}
              />
            </Field>
            <Field label="Complemento" htmlFor="ob-comp" className="sm:col-span-2">
              <Input
                id="ob-comp"
                value={cadastro.endereco.complemento}
                disabled={disabled}
                onChange={(e) => update((d) => void (d.cadastro.endereco.complemento = e.target.value))}
              />
            </Field>
            <Field label="Bairro" htmlFor="ob-bairro" className="sm:col-span-2">
              <Input
                id="ob-bairro"
                value={cadastro.endereco.bairro}
                disabled={disabled}
                onChange={(e) => update((d) => void (d.cadastro.endereco.bairro = e.target.value))}
              />
            </Field>
            <Field label="Cidade" htmlFor="ob-cidade" required className="sm:col-span-1">
              <Input
                id="ob-cidade"
                value={cadastro.endereco.cidade}
                disabled={disabled}
                onChange={(e) => update((d) => void (d.cadastro.endereco.cidade = e.target.value))}
              />
            </Field>
            <Field label="UF" htmlFor="ob-uf" required className="sm:col-span-1">
              <Input
                id="ob-uf"
                maxLength={2}
                value={cadastro.endereco.uf}
                disabled={disabled}
                onChange={(e) => update((d) => void (d.cadastro.endereco.uf = e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase()))}
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Qualificação dos sócios" description="Nome, posição e CPF de quem representa o cliente.">
        <div className="space-y-2">
          {cadastro.socios.map((socio, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-center">
              <Input
                value={socio.nome}
                placeholder="Nome"
                aria-label={`Nome do sócio ${index + 1}`}
                disabled={disabled}
                onChange={(e) => update((d) => void (d.cadastro.socios[index]!.nome = e.target.value))}
              />
              <Input
                value={socio.posicao}
                placeholder="Posição (ex.: diretor)"
                aria-label={`Posição do sócio ${index + 1}`}
                disabled={disabled}
                onChange={(e) => update((d) => void (d.cadastro.socios[index]!.posicao = e.target.value))}
              />
              <Input
                value={socio.cpf}
                inputMode="numeric"
                placeholder="000.000.000-00"
                aria-label={`CPF do sócio ${index + 1}`}
                disabled={disabled}
                aria-invalid={documentoInvalido(socio.cpf, "cpf") || undefined}
                aria-describedby={documentoInvalido(socio.cpf, "cpf") ? `ob-socio-${index}-cpf-aviso` : undefined}
                onChange={(e) => update((d) => void (d.cadastro.socios[index]!.cpf = maskCpf(e.target.value)))}
              />
              {!readOnly ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remover sócio ${index + 1}`}
                  onClick={() => update((d) => void d.cadastro.socios.splice(index, 1))}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              ) : null}
              <DocumentoAviso
                id={`ob-socio-${index}-cpf-aviso`}
                value={socio.cpf}
                kind="cpf"
                className="sm:col-span-full"
              />
            </div>
          ))}
          {cadastro.socios.length === 0 ? (
            <p className="text-v2-caption text-muted-foreground">Nenhum sócio informado.</p>
          ) : null}
          {!readOnly ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => update((d) => void d.cadastro.socios.push({ nome: "", posicao: "", cpf: "" }))}
            >
              <Plus className="size-3.5" aria-hidden />
              Adicionar sócio
            </Button>
          ) : null}
        </div>
      </Section>

      <Section
        title="Empresas para a consulta automatizada"
        description="Nomes e CPF/CNPJ de todas as empresas (e pessoas) do cliente que entram no monitoramento."
      >
        <div className="space-y-2">
          <SourceChip source={src["cadastro.empresasConsulta"]} />
          {cadastro.empresasConsulta.map((empresa, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1.6fr_1fr_auto] sm:items-center">
              <Input
                value={empresa.razaoSocial}
                placeholder="Razão social"
                aria-label={`Empresa ${index + 1}`}
                disabled={disabled}
                onChange={(e) => update((d) => void (d.cadastro.empresasConsulta[index]!.razaoSocial = e.target.value))}
              />
              <Input
                value={empresa.documento}
                inputMode="numeric"
                placeholder="CPF ou CNPJ"
                aria-label={`CPF/CNPJ da empresa ${index + 1}`}
                disabled={disabled}
                aria-invalid={documentoInvalido(empresa.documento, "cpf_cnpj") || undefined}
                aria-describedby={
                  documentoInvalido(empresa.documento, "cpf_cnpj") ? `ob-consulta-${index}-doc-aviso` : undefined
                }
                onChange={(e) => update((d) => void (d.cadastro.empresasConsulta[index]!.documento = maskCpfCnpj(e.target.value)))}
              />
              {!readOnly ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remover empresa ${index + 1}`}
                  onClick={() => update((d) => void d.cadastro.empresasConsulta.splice(index, 1))}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              ) : null}
              <DocumentoAviso
                id={`ob-consulta-${index}-doc-aviso`}
                value={empresa.documento}
                kind="cpf_cnpj"
                className="sm:col-span-full"
              />
            </div>
          ))}
          {!readOnly ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => update((d) => void d.cadastro.empresasConsulta.push({ razaoSocial: "", documento: "" }))}
            >
              <Plus className="size-3.5" aria-hidden />
              Adicionar empresa
            </Button>
          ) : null}
        </div>
        <Field label="Informações adicionais" htmlFor="ob-info">
          <Textarea
            id="ob-info"
            rows={3}
            value={cadastro.informacoesAdicionais}
            disabled={disabled}
            onChange={(e) => update((d) => void (d.cadastro.informacoesAdicionais = e.target.value))}
          />
        </Field>
      </Section>

      <Section
        title="Dados para o faturamento"
        description="O Financeiro usa estes dados para incluir o contrato no gerenciamento de contratos."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Razão social para faturamento" htmlFor="ob-fat-razao" required source={src["financeiro.faturamento"]}>
            <Input
              id="ob-fat-razao"
              value={financeiro.faturamento.razaoSocial}
              disabled={disabled}
              onChange={(e) => update((d) => void (d.financeiro.faturamento.razaoSocial = e.target.value))}
            />
          </Field>
          <Field label="CPF/CNPJ para faturamento" htmlFor="ob-fat-doc" required>
            <Input
              id="ob-fat-doc"
              inputMode="numeric"
              value={financeiro.faturamento.documento}
              disabled={disabled}
              aria-invalid={documentoInvalido(financeiro.faturamento.documento, "cpf_cnpj") || undefined}
              aria-describedby={
                documentoInvalido(financeiro.faturamento.documento, "cpf_cnpj") ? "ob-fat-doc-aviso" : undefined
              }
              onChange={(e) => update((d) => void (d.financeiro.faturamento.documento = maskCpfCnpj(e.target.value)))}
            />
            <DocumentoAviso id="ob-fat-doc-aviso" value={financeiro.faturamento.documento} kind="cpf_cnpj" />
          </Field>
          <Field label="Início da vigência" htmlFor="ob-vig" required source={src["financeiro.inicioVigencia"]}>
            <DateInputBr
              id="ob-vig"
              value={financeiro.inicioVigencia}
              disabled={disabled}
              onChange={(ymd) => update((d) => void (d.financeiro.inicioVigencia = ymd))}
            />
          </Field>
          <Field
            label="Primeiro faturamento"
            htmlFor="ob-primeiro"
            required={!financeiro.primeiroFaturamentoCondicionado}
            source={src["financeiro.primeiroFaturamento"]}
          >
            <DateInputBr
              id="ob-primeiro"
              value={financeiro.primeiroFaturamento}
              disabled={disabled || financeiro.primeiroFaturamentoCondicionado}
              onChange={(ymd) => update((d) => void (d.financeiro.primeiroFaturamento = ymd))}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-v2-body-sm text-foreground">
          <Switch
            aria-label="Primeiro faturamento depende de uma condição"
            checked={financeiro.primeiroFaturamentoCondicionado}
            disabled={disabled}
            onCheckedChange={(checked) =>
              update((d) => void (d.financeiro.primeiroFaturamentoCondicionado = Boolean(checked)))
            }
          />
          Primeiro faturamento depende de uma condição (ex.: entrega, êxito)
        </label>
        {financeiro.primeiroFaturamentoCondicionado ? (
          <Field label="Condição do primeiro faturamento" htmlFor="ob-cond" required>
            <Input
              id="ob-cond"
              value={financeiro.condicaoPrimeiroFaturamento}
              disabled={disabled}
              onChange={(e) => update((d) => void (d.financeiro.condicaoPrimeiroFaturamento = e.target.value))}
            />
          </Field>
        ) : null}

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-v2-body-sm-medium text-foreground">Responsável financeiro do cliente</p>
            <SourceChip source={src["financeiro.contatoFinanceiro"]} />
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Nome" htmlFor="ob-cf-nome" required>
              <Input
                id="ob-cf-nome"
                value={financeiro.contatoFinanceiro.nome}
                disabled={disabled}
                onChange={(e) => update((d) => void (d.financeiro.contatoFinanceiro.nome = e.target.value))}
              />
            </Field>
            <Field label="Posição" htmlFor="ob-cf-pos">
              <Input
                id="ob-cf-pos"
                value={financeiro.contatoFinanceiro.posicao}
                disabled={disabled}
                onChange={(e) => update((d) => void (d.financeiro.contatoFinanceiro.posicao = e.target.value))}
              />
            </Field>
            <Field label="E-mail" htmlFor="ob-cf-email" required>
              <Input
                id="ob-cf-email"
                type="email"
                value={financeiro.contatoFinanceiro.email}
                disabled={disabled}
                onChange={(e) => update((d) => void (d.financeiro.contatoFinanceiro.email = e.target.value))}
              />
            </Field>
            <Field label="Telefone" htmlFor="ob-cf-tel">
              <Input
                id="ob-cf-tel"
                type="tel"
                inputMode="tel"
                placeholder="(00) 00000-0000"
                value={financeiro.contatoFinanceiro.telefone}
                disabled={disabled}
                onChange={(e) => update((d) => void (d.financeiro.contatoFinanceiro.telefone = maskPhoneBr(e.target.value)))}
              />
            </Field>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Índice de reajuste" htmlFor="ob-indice" required>
            <Select
              value={financeiro.reajuste.indice || null}
              onValueChange={(value) => update((d) => void (d.financeiro.reajuste.indice = String(value ?? "")))}
              disabled={disabled}
            >
              <SelectTrigger id="ob-indice" className="w-full">
                <span>{financeiro.reajuste.indice || "Selecione"}</span>
              </SelectTrigger>
              <CrmSelectContent>
                {REAJUSTE_INDICES.map((indice) => (
                  <CrmSelectItem key={indice} value={indice}>
                    {indice}
                  </CrmSelectItem>
                ))}
              </CrmSelectContent>
            </Select>
          </Field>
          <Field label="Periodicidade do reajuste (meses)" htmlFor="ob-period">
            <Input
              id="ob-period"
              inputMode="numeric"
              value={financeiro.reajuste.periodicidadeMeses}
              disabled={disabled}
              onChange={(e) => update((d) => void (d.financeiro.reajuste.periodicidadeMeses = e.target.value.replace(/\D/g, "").slice(0, 3)))}
            />
          </Field>
          <Field label="Repasse acordado (%)" htmlFor="ob-repasse">
            <Input
              id="ob-repasse"
              inputMode="decimal"
              value={financeiro.repassePercentual}
              disabled={disabled}
              onChange={(e) => update((d) => void (d.financeiro.repassePercentual = apenasNumeroDecimal(e.target.value)))}
            />
          </Field>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-v2-body-sm-medium text-foreground">Rateio por área (%)</p>
            <SourceChip source={src["financeiro.rateioPorArea"]} />
          </div>
          {financeiro.rateioPorArea.map((linha, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1.6fr_120px_auto] sm:items-center">
              <Input
                value={linha.area}
                placeholder="Área"
                aria-label={`Área ${index + 1}`}
                disabled={disabled}
                onChange={(e) => update((d) => void (d.financeiro.rateioPorArea[index]!.area = e.target.value))}
              />
              <Input
                value={linha.percentual}
                inputMode="decimal"
                placeholder="%"
                aria-label={`Percentual da área ${index + 1}`}
                disabled={disabled}
                onChange={(e) => update((d) => void (d.financeiro.rateioPorArea[index]!.percentual = apenasNumeroDecimal(e.target.value)))}
              />
              {!readOnly ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remover área ${index + 1}`}
                  onClick={() => update((d) => void d.financeiro.rateioPorArea.splice(index, 1))}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              ) : null}
            </div>
          ))}
          {!readOnly ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => update((d) => void d.financeiro.rateioPorArea.push({ area: "", percentual: "" }))}
            >
              <Plus className="size-3.5" aria-hidden />
              Adicionar área
            </Button>
          ) : null}
        </div>

        <Field label="Observações para o financeiro" htmlFor="ob-obs">
          <Textarea
            id="ob-obs"
            rows={3}
            value={financeiro.observacoes}
            disabled={disabled}
            onChange={(e) => update((d) => void (d.financeiro.observacoes = e.target.value))}
          />
        </Field>
      </Section>
    </div>
  );
}
