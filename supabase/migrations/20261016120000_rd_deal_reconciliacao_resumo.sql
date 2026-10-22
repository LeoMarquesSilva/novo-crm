-- Snapshot RD enxuto para o kanban (`GET /api/crm/leads`).
--
-- `rd_deal_reconciliacao.detalhes.deal.deal_custom_fields` traz a definição completa
-- de cada campo (~39 KB por linha, 16 MB no total), e o kanban lia tudo a cada
-- abertura. A view mantém o mesmo formato de `detalhes`, mas cada custom field só com
-- rótulo e valor, e sem os campos vazios (~2 MB no total).
create or replace view public.rd_deal_reconciliacao_resumo
with (security_invoker = true)
as
select
  r.id,
  r.oportunidade_id,
  r.reconciled_at,
  case
    when jsonb_typeof(r.detalhes -> 'deal' -> 'deal_custom_fields') = 'array' then
      jsonb_set(
        r.detalhes,
        '{deal,deal_custom_fields}',
        coalesce(
          (
            select jsonb_agg(
              jsonb_strip_nulls(jsonb_build_object(
                'label', f -> 'label',
                'value', f -> 'value',
                'content', f -> 'content',
                'custom_field', jsonb_build_object('label', f -> 'custom_field' -> 'label')
              ))
              order by e.ord
            )
            from jsonb_array_elements(r.detalhes -> 'deal' -> 'deal_custom_fields') with ordinality as e(f, ord)
            where coalesce(nullif(btrim(f ->> 'value'), ''), nullif(btrim(f ->> 'content'), '')) is not null
          ),
          '[]'::jsonb
        )
      )
    else r.detalhes
  end as detalhes
from public.rd_deal_reconciliacao r;

comment on view public.rd_deal_reconciliacao_resumo is
  'rd_deal_reconciliacao com os custom fields do deal reduzidos a rótulo e valor (kanban de leads).';

-- Igual à tabela base: só o servidor (service role) lê.
revoke all on public.rd_deal_reconciliacao_resumo from public, anon, authenticated;
grant select on public.rd_deal_reconciliacao_resumo to service_role;
