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
