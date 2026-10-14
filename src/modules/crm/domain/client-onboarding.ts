import { z } from "zod";

/**
 * Cadastro do novo cliente no pós-venda (`lead_client_onboarding.payload`).
 * - cadastro: dados que Operações Legais confere e lança no VIOS e nos sistemas legados.
 * - financeiro: dados que o Financeiro usa para incluir o contrato no gerenciamento de
 *   contratos (vigência, primeiro faturamento, contato, reajuste, rateio).
 * O schema aceita rascunho (campos vazios); `listMissingOnboardingFields` diz o que falta
 * para enviar a Operações Legais.
 */
export const CLIENT_ONBOARDING_SCHEMA_VERSION = 1;

export const ONBOARDING_STATUSES = ["rascunho", "enviado", "devolvido", "concluido"] as const;
export type ClientOnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export const REAJUSTE_INDICES = ["IPCA", "IGP-M", "INPC", "Sem reajuste", "Outro"] as const;

const text = (max = 500) => z.string().trim().max(max).catch("").default("");

const addressSchema = z
  .object({
    cep: text(9),
    logradouro: text(200),
    numero: text(30),
    complemento: text(120),
    bairro: text(120),
    cidade: text(120),
    uf: text(2),
  })
  .default({ cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "" });

const partySchema = z.object({ razaoSocial: text(250), documento: text(20) });

export const clientOnboardingPayloadSchema = z.object({
  cadastro: z
    .object({
      razaoSocial: text(250),
      documento: text(20),
      endereco: addressSchema,
      email: text(200),
      telefone: text(40),
      socios: z
        .array(z.object({ nome: text(200), posicao: text(120), cpf: text(20) }))
        .max(30)
        .default([]),
      empresasConsulta: z.array(partySchema).max(50).default([]),
      informacoesAdicionais: text(4000),
    })
    .default({
      razaoSocial: "",
      documento: "",
      endereco: { cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "" },
      email: "",
      telefone: "",
      socios: [],
      empresasConsulta: [],
      informacoesAdicionais: "",
    }),
  financeiro: z
    .object({
      faturamento: partySchema.default({ razaoSocial: "", documento: "" }),
      /** AAAA-MM-DD */
      inicioVigencia: text(10),
      primeiroFaturamento: text(10),
      primeiroFaturamentoCondicionado: z.boolean().catch(false).default(false),
      condicaoPrimeiroFaturamento: text(500),
      contatoFinanceiro: z
        .object({ nome: text(200), posicao: text(120), email: text(200), telefone: text(40) })
        .default({ nome: "", posicao: "", email: "", telefone: "" }),
      /** Percentual de repasse acordado (0–100), vazio = sem repasse. */
      repassePercentual: text(10),
      rateioPorArea: z
        .array(z.object({ area: text(120), percentual: text(10) }))
        .max(20)
        .default([]),
      reajuste: z
        .object({ indice: text(40), periodicidadeMeses: text(4) })
        .default({ indice: "", periodicidadeMeses: "" }),
      observacoes: text(4000),
    })
    .default({
      faturamento: { razaoSocial: "", documento: "" },
      inicioVigencia: "",
      primeiroFaturamento: "",
      primeiroFaturamentoCondicionado: false,
      condicaoPrimeiroFaturamento: "",
      contatoFinanceiro: { nome: "", posicao: "", email: "", telefone: "" },
      repassePercentual: "",
      rateioPorArea: [],
      reajuste: { indice: "", periodicidadeMeses: "" },
      observacoes: "",
    }),
  /** Origem de cada campo pré-preenchido (caminho → origem), para a tela mostrar. */
  sources: z.record(z.string(), z.string()).catch({}).default({}),
});

export type ClientOnboardingPayload = z.infer<typeof clientOnboardingPayloadSchema>;

export function parseClientOnboardingPayload(raw: unknown): ClientOnboardingPayload {
  const parsed = clientOnboardingPayloadSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : clientOnboardingPayloadSchema.parse({});
}

export function emptyClientOnboardingPayload(): ClientOnboardingPayload {
  return clientOnboardingPayloadSchema.parse({});
}

