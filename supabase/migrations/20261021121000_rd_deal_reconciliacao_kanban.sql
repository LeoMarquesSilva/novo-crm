-- Snapshot RD só com o que o kanban usa (`GET /api/crm/leads`).
--
-- `rd_deal_reconciliacao_resumo` ainda devolvia o deal inteiro (~3 MB), e o
-- kanban relê tudo a cada evento do Realtime. A rota só lê do deal: `updated_at`,
-- motivo de perda, etapa (`deal_stage` e variantes) e dois custom fields
-- ("Cadastro realizado por…" e "Solicitante…"). Esta view mantém o formato de
-- `detalhes` (`{ deal: {...} }`) com só esses campos. O filtro dos custom fields
-- é largo (o rótulo exato continua sendo conferido na rota).

create or replace view public.rd_deal_reconciliacao_kanban
with (security_invoker = true)
as
select
  r.id,
  r.oportunidade_id,
  r.reconciled_at,
  case
    when jsonb_typeof(r.detalhes -> 'deal') = 'object' then
      jsonb_build_object(
        'deal',
        jsonb_strip_nulls(jsonb_build_object(
          'updated_at', r.detalhes -> 'deal' -> 'updated_at',
          'updatedAt', r.detalhes -> 'deal' -> 'updatedAt',
          'deal_lost_reason', r.detalhes -> 'deal' -> 'deal_lost_reason',
          'deal_stage', r.detalhes -> 'deal' -> 'deal_stage',
          'stage_name', r.detalhes -> 'deal' -> 'stage_name',
          'stage_label', r.detalhes -> 'deal' -> 'stage_label',
          'stage', r.detalhes -> 'deal' -> 'stage',
          'stageName', r.detalhes -> 'deal' -> 'stageName',
          'deal_custom_fields',
          case
            when jsonb_typeof(r.detalhes -> 'deal' -> 'deal_custom_fields') = 'array' then
              coalesce(
                (
                  select jsonb_agg(
                    jsonb_build_object(
                      'label', f -> 'label',
                      'value', f -> 'value',
                      'content', f -> 'content',
                      'custom_field', jsonb_build_object('label', f -> 'custom_field' -> 'label')
                    )
                    order by e.ord
                  )
                  from jsonb_array_elements(r.detalhes -> 'deal' -> 'deal_custom_fields')
                    with ordinality as e(f, ord)
                  where coalesce(f -> 'custom_field' ->> 'label', '') || ' ' || coalesce(f ->> 'label', '')
                    ~* '(solicitante|cadastro\W+realizado\W+por)'
                ),
                '[]'::jsonb
              )
          end
        ))
      )
    -- Sem `deal` a rota não lê nada do snapshot; a linha só marca "origem RD".
    else null
  end as detalhes
from public.rd_deal_reconciliacao r;

comment on view public.rd_deal_reconciliacao_kanban is
  'rd_deal_reconciliacao reduzido ao que o kanban de leads lê (etapa, atualização, motivo de perda, solicitante e cadastrante).';

-- Igual à tabela base: só o servidor (service role) lê.
revoke all on public.rd_deal_reconciliacao_kanban from public, anon, authenticated;
grant select on public.rd_deal_reconciliacao_kanban to service_role;
