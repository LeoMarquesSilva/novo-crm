"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Download, Loader2, Plus, Search, X } from "lucide-react";

import { CrmSelectContent, CrmSelectItem } from "@/components/crm/crm-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateInputBr } from "@/components/ui/date-input-br";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { maskCpf, maskCpfCnpj, maskDocument, maskPhoneBr } from "@/lib/crm/br-document-mask";
import { CRM_PRACTICE_AREAS } from "@/lib/crm/crm-areas";
import { formatCepDisplay } from "@/lib/crm/proposta-empresas";
import { formatNumberPtBr2, maskBrlCurrencyFromInput, parseBrlUserInput } from "@/lib/crm/proposta-valor-brl-extenso";
import { isValidCpf, isValidCpfOrCnpj } from "@/lib/crm/rd-migration/documents";
import { cn } from "@/lib/utils";
import {
  onlyDigits,
  partyTipo,
  rateioPercent,
  rateioTotal,
  REAJUSTE_INDICES,
  SOCIO_POSICOES,
  type ClientOnboardingPayload,
  type LeadIndicacao,
  type OnboardingAdjustment,
  type OnboardingParty,
  type PartyTipo,
} from "@/modules/crm/domain/client-onboarding";

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

/** Aviso do que Operações Legais pediu para ajustar no campo. */
function AjusteNota({ ajuste }: { ajuste?: OnboardingAdjustment }) {
  if (!ajuste) return null;
  return (
    <p className="rounded-(--radius-v2-sm) bg-warning-bg px-2 py-1 text-v2-caption text-warning-text">
      Ajustar{ajuste.comentario ? `: ${ajuste.comentario}` : " este campo."}
    </p>
  );
}

function Field({
  label,
  htmlFor,
  required,
  source,
  ajuste,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  source?: string;
  ajuste?: OnboardingAdjustment;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "space-y-1.5",
        ajuste ? "rounded-(--radius-v2-md) ring-2 ring-warning-border ring-offset-4 ring-offset-white" : undefined,
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={htmlFor}>
          {label}
          {required ? <span className="text-danger-text"> *</span> : null}
        </Label>
        <SourceChip source={source} />
      </div>
      {children}
      <AjusteNota ajuste={ajuste} />
    </div>
  );
}

function Section({
  id,
  title,
  description,
  ajuste,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  ajuste?: OnboardingAdjustment;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      tabIndex={id ? -1 : undefined}
      className={cn(
        "space-y-4 rounded-(--radius-v2-xl) border bg-white p-4 sm:p-5",
        ajuste ? "border-warning-border ring-2 ring-warning-border" : "border-neutral-200",
      )}
    >
      <div>
        <h3 className="text-v2-heading-md text-foreground">{title}</h3>
        {description ? <p className="mt-0.5 text-v2-caption text-muted-foreground">{description}</p> : null}
      </div>
      <AjusteNota ajuste={ajuste} />
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

const PARTY_TIPO_LABELS: Record<PartyTipo, string> = { CNPJ: "Empresa (CNPJ)", CPF: "Pessoa (CPF)" };

function partyKey(party: { razaoSocial: string; documento: string }): string {
  return onlyDigits(party.documento) || party.razaoSocial.trim().toLowerCase();
}

function partyLabel(party: OnboardingParty): string {
  const doc = party.documento ? maskDocument(party.documento, partyTipo(party)) : "sem documento";
  return `${party.razaoSocial || "Sem nome"} · ${doc}`;
}

/** Empresa ou pessoa: troca a máscara do documento (CNPJ ou CPF). */
function PartyTipoSelect({
  id,
  value,
  disabled,
  inModal,
  label,
  onChange,
}: {
  id?: string;
  value: PartyTipo;
  disabled: boolean;
  inModal: boolean;
  label: string;
  onChange: (tipo: PartyTipo) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next === "CPF" || next === "CNPJ") onChange(next);
      }}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-full" aria-label={label}>
        <span>{PARTY_TIPO_LABELS[value]}</span>
      </SelectTrigger>
      <CrmSelectContent inModal={inModal}>
        <CrmSelectItem value="CNPJ">{PARTY_TIPO_LABELS.CNPJ}</CrmSelectItem>
        <CrmSelectItem value="CPF">{PARTY_TIPO_LABELS.CPF}</CrmSelectItem>
      </CrmSelectContent>
    </Select>
  );
}

