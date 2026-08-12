create or replace function public.ensure_contract_draft_for_opportunity(
  p_opportunity_id uuid,
  p_now timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_opportunity public.oportunidades;
  v_contract_id uuid;
  v_d4sign_document_id uuid;
begin
  select *
  into v_opportunity
  from public.oportunidades
  where id = p_opportunity_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'OPPORTUNITY_NOT_FOUND';
  end if;

  select id
  into v_d4sign_document_id
  from public.d4sign_documents
  where oportunidade_id = p_opportunity_id
  order by created_at desc, id desc
  limit 1;

  insert into public.contratos (
    cliente_id,
    oportunidade_id,
    titulo,
    link_documento,
    d4sign_document_id,
    status,
    status_assinatura,
    created_at,
    updated_at
  )
  values (
    v_opportunity.cliente_id,
    v_opportunity.id,
    coalesce(nullif(btrim(v_opportunity.solicitante_nome), ''), 'Contrato'),
    v_opportunity.link_contrato,
    v_d4sign_document_id,
    'rascunho'::public.contract_lifecycle_status,
    'assinado'::public.contract_status,
    p_now,
    p_now
  )
  on conflict (oportunidade_id) where oportunidade_id is not null
  do update set
    cliente_id = coalesce(contratos.cliente_id, excluded.cliente_id),
    link_documento = coalesce(contratos.link_documento, excluded.link_documento),
    d4sign_document_id = coalesce(contratos.d4sign_document_id, excluded.d4sign_document_id)
  returning id into v_contract_id;

  insert into public.contrato_versoes (
    contrato_id,
    numero,
    status,
    origem_snapshot,
    created_at,
    updated_at
  )
  values (
    v_contract_id,
    1,
    'rascunho'::public.contract_version_status,
    '{}'::jsonb,
    p_now,
    p_now
  )
  on conflict (contrato_id, numero) do nothing;

  return v_contract_id;
end;
$$;

revoke all on function public.ensure_contract_draft_for_opportunity(uuid, timestamptz)
from public, anon, authenticated;

grant execute on function public.ensure_contract_draft_for_opportunity(uuid, timestamptz)
to service_role;

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

  if p_next_stage = 'contrato_assinado'::public.opportunity_stage then
    perform public.ensure_contract_draft_for_opportunity(
      p_opportunity_id,
      p_updated_at
    );
  end if;

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

create or replace function public.finalize_d4sign_opportunity(
  p_opportunity_id uuid,
  p_signers jsonb,
  p_now timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_stage public.opportunity_stage;
  v_transition_id uuid;
begin
  select etapa
  into v_stage
  from public.oportunidades
  where id = p_opportunity_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'OPPORTUNITY_NOT_FOUND';
  end if;

  update public.oportunidades
  set
    d4sign_signers = p_signers,
    d4sign_updated_at = p_now,
    updated_at = p_now
  where id = p_opportunity_id;

  if v_stage = 'contrato_enviado'::public.opportunity_stage then
    update public.oportunidades
    set
      etapa = 'contrato_assinado'::public.opportunity_stage,
      updated_at = p_now
    where id = p_opportunity_id;

    insert into public.transicoes_etapa (
      oportunidade_id,
      etapa_origem,
      etapa_destino,
      alterado_por,
      observacao
    )
    values (
      p_opportunity_id,
      'contrato_enviado'::public.opportunity_stage,
      'contrato_assinado'::public.opportunity_stage,
      null,
      'Automático via webhook D4Sign (documento finalizado).'
    )
    returning id into v_transition_id;

    perform public.ensure_contract_draft_for_opportunity(
      p_opportunity_id,
      p_now
    );
  end if;

  return v_transition_id;
end;
$$;

revoke all on function public.finalize_d4sign_opportunity(uuid, jsonb, timestamptz)
from public, anon, authenticated;

grant execute on function public.finalize_d4sign_opportunity(uuid, jsonb, timestamptz)
to service_role;
