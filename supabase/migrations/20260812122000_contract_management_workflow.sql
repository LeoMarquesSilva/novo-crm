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
    jsonb_build_object('version_id', p_version_id),
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

  if v_contract.oportunidade_id is not null then
    select etapa into v_stage
    from public.oportunidades
    where id = v_contract.oportunidade_id
    for update;
    if not p_advance_opportunity
      or v_stage is distinct from 'inclusao_faturamento'::public.opportunity_stage
    then
      raise exception using errcode = '40001', message = 'OPPORTUNITY_STAGE_CONFLICT';
    end if;
  end if;

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

  if v_contract.oportunidade_id is not null then
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

  return query select p_contract_id, p_version_id, v_contract.oportunidade_id, v_transition_id;
end;
$$;

revoke all on function public.activate_contract_version_atomic(
  uuid, uuid, uuid, timestamptz, boolean, timestamptz
) from public, anon, authenticated;

grant execute on function public.activate_contract_version_atomic(
  uuid, uuid, uuid, timestamptz, boolean, timestamptz
) to service_role;
