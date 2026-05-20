import { extractPlaceholderKeysFromText } from "@/data/proposta-tipos-catalog";

export type InvestimentoSubtipoDef = {
  subtipoId: string;
  label: string;
  /** Texto jurídico com placeholders `[CHAVE]`. */
  template: string;
  conceito: string;
  placeholderKeys: string[];
};

export type InvestimentoTipoDef = {
  tipoId: string;
  label: string;
  subtipos: InvestimentoSubtipoDef[];
};

function inv(
  subtipoId: string,
  label: string,
  conceito: string,
  template: string,
): InvestimentoSubtipoDef {
  const keys = extractPlaceholderKeysFromText(template);
  return { subtipoId, label, conceito, template, placeholderKeys: keys };
}

/**
 * Catálogo global de investimento (honorários), igual para todas as áreas de escopo.
 */
export const PROPOSTA_INVESTIMENTO_TIPOS_CATALOG: InvestimentoTipoDef[] = [
  {
    tipoId: "honorarios_contratuais",
    label: "Honorários contratuais",
    subtipos: [
      inv(
        "mensal_fixo",
        "Mensal - Fixo",
        "Pagamento mensal recorrente, em valor fixo, pela prestação continuada de serviços por prazo indeterminado.",
        "Para a prestação dos serviços objeto da presente proposta, propõe-se o pagamento mensal de R$ [VALORMENSAL], já incluídos os tributos incidentes.",
      ),
      inv(
        "mensal_escalonado",
        "Mensal - Escalonado",
        "Pagamento mensal recorrente, com alteração programada de valores conforme prazo, fase contratual ou marco previamente definido.",
        "Para a prestação dos serviços objeto da presente proposta, propõe-se o pagamento mensal de R$ [VALORMENSALESCALONADO], já incluídos os tributos incidentes, observada a seguinte condição: [CONDICAOESCALONADO].",
      ),
      inv(
        "mensal_variavel",
        "Mensal - Variável",
        "Pagamento mensal recorrente, com variação de valor conforme critérios previamente definidos em contrato.",
        "Para a prestação dos serviços objeto da presente proposta, propõe-se o pagamento mensal de R$ [VALORMENSALVARIAVEL], já incluídos os tributos incidentes, conforme a seguinte condição: [CONDICAOVARIAVEL].",
      ),
      inv(
        "mensal_variavel_hora",
        "Mensal - Variável Hora",
        "Pagamento mensal correspondente às horas efetivamente trabalhadas no período, conforme valor/hora previamente ajustado.",
        "Para a prestação dos serviços objeto da presente proposta, propõe-se o pagamento mensal correspondente às horas efetivamente demandadas no período, considerando o valor de R$ [VALORHORA] por hora trabalhada, estimando-se [HORASPREVISTAS] horas mensais, totalizando aproximadamente R$ [VALORMENSALESTIMADO], já incluídos os tributos incidentes.",
      ),
      inv(
        "mensal_condicionado",
        "Mensal - Condicionado",
        "Pagamento mensal recorrente, variável conforme volume, escopo ou demanda solicitada pelo cliente.",
        "Para a prestação dos serviços objeto da presente proposta, propõe-se o pagamento mensal a partir de R$ [VALORMENSALBASE], já incluídos os tributos incidentes, podendo sofrer variação conforme demanda, escopo ou solicitações adicionais, nos termos da seguinte condição: [CONDICAOVARIAVEL].",
      ),
      inv(
        "spot",
        "SPOT",
        "Pagamento de valor fechado para execução de serviço específico e determinado, com encerramento após a conclusão da entrega.",
        "Os honorários advocatícios para o desempenho especializado do escopo detalhado anteriormente serão fixados em R$ [VALORSPOT], já incluídos os tributos incidentes, para pagamento à vista ou, ainda, em até [PARCELAS] parcelas mensais e sucessivas de R$ [VALORPARCELA] cada.",
      ),
      inv(
        "spot_condicionado",
        "SPOT - Condicionado",
        "Pagamento de valor fechado referente a serviço específico, cuja execução dependerá de solicitação formal do cliente.",
        "Os honorários advocatícios para eventual execução do escopo acima descrito, mediante solicitação formal da Cliente, serão fixados em R$ [VALORSPOT], já incluídos os tributos incidentes, para pagamento à vista ou em até [PARCELAS] parcelas mensais e sucessivas de R$ [VALORPARCELA] cada.",
      ),
    ],
  },
  {
    tipoId: "honorarios_manutencao",
    label: "Honorários de manutenção",
    subtipos: [
      inv(
        "manutencao",
        "Manutenção",
        "Valor mensal devido para acompanhamento, manutenção estratégica ou condução continuada após encerrada etapa principal.",
        "Após a quitação dos honorários descritos no item [ITEM], será devido o valor mensal de R$ [VALORMANUTENCAO], a título de manutenção da condução processual, acompanhamento estratégico ou suporte continuado, até [CONDICAOFINAL].",
      ),
    ],
  },
  {
    tipoId: "honorarios_exito",
    label: "Honorários de êxito",
    subtipos: [
      inv(
        "exito_percentual",
        "Êxito %",
        "Pagamento condicionado ao resultado útil obtido ao cliente, calculado sobre benefício econômico ou proveito financeiro alcançado.",
        "Ficam previstos honorários de êxito no percentual de [PORCENTAGEMHONORARIOS]%, incidentes sobre o benefício econômico obtido pela Cliente em razão da atuação do Bismarchi | Pires, calculados conforme a seguinte base: [BASECALCULO].",
      ),
      inv(
        "exito_valor_fixo",
        "Êxito - Valor fixo",
        "Pagamento de valor previamente definido condicionado ao atingimento de resultado específico.",
        "Em caso de obtenção do resultado previsto nesta proposta, serão devidos honorários de êxito no valor de R$ [VALOREXITO], a serem pagos no prazo de [PRAZOPAGAMENTO].",
      ),
    ],
  },
  {
    tipoId: "honorarios_hibridos",
    label: "Honorários híbridos",
    subtipos: [
      inv(
        "mensal_mais_exito",
        "Mensal + Êxito",
        "Combinação entre remuneração mensal recorrente e honorários condicionados ao resultado obtido.",
        "Pela prestação dos serviços objeto desta proposta, será devido o valor mensal de R$ [VALORMENSAL], já incluídos os tributos incidentes, acrescido de honorários de êxito de [PORCENTAGEMHONORARIOS]% sobre [BASECALCULO].",
      ),
      inv(
        "spot_mais_exito",
        "SPOT + Êxito",
        "Valor fixo inicial para atuação específica, acrescido de remuneração variável em caso de sucesso.",
        "Para atuação no escopo descrito, serão devidos honorários iniciais de R$ [VALORSPOT], acrescidos de honorários de êxito de [PORCENTAGEMHONORARIOS]% sobre [BASECALCULO], caso atingido o resultado previsto.",
      ),
    ],
  },
];

export function getInvestimentoSubtipoDef(
  tipoId: string,
  subtipoId: string,
): InvestimentoSubtipoDef | undefined {
  const tipo = PROPOSTA_INVESTIMENTO_TIPOS_CATALOG.find((t) => t.tipoId === tipoId);
  return tipo?.subtipos.find((s) => s.subtipoId === subtipoId);
}
