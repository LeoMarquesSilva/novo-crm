-- Parcelas do preço fechado com vencimento próprio (ex.: dia 20 de cada mês), em vez do
-- 1º dia da competência. O assistente de configuração envia `dueDate` em cada parcela;
-- sem ele, o vencimento continua sendo a competência.
-- Mesma função de 20260812122000_contract_management_workflow.sql; só muda o vencimento.

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
        coalesce(nullif(v_installment ->> 'dueDate', '')::date, (v_installment ->> 'competency')::date),
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

  if jsonb_array_length(coalesce(p_configuration -> 'substitutionEvidence', '[]'::jsonb)) > 0 then
    insert into public.contrato_eventos (
      contrato_id, tipo, titulo, detalhe, ator_app_user_id, origem,
      metadados_snapshot, created_at, updated_at
    ) values (
      p_contract_id, 'override_registrado', 'Override de configuração registrado',
      'Valores sugeridos foram substituídos com justificativa.', p_actor_id,
      'gerenciador_contratos', jsonb_build_object(
        'version_id', p_version_id,
        'substitution_evidence', p_configuration -> 'substitutionEvidence'
      ), p_now, p_now
    );
  end if;

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

-- Alerta de implantação de contrato já ativado ficava "aberto" (a ativação não o fechava;
-- agora a rota de ativação fecha). Fecha os que sobraram.
update public.contrato_alertas a
set status = 'resolvido',
    resolvido_em = coalesce(c.updated_at, now()),
    resolucao = '{"conclusion":"Contrato ativado no gerenciamento de contratos."}',
    updated_at = now()
from public.contratos c
where c.id = a.contrato_id
  and a.tipo = 'contrato_implantacao_pendente'
  and a.status <> 'resolvido'
  and c.status = 'ativo';
