import type {
  ContractAdjustment,
  ContractingParty,
  ContractingPartyAddress,
  ContractPayment,
  ContractStartRule,
} from "@/lib/crm/contract-engine/types";
import { parseDueDateText } from "@/lib/crm/due-date-text";
import { formatNumberPtBr2 } from "@/lib/crm/proposta-valor-brl-extenso";
import {
  emptyClientOnboardingPayload,
  onlyDigits,
  partyTipo,
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
  /** Subtipos de honorário do contrato montado (`spot_condicionado`, `exito_percentual`…). */
  investmentSubtypes?: string[];
  /** Reajuste escolhido na etapa de contrato (03/11/2026). */
  adjustment?: Pick<ContractAdjustment, "index" | "periodMonths"> | null;
  /** Soma dos honorários do contrato montado; base do rateio quando a proposta não traz valor por área. */
  investmentTotal?: number | null;
  /** "Data do primeiro vencimento" pedida na proposta (`cp_primeiro_vencimento`, AAAA-MM-DD). */
  proposalFirstDueDate?: string | null;
  /** Quando a venda foi fechada (assinatura), AAAA-MM-DD. */
  signedOn: string | null;
  /** Áreas da proposta com o valor de cada uma (para o rateio). */
  areaAmounts: { area: string; amount: number | null }[];
  /** Ponto focal pedido na passagem para a proposta (`cp_nome_focal`, `cp_email_focal`, `cp_tel_focal`). */
  focal: { name: string | null; email: string | null; phone: string | null };
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

const EXITO_SUBTYPES = new Set(["exito_percentual", "exito_valor_fixo"]);

/** Condição do 1º faturamento como ficou no contrato; null quando há data ou nada a dizer. */
function firstBillingCondition(firstDueText: string, subtypes: string[]): string | null {
  if (subtypes.length > 0 && subtypes.every((s) => EXITO_SUBTYPES.has(s))) {
    return "Honorários só de êxito: o primeiro faturamento ocorre no êxito.";
  }
  if (subtypes.includes("spot_condicionado") && !firstDueText) {
    return "Honorários condicionados: o primeiro faturamento ocorre mediante solicitação formal da Cliente.";
  }
  // Vencimento escrito como evento ("após a entrega do parecer"). Data em aberto ("a combinar") ou
  // "na assinatura" sem data conhecida não é condição: o responsável informa a data.
  if (CONDITION_TEXT.test(firstDueText) && !/assinatura/i.test(firstDueText)) return firstDueText;
  return null;
}

const CONDITION_TEXT = /\b(após|apos|mediante|quando|depois|entrega|êxito|exito|conclus|protocol|solicita|homologa|deferimento|tr[aâ]nsito)/i;

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

  // Sem e-mail/telefone na carteira, vale o ponto focal da proposta (o responsável confirma).
  const focalEmail = sources.focal.email?.trim() ?? "";
  const focalPhone = sources.focal.phone?.trim() ?? "";
  if (sources.cliente?.email) {
    payload.cadastro.email = sources.cliente.email;
    origin["cadastro.email"] = "carteira";
  } else if (focalEmail) {
    payload.cadastro.email = focalEmail;
    origin["cadastro.email"] = "ponto_focal";
  }
  if (sources.cliente?.telefone) {
    payload.cadastro.telefone = sources.cliente.telefone;
    origin["cadastro.telefone"] = "carteira";
  } else if (focalPhone) {
    payload.cadastro.telefone = focalPhone;
    origin["cadastro.telefone"] = "ponto_focal";
  }

  const consulta = parties
    .filter((p) => p.razaoSocial.trim() || onlyDigits(p.documento))
    .map((p) => ({
      tipo: partyTipo({ documento: p.documento }),
      razaoSocial: p.razaoSocial.trim(),
      documento: p.documento.trim(),
    }));
  if (consulta.length > 0) {
    payload.cadastro.empresasConsulta = consulta;
    origin["cadastro.empresasConsulta"] = partiesSource;
  }

  if (payload.cadastro.razaoSocial) {
    payload.financeiro.faturamento = {
      tipo: partyTipo({ documento: payload.cadastro.documento }),
      razaoSocial: payload.cadastro.razaoSocial,
      documento: payload.cadastro.documento,
    };
    origin["financeiro.faturamento"] = origin["cadastro.razaoSocial"] ?? "lead";
  }

  // O vencimento do contrato é texto livre ("na data de assinatura do Contrato"): vira data
  // quando dá para ler uma; honorário condicionado, só êxito ou vencimento sem data viram a
  // condição do 1º faturamento, como foi feito o contrato (29/10/2026).
  const firstDueText = sources.payment?.firstDueDate?.trim() ?? "";
  const firstDue = parseDueDateText(firstDueText, { signedOn: sources.signedOn });
  const condicao = firstDue ? null : firstBillingCondition(firstDueText, sources.investmentSubtypes ?? []);
  const proposalFirstDue = sources.proposalFirstDueDate?.trim() ?? "";
  if (firstDue) {
    payload.financeiro.primeiroFaturamento = firstDue.date;
    origin["financeiro.primeiroFaturamento"] = firstDue.basis === "assinatura" ? "assinatura" : "contrato";
  } else if (condicao) {
    payload.financeiro.primeiroFaturamentoCondicionado = true;
    payload.financeiro.condicaoPrimeiroFaturamento = condicao;
    origin["financeiro.primeiroFaturamento"] = "contrato";
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(proposalFirstDue)) {
    payload.financeiro.primeiroFaturamento = proposalFirstDue;
    origin["financeiro.primeiroFaturamento"] = "proposta";
  }

  // Início da vigência pela regra do contrato: data definida, assinatura ou 1º pagamento.
  const startRule = sources.startRule;
  if (startRule?.kind === "on_defined_date" && startRule.date) {
    payload.financeiro.inicioVigencia = startRule.date.slice(0, 10);
    origin["financeiro.inicioVigencia"] = "contrato";
  } else if (startRule?.kind === "on_first_payment") {
    // Começa no 1º pagamento: sem data dele (condicionado), o responsável informa.
    if (payload.financeiro.primeiroFaturamento) {
      payload.financeiro.inicioVigencia = payload.financeiro.primeiroFaturamento;
      origin["financeiro.inicioVigencia"] = "contrato";
    }
  } else if (sources.signedOn) {
    payload.financeiro.inicioVigencia = sources.signedOn;
    origin["financeiro.inicioVigencia"] = "assinatura";
  }

  if (sources.adjustment) {
    payload.financeiro.reajuste = {
      indice: sources.adjustment.index,
      periodicidadeMeses: sources.adjustment.periodMonths ? String(sources.adjustment.periodMonths) : "",
    };
    origin["financeiro.reajuste"] = "contrato";
  }

  if (sources.contatoFinanceiro) {
    payload.financeiro.contatoFinanceiro = {
      nome: sources.contatoFinanceiro.nome,
      posicao: sources.contatoFinanceiro.cargo ?? "",
      email: sources.contatoFinanceiro.email ?? "",
      telefone: sources.contatoFinanceiro.telefone ?? "",
    };
    origin["financeiro.contatoFinanceiro"] = "carteira";
  } else if (sources.focal.name || focalEmail) {
    payload.financeiro.contatoFinanceiro = {
      nome: sources.focal.name?.trim() ?? "",
      posicao: "",
      email: focalEmail,
      telefone: focalPhone,
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
  // Soma do investimento das áreas da proposta (ou, com honorário consolidado, o total do
  // contrato): base para o R$ de cada área do rateio.
  const valorProposta = areas.reduce((acc, a) => acc + (a.amount ?? 0), 0) || (sources.investmentTotal ?? 0);
  if (valorProposta > 0) {
    payload.financeiro.valorRateio = `R$ ${formatNumberPtBr2(valorProposta)}`;
    origin["financeiro.valorRateio"] = "proposta";
  }

  payload.sources = origin;
  return payload;
}

/**
 * Faturamento do rascunho com os vazios completados pelo que o lead já tem: o cadastro é
 * salvo antes (Aguardando Cadastro) e os dados do faturamento só são pedidos depois, então o
 * responsável revê o que já foi informado em vez de digitar de novo.
 */
function fillEmptyFinanceiro(
  saved: ClientOnboardingPayload,
  prefill: ClientOnboardingPayload,
): ClientOnboardingPayload {
  const out = structuredClone(saved);
  const f = out.financeiro;
  const p = prefill.financeiro;
  const sources = { ...out.sources };
  const take = (key: string, apply: () => void) => {
    apply();
    if (prefill.sources[key]) sources[key] = prefill.sources[key];
  };
  if (!f.faturamento.razaoSocial && !f.faturamento.documento && (p.faturamento.razaoSocial || p.faturamento.documento)) {
    take("financeiro.faturamento", () => void (f.faturamento = { ...p.faturamento }));
  }
  if (!f.inicioVigencia && p.inicioVigencia) take("financeiro.inicioVigencia", () => void (f.inicioVigencia = p.inicioVigencia));
  if (!f.primeiroFaturamento && !f.primeiroFaturamentoCondicionado && p.primeiroFaturamento) {
    take("financeiro.primeiroFaturamento", () => void (f.primeiroFaturamento = p.primeiroFaturamento));
  } else if (!f.primeiroFaturamento && !f.primeiroFaturamentoCondicionado && p.primeiroFaturamentoCondicionado) {
    take("financeiro.primeiroFaturamento", () => {
      f.primeiroFaturamentoCondicionado = true;
      f.condicaoPrimeiroFaturamento = p.condicaoPrimeiroFaturamento;
    });
  }
  const contato = f.contatoFinanceiro;
  if (!contato.nome && !contato.email && !contato.telefone && (p.contatoFinanceiro.nome || p.contatoFinanceiro.email)) {
    take("financeiro.contatoFinanceiro", () => void (f.contatoFinanceiro = { ...p.contatoFinanceiro }));
  }
  if (f.rateioPorArea.length === 0 && p.rateioPorArea.length > 0) {
    take("financeiro.rateioPorArea", () => void (f.rateioPorArea = p.rateioPorArea.map((r) => ({ ...r }))));
  }
  if (!f.valorRateio && p.valorRateio) take("financeiro.valorRateio", () => void (f.valorRateio = p.valorRateio));
  if (!f.reajuste.indice && p.reajuste.indice) take("financeiro.reajuste", () => void (f.reajuste = { ...p.reajuste }));
  out.sources = sources;
  return out;
}

/**
 * Junta o rascunho salvo com o pré-preenchimento: o que o usuário já digitou prevalece; no
 * faturamento, o que ficou vazio recebe o que o lead já tem.
 */
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
  return isEmptyDraft ? prefill : fillEmptyFinanceiro(saved, prefill);
}
