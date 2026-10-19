import type { ContractImportExtraction } from "@/lib/contract-import/schemas";
import { emptyClientOnboardingPayload } from "@/modules/crm/domain/client-onboarding";

/**
 * Cenário do teste E2E de 18/10/2026 (lead copiado do RD, Renato Marotta Starek): SPOT de
 * R$ 12.000 em 5x de R$ 2.400, manutenção de R$ 250/mês após a 5ª parcela e êxito de 5%;
 * assinatura em 18/10, primeiro faturamento em 20/10, reajuste anual pelo IPCA.
 */
export const renatoProposalEscopoJson = JSON.stringify({
  "Societário e Contratos": [
    {
      id: "soc-1",
      tipoId: "societario",
      subtipoId: "reorganizacao",
      investimento: {
        tipoId: "honorarios_contratuais",
        subtipoId: "spot",
        placeholders: {
          VALORSPOT: "12.000,00",
          PARCELAS: "5",
          PARCELAS_IGUAIS: "sim",
          VALORPARCELA: "2.400,00",
          PARCELAS_VENCIMENTOS: "na data de assinatura do Contrato|20/11/2026|20/12/2026|20/01/2027|20/02/2027",
        },
      },
    },
  ],
  __investimentoDocumento__: {
    tipoId: "honorarios_contratuais",
    subtipoId: "spot",
    placeholders: { VALORSPOT: "12.000,00" },
    items: [
      {
        id: "inv-spot",
        tipoId: "honorarios_contratuais",
        subtipoId: "spot",
        placeholders: { VALORSPOT: "12.000,00", PARCELAS: "5", VALORPARCELA: "2.400,00" },
      },
      {
        id: "inv-man",
        tipoId: "honorarios_manutencao",
        subtipoId: "manutencao",
        placeholders: { VALORMANUTENCAO: "250,00", ITEM: "3.1", CONDICAOFINAL: "o encerramento do processo" },
      },
      {
        id: "inv-exito",
        tipoId: "honorarios_exito",
        subtipoId: "exito_percentual",
        placeholders: { PORCENTAGEMHONORARIOS: "5", BASECALCULO: "o benefício econômico" },
      },
    ],
  },
});

/** Cadastro enviado pelo responsável e conferido por Operações Legais. */
export function renatoOnboarding() {
  const payload = emptyClientOnboardingPayload();
  payload.cadastro.razaoSocial = "[TESTE E2E] RENATO MAROTTA STAREK";
  payload.cadastro.documento = "52998224725";
  payload.financeiro.inicioVigencia = "2026-10-18";
  payload.financeiro.primeiroFaturamento = "2026-10-20";
  payload.financeiro.reajuste = { indice: "IPCA", periodicidadeMeses: "12" };
  payload.financeiro.rateioPorArea = [{ area: "Societário e Contratos", percentual: "100" }];
  return payload;
}

/** Cláusulas de honorários e de atraso do PDF assinado (simulado). */
export const renatoSignedPdfText = [
  "3. DOS HONORÁRIOS CONTRATUAIS",
  "Valor total de R$ 12.000,00 (doze mil reais), pago em 5 parcelas de R$ 2.400,00 (dois mil e quatrocentos reais). Honorários de manutenção de R$ 250,00 (duzentos e cinquenta reais). Honorários de êxito conforme condições da proposta.",
  "4.2. Atraso no Pagamento. O atraso no pagamento facultará à Contratada cobrar multa equivalente a 20% (vinte por cento) do valor em mora, acrescida de juros de 1% (um por cento) ao mês, pro rata die, com atualização pela variação positiva do IPCA-E.",
  "5.2. Início do Contrato. A prestação dos serviços se iniciará na ocasião da assinatura do Contrato.",
].join("\n");

/** O que a IA devolveu ao ler o PDF assinado no teste. */
export function renatoPdfExtraction(): ContractImportExtraction {
  return {
    groupName: null,
    parties: [
      {
        razaoSocial: "[TESTE E2E] RENATO MAROTTA STAREK",
        documento: "529.982.247-25",
        documentoTipo: "cpf",
        endereco: null,
        role: "contratante",
      },
    ],
    startsAt: "2026-10-18",
    signedAt: "2026-10-18",
    indefinite: true,
    dueDay: null,
    firstInvoiceAt: null,
    firstInvoiceConditioned: false,
    adjustmentIndex: "IPCA-E",
    taxMode: null,
    areas: [],
    components: [
      {
        kind: "mensal_preco_fechado",
        description: "Valor total de R$ 12.000,00 em 5 parcelas de R$ 2.400,00",
        amountCents: 1_200_000,
        percentageBasisPoints: null,
        effectiveFrom: null,
        effectiveTo: null,
        installmentCount: 5,
        installmentAmountCents: 240_000,
        firstDueDate: null,
        requiresManualRelease: false,
        includedQuantity: null,
        unitAmountCents: null,
        chargeMode: null,
        areaKey: null,
      },
      {
        kind: "mensal_fixo",
        description: "Honorários de manutenção",
        amountCents: 25_000,
        percentageBasisPoints: null,
        effectiveFrom: null,
        effectiveTo: null,
        installmentCount: null,
        installmentAmountCents: null,
        firstDueDate: null,
        requiresManualRelease: false,
        includedQuantity: null,
        unitAmountCents: null,
        chargeMode: null,
        areaKey: null,
      },
      {
        kind: "exito_percentual",
        description: "Honorários de êxito conforme condições da proposta",
        amountCents: null,
        percentageBasisPoints: null,
        effectiveFrom: null,
        effectiveTo: null,
        installmentCount: null,
        installmentAmountCents: null,
        firstDueDate: null,
        requiresManualRelease: true,
        includedQuantity: null,
        unitAmountCents: null,
        chargeMode: null,
        areaKey: null,
      },
    ],
    d4signUuid: "7c97f6c3-031f-4e41-83f9-5aa852531b72",
    signers: [],
    extras: { objectText: null },
    evidence: [
      {
        field: "adjustmentIndex",
        quote: "com atualização pela variação positiva do IPCA-E",
        clause: "4.2",
      },
    ],
  };
}
