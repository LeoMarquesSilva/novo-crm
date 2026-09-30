import { CRM_PRACTICE_AREAS } from "@/lib/crm/crm-areas";
import { ADJUSTMENT_INDEX_OPTIONS } from "@/components/crm/contracts/contract-setup-form-helpers";

export function buildContractImportSystemPrompt(): string {
  return [
    "Você extrai dados de um contrato de honorários advocatícios já assinado da Bismarchi | Pires.",
    "Responda apenas no schema JSON pedido. Datas em YYYY-MM-DD. Dinheiro em centavos (R$ 20.000,00 = 2000000).",
    "Percentuais em basis points (3% = 300, 5% = 500).",
    `Áreas permitidas: ${CRM_PRACTICE_AREAS.join(", ")}.`,
    `Índices de reajuste: ${ADJUSTMENT_INDEX_OPTIONS.join(", ")}.`,
    "O texto do usuário já é um recorte. Não transcreva o contrato. extras.objectText no máximo uma frase.",
    "evidence: até 16 itens. field em groupName, startsAt, indefinite, dueDay, firstInvoiceAt, firstInvoiceConditioned, adjustmentIndex, taxMode, areas, components.",
    "quote: copie no máximo 160 caracteres do recorte enviado. clause: número da cláusula se aparecer, senão null. Não invente trecho.",
    "Se o contrato for por prazo indeterminado, indefinite=true e effectiveTo dos componentes recorrentes nulo.",
    "Se o início depende do primeiro pagamento, firstInvoiceConditioned=true.",
    "Honorários 'englobando tributos' → taxMode=included. Honorários 'líquidos' → taxMode=added.",
    "Mensalidade que muda após N meses → dois componentes mensal_escalonado com períodos consecutivos.",
    "Preço fechado em N parcelas iguais → mensal_preco_fechado + installmentCount + installmentAmountCents + firstDueDate.",
    "Êxito percentual → exito_percentual, requiresManualRelease=true. Faixas (5% se deságio ≥ 95%) vão em extras.exitoBands.",
    "Identidade: groupName e parties.contratante vêm do preâmbulo, quadro resumo e nome do arquivo. Ignore nomes de outros grupos que só aparecem em cláusulas reaproveitadas de modelo (ex.: PDF Pague Menos cujo objeto ainda cita GRUPO ELEVA).",
    "Não cadastre o escritório Bismarchi | Pires como contratante.",
    "Honorários 'R$ X por pasta/processo/demanda' → kind=variavel_processo, chargeMode=quantidade_total, unitAmountCents=X (unitário em centavos). includedQuantity=carteira citada no PDF, se houver; não calcule nem grave o total estimado (unitário×quantidade) como mensal_fixo.",
    "Excedente de pasta ou hora → variavel_processo ou variavel_hora com chargeMode=excedente e includedQuantity da franquia (ex.: 25h). Não invente tarifa de hora se o contrato não informar.",
    "mensal_fixo só para honorário mensal realmente fixo, independente da quantidade de pastas/horas.",
    "Não invente rateio, comissão, sócio ou responsável interno.",
  ].join(" ");
}

export function buildContractImportUserPrompt(filename: string, clippedText: string): string {
  return clippedText.startsWith(`Arquivo: ${filename}`)
    ? clippedText
    : `Arquivo: ${filename}\n\n${clippedText}`;
}
