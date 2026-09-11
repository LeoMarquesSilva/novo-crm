-- Limpeza de dados: 26 `field_definitions` de "confecção de contrato" com a
-- nomenclatura antiga (sufixo "_cc": tipo_instrumento_cc, valores_cc,
-- rateio_*_cc, spot_*_cc, mensal_*_cc...) foram substituídos há tempos pelos
-- campos atuais (prefixo "cc_": cc_tipo_instrumento, cc_valores, cc_incluir_*
-- etc.), usados pelo builder de contrato (contrato-document-builder.tsx).
--
-- Os antigos continuavam `is_active = true` — 5 deles (tipo_instrumento_cc,
-- objeto_contrato_cc, valores_cc, tipo_pagamento_cc, prazo_confeccao_cc) até
-- marcados `is_required = true` — mas nenhum tem input em UI alguma hoje:
-- não são renderizados pelo builder (que só referencia field_code `cc_*`
-- explicitamente) e o gate de transição de etapa já os ignora por completo
-- (`filterConfeccaoContratoTransitionDefinitions` retorna `[]` para
-- "confeccao_contrato"). Confirmado por grep: nenhuma referência real no
-- código a nenhum desses 26 field_code (só fixtures de teste com valores
-- arbitrários). Desativar (não apagar — preserva field_values históricos de
-- leads antigos) evita que apareçam como "obrigatórios" na tela de admin de
-- campos, sugerindo incorretamente que bloqueiam algo.

update public.field_definitions
set is_active = false
where entity_name = 'oportunidade'
  and stage_code = 'confeccao_contrato'
  and is_active = true
  and field_code in (
    'tipo_instrumento_cc',
    'limitacao_processos_cc',
    'limitacao_horas_cc',
    'objeto_contrato_cc',
    'exito_cc',
    'valores_cc',
    'tipo_pagamento_cc',
    'prazo_confeccao_cc',
    'mensal_fixo_cc',
    'mensal_preco_fechado_cc',
    'mensal_escalonado_cc',
    'mensal_variavel_cc',
    'mensal_condicionado_cc',
    'spot_cc',
    'spot_manutencao_cc',
    'spot_parcelado_cc',
    'spot_parcelado_manutencao_cc',
    'spot_condicionado_cc',
    'exito_valor_cc',
    'rateio_reestruturacao_cc',
    'rateio_civel_cc',
    'rateio_trabalhista_cc',
    'rateio_tributario_cc',
    'rateio_contratos_cc',
    'rateio_add_cc',
    'link_contrato_cc'
  );
