import type { ContractingParty, ContractingPartyAddress, ContractPayment, ContractStartRule } from "@/lib/crm/contract-engine/types";
import {
  emptyClientOnboardingPayload,
  onlyDigits,
  type ClientOnboardingPayload,
} from "@/modules/crm/domain/client-onboarding";

export type OnboardingPrefillSources = {
  /** Partes do contrato montado no CRM (motor canônico), quando existe. */
  contractParties: ContractingParty[] | null;
  /** Partes resolvidas do intake/proposta (sem contrato montado). */
  intakeParties: ContractingParty[];
  /** Endereço `cp_cliente_*` da proposta. */
  proposalAddress: ContractingPartyAddress | null;
  startRule: ContractStartRule | null;
  payment: Pick<ContractPayment, "firstDueDate"> | null;
  /** Quando a venda foi fechada (assinatura), AAAA-MM-DD. */
  signedOn: string | null;
  /** Áreas da proposta com o valor de cada uma (para o rateio). */
  areaAmounts: { area: string; amount: number | null }[];
  focal: { name: string | null; email: string | null };
  cliente: {
    razaoSocial: string | null;
    documento: string | null;
    endereco: ContractingPartyAddress | null;
    email: string | null;
    telefone: string | null;
  } | null;
  contatoFinanceiro: { nome: string; cargo: string | null; email: string | null; telefone: string | null } | null;
};

function hasAddress(a: ContractingPartyAddress | null | undefined): a is ContractingPartyAddress {
  return Boolean(a && (a.logradouro || a.cep || a.cidade));
}

function normalizeAddress(a: ContractingPartyAddress): ClientOnboardingPayload["cadastro"]["endereco"] {
  return {
    cep: onlyDigits(a.cep ?? "").slice(0, 8),
    logradouro: (a.logradouro ?? "").trim(),
    numero: (a.numero ?? "").trim(),
    complemento: (a.complemento ?? "").trim(),
    bairro: (a.bairro ?? "").trim(),
    cidade: (a.cidade ?? "").trim(),
    uf: (a.uf ?? "").trim().toUpperCase().slice(0, 2),
  };
}

