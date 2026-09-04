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
  /**
   * Sub-cláusulas de uma cláusula que agrupa várias (ex.: "Disposições Gerais"
   * com Irrevogabilidade, Foro, Tributos...). Quando presente, os renderizadores
   * numeram cada item como N.1, N.2... usando o N já atribuído à cláusula-pai —
   * nunca um número próprio, para não duplicar a numeração de topo.
   */
  items?: Array<{ title: string; content: string }>;
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
  /**
   * "Objetos Excluídos do Contrato" — cláusula própria de posição fixa (2, logo
   * após o Objeto e antes de Honorários), igual ao padrão
   * `contrato_honorarios_template_1.md`. `null` quando não há motor canônico.
   */
  objetosExcluidos: ClausulaAdicional | null;
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
    objetosExcluidos: null,
    clausulasAdicionais,
  };
}

/**
 * Ids das seções do builder de contrato (`contrato-document-builder.tsx`), na
 * mesma grafia usada como `id` de cada `<div>`/`<FormSection>`. Única fonte de
 * verdade para "qual seção resolve esta pendência" — evita o cliente ter que
 * adivinhar por conteúdo de string (frágil: quebra silenciosamente se o texto
 * do label mudar aqui sem avisar quem faz o matching do outro lado).
 */
export type ContratoBuilderSectionId =
  | "section-partes"
  | "section-escopos"
  | "section-objeto"
  | "section-condicoes"
  | "section-vigencia"
  | "section-clausulas"
  | "section-assinaturas";

export type ContratoPendingField = {
  label: string;
  /** Seção do builder que resolve esta pendência; `null` quando não há uma (caso legado). */
  sectionId: ContratoBuilderSectionId | null;
};

/**
 * Lista campos CC obrigatórios que ainda estão vazios.
 * Inclui validação de pelo menos uma área de atuação selecionada.
 */
export function listContratoPendingFields(
  fieldByCode: Record<string, string>,
  empresa: string,
  engine?: {
    scopes: Array<{ label: string; missingProfile: boolean }>;
    contractObject?: {
      missingScopeIds: string[];
      missingRequiredFields: string[];
      fieldValues: Array<{ key: string; label: string; value: string; required: boolean }>;
    };
  } | null,
): ContratoPendingField[] {
  const pending: ContratoPendingField[] = [];
  const push = (label: string, sectionId: ContratoBuilderSectionId | null) =>
    pending.push({ label, sectionId });

  if (!empresa.trim()) push("Empresa (dados da proposta)", "section-partes");

  const hasEngineObject = Boolean(engine?.contractObject);
  // Com o motor canônico ativo, "Tipo de Instrumento" e "Objeto do Contrato" (campos
  // legados) não têm mais input no builder (seção "Avançado/legado" removida) — o
  // objeto real vem do perfil contratual. Não checar como obrigatório nesse modo,
  // senão vira uma pendência permanente sem forma de resolver pela UI.
  const always: Array<[string, string, ContratoBuilderSectionId | null]> = hasEngineObject
    ? [["cc_tipo_pagamento", "Tipo de pagamento", "section-condicoes"]]
    : [
        ["cc_tipo_instrumento", "Tipo de Instrumento", null],
        ["cc_objeto", "Objeto do Contrato", null],
        ["cc_tipo_pagamento", "Tipo de pagamento", "section-condicoes"],
      ];

  for (const [code, label, sectionId] of always) {
    if (!String(fieldByCode[code] ?? "").trim()) push(label, sectionId);
  }

  if (engine?.contractObject) {
    if (engine.scopes.some((s) => s.missingProfile) || engine.contractObject.missingScopeIds.length > 0) {
      push("Objeto do Contrato incompleto — há escopo sem redação contratual", "section-objeto");
    }
    for (const field of engine.contractObject.fieldValues) {
      if (field.required && !field.value.trim()) {
        push(`${field.label} *`, "section-objeto");
      }
    }
  }

  const tipoPagamento = String(fieldByCode["cc_tipo_pagamento"] ?? "").trim();

  // cc_valores é obrigatório para qualquer pagamento exceto Êxito puro
  if (tipoPagamento && tipoPagamento !== "Êxito") {
    if (!String(fieldByCode["cc_valores"] ?? "").trim()) {
      push("Valores e vencimento", "section-condicoes");
    }
  }

  // Pelo menos uma área de atuação deve ser selecionada
  const areaToggles = [
    "cc_incluir_trabalhista",
    "cc_incluir_civel",
    "cc_incluir_contratual",
    "cc_incluir_tributario",
  ];
  const hasArea = areaToggles.some(
    (code) => String(fieldByCode[code] ?? "").trim() === "Sim",
  );
  if (!hasArea && !hasEngineObject) push("Áreas de atuação (selecione ao menos uma)", null);
  if (!hasArea && hasEngineObject && (engine?.scopes.length ?? 0) === 0) {
    push("Escopos contratados (nenhum escopo herdado da proposta)", "section-escopos");
  }

  // Dois escopos diferentes (ex.: Trabalhista + Cível) podem pedir um campo com
  // o mesmo rótulo (ex.: "Vara / Tribunal *", cada um com sua própria chave) —
  // sem isso, essa lista compacta repetia o mesmo texto e quebrava a key React
  // de quem a renderiza. A visão detalhada (com a área de cada campo) já fica
  // na seção Objeto do Contrato.
  const seen = new Set<string>();
  return pending.filter((p) => {
    if (seen.has(p.label)) return false;
    seen.add(p.label);
    return true;
  });
}
