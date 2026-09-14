import { PROPOSTA_PLACEHOLDER_RESUMO_PROCESSO } from "@/data/proposta-tipos-catalog";

/**
 * Rótulos para o CRM (campos do escopo / investimento). Chaves internas permanecem as do modelo Word.
 */
const LABELS: Record<string, string> = {
  // Escopo (catálogo por área)
  "NOME EMPRESA": "Nome da empresa",
  "TIPO DA AÇÃO": "Tipo da ação",
  "NUM. DO PROCESSO": "Número do processo",
  "PARTE_CONTRÁRIA": "Parte contrária",
  "VALOR_CAUSA": "Valor da causa",
  "QTD DE PROCESSOS": "Quantidade de processos",
  CNPJ: "CNPJ da empresa",
  DOCUMENTO: "CPF/CNPJ (documento)",
  EMPRESA: "Razão social (Word: EMPRESA)",
  CIDADE: "Cidade do cliente",
  UF: "UF do cliente",
  CEP: "CEP do cliente",
  NUMERO: "Número do endereço",
  "DATA VIGENCIA": "Data de vigência da proposta",
  "HORAS MES": "Horas por mês",
  HORAS_MES: "Horas por mês",
  [PROPOSTA_PLACEHOLDER_RESUMO_PROCESSO]: "Resumo do processo",

  // Investimento (honorários)
  VALORMENSAL: "Valor mensal",
  VALORMENSALESCALONADO: "Valor mensal (escalonado)",
  CONDICAOESCALONADO: "Condição do escalonamento",
  VALORMENSALVARIAVEL: "Valor mensal (variável)",
  CONDICAOVARIAVEL: "Condição (variável / adicional)",
  VALORHORA: "Valor por hora",
  HORASPREVISTAS: "Horas previstas (mensais)",
  VALORMENSALESTIMADO: "Valor mensal estimado",
  VALORMENSALBASE: "Valor mensal base",
  VALORSPOT: "Valor spot (fechado)",
  PARCELAS: "Número de parcelas",
  VALORPARCELA: "Valor de cada parcela",
  DETALHEPARCELAS: "Detalhe do pagamento (à vista ou parcelas)",
  ITEM: "Item de referência (ex.: item da proposta)",
  VALORMANUTENCAO: "Valor da manutenção (mensal)",
  CONDICAOFINAL: "Condição final / prazo da manutenção",
  PORCENTAGEMHONORARIOS: "Percentual de honorários de êxito",
  BASECALCULO: "Base de cálculo (êxito)",
  VALOREXITO: "Valor fixo de êxito",
  PRAZOPAGAMENTO: "Prazo para pagamento",
};

export type PropostaPlaceholderControl =
  | "text"
  | "textarea"
  | "currency"
  | "integer"
  | "cnpj"
  | "process"
  | "select"
  | "date";

export type PropostaPlaceholderFieldConfig = {
  label: string;
  control: PropostaPlaceholderControl;
  placeholder: string;
  options?: string[];
  wide?: boolean;
  autoFillFromCompany?: boolean;
};

const BRAZIL_STATE_OPTIONS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
];