/** Percentual no formato da tela ("33,33"). */
function percentText(value: number): string {
  return String(Math.round(value * 100) / 100).replace(".", ",");
}

function brl(value: number): string {
  return `R$ ${formatNumberPtBr2(value)}`;
}

/**
 * Rateio dos honorários entre as áreas do escritório: área da lista, % de cada uma (100% no
 * total) e, com o valor a ratear, quanto cabe a cada área em R$.
 */
function RateioPorArea({
  rows: allRows,
  valorRateio,
  sourceRateio,
  sourceValor,
  readOnly,
  inModal,
  update,
  fid,
}: {
  rows: ClientOnboardingPayload["financeiro"]["rateioPorArea"];
  valorRateio: string;
  sourceRateio?: string;
  sourceValor?: string;
  readOnly: boolean;
  inModal: boolean;
  update: Updater;
  fid: (id: string) => string;
}) {
  // Só leitura: linha em branco que sobrou da edição não aparece.
  const rows = readOnly ? allRows.filter((r) => r.area || r.percentual) : allRows;
  const base = parseBrlUserInput(valorRateio);
  const total = rateioTotal(rows);
  const diff = Math.round((100 - total) * 100) / 100;
  const usadas = new Set(rows.map((r) => r.area).filter(Boolean));
  const livres = CRM_PRACTICE_AREAS.filter((area) => !usadas.has(area));
  const opcoes = (atual: string): string[] => [
    ...(atual && !(CRM_PRACTICE_AREAS as readonly string[]).includes(atual) ? [atual] : []),
    ...CRM_PRACTICE_AREAS.filter((area) => area === atual || !usadas.has(area)),
  ];
  const valorDe = (percentual: string) => (base != null && base > 0 ? brl((base * rateioPercent(percentual)) / 100) : "—");

  function adicionar() {
    update((d) => {
      // A nova área já vem com o que falta para 100%.
      const resto = Math.round((100 - rateioTotal(d.financeiro.rateioPorArea)) * 100) / 100;
      d.financeiro.rateioPorArea.push({ area: "", percentual: resto > 0 ? percentText(resto) : "" });
    });
  }

  function dividirIgualmente() {
    update((d) => {
      const linhas = d.financeiro.rateioPorArea;
      const parte = Math.floor((100 / linhas.length) * 100) / 100;
      linhas.forEach((linha, i) => {
        // A última fica com o arredondamento, para fechar 100%.
        linha.percentual = percentText(i === linhas.length - 1 ? 100 - parte * (linhas.length - 1) : parte);
      });
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-v2-body-sm-medium text-foreground">
          Rateio por área<span className="text-danger-text"> *</span>
        </p>
        <SourceChip source={sourceRateio} />
      </div>
      <p className="text-v2-caption text-muted-foreground">
        Divida os honorários entre as áreas que vão atender o cliente. O total precisa fechar 100%.
      </p>

      <Field label="Valor a ratear (R$)" htmlFor={fid("ob-valor-rateio")} source={sourceValor} className="sm:max-w-xs">
        <Input
          id={fid("ob-valor-rateio")}
          inputMode="numeric"
          placeholder="R$ 0,00"
          value={valorRateio}
          disabled={readOnly}
          onChange={(e) => update((d) => void (d.financeiro.valorRateio = maskBrlCurrencyFromInput(e.target.value)))}
        />
        <p className="text-v2-caption text-muted-foreground">Valor dos honorários; mostra quanto cabe a cada área.</p>
      </Field>

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-(--radius-v2-md) border border-border">
          <div className="hidden grid-cols-[minmax(0,1fr)_112px_150px_32px] gap-3 bg-surface-subtle px-3 py-2 text-v2-caption font-medium text-muted-foreground sm:grid">
            <span>Área</span>
            <span>Percentual</span>
            <span className="text-right">Valor</span>
            <span />
          </div>
          {rows.map((linha, index) => (
            <div
              key={index}
              className="grid grid-cols-[minmax(0,1fr)_96px_32px] items-center gap-x-3 gap-y-1 border-t border-border px-3 py-2 max-sm:[&:nth-child(2)]:border-t-0 sm:grid-cols-[minmax(0,1fr)_112px_150px_32px]"
            >
              <Select
                value={linha.area || null}
                onValueChange={(value) => update((d) => void (d.financeiro.rateioPorArea[index]!.area = String(value ?? "")))}
                disabled={readOnly}
              >
                <SelectTrigger className="w-full" aria-label={`Área ${index + 1} do rateio`}>
                  <span className={linha.area ? "truncate" : "text-muted-foreground"}>{linha.area || "Selecione a área"}</span>
                </SelectTrigger>
                <CrmSelectContent inModal={inModal}>
                  {opcoes(linha.area).map((area) => (
                    <CrmSelectItem key={area} value={area}>
                      {area}
                    </CrmSelectItem>
                  ))}
                </CrmSelectContent>
              </Select>
              <div className="relative">
                <Input
                  value={linha.percentual}
                  inputMode="decimal"
                  placeholder="0"
                  aria-label={`Percentual da área ${index + 1}`}
                  className="pr-7 text-right tabular-nums"
                  disabled={readOnly}
                  onChange={(e) =>
                    update((d) => void (d.financeiro.rateioPorArea[index]!.percentual = apenasNumeroDecimal(e.target.value)))
                  }
                />
                <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">
                  %
                </span>
              </div>
              <span className="col-span-2 row-start-2 text-v2-caption tabular-nums text-muted-foreground sm:col-span-1 sm:row-start-auto sm:text-right sm:text-sm sm:text-foreground">
                {valorDe(linha.percentual)}
              </span>
              {!readOnly ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="col-start-3 row-start-1 sm:col-start-auto sm:row-start-auto"
                  aria-label={`Remover área ${index + 1}`}
                  onClick={() => update((d) => void d.financeiro.rateioPorArea.splice(index, 1))}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              ) : (
                <span />
              )}
            </div>
          ))}
          <div className="grid grid-cols-[minmax(0,1fr)_96px_32px] items-center gap-3 border-t border-border bg-surface-subtle px-3 py-2 sm:grid-cols-[minmax(0,1fr)_112px_150px_32px]">
            <span
              className={cn(
                "flex items-center gap-1.5 text-v2-caption font-medium",
                diff === 0 ? "text-success-text" : diff > 0 ? "text-warning-text" : "text-danger-text",
              )}
            >
              {diff === 0 ? <CheckCircle2 className="size-3.5" aria-hidden /> : <CircleAlert className="size-3.5" aria-hidden />}
              {diff === 0 ? "Fecha 100%" : diff > 0 ? `Faltam ${percentText(diff)}%` : `Passou ${percentText(-diff)}%`}
            </span>
            <span className="pr-2.5 text-right text-sm font-semibold tabular-nums text-foreground">{percentText(total)}%</span>
            <span className="hidden text-right text-sm font-semibold tabular-nums text-foreground sm:block">
              {base != null && base > 0 ? brl((base * total) / 100) : "—"}
            </span>
            <span />
          </div>
        </div>
      ) : null}

      {!readOnly ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={adicionar} disabled={livres.length === 0}>
            <Plus className="size-3.5" aria-hidden />
            Adicionar área
          </Button>
          {rows.length > 1 ? (
            <Button type="button" variant="ghost" size="sm" onClick={dividirIgualmente}>
              Dividir igualmente
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Seções do formulário: o cadastro vai antes (Aguardando Cadastro), o faturamento depois. */
export type ClientOnboardingFormSections = "cadastro" | "faturamento" | "all";

/**
 * Formulário do cadastro do cliente: dados de cadastro (Operações Legais) e dados para o
 * Financeiro / gestão de contratos. `readOnly` mostra o mesmo layout sem edição.
 */
export function ClientOnboardingForm({
  payload,
  onChange,
  readOnly = false,
  inModal = false,
  sections = "all",
  leadParties = [],
  ajustes = [],
  indicacao = null,
  idPrefix = "",
}: {
  payload: ClientOnboardingPayload;
  onChange: (next: ClientOnboardingPayload) => void;
  readOnly?: boolean;
  /** Dentro de um Dialog: o menu do select abre por cima do modal. */
  inModal?: boolean;
  sections?: ClientOnboardingFormSections;
  /** Empresas e pessoas já informadas no lead, para puxar sem digitar de novo. */
  leadParties?: OnboardingParty[];
  /** Campos que Operações Legais pediu para ajustar (ficam destacados). */
  ajustes?: OnboardingAdjustment[];
  /** Lead de indicação: mostra (e exige) o repasse acordado. */
  indicacao?: LeadIndicacao | null;
  /**
   * Prefixo dos ids dos campos. A aba usa os ids puros (os avisos de ajuste levam a eles);
   * o modal aberto por cima da aba usa outro, senão o rótulo focava o campo de trás.
   */
  idPrefix?: string;
}) {
  const fid = (id: string) => `${idPrefix}${id}`;
  const ajusteDe = (campo: OnboardingAdjustment["campo"]) => ajustes.find((a) => a.campo === campo);
  const showCadastro = sections !== "faturamento";
  const showFaturamento = sections !== "cadastro";
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
  const [cepBuscando, setCepBuscando] = useState(false);

  async function buscarCep(cep: string) {
    setCepStatus("Buscando endereço…");
    setCepBuscando(true);
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
    } finally {
      setCepBuscando(false);
    }
  }

  const consultaKeys = new Set(cadastro.empresasConsulta.map(partyKey).filter(Boolean));
  const partiesToPull = leadParties.filter((p) => !consultaKeys.has(partyKey(p)));
  // "Usar dados de": o cliente principal, as partes do lead e as da busca de novas demandas.
  const billingOptions: OnboardingParty[] = [];
  const billingSeen = new Set<string>();
  for (const party of [
    { tipo: "" as const, razaoSocial: cadastro.razaoSocial, documento: cadastro.documento },
    ...leadParties,
    ...cadastro.empresasConsulta,
  ]) {
    const key = partyKey(party);
    if (!key || billingSeen.has(key)) continue;
    billingSeen.add(key);
    billingOptions.push({ ...party, tipo: partyTipo(party) });
  }
  const billingTipo = partyTipo(financeiro.faturamento);
  const socioPosicoes = (atual: string): string[] =>
    atual && !(SOCIO_POSICOES as readonly string[]).includes(atual) ? [...SOCIO_POSICOES, atual] : [...SOCIO_POSICOES];

  return (
    <div className="space-y-4">
      {showCadastro ? (
      <>
      <Section title="Dados do cliente" description="Operações Legais confere e cadastra no VIOS e nos sistemas legados.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Razão social" htmlFor={fid("ob-razao")} required source={src["cadastro.razaoSocial"]} ajuste={ajusteDe("cadastro.razaoSocial")}>
            <Input
              id={fid("ob-razao")}
              value={cadastro.razaoSocial}
              disabled={disabled}
              onChange={(e) => update((d) => void (d.cadastro.razaoSocial = e.target.value))}
            />
          </Field>
          <Field label="CPF/CNPJ" htmlFor={fid("ob-doc")} required source={src["cadastro.documento"]} ajuste={ajusteDe("cadastro.documento")}>
            <Input
              id={fid("ob-doc")}
              inputMode="numeric"
              value={maskCpfCnpj(cadastro.documento)}
              disabled={disabled}
              aria-invalid={documentoInvalido(cadastro.documento, "cpf_cnpj") || undefined}
              aria-describedby={documentoInvalido(cadastro.documento, "cpf_cnpj") ? fid("ob-doc-aviso") : undefined}
              onChange={(e) => update((d) => void (d.cadastro.documento = maskCpfCnpj(e.target.value)))}
            />
            <DocumentoAviso id={fid("ob-doc-aviso")} value={cadastro.documento} kind="cpf_cnpj" />
          </Field>
          <Field label="E-mail do cliente" htmlFor={fid("ob-email")} source={src["cadastro.email"]} ajuste={ajusteDe("cadastro.email")}>
            <Input
              id={fid("ob-email")}
              type="email"
              value={cadastro.email}
              disabled={disabled}
              onChange={(e) => update((d) => void (d.cadastro.email = e.target.value))}
            />
          </Field>
          <Field label="Telefone" htmlFor={fid("ob-tel")} source={src["cadastro.telefone"]} ajuste={ajusteDe("cadastro.telefone")}>
            <Input
              id={fid("ob-tel")}
              type="tel"
              inputMode="tel"
              placeholder="(00) 00000-0000"
              value={cadastro.telefone}
              disabled={disabled}
              onChange={(e) => update((d) => void (d.cadastro.telefone = maskPhoneBr(e.target.value)))}
            />
          </Field>
        </div>

        <div
          className={cn(
            "space-y-2",
            ajusteDe("cadastro.endereco")
              ? "rounded-(--radius-v2-md) ring-2 ring-warning-border ring-offset-4 ring-offset-white"
              : undefined,
          )}
        >
          <div className="flex items-center gap-2">
            <p className="text-v2-body-sm-medium text-foreground">Endereço</p>
            <SourceChip source={src["cadastro.endereco"]} />
          </div>
          <AjusteNota ajuste={ajusteDe("cadastro.endereco")} />
          <div className="grid gap-3 sm:grid-cols-6">
            <Field label="CEP" htmlFor={fid("ob-cep")} required className="sm:col-span-2">
              <div className="flex gap-2">
                <Input
                  id={fid("ob-cep")}
                  className="min-w-0 flex-1"
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
                {!readOnly ? (
                  // CEP que já veio preenchido (RD, proposta) não dispara a busca sozinho.
                  <Button
                    type="button"
                    variant="outline"
                    size="control"
                    aria-label="Buscar endereço pelo CEP"
                    title="Buscar endereço pelo CEP"
                    disabled={cepBuscando || onlyDigits(cadastro.endereco.cep).length !== 8}
                    onClick={() => void buscarCep(onlyDigits(cadastro.endereco.cep))}
                  >
                    {cepBuscando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}
                  </Button>
                ) : null}
              </div>
              {cepStatus ? <p className="text-v2-caption text-muted-foreground">{cepStatus}</p> : null}
            </Field>
            <Field label="Logradouro" htmlFor={fid("ob-log")} required className="sm:col-span-3">
              <Input
                id={fid("ob-log")}
                value={cadastro.endereco.logradouro}
                disabled={disabled}
                onChange={(e) => update((d) => void (d.cadastro.endereco.logradouro = e.target.value))}
              />
            </Field>
            <Field label="Número" htmlFor={fid("ob-num")} required className="sm:col-span-1">
              <Input
                id={fid("ob-num")}
                value={cadastro.endereco.numero}
                disabled={disabled}
                onChange={(e) => update((d) => void (d.cadastro.endereco.numero = e.target.value))}
              />
            </Field>
            <Field label="Complemento" htmlFor={fid("ob-comp")} className="sm:col-span-2">
              <Input
                id={fid("ob-comp")}
                value={cadastro.endereco.complemento}
                disabled={disabled}
                onChange={(e) => update((d) => void (d.cadastro.endereco.complemento = e.target.value))}
              />
            </Field>
            <Field label="Bairro" htmlFor={fid("ob-bairro")} className="sm:col-span-2">
              <Input
                id={fid("ob-bairro")}
                value={cadastro.endereco.bairro}
                disabled={disabled}
                onChange={(e) => update((d) => void (d.cadastro.endereco.bairro = e.target.value))}
              />
            </Field>
            <Field label="Cidade" htmlFor={fid("ob-cidade")} required className="sm:col-span-1">
              <Input
                id={fid("ob-cidade")}
                value={cadastro.endereco.cidade}
                disabled={disabled}
                onChange={(e) => update((d) => void (d.cadastro.endereco.cidade = e.target.value))}
              />
            </Field>
            <Field label="UF" htmlFor={fid("ob-uf")} required className="sm:col-span-1">
              <Input
                id={fid("ob-uf")}
                maxLength={2}
                value={cadastro.endereco.uf}
                disabled={disabled}
                onChange={(e) => update((d) => void (d.cadastro.endereco.uf = e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase()))}
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section id={fid("ob-socios")} title="Qualificação dos sócios" description="Nome, posição e CPF de quem representa o cliente." ajuste={ajusteDe("cadastro.socios")}>
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
              <Select
                value={socio.posicao || null}
                onValueChange={(value) => update((d) => void (d.cadastro.socios[index]!.posicao = String(value ?? "")))}
                disabled={disabled}
              >
                <SelectTrigger className="w-full" aria-label={`Posição do sócio ${index + 1}`}>
                  <span className={socio.posicao ? undefined : "text-muted-foreground"}>{socio.posicao || "Posição"}</span>
                </SelectTrigger>
                <CrmSelectContent inModal={inModal}>
                  {socioPosicoes(socio.posicao).map((posicao) => (
                    <CrmSelectItem key={posicao} value={posicao}>
                      {posicao}
                    </CrmSelectItem>
                  ))}
                </CrmSelectContent>
              </Select>
              <Input
                value={maskCpf(socio.cpf)}
                inputMode="numeric"
                placeholder="000.000.000-00"
                aria-label={`CPF do sócio ${index + 1}`}
                disabled={disabled}
                aria-invalid={documentoInvalido(socio.cpf, "cpf") || undefined}
                aria-describedby={documentoInvalido(socio.cpf, "cpf") ? fid(`ob-socio-${index}-cpf-aviso`) : undefined}
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
                id={fid(`ob-socio-${index}-cpf-aviso`)}
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
        id={fid("ob-consulta")}
        title="Empresas para incluir na busca de novas demandas"
        description="Nomes e CPF/CNPJ de todas as empresas (e pessoas) do cliente que entram no monitoramento."
        ajuste={ajusteDe("cadastro.empresasConsulta")}
      >
        <div className="space-y-2">
          <SourceChip source={src["cadastro.empresasConsulta"]} />
          {cadastro.empresasConsulta.map((empresa, index) => {
            const tipo = partyTipo(empresa);
            const kind = tipo === "CPF" ? "cpf" : "cpf_cnpj";
            return (
              <div key={index} className="grid gap-2 sm:grid-cols-[170px_1.6fr_1fr_auto] sm:items-center">
                <PartyTipoSelect
                  value={tipo}
                  disabled={disabled}
                  inModal={inModal}
                  label={`Empresa ou pessoa ${index + 1}`}
                  onChange={(next) =>
                    update((d) => {
                      const row = d.cadastro.empresasConsulta[index]!;
                      row.tipo = next;
                      row.documento = maskDocument(row.documento, next);
                    })
                  }
                />
                <Input
                  value={empresa.razaoSocial}
                  placeholder={tipo === "CPF" ? "Nome completo" : "Razão social"}
                  aria-label={`${tipo === "CPF" ? "Nome" : "Razão social"} ${index + 1}`}
                  disabled={disabled}
                  onChange={(e) => update((d) => void (d.cadastro.empresasConsulta[index]!.razaoSocial = e.target.value))}
                />
                <Input
                  value={maskDocument(empresa.documento, tipo)}
                  inputMode="numeric"
                  placeholder={tipo === "CPF" ? "000.000.000-00" : "00.000.000/0000-00"}
                  aria-label={`${tipo} ${index + 1}`}
                  disabled={disabled}
                  aria-invalid={documentoInvalido(empresa.documento, kind) || undefined}
                  aria-describedby={documentoInvalido(empresa.documento, kind) ? fid(`ob-consulta-${index}-doc-aviso`) : undefined}
                  onChange={(e) =>
                    update((d) => void (d.cadastro.empresasConsulta[index]!.documento = maskDocument(e.target.value, tipo)))
                  }
                />
                {!readOnly ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remover ${index + 1} da busca de novas demandas`}
                    onClick={() => update((d) => void d.cadastro.empresasConsulta.splice(index, 1))}
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                ) : null}
                <DocumentoAviso
                  id={fid(`ob-consulta-${index}-doc-aviso`)}
                  value={empresa.documento}
                  kind={kind}
                  className="sm:col-span-full"
                />
              </div>
            );
          })}
          {cadastro.empresasConsulta.length === 0 ? (
            <p className="text-v2-caption text-muted-foreground">Nenhuma empresa ou pessoa informada.</p>
          ) : null}
          {!readOnly ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  update((d) => void d.cadastro.empresasConsulta.push({ tipo: "CNPJ", razaoSocial: "", documento: "" }))
                }
              >
                <Plus className="size-3.5" aria-hidden />
                Adicionar empresa
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  update((d) => void d.cadastro.empresasConsulta.push({ tipo: "CPF", razaoSocial: "", documento: "" }))
                }
              >
                <Plus className="size-3.5" aria-hidden />
                Adicionar pessoa
              </Button>
              {leadParties.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={partiesToPull.length === 0}
                  title={partiesToPull.length === 0 ? "Todas as empresas e pessoas do lead já estão na lista." : undefined}
                  onClick={() =>
                    update((d) => void d.cadastro.empresasConsulta.push(...partiesToPull.map((p) => ({ ...p, documento: maskDocument(p.documento, partyTipo(p)) }))))
                  }
                >
                  <Download className="size-3.5" aria-hidden />
                  Puxar do lead{partiesToPull.length > 0 ? ` (${partiesToPull.length})` : ""}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        {cadastro.informacoesAdicionais ? (
          // Campo antigo: só o processo do RD preenchia (sócios e consulta em texto livre).
          <div className="space-y-1 rounded-(--radius-v2-md) border border-neutral-200 bg-neutral-50 p-3">
            <p className="text-v2-caption-medium text-muted-foreground">Anotações trazidas do RD</p>
            <p className="whitespace-pre-wrap text-v2-body-sm text-foreground">{cadastro.informacoesAdicionais}</p>
          </div>
        ) : null}
      </Section>
      </>
      ) : null}

      {showFaturamento ? (
      <Section
        title="Dados para o faturamento"
        description="O Financeiro usa estes dados para incluir o contrato no gerenciamento de contratos."
      >
        {!readOnly && billingOptions.length > 0 ? (
          <Field label="Usar dados de" htmlFor={fid("ob-fat-origem")}>
            <Select
              value={null}
              onValueChange={(value) => {
                const party = billingOptions.find((p) => partyKey(p) === value);
                if (!party) return;
                update((d) => {
                  d.financeiro.faturamento = {
                    tipo: partyTipo(party),
                    razaoSocial: party.razaoSocial,
                    documento: maskDocument(party.documento, partyTipo(party)),
                  };
                });
              }}
            >
              <SelectTrigger id={fid("ob-fat-origem")} className="w-full">
                <span className="text-muted-foreground">Escolha uma empresa ou pessoa já informada no lead</span>
              </SelectTrigger>
              <CrmSelectContent inModal={inModal}>
                {billingOptions.map((party) => (
                  <CrmSelectItem key={partyKey(party)} value={partyKey(party)}>
                    {partyLabel(party)}
                  </CrmSelectItem>
                ))}
              </CrmSelectContent>
            </Select>
          </Field>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-[200px_1.4fr_1fr]">
          <Field label="Faturar para" htmlFor={fid("ob-fat-tipo")} required source={src["financeiro.faturamento"]}>
            <PartyTipoSelect
              id={fid("ob-fat-tipo")}
              value={billingTipo}
              disabled={disabled}
              inModal={inModal}
              label="Faturar para empresa ou pessoa"
              onChange={(next) =>
                update((d) => {
                  d.financeiro.faturamento.tipo = next;
                  d.financeiro.faturamento.documento = maskDocument(d.financeiro.faturamento.documento, next);
                })
              }
            />
          </Field>
          <Field label={billingTipo === "CPF" ? "Nome para faturamento" : "Razão social para faturamento"} htmlFor={fid("ob-fat-razao")} required>
            <Input
              id={fid("ob-fat-razao")}
              value={financeiro.faturamento.razaoSocial}
              disabled={disabled}
              onChange={(e) => update((d) => void (d.financeiro.faturamento.razaoSocial = e.target.value))}
            />
          </Field>
          <Field label={`${billingTipo} para faturamento`} htmlFor={fid("ob-fat-doc")} required>
            <Input
              id={fid("ob-fat-doc")}
              inputMode="numeric"
              placeholder={billingTipo === "CPF" ? "000.000.000-00" : "00.000.000/0000-00"}
              value={maskDocument(financeiro.faturamento.documento, billingTipo)}
              disabled={disabled}
              aria-invalid={documentoInvalido(financeiro.faturamento.documento, billingTipo === "CPF" ? "cpf" : "cpf_cnpj") || undefined}
              aria-describedby={
                documentoInvalido(financeiro.faturamento.documento, billingTipo === "CPF" ? "cpf" : "cpf_cnpj")
                  ? fid("ob-fat-doc-aviso")
                  : undefined
              }
              onChange={(e) =>
                update((d) => void (d.financeiro.faturamento.documento = maskDocument(e.target.value, billingTipo)))
              }
            />
            <DocumentoAviso
              id={fid("ob-fat-doc-aviso")}
              value={financeiro.faturamento.documento}
              kind={billingTipo === "CPF" ? "cpf" : "cpf_cnpj"}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Início da vigência" htmlFor={fid("ob-vig")} required source={src["financeiro.inicioVigencia"]}>
            <DateInputBr
              id={fid("ob-vig")}
              value={financeiro.inicioVigencia}
              disabled={disabled}
              onChange={(ymd) => update((d) => void (d.financeiro.inicioVigencia = ymd))}
            />
          </Field>
          <Field
            label="Primeiro faturamento"
            htmlFor={fid("ob-primeiro")}
            required={!financeiro.primeiroFaturamentoCondicionado}
            source={src["financeiro.primeiroFaturamento"]}
          >
            <DateInputBr
              id={fid("ob-primeiro")}
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
          <Field label="Condição do primeiro faturamento" htmlFor={fid("ob-cond")} required>
            <Input
              id={fid("ob-cond")}
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
            <Field label="Nome" htmlFor={fid("ob-cf-nome")} required>
              <Input
                id={fid("ob-cf-nome")}
                value={financeiro.contatoFinanceiro.nome}
                disabled={disabled}
                onChange={(e) => update((d) => void (d.financeiro.contatoFinanceiro.nome = e.target.value))}
              />
            </Field>
            <Field label="Posição" htmlFor={fid("ob-cf-pos")}>
              <Input
                id={fid("ob-cf-pos")}
                value={financeiro.contatoFinanceiro.posicao}
                disabled={disabled}
                onChange={(e) => update((d) => void (d.financeiro.contatoFinanceiro.posicao = e.target.value))}
              />
            </Field>
            <Field label="E-mail" htmlFor={fid("ob-cf-email")} required>
              <Input
                id={fid("ob-cf-email")}
                type="email"
                value={financeiro.contatoFinanceiro.email}
                disabled={disabled}
                onChange={(e) => update((d) => void (d.financeiro.contatoFinanceiro.email = e.target.value))}
              />
            </Field>
            <Field label="Telefone" htmlFor={fid("ob-cf-tel")}>
              <Input
                id={fid("ob-cf-tel")}
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

        <div className={cn("grid gap-4", indicacao ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
          <Field label="Índice de reajuste" htmlFor={fid("ob-indice")} required source={src["financeiro.reajuste"]}>
            <Select
              value={financeiro.reajuste.indice || null}
              onValueChange={(value) => update((d) => void (d.financeiro.reajuste.indice = String(value ?? "")))}
              disabled={disabled}
            >
              <SelectTrigger id={fid("ob-indice")} className="w-full">
                <span>{financeiro.reajuste.indice || "Selecione"}</span>
              </SelectTrigger>
              <CrmSelectContent inModal={inModal}>
                {REAJUSTE_INDICES.map((indice) => (
                  <CrmSelectItem key={indice} value={indice}>
                    {indice}
                  </CrmSelectItem>
                ))}
              </CrmSelectContent>
            </Select>
          </Field>
          <Field label="Periodicidade do reajuste (meses)" htmlFor={fid("ob-period")}>
            <Input
              id={fid("ob-period")}
              inputMode="numeric"
              value={financeiro.reajuste.periodicidadeMeses}
              disabled={disabled}
              onChange={(e) => update((d) => void (d.financeiro.reajuste.periodicidadeMeses = e.target.value.replace(/\D/g, "").slice(0, 3)))}
            />
          </Field>
          {indicacao ? (
            <Field label="Repasse acordado com a indicação (%)" htmlFor={fid("ob-repasse")} required source={src["financeiro.repassePercentual"]}>
              <Input
                id={fid("ob-repasse")}
                inputMode="decimal"
                placeholder="Ex.: 10"
                value={financeiro.repassePercentual}
                disabled={disabled}
                onChange={(e) => update((d) => void (d.financeiro.repassePercentual = apenasNumeroDecimal(e.target.value)))}
              />
              <p className="text-v2-caption text-muted-foreground">
                {indicacao.nome ? `Indicação de ${indicacao.nome}${indicacao.tipo ? ` (${indicacao.tipo})` : ""}. ` : "Lead de indicação. "}
                Sem repasse, informe 0.
              </p>
            </Field>
          ) : null}
        </div>

        <RateioPorArea
          rows={financeiro.rateioPorArea}
          valorRateio={financeiro.valorRateio}
          sourceRateio={src["financeiro.rateioPorArea"]}
          sourceValor={src["financeiro.valorRateio"]}
          readOnly={readOnly}
          inModal={inModal}
          update={update}
          fid={fid}
        />

        <Field label="Observações para o financeiro" htmlFor={fid("ob-obs")}>
          <Textarea
            id={fid("ob-obs")}
            rows={3}
            value={financeiro.observacoes}
            disabled={disabled}
            onChange={(e) => update((d) => void (d.financeiro.observacoes = e.target.value))}
          />
        </Field>
      </Section>
      ) : null}
    </div>
  );
}
