import { CRM_PRACTICE_AREAS } from "@/lib/crm/crm-areas";
import { ADJUSTMENT_INDEX_OPTIONS } from "@/components/crm/contracts/contract-setup-form-helpers";

export function buildContractImportSystemPrompt(): string {
  return [
    "Você extrai dados de um contrato de honorários advocatícios já assinado da Bismarchi | Pires.",
    "Responda apenas no schema JSON pedido. Datas em YYYY-MM-DD. Dinheiro em centavos (R$ 20.000,00 = 2000000).",
    "Percentuais em basis points (3% = 300, 5% = 500).",
    `Áreas permitidas: ${CRM_PRACTICE_AREAS.join(", ")}.`,
    `Índices de reajuste: ${ADJUSTMENT_INDEX_OPTIONS.join(", ")}.`,
    "Se o contrato for por prazo indeterminado, indefinite=true e effectiveTo dos componentes recorrentes nulo.",
    "Se o início depende do primeiro pagamento, firstInvoiceConditioned=true.",
    "Honorários 'englobando tributos' → taxMode=included. Honorários 'líquidos' → taxMode=added.",
    "Mensalidade que muda após N meses → dois componentes mensal_escalonado com períodos consecutivos.",
    "Preço fechado em N parcelas iguais → mensal_preco_fechado + installmentCount + installmentAmountCents + firstDueDate.",
    "Êxito percentual → exito_percentual, requiresManualRelease=true. Faixas (5% se deságio ≥ 95%) vão em extras.exitoBands.",
    "Não invente rateio, comissão, sócio ou responsável interno.",
  ].join(" ");
}

export function buildContractImportUserPrompt(filename: string, text: string): string {
  return `Arquivo: ${filename}\n\nTexto do contrato:\n\n${text}`;
}