export const opsChecklistSchema = z.object({
  dadosConferidos: z.boolean().catch(false).default(false),
  viosCadastrado: z.boolean().catch(false).default(false),
  viosReferencia: text(120),
  sistemasLegadosAtualizados: z.boolean().catch(false).default(false),
  observacoes: text(4000),
  grupoNome: text(200),
});

export type OpsChecklist = z.infer<typeof opsChecklistSchema>;

export function parseOpsChecklist(raw: unknown): OpsChecklist {
  const parsed = opsChecklistSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : opsChecklistSchema.parse({});
}

/** O que falta para Operações Legais concluir (cadastro no VIOS, legados e nome do grupo). */
export function listMissingChecklistItems(checklist: OpsChecklist): string[] {
  const missing: string[] = [];
  if (!checklist.dadosConferidos) missing.push("Dados conferidos");
  if (!checklist.viosCadastrado) missing.push("Cadastro no VIOS");
  if (!checklist.viosReferencia) missing.push("Código do cliente no VIOS");
  if (!checklist.sistemasLegadosAtualizados) missing.push("Sistemas legados atualizados");
  if (!checklist.grupoNome) missing.push("Nome do grupo econômico");
  return missing;
}

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidDocument(value: string): boolean {
  const digits = onlyDigits(value);
  return digits.length === 11 || digits.length === 14;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Rótulos dos campos obrigatórios que faltam para enviar a Operações Legais. */
export function listMissingOnboardingFields(payload: ClientOnboardingPayload): string[] {
  const missing: string[] = [];
  const { cadastro, financeiro } = payload;

  if (!cadastro.razaoSocial) missing.push("Razão social do cliente");
  if (!isValidDocument(cadastro.documento)) missing.push("CPF/CNPJ do cliente");
  if (onlyDigits(cadastro.endereco.cep).length !== 8) missing.push("CEP");
  if (!cadastro.endereco.logradouro) missing.push("Logradouro");
  if (!cadastro.endereco.numero) missing.push("Número");
  if (!cadastro.endereco.cidade) missing.push("Cidade");
  if (cadastro.endereco.uf.length !== 2) missing.push("UF");
  if (cadastro.email && !EMAIL.test(cadastro.email)) missing.push("E-mail do cliente (inválido)");
  for (const [i, socio] of cadastro.socios.entries()) {
    if (!socio.nome) missing.push(`Nome do sócio ${i + 1}`);
  }

  if (!financeiro.faturamento.razaoSocial) missing.push("Razão social para faturamento");
  if (!isValidDocument(financeiro.faturamento.documento)) missing.push("CPF/CNPJ para faturamento");
  if (!ISO_DATE.test(financeiro.inicioVigencia)) missing.push("Início da vigência");
  if (!financeiro.primeiroFaturamentoCondicionado && !ISO_DATE.test(financeiro.primeiroFaturamento)) {
    missing.push("Primeiro faturamento");
  }
  if (financeiro.primeiroFaturamentoCondicionado && !financeiro.condicaoPrimeiroFaturamento) {
    missing.push("Condição do primeiro faturamento");
  }
  if (!financeiro.contatoFinanceiro.nome) missing.push("Nome do contato financeiro");
  if (!EMAIL.test(financeiro.contatoFinanceiro.email)) missing.push("E-mail do contato financeiro");
  if (!financeiro.reajuste.indice) missing.push("Índice de reajuste");

  const rateio = financeiro.rateioPorArea.filter((r) => r.area);
  if (rateio.length > 0) {
    const total = rateio.reduce((acc, r) => acc + (Number(r.percentual.replace(",", ".")) || 0), 0);
    if (Math.abs(total - 100) > 0.01) missing.push("Rateio por área somando 100%");
  }
  if (financeiro.repassePercentual) {
    const repasse = Number(financeiro.repassePercentual.replace(",", "."));
    if (!Number.isFinite(repasse) || repasse < 0 || repasse > 100) missing.push("Repasse (0 a 100%)");
  }

  return missing;
}
