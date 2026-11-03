-- Reunião de validação (03/11/2026): na escolha dos escopos da reunião, "Prazo para entrega"
-- passa a se chamar "Data limite de preenchimento" (mesmo campo cp_prazo_entrega).
update public.field_definitions
set label = 'Data limite de preenchimento'
where pipeline_code = 'vendas'
  and entity_name = 'oportunidade'
  and field_code = 'cp_prazo_entrega'
  and label = 'Prazo para entrega';