function formatPercent(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * Cadastro pré-preenchido com o que o lead já tem: partes e endereço do contrato (ou do
 * intake/proposta), cliente já cadastrado, ponto focal, datas do contrato e áreas da
 * proposta. O responsável confere e completa antes de enviar a Operações Legais.
 */
export function buildClientOnboardingPrefill(sources: OnboardingPrefillSources): ClientOnboardingPayload {
  const payload = emptyClientOnboardingPayload();
  const origin: Record<string, string> = {};

  const parties = sources.contractParties?.length ? sources.contractParties : sources.intakeParties;
  const partiesSource = sources.contractParties?.length ? "contrato" : "lead";
  const primary = parties.find((p) => p.role === "contratante") ?? parties[0] ?? null;

  if (primary) {
    payload.cadastro.razaoSocial = primary.razaoSocial.trim();
    payload.cadastro.documento = primary.documento.trim();
    origin["cadastro.razaoSocial"] = partiesSource;
    origin["cadastro.documento"] = partiesSource;
  } else if (sources.cliente?.razaoSocial) {
    payload.cadastro.razaoSocial = sources.cliente.razaoSocial;
    payload.cadastro.documento = sources.cliente.documento ?? "";
    origin["cadastro.razaoSocial"] = "carteira";
    origin["cadastro.documento"] = "carteira";
  }

  const address = hasAddress(primary?.endereco)
    ? { value: primary.endereco, source: partiesSource }
    : hasAddress(sources.proposalAddress)
      ? { value: sources.proposalAddress, source: "proposta" }
      : hasAddress(sources.cliente?.endereco)
        ? { value: sources.cliente.endereco, source: "carteira" }
        : null;
  if (address) {
    payload.cadastro.endereco = normalizeAddress(address.value);
    origin["cadastro.endereco"] = address.source;
  }

  if (sources.cliente?.email) {
    payload.cadastro.email = sources.cliente.email;
    origin["cadastro.email"] = "carteira";
  }
  if (sources.cliente?.telefone) {
    payload.cadastro.telefone = sources.cliente.telefone;
    origin["cadastro.telefone"] = "carteira";
  }

  const consulta = parties
    .filter((p) => p.razaoSocial.trim() || onlyDigits(p.documento))
    .map((p) => ({ razaoSocial: p.razaoSocial.trim(), documento: p.documento.trim() }));
  if (consulta.length > 0) {
    payload.cadastro.empresasConsulta = consulta;
    origin["cadastro.empresasConsulta"] = partiesSource;
  }

  if (payload.cadastro.razaoSocial) {
    payload.financeiro.faturamento = {
      razaoSocial: payload.cadastro.razaoSocial,
      documento: payload.cadastro.documento,
    };
    origin["financeiro.faturamento"] = origin["cadastro.razaoSocial"] ?? "lead";
  }

  if (sources.startRule?.kind === "on_defined_date" && sources.startRule.date) {
    payload.financeiro.inicioVigencia = sources.startRule.date.slice(0, 10);
    origin["financeiro.inicioVigencia"] = "contrato";
  } else if (sources.signedOn) {
    payload.financeiro.inicioVigencia = sources.signedOn;
    origin["financeiro.inicioVigencia"] = "assinatura";
  }

  if (sources.payment?.firstDueDate) {
    payload.financeiro.primeiroFaturamento = sources.payment.firstDueDate.slice(0, 10);
    origin["financeiro.primeiroFaturamento"] = "contrato";
  }

  if (sources.contatoFinanceiro) {
    payload.financeiro.contatoFinanceiro = {
      nome: sources.contatoFinanceiro.nome,
      posicao: sources.contatoFinanceiro.cargo ?? "",
      email: sources.contatoFinanceiro.email ?? "",
      telefone: sources.contatoFinanceiro.telefone ?? "",
    };
    origin["financeiro.contatoFinanceiro"] = "carteira";
  } else if (sources.focal.name || sources.focal.email) {
    payload.financeiro.contatoFinanceiro = {
      nome: sources.focal.name?.trim() ?? "",
      posicao: "",
      email: sources.focal.email?.trim() ?? "",
      telefone: "",
    };
    // Ponto focal comercial: o responsável confirma se também é o contato financeiro.
    origin["financeiro.contatoFinanceiro"] = "ponto_focal";
  }

  const areas = sources.areaAmounts.filter((a) => a.area.trim());
  if (areas.length === 1) {
    payload.financeiro.rateioPorArea = [{ area: areas[0]!.area, percentual: "100" }];
    origin["financeiro.rateioPorArea"] = "proposta";
  } else if (areas.length > 1) {
    const total = areas.reduce((acc, a) => acc + (a.amount ?? 0), 0);
    payload.financeiro.rateioPorArea = areas.map((a) => ({
      area: a.area,
      percentual: total > 0 && a.amount != null ? formatPercent((a.amount / total) * 100) : "",
    }));
    origin["financeiro.rateioPorArea"] = "proposta";
  }

  payload.sources = origin;
  return payload;
}

/** Junta o rascunho salvo com o pré-preenchimento: o que o usuário já digitou prevalece. */
export function mergeOnboardingDraft(
  saved: ClientOnboardingPayload | null,
  prefill: ClientOnboardingPayload,
): ClientOnboardingPayload {
  if (!saved) return prefill;
  const isEmptyDraft =
    !saved.cadastro.razaoSocial &&
    !saved.cadastro.documento &&
    !saved.financeiro.inicioVigencia &&
    !saved.financeiro.contatoFinanceiro.email;
  return isEmptyDraft ? prefill : saved;
}
