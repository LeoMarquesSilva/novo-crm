-- Reunião de validação (03/11/2026): escopos do Cível (Contencioso e Família) revalidados.
-- 1) Os dois subtipos do Contencioso tinham o mesmo rótulo ("Contencioso") no seletor.
-- 2) "1 processo" passa a pedir Vara/Tribunal, que o objeto do contrato Cível exige
--    (vara_tribunal_civel, alias "VARA/TRIBUNAL" em object-fields.ts).
-- O código deixou de trazer no fallback "Carteira de processos" (sem texto nem campos) e a
-- chave antiga "divorcio_guarda_alimentos", que duplicava "Divórcio, guarda e alimentos".
update public.proposal_scope_subtypes s
set label = case s.subtype_key when 'um_processo' then '1 processo' else '+1 processo' end,
    updated_at = now()
from public.proposal_scope_types t
where t.id = s.scope_type_id
  and t.area_key = 'Cível'
  and t.type_key = 'contencioso'
  and s.subtype_key in ('um_processo', 'mais_um_processo')
  and s.label = 'Contencioso';

update public.proposal_scope_subtypes s
set escopo_template = replace(
      s.escopo_template,
      'sob o n.º [NUM. DO PROCESSO], movida por',
      'sob o n.º [NUM. DO PROCESSO], em trâmite perante [VARA/TRIBUNAL], movida por'
    ),
    -- Logo depois do número do processo, na ordem do formulário do escopo.
    placeholder_keys = case
      when 'VARA/TRIBUNAL' = any (s.placeholder_keys) then s.placeholder_keys
      when array_position(s.placeholder_keys, 'NUM. DO PROCESSO') is null
        then array_append(s.placeholder_keys, 'VARA/TRIBUNAL')
      else s.placeholder_keys[1:array_position(s.placeholder_keys, 'NUM. DO PROCESSO')]
        || array['VARA/TRIBUNAL']
        || s.placeholder_keys[array_position(s.placeholder_keys, 'NUM. DO PROCESSO') + 1:]
    end,
    updated_at = now()
from public.proposal_scope_types t
where t.id = s.scope_type_id
  and t.area_key = 'Cível'
  and t.type_key = 'contencioso'
  and s.subtype_key = 'um_processo'
  and s.escopo_template like '%sob o n.º [NUM. DO PROCESSO], movida por%';
