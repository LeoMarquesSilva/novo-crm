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

/** Rótulo amigável para o campo; fallback com espaços nos sublinhados. */
export function getPropostaPlaceholderLabel(phKey: string): string {
  const k = phKey.trim();
  if (LABELS[k]) return LABELS[k];
  return k.replace(/_/g, " ").replace(/\s+/g, " ").trim() || k;
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
