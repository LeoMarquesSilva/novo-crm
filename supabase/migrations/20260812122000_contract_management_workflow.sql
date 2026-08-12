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

create or replace function public.get_contract_billing_transition_state(
  p_opportunity_id uuid,
  p_on_date date
)
returns table (
  contract_id uuid,
  is_valid boolean,
  code text,
  reason text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with linked_contract as (
    select
      c.id as contract_id,
      c.status as contract_status,
      c.cliente_id,
      c.vigente_de as contract_vigente_de,
      c.vigente_ate as contract_vigente_ate,
      c.primeiro_vencimento,
      c.primeiro_faturamento_condicionado,
      v.id as version_id,
      v.status as version_status,
      v.vigente_de as version_vigente_de,
      v.vigente_ate as version_vigente_ate
    from public.contratos c
    left join public.contrato_versoes v
      on v.id = c.versao_ativa_id
     and v.contrato_id = c.id
    where c.oportunidade_id = p_opportunity_id
    limit 1
  ), evaluated as (
    select
      c.contract_id,
      coalesce(
        c.contract_status = 'ativo'::public.contract_lifecycle_status
        and c.version_status = 'ativa'::public.contract_version_status
        and c.cliente_id is not null
        and c.contract_vigente_de is not null
        and c.contract_vigente_de <= p_on_date
        and (c.contract_vigente_ate is null or c.contract_vigente_ate >= p_on_date)
        and (c.primeiro_vencimento is not null or c.primeiro_faturamento_condicionado)
        and c.version_vigente_de is not null
        and c.version_vigente_de <= p_on_date
        and (c.version_vigente_ate is null or c.version_vigente_ate >= p_on_date)
        and exists (
          select 1
          from public.contrato_responsaveis r
          where r.contrato_id = c.contract_id
        )
        and exists (
          select 1
          from public.contrato_componentes_cobranca cc
          where cc.versao_id = c.version_id
        ),
        false
      ) as is_valid
    from (select 1) seed
    left join linked_contract c on true
  )
  select
    e.contract_id,
    e.is_valid,
    case
      when e.is_valid then null
      when e.contract_id is null then 'contract_not_found'
      else 'contract_billing_setup_required'
    end,
    case
      when e.is_valid then null
      when e.contract_id is null then 'Contrato vinculado não encontrado.'
      else 'Configuração de faturamento incompleta ou fora da vigência.'
    end
  from evaluated e;
$$;

revoke all on function public.get_contract_billing_transition_state(uuid, date)
from public, anon, authenticated;

grant execute on function public.get_contract_billing_transition_state(uuid, date)
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

  if p_expected_stage = 'inclusao_faturamento'::public.opportunity_stage
    and p_next_stage = 'boas_vindas'::public.opportunity_stage
    and not exists (
      select 1
      from public.contratos c
      join public.contrato_versoes v
        on v.id = c.versao_ativa_id
       and v.contrato_id = c.id
      where c.oportunidade_id = p_opportunity_id
        and c.status = 'ativo'::public.contract_lifecycle_status
        and v.status = 'ativa'::public.contract_version_status
        and c.cliente_id is not null
        and c.vigente_de is not null
        and (c.primeiro_vencimento is not null or c.primeiro_faturamento_condicionado)
        and v.vigente_de is not null
        and exists (
          select 1 from public.contrato_responsaveis r where r.contrato_id = c.id
        )
        and exists (
          select 1
          from public.contrato_componentes_cobranca cc
          where cc.versao_id = v.id
        )
    )
  then
    raise exception using
      errcode = '55000',
      message = 'CONTRACT_BILLING_SETUP_REQUIRED';
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

alter table public.contratos
  add column if not exists primeiro_faturamento_condicionado boolean not null default false;

create or replace function public.save_contract_configuration_atomic(
  p_contract_id uuid,
  p_version_id uuid,
  p_expected_version_updated_at timestamptz,
  p_actor_id uuid,
  p_contract jsonb,
  p_configuration jsonb,
  p_now timestamptz
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_contract public.contratos;
  v_version public.contrato_versoes;
  v_stage public.opportunity_stage;
  v_area jsonb;
  v_component jsonb;
  v_installment jsonb;
  v_rule jsonb;
  v_responsible jsonb;
  v_inserted integer;
begin
  select * into v_version
  from public.contrato_versoes
  where id = p_version_id and contrato_id = p_contract_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'CONTRACT_NOT_FOUND';
  end if;

  select * into v_contract
  from public.contratos
  where id = p_contract_id
  for update;

  if v_version.status <> 'rascunho'::public.contract_version_status then
    raise exception using errcode = '55000', message = 'ACTIVE_CONTRACT_VERSION_IS_IMMUTABLE';
  end if;

  if v_version.updated_at is distinct from p_expected_version_updated_at then
    raise exception using errcode = '40001', message = 'CONTRACT_VERSION_CONFLICT';
  end if;

  if v_version.numero = 1 and v_contract.oportunidade_id is not null then
    select etapa into v_stage
    from public.oportunidades
    where id = v_contract.oportunidade_id
    for update;
    if v_stage is distinct from 'inclusao_faturamento'::public.opportunity_stage then
      raise exception using errcode = '40001', message = 'OPPORTUNITY_STAGE_CONFLICT';
    end if;
  end if;

  if nullif(btrim(p_contract ->> 'clientId'), '') is null
    or nullif(btrim(p_contract ->> 'startsAt'), '') is null
    or (
      nullif(btrim(p_contract ->> 'firstInvoiceAt'), '') is null
      and coalesce((p_contract ->> 'firstInvoiceConditioned')::boolean, false) = false
    )
    or jsonb_typeof(p_configuration -> 'responsibles') <> 'array'
    or jsonb_array_length(p_configuration -> 'responsibles') = 0
    or jsonb_typeof(p_configuration #> '{version,components}') <> 'array'
    or jsonb_array_length(p_configuration #> '{version,components}') = 0
  then
    raise exception using errcode = '22023', message = 'CONTRACT_CONFIGURATION_INVALID';
  end if;

  update public.contratos
  set cliente_id = (p_contract ->> 'clientId')::uuid,
      vigente_de = (p_contract ->> 'startsAt')::date,
      vigente_ate = nullif(p_configuration #>> '{version,effectiveTo}', '')::date,
      prazo_indeterminado = coalesce((p_contract ->> 'indefinite')::boolean, false),
      dia_vencimento = nullif(p_contract ->> 'dueDay', '')::integer,
      data_base_renovacao = nullif(p_contract ->> 'renewalDate', '')::date,
      data_alerta_renovacao = nullif(p_contract ->> 'renewalAlertDate', '')::date,
      indice_reajuste = nullif(btrim(p_contract ->> 'adjustmentIndex'), ''),
      primeiro_vencimento = nullif(p_contract ->> 'firstInvoiceAt', '')::date,
      primeiro_faturamento_condicionado = coalesce(
        (p_contract ->> 'firstInvoiceConditioned')::boolean,
        false
      ),
      atualizado_por = p_actor_id,
      updated_at = p_now
  where id = p_contract_id;

  delete from public.contrato_rateios_area where versao_id = p_version_id;
  delete from public.contrato_participacoes_socios where versao_id = p_version_id;
  delete from public.contrato_comissoes where versao_id = p_version_id;
  delete from public.contrato_componentes_cobranca where versao_id = p_version_id;
  delete from public.contrato_areas where versao_id = p_version_id;
  delete from public.contrato_responsaveis where contrato_id = p_contract_id;

  for v_responsible in
    select value from jsonb_array_elements(p_configuration -> 'responsibles')
  loop
    insert into public.contrato_responsaveis (
      contrato_id, papel, app_user_id, nome, email, created_at, updated_at
    )
    select p_contract_id,
           v_responsible ->> 'role',
           u.id,
           u.full_name,
           null,
           p_now,
           p_now
    from public.app_users u
    where u.id = (v_responsible ->> 'id')::uuid;
    get diagnostics v_inserted = row_count;
    if v_inserted <> 1 then
      raise exception using errcode = '22023', message = 'CONTRACT_CONFIGURATION_INVALID';
    end if;
  end loop;

  for v_area in
    select value from jsonb_array_elements(coalesce(p_configuration -> 'areas', '[]'::jsonb))
  loop
    insert into public.contrato_areas (
      id, versao_id, area_key, processos_incluidos, horas_incluidas,
      valor_excedente_processo, valor_excedente_hora, created_at, updated_at
    ) values (
      (v_area ->> 'id')::uuid,
      p_version_id,
      v_area ->> 'areaKey',
      nullif(v_area ->> 'includedProcesses', '')::numeric,
      nullif(v_area ->> 'includedHours', '')::numeric,
      nullif(v_area ->> 'processExcessRateCents', '')::numeric / 100,
      nullif(v_area ->> 'hourExcessRateCents', '')::numeric / 100,
      p_now,
      p_now
    );
  end loop;

  for v_component in
    select value from jsonb_array_elements(p_configuration #> '{version,components}')
  loop
    if (v_component ->> 'areaId') is not null and not exists (
      select 1 from public.contrato_areas
      where id = (v_component ->> 'areaId')::uuid and versao_id = p_version_id
    ) then
      raise exception using errcode = '22023', message = 'CONTRACT_CONFIGURATION_INVALID';
    end if;

    insert into public.contrato_componentes_cobranca (
      id, versao_id, area_id, tipo, descricao, periodo_inicio, periodo_fim,
      valor_fixo, valor_unitario, quantidade_incluida, percentual,
      modo_cobranca_variavel, liberacao_manual_necessaria, condicao_liberacao,
      tratamento_tributario, elegivel_rateio, elegivel_participacao,
      elegivel_comissao, created_at, updated_at
    ) values (
      (v_component ->> 'id')::uuid,
      p_version_id,
      nullif(v_component ->> 'areaId', '')::uuid,
      v_component ->> 'kind',
      v_component ->> 'description',
      (v_component ->> 'effectiveFrom')::date,
      nullif(v_component ->> 'effectiveTo', '')::date,
      nullif(v_component ->> 'amountCents', '')::numeric / 100,
      nullif(v_component ->> 'unitAmountCents', '')::numeric / 100,
      nullif(v_component ->> 'includedQuantity', '')::numeric,
      nullif(v_component ->> 'percentageBasisPoints', '')::numeric / 100,
      v_component ->> 'chargeMode',
      coalesce((v_component ->> 'requiresManualRelease')::boolean, false),
      v_component ->> 'reason',
      case when v_component ? 'tax' then (v_component -> 'tax')::text else null end,
      coalesce((v_component ->> 'areaAllocationEligible')::boolean, true),
      coalesce((v_component ->> 'partnerShareEligible')::boolean, true),
      coalesce((v_component ->> 'commissionEligible')::boolean, true),
      p_now,
      p_now
    );

    for v_installment in
      select value from jsonb_array_elements(coalesce(v_component -> 'installments', '[]'::jsonb))
    loop
      insert into public.contrato_parcelas (
        componente_id, numero, competencia, vencimento, valor, created_at, updated_at
      ) values (
        (v_component ->> 'id')::uuid,
        (v_installment ->> 'number')::integer,
        (v_installment ->> 'competency')::date,
        (v_installment ->> 'competency')::date,
        (v_installment ->> 'amountCents')::numeric / 100,
        p_now,
        p_now
      );
    end loop;
  end loop;

  for v_rule in
    select value from jsonb_array_elements(coalesce(p_configuration #> '{version,areaAllocations}', '[]'::jsonb))
  loop
    insert into public.contrato_rateios_area (
      id, versao_id, componente_id, area_id, modo, percentual, valor, created_at, updated_at
    ) values (
      (v_rule ->> 'id')::uuid,
      p_version_id,
      nullif(v_rule ->> 'componentId', '')::uuid,
      (v_rule ->> 'areaId')::uuid,
      v_rule ->> 'mode',
      nullif(v_rule ->> 'percentageBasisPoints', '')::numeric / 100,
      nullif(v_rule ->> 'amountCents', '')::numeric / 100,
      p_now,
      p_now
    );
  end loop;

  for v_rule in
    select value from jsonb_array_elements(coalesce(p_configuration #> '{version,partnerShares}', '[]'::jsonb))
  loop
    insert into public.contrato_participacoes_socios (
      id, versao_id, componente_id, socio_app_user_id, socio_nome,
      percentual, created_at, updated_at
    )
    select (v_rule ->> 'id')::uuid,
           p_version_id,
           nullif(v_rule ->> 'componentId', '')::uuid,
           u.id,
           u.full_name,
           (v_rule ->> 'percentageBasisPoints')::numeric / 100,
           p_now,
           p_now
    from public.app_users u
    where u.id = (v_rule ->> 'beneficiaryId')::uuid;
    get diagnostics v_inserted = row_count;
    if v_inserted <> 1 then
      raise exception using errcode = '22023', message = 'CONTRACT_CONFIGURATION_INVALID';
    end if;
  end loop;

  for v_rule in
    select value from jsonb_array_elements(coalesce(p_configuration #> '{version,commissions}', '[]'::jsonb))
  loop
    insert into public.contrato_comissoes (
      id, versao_id, componente_id, beneficiario_app_user_id, beneficiario_nome,
      percentual, valor, base_calculo, created_at, updated_at
    )
    select (v_rule ->> 'id')::uuid,
           p_version_id,
           nullif(v_rule ->> 'componentId', '')::uuid,
           u.id,
           u.full_name,
           nullif(v_rule ->> 'percentageBasisPoints', '')::numeric / 100,
           nullif(v_rule ->> 'amountCents', '')::numeric / 100,
           v_rule ->> 'mode',
           p_now,
           p_now
    from public.app_users u
    where u.id = (v_rule ->> 'beneficiaryId')::uuid;
    get diagnostics v_inserted = row_count;
    if v_inserted <> 1 then
      raise exception using errcode = '22023', message = 'CONTRACT_CONFIGURATION_INVALID';
    end if;
  end loop;

  update public.contrato_versoes
  set vigente_de = (p_configuration #>> '{version,effectiveFrom}')::date,
      vigente_ate = nullif(p_configuration #>> '{version,effectiveTo}', '')::date,
      atualizado_por = p_actor_id,
      updated_at = p_now
  where id = p_version_id;

  insert into public.contrato_eventos (
    contrato_id, tipo, titulo, detalhe, ator_app_user_id, origem,
    metadados_snapshot, created_at, updated_at
  ) values (
    p_contract_id,
    'configuracao_salva',
    'Configuração contratual salva',
    'Versão em rascunho atualizada.',
    p_actor_id,
    'gerenciador_contratos',
    jsonb_build_object(
      'version_id', p_version_id,
      'substitution_evidence', coalesce(p_configuration -> 'substitutionEvidence', '[]'::jsonb)
    ),
    p_now,
    p_now
  );

  return p_now;
exception
  when check_violation or foreign_key_violation or unique_violation
    or not_null_violation or invalid_text_representation
  then
    raise exception using errcode = '22023', message = 'CONTRACT_CONFIGURATION_INVALID';
end;
$$;

revoke all on function public.save_contract_configuration_atomic(
  uuid, uuid, timestamptz, uuid, jsonb, jsonb, timestamptz
) from public, anon, authenticated;

grant execute on function public.save_contract_configuration_atomic(
  uuid, uuid, timestamptz, uuid, jsonb, jsonb, timestamptz
) to service_role;

create or replace function public.activate_contract_version_atomic(
  p_contract_id uuid,
  p_version_id uuid,
  p_actor_id uuid,
  p_expected_version_updated_at timestamptz,
  p_advance_opportunity boolean,
  p_now timestamptz
)
returns table (
  contract_id uuid,
  version_id uuid,
  opportunity_id uuid,
  opportunity_transition_id uuid
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_contract public.contratos;
  v_version public.contrato_versoes;
  v_stage public.opportunity_stage;
  v_transition_id uuid;
  v_has_prior_activation boolean;
begin
  select * into v_version
  from public.contrato_versoes
  where id = p_version_id and contrato_id = p_contract_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'CONTRACT_NOT_FOUND';
  end if;

  select * into v_contract
  from public.contratos
  where id = p_contract_id
  for update;

  if v_version.status <> 'rascunho'::public.contract_version_status then
    raise exception using errcode = '55000', message = 'ACTIVE_CONTRACT_VERSION_IS_IMMUTABLE';
  end if;
  if v_version.updated_at is distinct from p_expected_version_updated_at then
    raise exception using errcode = '40001', message = 'CONTRACT_VERSION_CONFLICT';
  end if;
  if v_contract.cliente_id is null
    or v_contract.vigente_de is null
    or (v_contract.primeiro_vencimento is null and not v_contract.primeiro_faturamento_condicionado)
    or v_version.vigente_de is null
    or not exists (select 1 from public.contrato_responsaveis where contrato_id = p_contract_id)
    or not exists (select 1 from public.contrato_componentes_cobranca where versao_id = p_version_id)
  then
    raise exception using errcode = '22023', message = 'CONTRACT_CONFIGURATION_INVALID';
  end if;

  v_has_prior_activation := (
    v_contract.status = 'ativo'::public.contract_lifecycle_status
    or v_contract.versao_ativa_id is not null
  );

  if v_contract.oportunidade_id is not null
    and not v_has_prior_activation
    and not p_advance_opportunity
  then
    raise exception using errcode = '40001', message = 'OPPORTUNITY_STAGE_CONFLICT';
  end if;

  if v_contract.oportunidade_id is not null and p_advance_opportunity then
    select etapa into v_stage
    from public.oportunidades
    where id = v_contract.oportunidade_id
    for update;
    if v_stage is distinct from 'inclusao_faturamento'::public.opportunity_stage then
      raise exception using errcode = '40001', message = 'OPPORTUNITY_STAGE_CONFLICT';
    end if;
  end if;

  -- Uma ativação posterior encerra o snapshot anterior na véspera, preservando
  -- os IDs já gravados em fechamentos históricos.
  perform set_config('app.contract_version_rpc', 'on', true);
  update public.contrato_versoes
  set status = 'substituida'::public.contract_version_status,
      vigente_ate = v_version.vigente_de - 1,
      substituida_em = p_now,
      substituida_por = p_actor_id,
      atualizado_por = p_actor_id,
      updated_at = p_now
  where contrato_id = p_contract_id
    and status = 'ativa'::public.contract_version_status
    and id <> p_version_id;

  update public.contrato_versoes
  set status = 'ativa'::public.contract_version_status,
      ativada_em = p_now,
      ativada_por = p_actor_id,
      atualizado_por = p_actor_id,
      updated_at = p_now
  where id = p_version_id;

  update public.contratos
  set status = 'ativo'::public.contract_lifecycle_status,
      versao_ativa_id = p_version_id,
      ativado_em = p_now,
      ativado_por = p_actor_id,
      atualizado_por = p_actor_id,
      updated_at = p_now
  where id = p_contract_id;

  if v_contract.oportunidade_id is not null and p_advance_opportunity then
    update public.oportunidades
    set etapa = 'boas_vindas'::public.opportunity_stage,
        updated_at = p_now
    where id = v_contract.oportunidade_id;

    insert into public.transicoes_etapa (
      oportunidade_id, etapa_origem, etapa_destino, alterado_por, observacao
    ) values (
      v_contract.oportunidade_id,
      'inclusao_faturamento'::public.opportunity_stage,
      'boas_vindas'::public.opportunity_stage,
      p_actor_id,
      'Contrato ativado pelo gerenciador de contratos.'
    ) returning id into v_transition_id;
  end if;

  insert into public.contrato_eventos (
    contrato_id, tipo, titulo, detalhe, ator_app_user_id, origem,
    metadados_snapshot, created_at, updated_at
  ) values (
    p_contract_id,
    'versao_ativada',
    'Versão contratual ativada',
    'Contrato ativado e configuração tornada imutável.',
    p_actor_id,
    'gerenciador_contratos',
    jsonb_build_object(
      'version_id', p_version_id,
      'opportunity_transition_id', v_transition_id
    ),
    p_now,
    p_now
  );

  if v_contract.versao_ativa_id is not null and v_contract.versao_ativa_id <> p_version_id then
    insert into public.contrato_eventos (
      contrato_id, tipo, titulo, detalhe, ator_app_user_id, origem,
      metadados_snapshot, created_at, updated_at
    ) values (
      p_contract_id, 'versao_substituida', 'Versão contratual substituída',
      'A versão anterior foi encerrada na véspera da nova vigência.', p_actor_id,
      'gerenciador_contratos', jsonb_build_object(
        'previous_version_id', v_contract.versao_ativa_id,
        'version_id', p_version_id,
        'effective_from', v_version.vigente_de
      ), p_now, p_now
    );
  end if;

  return query select p_contract_id, p_version_id, v_contract.oportunidade_id, v_transition_id;
end;
$$;

revoke all on function public.activate_contract_version_atomic(
  uuid, uuid, uuid, timestamptz, boolean, timestamptz
) from public, anon, authenticated;

grant execute on function public.activate_contract_version_atomic(
  uuid, uuid, uuid, timestamptz, boolean, timestamptz
) to service_role;

create or replace function public.create_contract_closing_revision(
  p_contract_id uuid, p_version_id uuid, p_competencia date,
  p_expected_revision integer, p_actor_id uuid, p_totals jsonb, p_items jsonb
)
returns table (closing_id uuid, revision_id uuid, revision_number integer)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_contract public.contratos;
  v_closing public.contrato_fechamentos;
  v_current public.contrato_fechamento_revisoes;
  v_revision_id uuid;
  v_item jsonb;
  v_next integer;
begin
  select * into v_contract from public.contratos where id = p_contract_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'CONTRACT_NOT_FOUND'; end if;
  if v_contract.status <> 'ativo'::public.contract_lifecycle_status then
    raise exception using errcode = '55000', message = 'CONTRACT_NOT_ACTIVE';
  end if;
  if not exists (
    select 1 from public.contrato_versoes
    where id = p_version_id and contrato_id = p_contract_id
      and status = 'ativa'::public.contract_version_status
      and vigente_de <= p_competencia and (vigente_ate is null or vigente_ate >= p_competencia)
  ) then raise exception using errcode = 'P0002', message = 'CONTRACT_VERSION_NOT_FOUND'; end if;

  insert into public.contrato_fechamentos
    (contrato_id, versao_id, competencia, status, preparado_em, preparado_por)
  values (p_contract_id, p_version_id, p_competencia, 'a_calcular', now(), p_actor_id)
  on conflict (contrato_id, competencia) do nothing;

  select * into v_closing from public.contrato_fechamentos
  where contrato_id = p_contract_id and competencia = p_competencia for update;
  if v_closing.versao_id <> p_version_id then
    raise exception using errcode = '40001', message = 'CONTRACT_VERSION_CONFLICT';
  end if;
  if v_closing.revisao_atual_id is not null then
    select * into v_current from public.contrato_fechamento_revisoes
    where id = v_closing.revisao_atual_id for update;
  end if;
  if coalesce(v_current.numero, 0) <> p_expected_revision then
    raise exception using errcode = '40001', message = 'CLOSING_REVISION_CONFLICT';
  end if;
  if v_current.status in ('aprovado', 'lancado_vios') then
    raise exception using errcode = '55000', message = 'APPROVED_CLOSING_IMMUTABLE';
  end if;

  v_next := coalesce(v_current.numero, 0) + 1;
  insert into public.contrato_fechamento_revisoes (
    fechamento_id, numero, revisao_anterior_id, status,
    total_honorarios, total_tributos, total_reembolsos, total_geral,
    calculada_em, calculada_por
  ) values (
    v_closing.id, v_next, v_current.id, 'em_revisao',
    coalesce((p_totals->>'honorariosCents')::numeric, 0) / 100,
    coalesce((p_totals->>'tributosCents')::numeric, 0) / 100,
    coalesce((p_totals->>'reembolsosCents')::numeric, 0) / 100,
    coalesce((p_totals->>'totalCents')::numeric, 0) / 100,
    now(), p_actor_id
  ) returning id into v_revision_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into public.contrato_fechamento_itens (
      revisao_id, tipo, componente_id, area_id, descricao, quantidade, tarifa,
      percentual, valor, bloqueante, bloqueio_tipo, bloqueio_descricao, metadados
    ) values (
      v_revision_id, coalesce(v_item->>'kind', 'memory'),
      nullif(v_item->>'componentId', '')::uuid,
      case when v_item->>'kind' = 'area_allocation' then nullif(v_item->>'beneficiaryId', '')::uuid else null end,
      coalesce(v_item->>'description', v_item->>'kind', 'Item'),
      nullif(v_item->>'quantity', '')::numeric,
      nullif(v_item->>'unitAmountCents', '')::numeric / 100,
      nullif(v_item->>'percentageBasisPoints', '')::numeric / 100,
      coalesce(nullif(v_item->>'amountCents', '')::numeric, 0) / 100,
      coalesce((v_item->>'blocking')::boolean, false),
      v_item->>'blockerCode', case when coalesce((v_item->>'blocking')::boolean, false) then v_item->>'description' end,
      v_item
    );
  end loop;

  update public.contrato_fechamentos set revisao_atual_id = v_revision_id,
    status = 'em_revisao', preparado_em = now(), preparado_por = p_actor_id
  where id = v_closing.id;
  return query select v_closing.id, v_revision_id, v_next;
end;
$$;

create or replace function public.approve_contract_closing_revision(
  p_contract_id uuid, p_closing_id uuid, p_expected_revision integer, p_actor_id uuid
)
returns public.contrato_fechamento_revisoes
language plpgsql security invoker set search_path = ''
as $$
declare v_closing public.contrato_fechamentos; v_revision public.contrato_fechamento_revisoes;
begin
  select * into v_closing from public.contrato_fechamentos where id = p_closing_id and contrato_id = p_contract_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'CLOSING_NOT_FOUND'; end if;
  select * into v_revision from public.contrato_fechamento_revisoes where id = v_closing.revisao_atual_id for update;
  if v_revision.numero <> p_expected_revision then raise exception using errcode = '40001', message = 'CLOSING_REVISION_CONFLICT'; end if;
  if v_revision.status <> 'em_revisao' then raise exception using errcode = '55000', message = 'CLOSING_NOT_REVIEWABLE'; end if;
  if exists (select 1 from public.contrato_fechamento_itens where revisao_id = v_revision.id and bloqueante and resolvido_em is null) then
    raise exception using errcode = '22023', message = 'CLOSING_HAS_UNRESOLVED_BLOCKERS';
  end if;
  update public.contrato_fechamento_revisoes set status='aprovado', aprovada_em=now(), aprovada_por=p_actor_id
  where id=v_revision.id returning * into v_revision;
  update public.contrato_fechamentos set status='aprovado' where id=v_closing.id;
  return v_revision;
end;
$$;

create or replace function public.create_contract_closing_correction(
  p_contract_id uuid, p_closing_id uuid, p_previous_revision_id uuid, p_expected_revision integer,
  p_reason text, p_actor_id uuid
)
returns public.contrato_fechamento_revisoes
language plpgsql security invoker set search_path = ''
as $$
declare v_closing public.contrato_fechamentos; v_previous public.contrato_fechamento_revisoes; v_new public.contrato_fechamento_revisoes;
begin
  if nullif(btrim(p_reason),'') is null then raise exception using errcode='22023', message='CORRECTION_REASON_REQUIRED'; end if;
  select * into v_closing from public.contrato_fechamentos where id=p_closing_id and contrato_id=p_contract_id for update;
  if not found then raise exception using errcode='P0002', message='CLOSING_NOT_FOUND'; end if;
  select * into v_previous from public.contrato_fechamento_revisoes where id=p_previous_revision_id and fechamento_id=p_closing_id for update;
  if not found or v_closing.revisao_atual_id <> v_previous.id then raise exception using errcode='40001', message='CLOSING_REVISION_CONFLICT'; end if;
  if v_previous.numero <> p_expected_revision then raise exception using errcode='40001', message='CLOSING_REVISION_CONFLICT'; end if;
  if v_previous.status not in ('aprovado','lancado_vios') then raise exception using errcode='55000', message='CLOSING_CORRECTION_REQUIRES_APPROVED_REVISION'; end if;
  insert into public.contrato_fechamento_revisoes (
    fechamento_id, numero, revisao_anterior_id, status, total_honorarios,
    total_tributos, total_reembolsos, total_geral, calculada_em, calculada_por, motivo_correcao
  ) values (
    p_closing_id, v_previous.numero+1, v_previous.id, 'em_revisao', v_previous.total_honorarios,
    v_previous.total_tributos, v_previous.total_reembolsos, v_previous.total_geral, now(), p_actor_id, btrim(p_reason)
  ) returning * into v_new;
  insert into public.contrato_fechamento_itens (
    revisao_id,tipo,componente_id,area_id,descricao,quantidade,tarifa,percentual,valor,
    elegivel_rateio,elegivel_participacao,elegivel_comissao,bloqueante,bloqueio_tipo,bloqueio_descricao,metadados
  ) select v_new.id,tipo,componente_id,area_id,descricao,quantidade,tarifa,percentual,valor,
    elegivel_rateio,elegivel_participacao,elegivel_comissao,bloqueante,bloqueio_tipo,bloqueio_descricao,metadados
  from public.contrato_fechamento_itens where revisao_id=v_previous.id;
  update public.contrato_fechamentos set revisao_atual_id=v_new.id,status='em_revisao' where id=p_closing_id;
  return v_new;
end;
$$;

create or replace function public.register_contract_closing_vios(
  p_contract_id uuid, p_closing_id uuid, p_expected_revision integer, p_reference text, p_url text, p_actor_id uuid
)
returns public.contrato_fechamento_revisoes
language plpgsql security invoker set search_path = ''
as $$
declare v_closing public.contrato_fechamentos; v_revision public.contrato_fechamento_revisoes;
begin
  if nullif(btrim(p_reference),'') is null then raise exception using errcode='22023', message='VIOS_REFERENCE_REQUIRED'; end if;
  select * into v_closing from public.contrato_fechamentos where id=p_closing_id and contrato_id=p_contract_id for update;
  if not found then raise exception using errcode='P0002', message='CLOSING_NOT_FOUND'; end if;
  select * into v_revision from public.contrato_fechamento_revisoes where id=v_closing.revisao_atual_id for update;
  if v_revision.numero <> p_expected_revision then raise exception using errcode='40001', message='CLOSING_REVISION_CONFLICT'; end if;
  if v_revision.status <> 'aprovado' then raise exception using errcode='55000', message='CLOSING_NOT_APPROVED'; end if;
  perform set_config('app.contract_closing_vios_rpc','on',true);
  update public.contrato_fechamento_revisoes set status='lancado_vios',vios_referencia=btrim(p_reference),
    vios_url=nullif(btrim(p_url),''),lancada_vios_em=now(),lancada_vios_por=p_actor_id
  where id=v_revision.id returning * into v_revision;
  update public.contrato_fechamentos set status='lancado_vios' where id=p_closing_id;
  return v_revision;
end;
$$;

create or replace function public.resolve_contract_closing_blocker(
  p_contract_id uuid, p_closing_id uuid, p_item_id uuid, p_expected_revision integer,
  p_resolution text, p_reason text, p_actor_id uuid
)
returns public.contrato_fechamento_itens
language plpgsql security invoker set search_path = ''
as $$
declare v_closing public.contrato_fechamentos; v_revision public.contrato_fechamento_revisoes; v_item public.contrato_fechamento_itens;
begin
  if p_resolution not in ('nao_cobrar','ajuste','aditivo') or nullif(btrim(p_reason),'') is null then
    raise exception using errcode='22023', message='BLOCKER_RESOLUTION_INVALID';
  end if;
  select * into v_closing from public.contrato_fechamentos where id=p_closing_id and contrato_id=p_contract_id for update;
  if not found then raise exception using errcode='P0002', message='CLOSING_NOT_FOUND'; end if;
  select * into v_revision from public.contrato_fechamento_revisoes where id=v_closing.revisao_atual_id for update;
  if v_revision.numero <> p_expected_revision then raise exception using errcode='40001', message='CLOSING_REVISION_CONFLICT'; end if;
  if v_revision.status <> 'em_revisao' then raise exception using errcode='55000', message='CLOSING_NOT_REVIEWABLE'; end if;
  update public.contrato_fechamento_itens set resolucao=p_resolution||': '||btrim(p_reason),
    resolvido_em=now(), resolvido_por=p_actor_id
  where id=p_item_id and revisao_id=v_revision.id and bloqueante and resolvido_em is null
  returning * into v_item;
  if not found then raise exception using errcode='P0002', message='BLOCKER_NOT_FOUND'; end if;
  return v_item;
end;
$$;

create or replace function public.upsert_contract_consumptions_atomic(
  p_contract_id uuid, p_version_id uuid, p_competencia date, p_actor_id uuid, p_items jsonb
)
returns setof public.contrato_consumos_mensais
language plpgsql security invoker set search_path = ''
as $$
declare v_item jsonb; v_id uuid; v_closing public.contrato_fechamentos;
begin
  select * into v_closing from public.contrato_fechamentos
  where contrato_id=p_contract_id and competencia=p_competencia for update;
  if found and v_closing.status in ('aprovado','lancado_vios') then
    raise exception using errcode='55000', message='APPROVED_CLOSING_IMMUTABLE';
  end if;
  if not exists (select 1 from public.contrato_versoes where id=p_version_id and contrato_id=p_contract_id) then
    raise exception using errcode='P0002', message='CONTRACT_VERSION_NOT_FOUND';
  end if;
  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_id := coalesce(nullif(v_item->>'id','')::uuid, gen_random_uuid());
    if exists (select 1 from public.contrato_consumos_mensais where id=v_id and (contrato_id<>p_contract_id or versao_id<>p_version_id) for update) then
      raise exception using errcode='42501', message='CONSUMPTION_SCOPE_CONFLICT';
    end if;
    if nullif(v_item->>'componentId','') is not null and not exists (
      select 1 from public.contrato_componentes_cobranca where id=(v_item->>'componentId')::uuid and versao_id=p_version_id
    ) then raise exception using errcode='22023', message='INVALID_CONTRACT_MEMBERSHIP'; end if;
    if nullif(v_item->>'areaId','') is not null and not exists (
      select 1 from public.contrato_areas where id=(v_item->>'areaId')::uuid and versao_id=p_version_id
    ) then raise exception using errcode='22023', message='INVALID_CONTRACT_MEMBERSHIP'; end if;
    insert into public.contrato_consumos_mensais(id,contrato_id,versao_id,competencia,componente_id,area_id,tipo,quantidade,valor,evidencia_url,observacao,informado_por)
    values(v_id,p_contract_id,p_version_id,p_competencia,nullif(v_item->>'componentId','')::uuid,nullif(v_item->>'areaId','')::uuid,
      v_item->>'kind',nullif(v_item->>'quantity','')::numeric,nullif(v_item->>'amount','')::numeric,v_item->>'evidenceUrl',v_item->>'note',p_actor_id)
    on conflict(id) do update set componente_id=excluded.componente_id,area_id=excluded.area_id,tipo=excluded.tipo,
      quantidade=excluded.quantidade,valor=excluded.valor,evidencia_url=excluded.evidencia_url,observacao=excluded.observacao,
      informado_por=excluded.informado_por,updated_at=now();
  end loop;
  return query select * from public.contrato_consumos_mensais where contrato_id=p_contract_id and versao_id=p_version_id and competencia=p_competencia order by created_at;
end;
$$;

revoke all on function public.create_contract_closing_revision(uuid,uuid,date,integer,uuid,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.approve_contract_closing_revision(uuid,uuid,integer,uuid) from public, anon, authenticated;
revoke all on function public.create_contract_closing_correction(uuid,uuid,uuid,integer,text,uuid) from public, anon, authenticated;
revoke all on function public.register_contract_closing_vios(uuid,uuid,integer,text,text,uuid) from public, anon, authenticated;
revoke all on function public.resolve_contract_closing_blocker(uuid,uuid,uuid,integer,text,text,uuid) from public, anon, authenticated;
revoke all on function public.upsert_contract_consumptions_atomic(uuid,uuid,date,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.create_contract_closing_revision(uuid,uuid,date,integer,uuid,jsonb,jsonb) to service_role;
grant execute on function public.approve_contract_closing_revision(uuid,uuid,integer,uuid) to service_role;
grant execute on function public.create_contract_closing_correction(uuid,uuid,uuid,integer,text,uuid) to service_role;
grant execute on function public.register_contract_closing_vios(uuid,uuid,integer,text,text,uuid) to service_role;
grant execute on function public.resolve_contract_closing_blocker(uuid,uuid,uuid,integer,text,text,uuid) to service_role;
grant execute on function public.upsert_contract_consumptions_atomic(uuid,uuid,date,uuid,jsonb) to service_role;

-- Garante que retries concorrentes do cron/transição criem uma única notificação por usuário e intenção.
alter table public.crm_in_app_notifications
  add column if not exists idempotency_key text;

create unique index if not exists crm_in_app_notifications_user_intent_key
  on public.crm_in_app_notifications (user_id, idempotency_key);

-- Versões posteriores substituem snapshots ativos somente por este fluxo auditado.
create or replace function public.guard_active_contract_version_immutability()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'ativa'::public.contract_version_status
    and current_setting('app.contract_version_rpc', true) is distinct from 'on'
  then
    raise exception using errcode = '55000', message = 'ACTIVE_CONTRACT_VERSION_IS_IMMUTABLE';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.manage_contract_version_atomic(
  p_contract_id uuid, p_actor_id uuid, p_action jsonb, p_now timestamptz
)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_contract public.contratos;
  v_source public.contrato_versoes;
  v_new_id uuid;
  v_effective date;
  v_addendum_id uuid;
  v_area record;
  v_component record;
  v_new_area_id uuid;
  v_new_component_id uuid;
  v_area_map jsonb := '{}'::jsonb;
  v_component_map jsonb := '{}'::jsonb;
  v_reason text;
  v_ended_at date;
  v_status public.contract_lifecycle_status;
begin
  select * into v_contract from public.contratos where id=p_contract_id for update;
  if not found then raise exception using errcode='P0002', message='CONTRACT_NOT_FOUND'; end if;

  if p_action->>'action' = 'clone_draft' then
    v_effective := nullif(p_action->>'effectiveFrom','')::date;
    v_addendum_id := nullif(p_action->>'addendumId','')::uuid;
    select * into v_source from public.contrato_versoes
      where id=(p_action->>'sourceVersionId')::uuid and contrato_id=p_contract_id for update;
    if not found then raise exception using errcode='P0002', message='CONTRACT_VERSION_NOT_FOUND'; end if;
    if v_effective is null or (v_source.vigente_de is not null and v_effective <= v_source.vigente_de) then
      raise exception using errcode='22023', message='CONTRACT_VERSION_PERIOD_INVALID';
    end if;
    if exists (
      select 1 from public.contrato_versoes
      where contrato_id=p_contract_id and id<>v_source.id
        and status in ('rascunho','ativa')
        and daterange(vigente_de,coalesce(vigente_ate,'infinity'::date),'[]')
          && daterange(v_effective,coalesce(v_source.vigente_ate,'infinity'::date),'[]')
    ) then raise exception using errcode='23P01', message='CONTRACT_VERSION_OVERLAP'; end if;
    if v_addendum_id is not null and not exists (
      select 1 from public.aditivos where id=v_addendum_id and contrato_base_id=p_contract_id for update
    ) then raise exception using errcode='P0002', message='CONTRACT_ADDENDUM_NOT_FOUND'; end if;

    insert into public.contrato_versoes(contrato_id,numero,status,vigente_de,vigente_ate,origem_snapshot,criado_por,atualizado_por,created_at,updated_at)
    values(p_contract_id,(select coalesce(max(numero),0)+1 from public.contrato_versoes where contrato_id=p_contract_id),
      'rascunho',v_effective,v_source.vigente_ate,
      v_source.origem_snapshot || jsonb_build_object('source_version_id',v_source.id,'cloned_at',p_now),
      p_actor_id,p_actor_id,p_now,p_now) returning id into v_new_id;

    for v_area in select * from public.contrato_areas where versao_id=v_source.id order by created_at,id loop
      v_new_area_id := gen_random_uuid();
      v_area_map := v_area_map || jsonb_build_object(v_area.id::text,v_new_area_id);
      insert into public.contrato_areas(id,versao_id,area_key,processos_incluidos,horas_incluidas,valor_excedente_processo,
        valor_excedente_hora,valor_km,acompanha_processos,acompanha_horas,observacoes,created_at,updated_at)
      values(v_new_area_id,v_new_id,v_area.area_key,v_area.processos_incluidos,v_area.horas_incluidas,v_area.valor_excedente_processo,
        v_area.valor_excedente_hora,v_area.valor_km,v_area.acompanha_processos,v_area.acompanha_horas,v_area.observacoes,p_now,p_now);
    end loop;

    for v_component in select * from public.contrato_componentes_cobranca where versao_id=v_source.id order by ordem,created_at,id loop
      v_new_component_id := gen_random_uuid();
      v_component_map := v_component_map || jsonb_build_object(v_component.id::text,v_new_component_id);
      insert into public.contrato_componentes_cobranca(id,versao_id,area_id,grupo_faixa_id,tipo,descricao,recorrencia,periodo_inicio,periodo_fim,
        valor_fixo,valor_unitario,quantidade_incluida,percentual,base_calculo,modo_cobranca_variavel,liberacao_manual_necessaria,
        condicao_liberacao,tratamento_tributario,elegivel_rateio,elegivel_participacao,elegivel_comissao,ordem,created_at,updated_at)
      values(v_new_component_id,v_new_id,(v_area_map->>v_component.area_id::text)::uuid,v_component.grupo_faixa_id,v_component.tipo,
        v_component.descricao,v_component.recorrencia,greatest(v_component.periodo_inicio,v_effective),v_component.periodo_fim,
        v_component.valor_fixo,v_component.valor_unitario,v_component.quantidade_incluida,v_component.percentual,v_component.base_calculo,
        v_component.modo_cobranca_variavel,v_component.liberacao_manual_necessaria,v_component.condicao_liberacao,
        v_component.tratamento_tributario,v_component.elegivel_rateio,v_component.elegivel_participacao,v_component.elegivel_comissao,
        v_component.ordem,p_now,p_now);
      insert into public.contrato_parcelas(componente_id,numero,competencia,vencimento,valor,created_at,updated_at)
        select v_new_component_id,numero,competencia,vencimento,valor,p_now,p_now from public.contrato_parcelas where componente_id=v_component.id;
    end loop;

    insert into public.contrato_rateios_area(versao_id,componente_id,area_id,modo,percentual,valor,created_at,updated_at)
      select v_new_id,(v_component_map->>componente_id::text)::uuid,(v_area_map->>area_id::text)::uuid,modo,percentual,valor,p_now,p_now
      from public.contrato_rateios_area where versao_id=v_source.id;
    insert into public.contrato_participacoes_socios(versao_id,componente_id,socio_app_user_id,socio_nome,percentual,regra_sugerida,override_motivo,created_at,updated_at)
      select v_new_id,(v_component_map->>componente_id::text)::uuid,socio_app_user_id,socio_nome,percentual,regra_sugerida,override_motivo,p_now,p_now
      from public.contrato_participacoes_socios where versao_id=v_source.id;
    insert into public.contrato_comissoes(versao_id,componente_id,beneficiario_app_user_id,beneficiario_nome,percentual,valor,periodo_inicio,periodo_fim,base_calculo,motivo,created_at,updated_at)
      select v_new_id,(v_component_map->>componente_id::text)::uuid,beneficiario_app_user_id,beneficiario_nome,percentual,valor,
        periodo_inicio,periodo_fim,base_calculo,motivo,p_now,p_now from public.contrato_comissoes where versao_id=v_source.id;

    if v_addendum_id is not null then
      update public.aditivos set versao_origem_id=v_source.id,versao_resultante_id=v_new_id,updated_at=p_now where id=v_addendum_id;
    end if;
    insert into public.contrato_eventos(contrato_id,tipo,titulo,detalhe,ator_app_user_id,origem,metadados_snapshot,created_at,updated_at)
      values(p_contract_id,'versao_clonada','Nova versão contratual em rascunho','Configuração normalizada clonada sem alterar fechamentos históricos.',
        p_actor_id,'gerenciador_contratos',jsonb_build_object('source_version_id',v_source.id,'version_id',v_new_id,'addendum_id',v_addendum_id),p_now,p_now);
    return jsonb_build_object('contractId',p_contract_id,'versionId',v_new_id,'status','rascunho');
  end if;

  v_reason := nullif(btrim(p_action->>'reason'),'');
  if v_reason is null then raise exception using errcode='22023', message='CONTRACT_LIFECYCLE_REASON_REQUIRED'; end if;
  if p_action->>'action' = 'suspend_contract' then v_status := 'suspenso';
  elsif p_action->>'action' = 'resume_contract' then v_status := 'ativo';
  elsif p_action->>'action' = 'end_contract' then
    v_status := 'encerrado'; v_ended_at := nullif(p_action->>'endedAt','')::date;
    if v_ended_at is null then raise exception using errcode='22023', message='CONTRACT_VERSION_PERIOD_INVALID'; end if;
  else raise exception using errcode='22023', message='CONTRACT_VERSION_ACTION_INVALID'; end if;

  update public.contratos set status=v_status,vigente_ate=coalesce(v_ended_at,vigente_ate),
    suspenso_em=case when v_status='suspenso' then p_now else suspenso_em end,
    suspenso_por=case when v_status='suspenso' then p_actor_id else suspenso_por end,
    encerrado_em=case when v_status='encerrado' then p_now else encerrado_em end,
    encerrado_por=case when v_status='encerrado' then p_actor_id else encerrado_por end,
    atualizado_por=p_actor_id,updated_at=p_now where id=p_contract_id;
  insert into public.contrato_eventos(contrato_id,tipo,titulo,detalhe,ator_app_user_id,origem,metadados_snapshot,created_at,updated_at)
    values(p_contract_id,case v_status when 'suspenso' then 'contrato_suspenso' when 'ativo' then 'contrato_retomado' else 'contrato_encerrado' end,
      case v_status when 'suspenso' then 'Contrato suspenso' when 'ativo' then 'Contrato retomado' else 'Contrato encerrado' end,
      v_reason,p_actor_id,'gerenciador_contratos',jsonb_build_object('ended_at',v_ended_at),p_now,p_now);
  return jsonb_build_object('contractId',p_contract_id,'status',v_status);
end;
$$;

revoke all on function public.manage_contract_version_atomic(uuid,uuid,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.manage_contract_version_atomic(uuid,uuid,jsonb,timestamptz) to service_role;