function normalizePlaceholderKey(key: string): string {
  return key
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("pt-BR")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const FIELD_CONFIGS: Record<string, PropostaPlaceholderFieldConfig> = {
  NOME_EMPRESA: {
    label: "Nome da empresa",
    control: "text",
    placeholder: "Nome da empresa principal",
    autoFillFromCompany: true,
  },
  NOME_EMPRESA_OU_GRUPO: {
    label: "Nome da empresa ou grupo",
    control: "text",
    placeholder: "Ex.: Grupo Empresa",
  },
  NOME_SOCIO_DISSIDENTE: {
    label: "Nome do sócio dissidente",
    control: "text",
    placeholder: "Nome completo do sócio",
  },
  FINALIDADE_ALTERACAO_CONTRATUAL: {
    label: "Finalidade da alteração contratual",
    control: "textarea",
    placeholder: "Descreva a finalidade da alteração contratual",
    wide: true,
  },
  LIMITE_PROCESSOS_ATIVOS: {
    label: "Limite de processos ativos",
    control: "integer",
    placeholder: "Ex.: 10",
  },
  QTD_DE_PROCESSOS: {
    label: "Quantidade de processos",
    control: "integer",
    placeholder: "Ex.: 5",
  },
  QTD_DE_ACOES: {
    label: "Quantidade de ações",
    control: "integer",
    placeholder: "Ex.: 3",
  },
  HORAS_MES: {
    label: "Horas por mês",
    control: "integer",
    placeholder: "Ex.: 12",
    wide: true,
  },
  LIMITE_HORAS: {
    label: "Limite de horas mensais",
    control: "integer",
    placeholder: "Ex.: 20",
  },
  VALOR_DA_HORA_ADICIONAL: {
    label: "Valor da hora adicional",
    control: "currency",
    placeholder: "R$ 0,00",
  },
  VALORHORAEXCEDENTE: {
    label: "Valor da hora excedente",
    control: "currency",
    placeholder: "R$ 0,00",
  },
  VLR_ADCIONAL_DE_PROCESSO: {
    label: "Valor adicional por processo",
    control: "currency",
    placeholder: "R$ 0,00",
  },
  VALOR_CAUSA: {
    label: "Valor da causa",
    control: "currency",
    placeholder: "R$ 0,00",
  },
  TIPO_DA_ACAO: {
    label: "Tipo da ação",
    control: "text",
    placeholder: "Ex.: Ação de cobrança",
  },
  NUM_DO_PROCESSO: {
    label: "Número do processo",
    control: "process",
    placeholder: "0000000-00.0000.0.00.0000",
  },
  NUM_PROCESSO_RJ: {
    label: "Número do processo de recuperação judicial",
    control: "process",
    placeholder: "0000000-00.0000.0.00.0000",
  },
  PARTE_CONTRARIA: {
    label: "Parte contrária",
    control: "text",
    placeholder: "Nome da parte contrária",
  },
  RESUMO_DO_PROCESSO: {
    label: "Resumo do processo",
    control: "textarea",
    placeholder: "Descreva os principais fatos e o contexto do processo",
    wide: true,
  },
  EMPRESA_ALVO: {
    label: "Empresa-alvo",
    control: "text",
    placeholder: "Razão social da empresa-alvo",
  },
  CNPJ_ALVO: {
    label: "CNPJ da empresa-alvo",
    control: "cnpj",
    placeholder: "00.000.000/0000-00",
  },
  CNPJ: {
    label: "CNPJ da empresa",
    control: "cnpj",
    placeholder: "00.000.000/0000-00",
  },
  VARA_RJ: {
    label: "Vara do processo de recuperação judicial",
    control: "text",
    placeholder: "Ex.: 2ª Vara Empresarial",
  },
  PARCEIRO_COMERCIAL: {
    label: "Parceiro comercial",
    control: "text",
    placeholder: "Nome ou razão social do parceiro",
  },
  PARTE_NOTIFICADA: {
    label: "Parte notificada",
    control: "text",
    placeholder: "Nome ou razão social da parte notificada",
  },
  OBJETO_DA_ANALISE: {
    label: "Objeto da análise",
    control: "textarea",
    placeholder: "Descreva o objeto que será analisado",
    wide: true,
  },
  EMPRESA_CONTRAPARTE: {
    label: "Empresa contraparte",
    control: "text",
    placeholder: "Razão social da contraparte",
  },
  PRAZO_ELABORACAO: {
    label: "Prazo de elaboração em dias úteis",
    control: "integer",
    placeholder: "Ex.: 15",
  },
  DATA_VIGENCIA: {
    label: "Data de vigência da proposta",
    control: "date",
    placeholder: "dd/mm/aaaa",
  },
  UF: {
    label: "UF do cliente",
    control: "select",
    placeholder: "Selecione a UF",
    options: BRAZIL_STATE_OPTIONS,
  },
};

function humanizePlaceholderKey(key: string): string {
  const words = key
    .trim()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
  return words ? words.charAt(0).toLocaleUpperCase("pt-BR") + words.slice(1) : "Campo";
}

/** Rótulo amigável para o campo; fallback com espaços nos sublinhados. */
export function getPropostaPlaceholderLabel(phKey: string): string {
  const k = phKey.trim();
  const config = FIELD_CONFIGS[normalizePlaceholderKey(k)];
  if (config) return config.label;
  if (LABELS[k]) return LABELS[k];
  return humanizePlaceholderKey(k);
}

export function getPropostaPlaceholderFieldConfig(
  phKey: string,
): PropostaPlaceholderFieldConfig {
  const normalizedKey = normalizePlaceholderKey(phKey);
  const config = FIELD_CONFIGS[normalizedKey];
  if (config) return config;
  const label = getPropostaPlaceholderLabel(phKey);
  if (normalizedKey.startsWith("VALOR") || normalizedKey.startsWith("VLR_")) {
    return {
      label,
      control: "currency",
      placeholder: "R$ 0,00",
    };
  }
  return {
    label,
    control: "text",
    placeholder: `Digite ${label.toLocaleLowerCase("pt-BR")}`,
  };
}

export type PropostaTemplatePlaceholderOption = {
  key: string;
  label: string;
};

/** Variáveis sugeridas ao montar texto de escopo no catálogo admin. */
export const PROPOSTA_SCOPE_TEMPLATE_PLACEHOLDERS: PropostaTemplatePlaceholderOption[] = [
  { key: "NOME EMPRESA", label: getPropostaPlaceholderLabel("NOME EMPRESA") },
  { key: "EMPRESA", label: getPropostaPlaceholderLabel("EMPRESA") },
  { key: "CNPJ", label: getPropostaPlaceholderLabel("CNPJ") },
  { key: "DOCUMENTO", label: getPropostaPlaceholderLabel("DOCUMENTO") },
  { key: "CIDADE", label: getPropostaPlaceholderLabel("CIDADE") },
  { key: "UF", label: getPropostaPlaceholderLabel("UF") },
  { key: "CEP", label: getPropostaPlaceholderLabel("CEP") },
  { key: "NUMERO", label: getPropostaPlaceholderLabel("NUMERO") },
  { key: "TIPO DA AÇÃO", label: getPropostaPlaceholderLabel("TIPO DA AÇÃO") },
  { key: "NUM. DO PROCESSO", label: getPropostaPlaceholderLabel("NUM. DO PROCESSO") },
  { key: "PARTE_CONTRÁRIA", label: getPropostaPlaceholderLabel("PARTE_CONTRÁRIA") },
  { key: "VALOR_CAUSA", label: getPropostaPlaceholderLabel("VALOR_CAUSA") },
  { key: "QTD DE PROCESSOS", label: getPropostaPlaceholderLabel("QTD DE PROCESSOS") },
  {
    key: PROPOSTA_PLACEHOLDER_RESUMO_PROCESSO,
    label: getPropostaPlaceholderLabel(PROPOSTA_PLACEHOLDER_RESUMO_PROCESSO),
  },
  { key: "DATA VIGENCIA", label: getPropostaPlaceholderLabel("DATA VIGENCIA") },
  { key: "HORAS MES", label: getPropostaPlaceholderLabel("HORAS MES") },
];

/** Variáveis sugeridas em templates de investimento (honorários). */
export const PROPOSTA_INVESTMENT_TEMPLATE_PLACEHOLDERS: PropostaTemplatePlaceholderOption[] = [
  "VALORMENSAL",
  "VALORMENSALESCALONADO",
  "CONDICAOESCALONADO",
  "VALORMENSALVARIAVEL",
  "CONDICAOVARIAVEL",
  "VALORHORA",
  "HORASPREVISTAS",
  "VALORMENSALESTIMADO",
  "VALORMENSALBASE",
  "VALORSPOT",
  "DETALHEPARCELAS",
  "PARCELAS",
  "VALORPARCELA",
  "ITEM",
  "VALORMANUTENCAO",
  "CONDICAOFINAL",
  "PORCENTAGEMHONORARIOS",
  "BASECALCULO",
  "VALOREXITO",
  "PRAZOPAGAMENTO",
].map((key) => ({ key, label: getPropostaPlaceholderLabel(key) }));

export function formatPropostaPlaceholderToken(key: string): string {
  return `[${key.trim()}]`;
}

/** Insere `[chave]` na posição do cursor (ou no fim do texto). */
export function insertPropostaPlaceholderInText(
  text: string,
  key: string,
  selectionStart: number,
  selectionEnd: number,
): { text: string; cursor: number } {
  const token = formatPropostaPlaceholderToken(key);
  const start = Math.max(0, Math.min(selectionStart, text.length));
  const end = Math.max(start, Math.min(selectionEnd, text.length));
  const next = `${text.slice(0, start)}${token}${text.slice(end)}`;
  return { text: next, cursor: start + token.length };
}
