/** Mapeamento interno (key) ↔ rótulos/aliases dos custom fields RD na reconciliação. */
export const LEAD_RD_FIELD_LABELS: Array<{ key: string; label: string; aliases?: string[] }> = [
  { key: "solicitante", label: "Solicitante" },
  { key: "cadastrado_por", label: "Cadastro realizado por", aliases: ["Cadastro realizado por (e-mail)"] },
  { key: "razao_social", label: "Razão Social [CP]", aliases: ["Razão Social / Nome Completo"] },
  { key: "cnpj", label: "CNPJ [CP]", aliases: ["CNPJ/CPF"] },
  { key: "demais_razoes_sociais", label: "Demais Razões sociais" },
  { key: "areas_analise", label: "Áreas que serão objeto de análise" },
  { key: "prazo_entrega_data", label: "Prazo de Entrega Due [DATA]" },
  { key: "prazo_entrega_hora", label: "Prazo de Entrega Due [HORÁRIO]", aliases: ["Prazo de Entrega Due [HORARIO]"] },
  { key: "local_reuniao", label: "Local da Reunião" },
  { key: "data_reuniao", label: "Data Reunião" },
  { key: "horario_reuniao", label: "Horário da Reunião" },
  { key: "email_solicitante", label: "Email Solicitante", aliases: ["E-mail do Solicitante"] },
  { key: "havera_due_diligence", label: "Haverá Due Diligence?", aliases: ["Havera Due Diligence?"] },
  { key: "areas_comparecimento", label: "Áreas para comparecimento na reunião" },
  { key: "indicacao", label: "Indicação" },
  { key: "nome_indicacao", label: "Nome da Indicação" },
  { key: "tipo_instrumento", label: "Tipo de Instrumento [CC]" },
  { key: "limitacao_processos", label: "Limitação de processos e valor adicional por processo [CC]" },
  { key: "limitacao_horas", label: "Limitação de horas (Consultivo) [CC]" },
  { key: "exito", label: "Êxito (Descrever áreas abrangidas e percentuais) [CC]" },
  { key: "valores", label: "Valores (descrever tipo de pagamento, valores e data de vencimento)  [CC]" },
  { key: "tipo_pagamento", label: "Tipo de pagamento [CC]" },
  { key: "link_arquivo_due", label: "Link do Arquivo DUE" },
  { key: "prazo_entrega_contrato", label: "Prazo para elaboração do contrato [CC]" },
  { key: "data_assinatura_contrato", label: "Data de assinatura do contrato [CA]" },
  { key: "link_contrato", label: "Link Contrato [CE]" },
  { key: "responsavel_elaboracao", label: "Responsável pela Elaboração [CE]" },
  { key: "areas_cp", label: "Áreas Objeto do contrato [CP]" },
  { key: "gestor_contrato", label: "Gestor do Contrato [CP]" },
  { key: "captador", label: "Captador [ CP]" },
  { key: "tributacao", label: "Tributação [CP]" },
  { key: "informacoes_adicionais", label: "Informações adicionais [CP]" },
  { key: "data_primeiro_vencimento", label: "Data do primeiro vencimento [CP]" },
  { key: "prazo_entrega_cp", label: "Prazo para entrega (mínimo de 2 dias úteis - sinalizar exceções e motivos) [CP]" },
  { key: "qualificacao_completa", label: "Qualificação completa (endereço, CEP, endereço eletrônico etc.) [CP]" },
  { key: "realizou_due_diligence", label: "Realizou Due Diligence? [CP]" },
  { key: "nome_ponto_focal", label: "Nome do ponto focal / Comercial [CP]" },
  { key: "email_ponto_focal", label: "E-mail do ponto focal / Comercial [CP]" },
  { key: "telefone_ponto_focal", label: "Telefone do ponto focal / Comercial [CP]" },
  { key: "link_proposta", label: "Link da Proposta [CP]" },
  { key: "status_cadastro", label: "STATUS [CADASTRO]" },
  { key: "razao_social_principal_cadastro", label: "Razão Social Cliente Principal [CADASTRO]" },
  { key: "cnpj_cpf_cadastro", label: "CNPJ / CPF Cliente Principal [CADASTRO]" },
  { key: "endereco_cadastro", label: "Endereço Cliente Principal [CADASTRO]" },
  { key: "escopo_contratual_cadastro", label: "Objeto do Contrato [CC]" },
  { key: "qualificacao_socios_cadastro", label: "Qualificação dos Sócios (Nome, Posição (Sócio, consultor familiar, diretor etc), CPF) [CADASTRO] " },
  { key: "consulta_auto_cadastro", label: "Cadastrar na consulta automatizada de novas demandas? (Favor informar os nomes, CNPJS de TODOS abaixo) [CADASTRO]" },
  { key: "info_adicionais_cadastro", label: "Informações Adicionais [CADASTRO]" },
  { key: "id_sharepoint", label: "ID SHAREPOINT" },
  { key: "razao_social_financeiro", label: "Razão Social para Faturamento [FINANCEIRO]" },
  { key: "cpf_cnpj_financeiro", label: "CPF/CNPJ para Faturamento [FINANCEIRO]" },
  { key: "vigencia_contrato_financeiro", label: "Início da Vigência do Contrato [FINANCEIRO]" },
  { key: "primeiro_faturamento_financeiro", label: "Primeiro Faturamento [FINANCEIRO]" },
  { key: "responsavel_cliente_financeiro", label: "Responsável Financeiro do Cliente [FINANCEIRO]" },
  { key: "posicao_responsavel_financeiro", label: "Posição do Responsável (Sócio, consultor, financeiro...) [FINANCEIRO]" },
  { key: "email_responsavel_financeiro", label: "E-mail Responsável Financeiro do Cliente [FINANCEIRO]" },
  { key: "telefone_responsavel_financeiro", label: "Telefone Responsável Financeiro do Cliente [FINANCEIRO]" },
  { key: "repasse_acordado_financeiro", label: "Repasse acordado % [FINANCEIRO]" },
  { key: "mensal_fixo_financeiro", label: "Mensal – Fixo Valor R$ [CC]" },
  { key: "mensal_escalonado_financeiro", label: "Mensal – Escalonado - Valor R$ [CC]" },
  { key: "mensal_variavel_financeiro", label: "Mensal – Variável - Valor R$ [CC]" },
  { key: "mensal_condicionado_financeiro", label: "Mensal – Condicionado - Valor R$ [CC]" },
  { key: "spot_financeiro", label: "SPOT - Valor R$  [CC]" },
  { key: "spot_manutencao_financeiro", label: "SPOT com Manutenção - Valor R$  [CC]" },
  { key: "spot_parcelado_financeiro", label: "SPOT – Parcelado - Valor R$  [CC]" },
  { key: "spot_parcelado_manutencao_financeiro", label: "SPOT - Parcelado com manutenção - Valor R$  [CC]" },
  { key: "spot_condicionado_financeiro", label: "SPOT – Condicionado - Valor R$  [CC]" },
  { key: "exito_financeiro", label: "Êxito - Valor R$  [CC]" },
  { key: "rateio_valor_insolvencia_financeiro", label: "RATEIO - VALOR R$ (Reestruturação e Insolvência) - [FINANCEIRO] " },
  { key: "rateio_porcentagem_insolvencia_financeiro", label: "RATEIO - PORCENTAGEM %  (Reestruturação e Insolvência) - [CC] " },
  { key: "rateio_valor_civel_financeiro", label: "RATEIO - VALOR R$  (Cível) - [FINANCEIRO] " },
  { key: "rateio_porcentagem_civel_financeiro", label: "RATEIO - PORCENTAGEM %  (Cível) - [CC] " },
  { key: "rateio_valor_trabalhista_financeiro", label: "RATEIO - VALOR  R$  (Trabalhista) - [FINANCEIRO] " },
  { key: "rateio_porcentagem_trabalhista_financeiro", label: "RATEIO - PORCENTAGEM %  (Trabalhista) - [CC] " },
  { key: "rateio_valor_tributario_financeiro", label: "RATEIO - VALOR R$ (Tributário) - [FINANCEIRO] " },
  { key: "rateio_porcentagem_tributario_financeiro", label: "RATEIO - PORCENTAGEM % (Tributário) - [CC] " },
  { key: "rateio_valor_contratos_financeiro", label: "RATEIO - VALOR R$ (Contratos / Societário) - [FINANCEIRO] " },
  { key: "rateio_porcentagem_contratos_financeiro", label: "RATEIO - PORCENTAGEM % (Contratos / Societário) - [CC] " },
  { key: "rateio_valor_add_financeiro", label: "RATEIO - VALOR R$ (ADD) - [FINANCEIRO] " },
  { key: "rateio_porcentagem_add_financeiro", label: "RATEIO - PORCENTAGEM % (ADD) - [CC] " },
  { key: "indice_reajuste_financeiro", label: "Índice de Reajuste - [FINANCEIRO]" },
  { key: "periodicidade_reajuste_financeiro", label: "Periodicidade do Reajuste - [FINANCEIRO]" },
  { key: "observacoes_financeiro", label: "Observações - [FINANCEIRO]" },
  { key: "mensal_preco_fechado_financeiro", label: "Mensal - Preço Fechado Parcelado - Valor R$ [CC]" },
  { key: "valor_primeiro_faturamento_financeiro", label: "Valor do primeiro faturamento [FINANCEIRO]" },
  { key: "valor_contrato_anual_financeiro", label: "Valor do contrato anual [FINANCEIRO]" },
  { key: "id_sharepoint_financeiro", label: "ID SHAREPOINT [FINANCEIRO]" },
  { key: "status_financeiro", label: "STATUS [FINANCEIRO]" },
];

const RD_OVERRIDE_KEY_SET = new Set<string>([
  "stage_name",
  ...LEAD_RD_FIELD_LABELS.map((m) => m.key),
]);

/** Chaves RD cujo valor é `app_users.id` (UI: nome + avatar). */
export const RD_FIELD_KEYS_APP_USER = new Set<string>([
  "gestor_contrato",
  "captador",
  "responsavel_elaboracao",
]);

export function isRdFieldAppUserKey(key: string): boolean {
  return RD_FIELD_KEYS_APP_USER.has(key);
}

export function isAllowedRdFieldOverrideKey(key: string): boolean {
  return RD_OVERRIDE_KEY_SET.has(key);
}

export function labelForRdFieldKey(key: string): string | null {
  if (key === "stage_name") return "Etapa RD";
  const row = LEAD_RD_FIELD_LABELS.find((m) => m.key === key);
  return row ? row.label.trim() : null;
}
