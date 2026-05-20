import type { LeadIntakeEmpresaRow } from "@/app/(crm)/crm/leads/[id]/lead-intake-types";
import { format } from "date-fns";
import { resolvePropostaEmpresaPrincipal } from "@/lib/crm/proposta-empresa-principal";

function formatCepBr(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export type ContratoDocxTemplateInput = {
  empresasIntake: LeadIntakeEmpresaRow[];
  /** Valor de `cp_proposta_empresas_json` para resolver empresa principal */
  cpPropostaEmpresasJson: string | undefined;
  /** Todos os field_code → valor (string) do lead — inclui cp_* e cc_* */
  fieldByCode: Record<string, string>;
  /** Momento de geração (para [DATA_ASSINATURA]) */
  generatedAt: Date;
};

export type ClausulaAdicional = {
  title: string;
  content: string;
};

/** Seção de área de atuação renderizada no contrato */
export type AreaSection = {
  key: string;
  label: string;
  /** Linhas de detalhe (limite de ações, horas, percentual…) */
  details: Array<{ label: string; value: string }>;
};

export type ContratoDocumentPagePreview = {
  qualificacao: string;
  objeto: string;
  valores: string;
  investimento: string;
  dataAssinatura: string;
  limiteProcessos: string;
  limiteHoras: string;
  exitoAreas: string;
  tipoPagamento: string;
  /** @deprecated Substituído por prazoRevisao */
  prazoConfeccao: string;
  prazoRevisao: string;
  /** Áreas de atuação selecionadas (toggles ativos) */
  areas: AreaSection[];
  /** Cláusulas adicionais escolhidas/editadas no builder (podem ser 0). */
  clausulasAdicionais: ClausulaAdicional[];
};

/**
 * Objeto de substituição para docxtemplater com delimitadores `[` e `]`.
 * Herda dados da empresa da etapa de proposta (cp_*) e combina com campos CC (cc_*).
 */
export function buildContratoDocxTemplateData(
  input: ContratoDocxTemplateInput,
): Record<string, string> {
  const { empresasIntake, cpPropostaEmpresasJson, fieldByCode, generatedAt } = input;

  const f = (code: string) => String(fieldByCode[code] ?? "").trim();

  const empresa = resolvePropostaEmpresaPrincipal({
    empresasIntake,
    cpPropostaEmpresasJson,
  });

  return {
    // ── Empresa (herdado da proposta) ──────────────────────────────────────
    EMPRESA: empresa.razaoSocial ?? "",
    DOCUMENTO: empresa.documentoFormatado ?? "",
    LOGRADOURO: f("cp_cliente_logradouro"),
    NUMERO: f("cp_cliente_numero"),
    BAIRRO: f("cp_cliente_bairro"),
    CIDADE: f("cp_cliente_cidade"),
    UF: f("cp_cliente_uf"),
    CEP: formatCepBr(f("cp_cliente_cep")),

    // ── Investimento (herdado do escopo da proposta, se disponível) ────────
    INVESTIMENTO: f("cp_investimento_resumo"),

    // ── Campos específicos do contrato (cc_*) ──────────────────────────────
    TIPO_INSTRUMENTO: f("cc_tipo_instrumento"),
    OBJETO_CONTRATO: f("cc_objeto"),
    LIMITE_PROCESSOS: f("cc_limite_processos"),
    LIMITE_HORAS: f("cc_limite_horas"),
    EXITO_AREAS: f("cc_exito_areas"),
    VALORES: f("cc_valores"),
    TIPO_PAGAMENTO: f("cc_tipo_pagamento"),
    PRAZO_CONFECCAO: f("cc_prazo_confeccao"),
    PRAZO_REVISAO: f("cc_prazo_revisao"),

    // ── Campos de área ─────────────────────────────────────────────────────
    INCLUIR_TRABALHISTA: f("cc_incluir_trabalhista"),
    TRABALHISTA_LIMITE_ACOES: f("cc_trabalhista_limite_acoes"),
    TRABALHISTA_HORAS_CONSULTIVAS: f("cc_trabalhista_horas_consultivas"),
    INCLUIR_CIVEL: f("cc_incluir_civel"),
    CIVEL_LIMITE_PROCESSOS: f("cc_civel_limite_processos"),
    CIVEL_HORAS_CONSULTIVAS: f("cc_civel_horas_consultivas"),
    INCLUIR_CONTRATUAL: f("cc_incluir_contratual"),
    CONTRATUAL_HORAS_MENSAIS: f("cc_contratual_horas_mensais"),
    INCLUIR_TRIBUTARIO: f("cc_incluir_tributario"),
    TRIBUTARIO_LIMITE_ACOES: f("cc_tributario_limite_acoes"),
    INCLUIR_EXITO: f("cc_incluir_exito"),
    EXITO_PERCENTUAL: f("cc_exito_percentual"),

    // ── Data gerada ────────────────────────────────────────────────────────
    DATA_ASSINATURA: format(generatedAt, "dd/MM/yyyy"),

    // ── Página (estático, como na proposta) ────────────────────────────────
    P: "1",
    F: "1",
  };
}

/** Resolve quais áreas estão ativas e monta as AreaSection[] */
function buildAreaSections(data: Record<string, string>): AreaSection[] {
  const g = (k: string) => String(data[k] ?? "").trim();
  const sections: AreaSection[] = [];

  if (g("INCLUIR_TRABALHISTA") === "Sim") {
    const details: AreaSection["details"] = [];
    if (g("TRABALHISTA_LIMITE_ACOES")) details.push({ label: "Limite de ações", value: g("TRABALHISTA_LIMITE_ACOES") });
    if (g("TRABALHISTA_HORAS_CONSULTIVAS")) details.push({ label: "Horas consultivas mensais", value: g("TRABALHISTA_HORAS_CONSULTIVAS") });
    sections.push({ key: "trabalhista", label: "Assessoria Jurídica Trabalhista", details });
  }

  if (g("INCLUIR_CIVEL") === "Sim") {
    const details: AreaSection["details"] = [];
    if (g("CIVEL_LIMITE_PROCESSOS")) details.push({ label: "Limite de processos", value: g("CIVEL_LIMITE_PROCESSOS") });
    if (g("CIVEL_HORAS_CONSULTIVAS")) details.push({ label: "Horas consultivas complementares", value: g("CIVEL_HORAS_CONSULTIVAS") });
    sections.push({ key: "civel", label: "Assessoria Jurídica Cível", details });
  }

  if (g("INCLUIR_CONTRATUAL") === "Sim") {
    const details: AreaSection["details"] = [];
    if (g("CONTRATUAL_HORAS_MENSAIS")) details.push({ label: "Horas técnicas mensais", value: g("CONTRATUAL_HORAS_MENSAIS") });
    sections.push({ key: "contratual", label: "Assessoria Jurídica Contratual e Societária", details });
  }

  if (g("INCLUIR_TRIBUTARIO") === "Sim") {
    const details: AreaSection["details"] = [];
    if (g("TRIBUTARIO_LIMITE_ACOES")) details.push({ label: "Limite de execuções fiscais", value: g("TRIBUTARIO_LIMITE_ACOES") });
    sections.push({ key: "tributario", label: "Assessoria Jurídica Tributária", details });
  }

  if (g("INCLUIR_EXITO") === "Sim") {
    const details: AreaSection["details"] = [];
    if (g("EXITO_PERCENTUAL")) details.push({ label: "Percentual sobre proveito econômico", value: g("EXITO_PERCENTUAL") });
    // Also carry old cc_exito_areas if present
    if (g("EXITO_AREAS")) details.push({ label: "Detalhamento", value: g("EXITO_AREAS") });
    sections.push({ key: "exito", label: "Honorários de Êxito", details });
  }

  return sections;
}

/**
 * Converte o dicionário de template em seções legíveis para o preview HTML e geração DOCX.
 * @param data        Dicionário de variáveis (resultado de buildContratoDocxTemplateData)
 * @param clausulasAdicionais  Cláusulas extra selecionadas/editadas no builder (default: [])
 */
export function buildContratoDocumentPagePreview(
  data: Record<string, string>,
  clausulasAdicionais: ClausulaAdicional[] = [],
): ContratoDocumentPagePreview {
  const g = (k: string) => String(data[k] ?? "").trim();
  const ELLIPSIS = "…";

  const empresa = g("EMPRESA") || ELLIPSIS;
  const documento = g("DOCUMENTO") || ELLIPSIS;
  const logradouro = g("LOGRADOURO") || ELLIPSIS;
  const numero = g("NUMERO") || ELLIPSIS;
  const bairro = g("BAIRRO") || ELLIPSIS;
  const cidade = g("CIDADE") || ELLIPSIS;
  const uf = g("UF") || ELLIPSIS;
  const cep = g("CEP") || ELLIPSIS;

  return {
    qualificacao: `${empresa}, pessoa jurídica de direito privado, inscrita no CNPJ nº ${documento}, com sede na ${logradouro}, nº ${numero}, ${bairro}, ${cidade}/${uf}, CEP ${cep}.`,
    objeto: g("OBJETO_CONTRATO") || ELLIPSIS,
    valores: g("VALORES") || ELLIPSIS,
    investimento: g("INVESTIMENTO"),
    dataAssinatura: g("DATA_ASSINATURA") || ELLIPSIS,
    limiteProcessos: g("LIMITE_PROCESSOS"),
    limiteHoras: g("LIMITE_HORAS"),
    exitoAreas: g("EXITO_AREAS"),
    tipoPagamento: g("TIPO_PAGAMENTO"),
    prazoConfeccao: g("PRAZO_CONFECCAO"),
    prazoRevisao: g("PRAZO_REVISAO"),
    areas: buildAreaSections(data),
    clausulasAdicionais,
  };
}

/**
 * Lista campos CC obrigatórios que ainda estão vazios.
 * Inclui validação de pelo menos uma área de atuação selecionada.
 */
export function listContratoPendingFields(
  fieldByCode: Record<string, string>,
  empresa: string,
): string[] {
  const pending: string[] = [];

  if (!empresa.trim()) pending.push("Empresa (dados da proposta)");

  const always: Array<[string, string]> = [
    ["cc_tipo_instrumento", "Tipo de Instrumento"],
    ["cc_objeto", "Objeto do Contrato"],
    ["cc_tipo_pagamento", "Tipo de pagamento"],
  ];

  for (const [code, label] of always) {
    if (!String(fieldByCode[code] ?? "").trim()) pending.push(label);
  }

  const tipoPagamento = String(fieldByCode["cc_tipo_pagamento"] ?? "").trim();

  // cc_valores é obrigatório para qualquer pagamento exceto Êxito puro
  if (tipoPagamento && tipoPagamento !== "Êxito") {
    if (!String(fieldByCode["cc_valores"] ?? "").trim()) {
      pending.push("Valores e vencimento");
    }
  }

  // Pelo menos uma área de atuação deve ser selecionada
  const areaToggles = [
    "cc_incluir_trabalhista",
    "cc_incluir_civel",
    "cc_incluir_contratual",
    "cc_incluir_tributario",
    "cc_incluir_exito",
  ];
  const hasArea = areaToggles.some(
    (code) => String(fieldByCode[code] ?? "").trim() === "Sim",
  );
  if (!hasArea) pending.push("Áreas de atuação (selecione ao menos uma)");

  return pending;
}
