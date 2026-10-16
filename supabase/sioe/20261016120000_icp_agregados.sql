-- Projeto SIOE (espelho do VIOS), não o banco do CRM: aplicar só no SIOE.
--
-- Agregados do ICP calculados no banco. Antes o CRM baixava ~170 mil linhas do
-- timesheet e ~35 mil processos (171 + 41 requisições, ~20 MB) para somar em
-- memória; a função devolve o resultado pronto em uma chamada (~0,7 s, ~110 KB).
-- Volta como um único jsonb para não esbarrar no limite de 1.000 linhas do PostgREST.
--
-- - horas: horas do timesheet desde p_desde, por grupo e área (grupo vazio entra no total do escritório);
-- - pastas_ativas: processos não encerrados e com situação "Ativo", por grupo e área;
-- - primeiro_processo: processo mais antigo de cada grupo (porta de entrada), empate pelo menor id.
create or replace function public.icp_agregados(p_desde date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'horas', coalesce((
      select jsonb_agg(jsonb_build_object('grupo', h.grupo, 'area', h.area, 'horas', h.horas))
      from (
        select btrim(coalesce(t.grupo_cliente, ''), E' \t\r\n') as grupo, t.area, sum(t.total_horas_decimal) as horas
        from public.timesheets t
        where t.data >= p_desde
        group by 1, 2
      ) h
    ), '[]'::jsonb),
    'pastas_ativas', coalesce((
      select jsonb_agg(jsonb_build_object('grupo', f.grupo, 'area', f.area, 'pastas', f.pastas))
      from (
        select btrim(p.grupo_cliente, E' \t\r\n') as grupo, p.area, count(*) as pastas
        from public.processos_completo p
        where p.processo_encerrado = 'Não'
          and p.situacao_processo = 'Ativo'
          and p.grupo_cliente is not null
        group by 1, 2
      ) f
    ), '[]'::jsonb),
    'primeiro_processo', coalesce((
      select jsonb_agg(jsonb_build_object('grupo', e.grupo, 'area', e.area, 'data_cadastro', e.data_cadastro))
      from (
        select distinct on (btrim(p.grupo_cliente, E' \t\r\n'))
          btrim(p.grupo_cliente, E' \t\r\n') as grupo, p.area, p.data_cadastro
        from public.processos_completo p
        where p.grupo_cliente is not null
          and p.data_cadastro is not null
          and btrim(p.grupo_cliente, E' \t\r\n') <> ''
        order by btrim(p.grupo_cliente, E' \t\r\n'), p.data_cadastro, p.id
      ) e
    ), '[]'::jsonb)
  );
$$;

comment on function public.icp_agregados(date) is
  'ICP do CRM: horas por grupo/área, pastas ativas por grupo/área e primeiro processo de cada grupo.';

-- Só o CRM (service role) chama; usuários do SIOE não precisam dela.
revoke all on function public.icp_agregados(date) from public, anon, authenticated;
grant execute on function public.icp_agregados(date) to service_role;
