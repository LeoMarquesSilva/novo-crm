-- Mantém a mudança de etapa, os dados do modal e a auditoria na mesma
-- transação PostgreSQL. A função é exposta pelo PostgREST somente para o
-- service_role usado pelos Route Handlers, nunca para clientes do navegador.

create or replace function public.transition_opportunity_atomic(
  p_opportunity_id uuid,
  p_expected_stage public.opportunity_stage,
  p_next_stage public.opportunity_stage,
  p_changed_by uuid,
  p_updated_at timestamptz,
  p_link_proposta text,
  p_set_link_proposta boolean,
  p_link_contrato text,
  p_set_link_contrato boolean,
  p_due_compilacao_entrada_em timestamptz,
  p_due_revision_cycle integer,
  p_due_revisao_entrada_em timestamptz,
  p_lead_intake jsonb,
  p_field_values jsonb
)
returns table (
  transition_id uuid,
  link_proposta text,
  link_contrato text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_transition_id uuid;
  v_field jsonb;
  v_field_id uuid;
  v_definition_id uuid;
begin
  perform 1
  from public.oportunidades
  where id = p_opportunity_id
    and etapa = p_expected_stage
  for update;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'OPPORTUNITY_STAGE_CONFLICT';
  end if;

  update public.oportunidades
  set
    etapa = p_next_stage,
    updated_at = p_updated_at,
    link_proposta = case
      when p_set_link_proposta then p_link_proposta
      else oportunidades.link_proposta
    end,
    link_contrato = case
      when p_set_link_contrato then p_link_contrato
      else oportunidades.link_contrato
    end,
    due_compilacao_entrada_em = coalesce(
      p_due_compilacao_entrada_em,
      oportunidades.due_compilacao_entrada_em
    ),
    due_revision_cycle = coalesce(
      p_due_revision_cycle,
      oportunidades.due_revision_cycle
    ),
    due_revisao_entrada_em = coalesce(
      p_due_revisao_entrada_em,
      oportunidades.due_revisao_entrada_em
    )
  where id = p_opportunity_id;

  if p_lead_intake is not null then
    update public.lead_intakes
    set
      local_reuniao = p_lead_intake ->> 'local_reuniao',
      data_reuniao = (p_lead_intake ->> 'data_reuniao')::date,
      horario_reuniao = (p_lead_intake ->> 'horario_reuniao')::time
    where oportunidade_id = p_opportunity_id;

    if not found then
      raise exception using
        errcode = 'P0002',
        message = 'LEAD_INTAKE_NOT_FOUND';
    end if;
  end if;

  for v_field in
    select value
    from jsonb_array_elements(coalesce(p_field_values, '[]'::jsonb))
  loop
    v_definition_id := (v_field ->> 'field_definition_id')::uuid;
    v_field_id := nullif(v_field ->> 'id', '')::uuid;

    if v_field_id is null then
      insert into public.field_values (
        field_definition_id,
        entity_name,
        entity_record_id,
        value_json,
        updated_by,
        updated_at
      )
      values (
        v_definition_id,
        'oportunidade',
        p_opportunity_id,
        v_field -> 'value_json',
        p_changed_by,
        p_updated_at
      );
    else
      update public.field_values
      set
        value_json = v_field -> 'value_json',
        updated_by = p_changed_by,
        updated_at = p_updated_at
      where id = v_field_id
        and field_definition_id = v_definition_id
        and entity_name = 'oportunidade'
        and entity_record_id = p_opportunity_id;

      if not found then
        raise exception using
          errcode = 'P0002',
          message = 'FIELD_VALUE_NOT_FOUND';
      end if;
    end if;
  end loop;

  insert into public.transicoes_etapa (
    oportunidade_id,
    etapa_origem,
    etapa_destino,
    alterado_por,
    observacao
  )
  values (
    p_opportunity_id,
    p_expected_stage,
    p_next_stage,
    p_changed_by,
    null
  )
  returning id into v_transition_id;

  return query
  select
    v_transition_id,
    o.link_proposta,
    o.link_contrato
  from public.oportunidades o
  where o.id = p_opportunity_id;
end;
$$;

revoke all on function public.transition_opportunity_atomic(
  uuid,
  public.opportunity_stage,
  public.opportunity_stage,
  uuid,
  timestamptz,
  text,
  boolean,
  text,
  boolean,
  timestamptz,
  integer,
  timestamptz,
  jsonb,
  jsonb
) from public, anon, authenticated;

grant execute on function public.transition_opportunity_atomic(
  uuid,
  public.opportunity_stage,
  public.opportunity_stage,
  uuid,
  timestamptz,
  text,
  boolean,
  text,
  boolean,
  timestamptz,
  integer,
  timestamptz,
  jsonb,
  jsonb
) to service_role;

create or replace function public.delete_crm_lead_atomic(
  p_opportunity_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform 1
  from public.oportunidades
  where id = p_opportunity_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'OPPORTUNITY_NOT_FOUND';
  end if;

  if not exists (
    select 1
    from public.lead_intakes
    where oportunidade_id = p_opportunity_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'LEAD_NOT_CREATED_IN_CRM';
  end if;

  delete from public.field_values
  where entity_name = 'oportunidade'
    and entity_record_id = p_opportunity_id;

  -- As tabelas filhas usam ON DELETE CASCADE ou SET NULL no schema atual.
  delete from public.oportunidades
  where id = p_opportunity_id;

  return true;
end;
$$;

revoke all on function public.delete_crm_lead_atomic(uuid)
from public, anon, authenticated;

grant execute on function public.delete_crm_lead_atomic(uuid)
to service_role;
