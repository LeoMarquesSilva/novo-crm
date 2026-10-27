-- Reunião Kick-off: a transição pedia nada e a reunião ficava sem registro.
-- Os campos entram no modal da etapa (pós-venda) e ficam gravados em field_values da negociação.
insert into public.field_definitions
  (pipeline_code, entity_name, stage_code, field_code, label, field_type, is_required, sort_order, is_active)
values
  ('pos_venda', 'oportunidade', 'reuniao_kickoff', 'kickoff_data', 'Data da Reunião Kick-off', 'date', true, 10, true),
  ('pos_venda', 'oportunidade', 'reuniao_kickoff', 'kickoff_horario', 'Horário da Reunião Kick-off', 'time', true, 20, true),
  ('pos_venda', 'oportunidade', 'reuniao_kickoff', 'kickoff_local', 'Local ou link da reunião', 'text', true, 30, true),
  ('pos_venda', 'oportunidade', 'reuniao_kickoff', 'kickoff_participantes', 'Participantes', 'textarea', true, 40, true),
  ('pos_venda', 'oportunidade', 'reuniao_kickoff', 'kickoff_observacoes', 'Observações', 'textarea', false, 50, true)
on conflict (pipeline_code, entity_name, field_code) do nothing;
