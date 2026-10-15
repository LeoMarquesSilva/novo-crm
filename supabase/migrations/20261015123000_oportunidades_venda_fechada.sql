-- Venda encerrada como ganha quando o contrato é assinado por todos.
-- `encerramento` já existe no remoto (criada fora do repositório; o import do RD grava 'ganho').
-- `venda_fechada_em` guarda quando a assinatura foi concluída (quadro de Vendas e indicadores).
-- Versionada; NÃO aplicada no remoto nesta entrega. Conferir antes a constraint atual:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.oportunidades'::regclass;

alter table public.oportunidades
  add column if not exists encerramento text,
  add column if not exists venda_fechada_em timestamptz;

comment on column public.oportunidades.venda_fechada_em is
  'Quando a venda foi fechada (contrato assinado por todos na D4Sign). Junto com encerramento = ganho.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.oportunidades'::regclass
      and c.contype = 'c'
      and a.attname = 'encerramento'
  ) then
    alter table public.oportunidades
      add constraint oportunidades_encerramento_check
      check (encerramento is null or encerramento in ('ganho', 'perdido')) not valid;
  end if;
end;
$$;

create index if not exists idx_oportunidades_venda_fechada_em
  on public.oportunidades (venda_fechada_em desc)
  where encerramento = 'ganho';

-- Backfill: leads criados no CRM (não RD) já assinados ou no pós-venda viram venda ganha.
update public.oportunidades o
set
  encerramento = 'ganho',
  venda_fechada_em = coalesce(
    (
      select min(t.created_at)
      from public.transicoes_etapa t
      where t.oportunidade_id = o.id
        and t.etapa_destino = 'contrato_assinado'::public.opportunity_stage
    ),
    (
      select max(d.finalized_at)
      from public.d4sign_documents d
      where d.oportunidade_id = o.id
    ),
    o.updated_at
  )
where o.encerramento is null
  and o.etapa in (
    'contrato_assinado'::public.opportunity_stage,
    'aguardando_cadastro'::public.opportunity_stage,
    'cadastro_novo_cliente'::public.opportunity_stage,
    'inclusao_faturamento'::public.opportunity_stage,
    'boas_vindas'::public.opportunity_stage,
    'reuniao_kickoff'::public.opportunity_stage
  )
  and not exists (
    select 1 from public.rd_deal_reconciliacao r where r.oportunidade_id = o.id
  );
