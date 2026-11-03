-- Reunião de validação (03/11/2026): sai o tipo de investimento "Honorários híbridos"
-- (Mensal + Êxito, SPOT + Êxito). Desativa no catálogo do banco; o código já não o traz no fallback.
-- Propostas antigas guardam o próprio catálogo no snapshot; nenhuma proposta em andamento o usa.
update public.proposal_investment_subtypes
set is_active = false, updated_at = now()
where investment_type_id in (select id from public.proposal_investment_types where type_key = 'honorarios_hibridos')
  and is_active;

update public.proposal_investment_types
set is_active = false, updated_at = now()
where type_key = 'honorarios_hibridos' and is_active;
