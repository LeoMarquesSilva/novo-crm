-- Acentos quebrados no banco (4º teste ponta a ponta, 22/10/2026).
-- As migrations 20261008183000, 20261018120000, 20261018130000 e 20261019120000 foram coladas no SQL Editor
-- em 21/10/2026 e os textos com acento viraram "Configura√ß√£o", "revis√£o" etc. As duas funções abaixo gravam
-- esses textos nos eventos do contrato (aba "Documentos e eventos"). Conferido em 22/10/2026: fora os acentos,
-- o corpo das funções no banco é igual ao de 20261018130000 (comparação só dos caracteres ASCII).
-- 1) Recria as duas funções a partir de 20261018130000 (UTF-8 correto).
-- 2) Refaz os comentários de coluna que ficaram quebrados.
-- 3) Corrige os eventos já gravados com o texto quebrado.

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
      and date_trunc('month', vigente_de::timestamp)::date <= p_competencia
      and (vigente_ate is null or vigente_ate >= p_competencia)
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
  insert into public.contrato_eventos(contrato_id,tipo,titulo,detalhe,ator_app_user_id,origem,metadados_snapshot)
    values(p_contract_id,'fechamento_calculado','Fechamento mensal calculado',
      'Uma nova revisão de cálculo foi preparada.',p_actor_id,'gerenciador_contratos',
      jsonb_build_object('closing_id',v_closing.id,'revision_id',v_revision_id,'revision_number',v_next,'competency',p_competencia));
  return query select v_closing.id, v_revision_id, v_next;
end;
$$;

revoke all on function public.create_contract_closing_revision(uuid,uuid,date,integer,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.create_contract_closing_revision(uuid,uuid,date,integer,uuid,jsonb,jsonb) to service_role;

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
      cobranca_mes_inicio = nullif(p_configuration #>> '{version,startMonthBilling}', ''),
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

comment on column public.oportunidades.rd_migrado_em is
  'Quando o negócio do RD virou lead do CRM (migração da virada). Nulo = lead do RD (só leitura) ou lead nativo do CRM.';

comment on column public.lead_intakes.area_cross_selling is
  'Área canónica (CRM_PRACTICE_AREAS) escolhida no Cross Selling. Nulo nos demais tipos.';

comment on column public.grupos_economicos.area_cross_selling is
  'Espelho de UI da carteira: área do Cross Selling quando tipo_lead = Cross Selling.';

comment on column public.grupos_economicos.decisor is
  'Nome livre do decisor na empresa, editável na carteira. Opcional.';

comment on column public.contrato_versoes.cobranca_mes_inicio is
  'Mensalidade fixa que começa depois do dia 1: mes_cheio cobra o mês de início inteiro; mes_seguinte começa na competência seguinte. Nulo vale mes_seguinte.';

update public.contrato_eventos
set titulo = 'Configuração contratual salva', detalhe = 'Versão em rascunho atualizada.'
where titulo = 'Configura√ß√£o contratual salva' and detalhe = 'Vers√£o em rascunho atualizada.';

update public.contrato_eventos
set detalhe = 'Uma nova revisão de cálculo foi preparada.'
where titulo = 'Fechamento mensal calculado' and detalhe = 'Uma nova revis√£o de c√°lculo foi preparada.';

update public.contrato_eventos
set titulo = 'Override de configuração registrado', detalhe = 'Valores sugeridos foram substituídos com justificativa.'
where titulo = 'Override de configura√ß√£o registrado' and detalhe = 'Valores sugeridos foram substitu√≠dos com justificativa.';
